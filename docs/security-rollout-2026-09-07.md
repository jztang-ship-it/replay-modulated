# 安全修复与部署说明（2026-09-07）

## 状态与范围

目标：`E:\work\replay-mod\ReplayMod`。本次为 **Applied：磁盘上的本地修改**，
不是 Commit、Push 或线上数据库 Applied。没有连接/修改生产数据库，没有提交推送，
没有清除已有修改、缺失的 macOS worktree 或历史业务数据。

## 已实现的安全边界

1. `/api/hand/resolve` 提供 start/draw/lock/status。服务端生成手牌和随机结果，
   校验预算、位置、同一球员去重、固定赛事/赛季、允许下注档位、持有位置和换牌次数。
   已提交回合中的 held 卡不能被重新放开。客户端提交 FP、阵容、胜负或派彩不再生效。
2. 私有 `hand_sessions` 保存状态、revision、请求幂等标识和一小时有效期；
   数据库锁保证同一请求仅扣一次下注，结算时日志、钱包、连胜与奖金池同事务写入。
   重复结算返回原结果，不修改赛季/运动/成绩，也不再次扣款、派彩或计入奖金池。
3. 浏览器不能修改 hand_log、player_state、user_achievements、shared_challenges、
   challenge_attempts；相关内部 RPC 仅 service_role 可执行。撤销开放 UPDATE 策略，
   同时撤销 TRUNCATE/REFERENCES/TRIGGER。个人资料只开放必要的资料字段，匿名状态由
   auth.users 决定；id upsert 受 RLS 限制，不能修改别人的资料或业务计数。
4. `grant_coins` 只认可实际存在的反馈、固定 feedback_v1 活动和固定 100 金币；
   `(user_id,campaign)` 奖励账本与入账同事务，重复/并发不能重复领取。
5. 创建挑战只使用当前用户 v2 verified 成绩；提交 attempt 必须使用属于该用户、
   绑定该 challenge/运动/赛季的 v2 手局。幂等 attempt、人数/胜者数、胜负转换、
   defended 计数和通知在锁定挑战的数据库事务内处理。老板挑战不会通知/奖励虚构发送者。
6. 新排行榜使用 `lb:v2:*`，成员是 `uid:handId`，昵称只在读取时从资料表取出。
   只接受本人匹配赛事的 v2 成绩；旧日期成绩不能刷入今天榜单。
7. 奖金池 POST 不接受客户端贡献金额；GET 读取数据库权威池，故障返回 503，
   只有尚未建立池记录时才返回初始 1000。
8. headline/flavor 均先验证 Supabase token，再执行每日用户 20/IP 60/全局配额。
   全局默认 1000，可通过 `AI_DAILY_REQUEST_LIMIT` 设为 0..10000（0 表示停用）。
   KV 配额使用原子 INCR+EXPIRE；配额存储异常拒绝调用模型，不放行。
   有 Supabase 匿名认证 token 的用户仍可使用，不强制注册真实账户。
9. 客户端只展示确认的结算结果/奖励，不再自行写 verified 成绩、发成就或支付奖励。
   网络超时重试保留同一请求和 held 选择，避免换随机结果或重复扣费。

## 必须注意的兼容性与剩余限制

- **不是无损替换原玩法。** 当前服务端用压缩的可信赛季全量目录；尚未移植原
  curated daily slate / hybrid promotions 的选池规则。客户端脚本化 FTUE 已停用，
  恢复必须将脚本选择及资格判定迁到服务端。上线前移植这些规则，或由产品明确接受变化。
- 下注改为开局成功即扣一次；篮球经济关闭、挑战均 0 下注，其他支持 10/30/50/100。
  会话一小时有效。刷新页面/关闭页面后没有自动恢复入口；放弃/过期不自动退款。
  当前重试保障限于同一个挂载中的游戏控制器；确定性过期或跨页面冲突仍需恢复 UX。
  **不要在未确认该行为及相应提示前直接向付费玩法发布。**
- 历史 authority_version=1 保留，但普通人类挑战须重建；不要把旧成绩批量标为 v2。
  老板挑战作为服务端生成的例外仍可用；老板旧计数会在 v2 attempt 时重新计算。
- 旧钱包/连胜/已解锁成就可能已被之前的漏洞污染。本迁移只阻止未来伪造，不猜测并
  清空既有资产。需从可靠支付/审计证据单独对账、备份后审批修复。
- 历史反馈没有可靠支付账本，018 将其标为活动已消费，不重复补发；可能存在历史
  未到账反馈需要人工核实补偿，不能把历史账本记录解释为确实已支付的证据。
- 新榜单命名空间和数据库奖金池不导入旧的可污染 KV 数据；旧 KV 只保留，不删除。
- 配额是调用次数限制，不保证精确美元成本；匿名账号批量创建仍需结合认证服务自身
  防滥用及模型供应商预算告警。未执行生产渗透测试或全依赖 CVE 审计。

## 部署顺序（需运维批准，本次未执行）

