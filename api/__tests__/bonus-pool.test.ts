import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),scope:vi.fn()}));
vi.mock('../hand/_lib/supabaseServer.js',()=>({supabaseAdmin:{from:()=>{const b:any={select:()=>b,eq:(k:any,v:any)=>{m.scope(v);return b},maybeSingle:m.read};return b}}}));
import handler from '../bonus-pool';
async function call(method:string,query:any={},body:any={}){const r:any={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()};await handler({method,query,body} as any,r);return {code:r.status.mock.calls.at(-1)[0],body:r.json.mock.calls.at(-1)[0]};}
beforeEach(()=>{vi.clearAllMocks();m.read.mockResolvedValue({data:{amount:1234.5},error:null});});
it.each(['GET','POST','PUT','DELETE'])('retires the pool for %s without storage access',async method=>{
 const r=await call(method,{sport:'basketball'},{action:'contribute',amount:100});
 expect(r.code).toBe(410);expect(r.body).not.toHaveProperty('pool');expect(m.read).not.toHaveBeenCalled();
});
