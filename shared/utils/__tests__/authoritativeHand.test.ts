import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn()}));
vi.mock('../../lib/supabase',()=>({supabase:{auth:{getSession:m.session}}}));
import {AuthoritativeHand,handErrorMessage} from '../authoritativeHand';
const value={hand_id:'id',revision:0,settled:false,roster:[{},{},{},{},{}],hand:null,sport:'basketball',season:'2425',challenge_id:null};
const context={sport:'basketball',season:'2425',bet_amount:0};
const fetchMock=vi.fn();
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',fetchMock);m.session.mockResolvedValue({data:{session:{access_token:'trusted-token'}}});fetchMock.mockResolvedValue({ok:true,json:async()=>value});});
it('requires an authenticated session',async()=>{m.session.mockResolvedValue({data:{session:null}});await expect(new AuthoritativeHand().start(context)).rejects.toThrow('Sign in');expect(fetchMock).not.toHaveBeenCalled();});
it('retries a failed start with the same request id',async()=>{const c=new AuthoritativeHand();fetchMock.mockRejectedValueOnce(new Error('timeout'));await expect(c.start(context)).rejects.toThrow();await c.start(context);expect(JSON.parse(fetchMock.mock.calls[0][1].body).request_id).toBe(JSON.parse(fetchMock.mock.calls[1][1].body).request_id);});
it('preserves a timed-out turn including the original held choices',async()=>{const c=new AuthoritativeHand();await c.start(context);fetchMock.mockRejectedValueOnce(new Error('timeout'));await expect(c.turn('draw',[0])).rejects.toThrow();await c.turn('draw',[4]);expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({held_slots:[0],revision:0});});
it('does not turn a pending lock retry into a new random draw',async()=>{const c=new AuthoritativeHand();await c.start(context);fetchMock.mockRejectedValueOnce(new Error('timeout'));await expect(c.turn('lock',[1])).rejects.toThrow();expect(c.pendingAction).toBe('lock');await expect(c.turn('draw',[])).rejects.toThrow('Retry');await c.turn('lock',[1]);expect(c.pendingAction).toBeNull();});
it('deduplicates concurrent identical starts',async()=>{const c=new AuthoritativeHand();await Promise.all([c.start(context),c.start(context)]);expect(fetchMock).toHaveBeenCalledTimes(1);});
it('does not submit client FP or payout',async()=>{const c=new AuthoritativeHand();await c.start(context);await c.turn('lock',[1,2]);expect(Object.keys(JSON.parse(fetchMock.mock.calls[1][1].body)).sort()).toEqual(['action','hand_id','held_slots','revision']);expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer trusted-token');});

it('surfaces database upgrade errors instead of promising that another deal will work',async()=>{
 fetchMock.mockResolvedValue({ok:false,status:503,json:async()=>({code:'AUTHORITY_SCHEMA_MISSING',error:'Database upgrade required'})});
 const c=new AuthoritativeHand();const error=await c.start(context).catch(e=>e);
 expect(error.code).toBe('AUTHORITY_SCHEMA_MISSING');expect(handErrorMessage(error,'retry')).toContain('database needs an update');expect(c.snapshot).toBeNull();
});
it('handles non-JSON frontend 404s as missing API configuration',async()=>{
 fetchMock.mockResolvedValue({ok:false,status:404,json:async()=>{throw new SyntaxError('HTML')}});
 const error=await new AuthoritativeHand().start(context).catch(e=>e);
 expect(error.code).toBe('API_NOT_FOUND');expect(handErrorMessage(error,'retry')).toContain('API is not connected');
});
it('gives a specific authentication error before attempting to deal',async()=>{
 m.session.mockResolvedValue({data:{session:null}});
 const error=await new AuthoritativeHand().start(context).catch(e=>e);
 expect(error.code).toBe('AUTH_REQUIRED');expect(handErrorMessage(error,'retry')).toContain('Sign-in');expect(fetchMock).not.toHaveBeenCalled();
});
