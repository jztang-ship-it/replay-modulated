import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn(),quota:vi.fn()}));
vi.mock('../hand/_lib/supabaseServer.js',()=>({supabaseAdmin:{rpc:m.rpc}}));
vi.mock('../hand/_lib/auth.js',()=>({verifyAuth:m.auth}));
vi.mock('../hand/_lib/security.js',async()=>({...await vi.importActual<any>('../hand/_lib/security.js'),quota:m.quota}));
import handler from '../challenge/[id]/attempt';
const id='11111111-1111-4111-8111-111111111111',hand='22222222-2222-4222-8222-222222222222';
async function call(body:any={hand_id:hand},challenge=id){const r:any={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()};await handler({method:'POST',query:{id:challenge},headers:{},body} as any,r);return {code:r.status.mock.calls.at(-1)[0],body:r.json.mock.calls.at(-1)[0]};}
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({user:{id:'trusted-user'}});m.quota.mockResolvedValue(true);m.rpc.mockResolvedValue({data:{attempt_id:'a',score:50,is_winner:false,idempotent:true},error:null});});
it('accepts only authenticated identity and hand id, never score or winner assertions',async()=>{const r=await call({hand_id:hand,user_id:'forged',score:9000,is_winner:true,user_name:'N',referrer_token:'ok'});expect(r.code).toBe(200);expect(r.body.score).toBe(50);expect(m.rpc).toHaveBeenCalledWith('submit_authoritative_attempt',{p_user:'trusted-user',p_challenge:id,p_hand:hand,p_name:'N',p_ref:'ok'});});
it('returns the transaction result verbatim on retry',async()=>expect((await call()).body.idempotent).toBe(true));
it('denies unsigned callers',async()=>{m.auth.mockResolvedValue({user:null});expect((await call()).code).toBe(401);expect(m.rpc).not.toHaveBeenCalled();});
it('denies invalid ids',async()=>expect((await call({hand_id:'fake'})).code).toBe(400));
it('fails closed if quota storage is offline',async()=>{m.quota.mockRejectedValue(new Error('offline'));expect((await call()).code).toBe(503);expect(m.rpc).not.toHaveBeenCalled();});
it('propagates binding/window/authority rejection without counters or notifications outside the transaction',async()=>{m.rpc.mockResolvedValue({data:null,error:{message:'wrong challenge'}});expect((await call()).code).toBe(409);expect(m.rpc).toHaveBeenCalledTimes(1);});
it('bounds display names and ignores invalid referral tokens',async()=>{await call({hand_id:hand,user_name:'x'.repeat(100),referrer_token:'bad!'});expect(m.rpc.mock.calls[0][1]).toMatchObject({p_name:'x'.repeat(32),p_ref:null});});