1. 先备份生产数据库，记录实际迁移版本；在独立 Supabase staging 完整演练。
   切换期间暂停游戏写入/AI，并避免旧客户端与新服务端交叉处理付费手局。
2. 按编号应用尚未应用的迁移，直到 `019_authoritative_sessions.sql`：
   016 服务端写入边界 → 017 手局关联 → 018 权限/奖励账本 → 019 私有手局/原子结算。
   018/019 含 CREATE TABLE，不是可盲目重复运行脚本；使用正常迁移历史管理。
3. 构建前运行 `node scripts/build-authority-data.mjs`。当前生成 33 个 gzip 文件，
   合计约 10.3 MiB，放在被 Git 忽略的 `server-data/`。构建脚本已经接入；
   `vercel.json` 为 resolve 函数配置 `includeFiles: server-data/**`。
   检查部署产物确实包含这些私有文件，不能只上传前端 dist。
4. 确认服务端 Supabase URL/service-role key、KV 和 AI 提供商配置正常；service-role
   密钥只能放服务端，不能使用 VITE_ 前缀暴露给浏览器。生产缺目录时会拒绝开局，
   不退回客户端算分。生产 Vercel 打包/资源限制本次尚未实地验证。
5. 协同发布前端和 API，清理旧客户端缓存。先灰度验证新开局、持有/换牌/锁定、
   请求超时重试、额度故障、钱包、反馈二次领取、挑战及榜单日期，再开放写入口。
6. 如发布失败：保持写入口关闭，使用向前修复；不要简单退回旧客户端并恢复宽松权限。
   任何数据库回滚须根据备份和新交易单独制定，不提供一键破坏性回滚。

## 本地验证命令与边界

```powershell
node scripts/build-authority-data.mjs
node node_modules/typescript/bin/tsc --noEmit
node scripts/check-unbound-symbols.mjs
node scripts/check-nodenext-imports.mjs
node node_modules/vitest/vitest.mjs run
npm.cmd --prefix basketball run build
npm.cmd --prefix baseball run build
npm.cmd --prefix football run build
```

数据库测试使用临时 PostgreSQL 17 容器，无网络、无端口映射、无宿主目录绑定：

```powershell
docker run --name replaymod-security-audit-pg --detach --rm --network none --memory 512m --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine
python scripts/verify-security-db.py
docker stop replaymod-security-audit-pg
```

脚本先检查容器隔离属性，每次生成独立空数据库并执行 001–019，使用最小 auth.uid/
角色和 Supabase 风格默认授权验证真正 PostgreSQL 权限、RLS、并发重试和回滚。
这不是完整 Supabase/PostgREST 集成测试；上线前还需用真实 JWT 和 PostgREST 演练。
本次三个前端构建、根目录 API 类型检查、未绑定符号门禁和 NodeNext 导入门禁通过。
最终全量测试：150 个测试文件、1644 项测试全部通过（0 失败、0 跳过）。
发牌回归额外覆盖棒球 2425 与足球 2022 各 1000 个固定随机种子，验证五人阵容、
球员去重、预算及位置要求。修复了原引擎为剩余位置预留预算不足后跨位置补位的问题；
预算修复也不能替换已持有卡或破坏位置规则，无法构成合法阵容时拒绝发牌。
根目录 tsc 不等同于三个前端完整类型检查；未绑定符号门禁保留 1 个既有基线问题。
`git diff --check` 通过；Git 仍提示部分既有文件 LF/CRLF 规范化警告。

为恢复损坏的根依赖目录，原 node_modules 保存在
`node_modules.security-backup-20260907`，未删除；已通过禁用安装脚本的 npm install
重装依赖并修补锁文件缺失项。未更改 PowerShell 执行策略或进行全依赖升级。
临时 PostgreSQL 镜像留在本机；测试容器在验证结束后停止清理。


## 本地启动故障复核（2026-09-07）

浏览器截图中的问题不是同一个原因：
- 棒球 Vite 缺少 `/api` 代理，已补齐到与篮球/足球相同的本地 3001 端口。
- 足球/棒球没有独立 `.env`，已让三个 Vite 配置合并根目录和各自目录的 `VITE_`
  公开变量（各运动配置优先）。本机根 `.env.local` 仅补入篮球已用的公开认证 URL/key，
  没有复制 service-role/Redis 密钥到客户端，也没有将本机 env 文件纳入版本控制。
- 对当前配置后端的只读检查确认：`hand_sessions`、`authoritative_bonus_pools`、
  `reward_claims` 返回 PGRST205，`hand_log`/`shared_challenges.authority_version`
  返回 42703。Redis 无写入 EVAL 检查通过。因此当前数据库并未提供新权威协议需要的
  结构。检查未读取业务行，未修改数据库，也未自动执行迁移。
- API 对缺失表/列/RPC 返回 503 + `AUTHORITY_SCHEMA_MISSING`，普通游戏页面明确提示
  数据库需要升级；不会将缺表伪装成奖金池初始值，也不会退回浏览器计算。

本地开发在独立终端运行（先按上文完成经批准的数据库迁移和 staging 验证）：

