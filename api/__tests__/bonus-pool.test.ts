import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),scope:vi.fn()}));
vi.mock('../hand/_lib/supabaseServer.js',()=>({supabaseAdmin:{from:()=>{const b:any={select:()=>b,eq:(k:any,v:any)=>{m.scope(v);return b},maybeSingle:m.read};return b}}}));
import handler from '../bonus-pool';
async function call(method:string,query:any={},body:any={}){const r:any={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()};await handler({method,query,body} as any,r);return {code:r.status.mock.calls.at(-1)[0],body:r.json.mock.calls.at(-1)[0]};}
beforeEach(()=>{vi.clearAllMocks();m.read.mockResolvedValue({data:{amount:1234.5},error:null});});
it('reads the atomic database pool',async()=>{expect(await call('GET',{sport:'baseball'})).toEqual({code:200,body:{pool:1234.5}});expect(m.scope).toHaveBeenCalledWith('baseball');});
it('scopes football by competition',async()=>{expect((await call('GET',{sport:'football',competition:'world_cup'})).code).toBe(200);expect(m.scope).toHaveBeenCalledWith('football:world_cup');});
it('seeds an absent pool without a client write',async()=>{m.read.mockResolvedValue({data:null,error:null});expect((await call('GET',{sport:'basketball'})).body.pool).toBe(1000);});
it.each([{sport:'football'},{sport:'football',competition:'bogus'},{sport:'bogus'},{sport:'basketball',competition:'world_cup'}])('rejects invalid scope %j',async query=>expect((await call('GET',query)).code).toBe(400));
it('never accepts caller-supplied contributions',async()=>{expect((await call('POST',{}, {sport:'baseball',action:'contribute',amount:999999})).code).toBe(403);expect(m.read).not.toHaveBeenCalled();});
it('fails closed on storage error rather than displaying a made-up balance',async()=>{m.read.mockResolvedValue({data:null,error:{message:'offline'}});expect((await call('GET',{sport:'baseball'})).code).toBe(503);});

it('does not confuse a missing pool table with an empty pool',async()=>{
 m.read.mockResolvedValue({data:null,error:{code:'PGRST205',message:'private schema details'}});
 const result=await call('GET',{sport:'baseball'});
 expect(result.code).toBe(503);expect(result.body.code).toBe('AUTHORITY_SCHEMA_MISSING');expect(result.body.pool).toBeUndefined();
 expect(JSON.stringify(result.body)).not.toContain('private schema details');
});
