import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),quota:vi.fn(),zadd:vi.fn(),expire:vi.fn(),zrange:vi.fn(),row:null as any,filters:[] as any[],profiles:[] as any[]}));
vi.stubEnv('SUPABASE_URL','https://example.supabase.co');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','test-key');
vi.mock('@vercel/kv',()=>({kv:{zadd:m.zadd,expire:m.expire,zrange:m.zrange}}));
vi.mock('../hand/_lib/security.js',async()=>({...await vi.importActual<any>('../hand/_lib/security.js'),quota:m.quota}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser:m.auth},from:()=>{const b:any={select:()=>b,eq:(...v:any[])=>{m.filters.push(v);return b},maybeSingle:async()=>({data:m.row,error:null}),in:async()=>({data:m.profiles,error:null})};return b;}})}));
const {default:handler}=await import('../leaderboard');
async function call(body:any,method='POST'){const res:any={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()};await handler({method,body,query:body,headers:{authorization:'Bearer valid'}} as any,res);return {status:res.status.mock.calls.at(-1)?.[0],body:res.json.mock.calls.at(-1)?.[0]};}
const submit={action:'submit',sport:'baseball',metric:'hand_best',handId:'hand-1',nickname:'Old name',value:9999};
beforeEach(()=>{vi.clearAllMocks();m.filters=[];m.auth.mockResolvedValue({data:{user:{id:'user-1'}},error:null});m.quota.mockResolvedValue(true);m.zrange.mockResolvedValue([]);m.profiles=[];m.row={hand_id:'hand-1',player_id:'user-1',sport:'baseball',competition:null,total_fp:30,created_at:new Date().toISOString()};});
afterEach(()=>vi.useRealTimers());
it('nickname changes cannot create another ranking identity',async()=>{await call(submit);await call({...submit,nickname:'Another name'});expect(m.zadd).toHaveBeenCalledTimes(4);for(const [,entry] of m.zadd.mock.calls)expect(entry).toEqual({member:'user-1:hand-1',score:30});});
it('old hands never enter todays daily board',async()=>{m.row.created_at='2020-01-01T00:00:00Z';expect((await call(submit)).status).toBe(200);expect(m.zadd).toHaveBeenCalledExactlyOnceWith('lb:v2:baseball:hand_best:alltime',{member:'user-1:hand-1',score:30});expect(m.expire).not.toHaveBeenCalled();});
it('queries only owned verified v2 rows',async()=>{await call(submit);expect(m.filters).toEqual(expect.arrayContaining([['player_id','user-1'],['verified',true],['authority_version',2],['hand_id','hand-1']]));});
it('rejects absent legacy or foreign rows',async()=>{m.row=null;expect((await call(submit)).status).toBe(400);expect(m.zadd).not.toHaveBeenCalled();});
it('rejects competition mismatch',async()=>{m.row.competition='world_cup';expect((await call(submit)).status).toBe(400);expect(m.zadd).not.toHaveBeenCalled();});
it('fails closed when quota storage is down',async()=>{m.quota.mockRejectedValueOnce(new Error('offline'));expect((await call(submit)).status).toBe(500);expect(m.zadd).not.toHaveBeenCalled();});
it('names come from profiles at read time',async()=>{m.zrange.mockResolvedValue(['user-1:hand-1',30]);m.profiles=[{id:'user-1',nickname:'New name'}];const r=await call({sport:'baseball',metric:'hand_best',scope:'daily'},'GET');expect(r.body.entries).toEqual([{uid:'user-1',session_id:'hand-1',nickname:'New name',score:30}]);});