```powershell
cd E:\work\replay-mod\ReplayMod
npm.cmd run check:backend  # 使用配置的远程后端，仅只读检查，失败时退出码为 1
npm.cmd run dev:api        # 保持运行；修改 API 后需重启
# 另外三个终端：
npm.cmd --prefix basketball run dev -- --port 5173
npm.cmd --prefix football run dev -- --port 5174
npm.cmd --prefix baseball run dev -- --port 5175
```

修改 env 后重启 Vite 并刷新页面。共享公开配置示例见根 `.env.example`。
`check:backend` 通过不代表生产上线验收完成，尤其不能替代真实 JWT/PostgREST 写入、
结算、迁移权限与并发测试。音频资源 404 属于独立资源配置问题，不是发牌 503 的根因，
本次未通过删除音频或放宽安全权限掩盖它。

本轮启动修复验证：150 个测试文件、1650 项测试全部通过；根项目 TypeScript、
NodeNext（35 个文件）与未绑定符号门禁通过（仍有 1 个既有基线问题）；三个前端构建通过。
另外以临时本机模拟 API 实际启动三个 Vite 服务，验证 `/api` 代理均收到模拟服务响应、
共享公开认证配置存在且 define 中没有 service-role 密钥。临时探测服务均已关闭。
此代理探测不等于远程游戏端到端验收；当前配置数据库的缺表/缺字段检查仍然失败，
需用户确认目标环境、备份和迁移权限后继续。没有执行远程数据库迁移或提交推送。

## 2026-09-07 网页快照与迁移演练（尚未执行生产迁移）

- 用户不具备数据库密码重置权限，改由用户操作 Supabase SQL Editor；未重置密码，也未通过密码连接生产库。
- 用户导出的限定范围快照时间为北京时间 2026-09-07 21:25:04，共 356 个导出单元、9 张应用表的 6,436 条记录。
- 已核对全部分块数量、字节长度、MD5 与表行数；原 CSV 的 SHA256 为 `18a329263f54b0ca8305c75524c3c384149e059e1f5e10cd8f52de16f8e947f5`。
- 已从实际快照恢复表结构、约束、索引、函数、策略和权限，并核对数据摘要与有效表/列授权；重建的 PostgreSQL 自定义格式归档也在第二个空库恢复通过。
- 在恢复库上执行 016–019 成功，原有字段的数据摘要及行数不变，前端写入与 RPC 权限校验通过。
- 网页迁移包装脚本已测试：迁移前结构检查、整体提交、末尾故意失败时全事务回滚，以及重复执行拒绝；仅记录实际执行的 016–019，不伪造 001–015 迁移历史。
- **这不是完整 Supabase 备份**：不含 Auth/Storage 和 `players`/`game_logs` 的数据；本地 Auth 仅为外键身份桩。归档中这两张表为空壳，严禁对生产库直接使用 `pg_restore --clean` 或删除 public schema。恢复须采用保留未备份对象及后续业务写入的限定对象方案。
- 快照、归档、校验报告、恢复限制和已验证的网页执行脚本均保存在用户指定磁盘的受限备份目录，不纳入 Git。测试容器无网络、无公开端口、无宿主机绑定，已停止并清理临时数据。
- **仍未执行生产库迁移、前端/API 部署、真实 JWT 端到端测试或提交推送**。等待用户在维护窗口运行完整网页脚本并提供执行结果，再检查远程后端。
- 新确认的独立风险：`players`、`game_logs` 无 RLS，且匿名/登录角色具有广泛写权限；不属于本次特定授权的 016–019，尚未修改，需另行安排修复。后续使用 CLI db push 前也须单独核对历史基线，不能把 001–015 当作本轮新执行。

## 2026-09-07 生产迁移完成与只读复核（最新状态）

- 用户已在目标项目 `hnhrpwwznzokkfagfumb` 的 main / PRODUCTION SQL Editor 执行完整网页脚本。截图显示提交后的 `APPLIED_016_019` 查询返回 016、017、018、019 四条记录；不要重复执行迁移脚本。
- 随后运行 `npm.cmd run check:backend`，全部 PASS，退出码 0：三个新增私有表、hand_log/shared_challenges 的 authority_version 均可由服务端访问，Redis 只读 EVAL 成功。之前的缺表/缺字段阻塞已消除。
- 补充检查确认前后端配置均指向指定项目；匿名角色访问 hand_sessions、authoritative_bonus_pools、reward_claims 均返回预期的 42501；challenge_attempts 的 hand_id/authority_version 可由服务端访问。
- 以上远程复核均为 limit(0) 查询或不修改键的 Redis EVAL，没有读取业务记录、调用结算 RPC、创建账号或修改余额。
- 此状态仅确认数据库迁移及基础连通性/匿名隔离检查通过，不代表所有安全问题解决或生产端到端验收通过。前端/API 部署、真实登录后的发牌/换牌/结算验证仍未完成。
- `players`/`game_logs` 的既有开放写权限仍未修改；001–015 的历史 CLI 基线仍未补记。限定范围备份的既有限制继续适用。
