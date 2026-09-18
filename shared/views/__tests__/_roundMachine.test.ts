import {it,expect,vi} from 'vitest';
import {advanceRound,commitRound,MAX_ROUNDS} from '../_roundMachine';
it('uses three selection rounds and supports early locks',()=>{
 expect(MAX_ROUNDS).toBe(3);
 expect(advanceRound({roundsUsed:1,maxRounds:3,userTappedReveal:false})).toEqual({next:'HOLD',roundsUsed:2,locked:false});
 expect(advanceRound({roundsUsed:2,maxRounds:3,userTappedReveal:false}).next).toBe('REVEALING');
 expect(advanceRound({roundsUsed:1,maxRounds:3,userTappedReveal:true}).next).toBe('REVEALING');
});
it('does not persist or score an intermediate selection round',async()=>{
 const persistLock=vi.fn(),resolveOutcome=vi.fn(),telemetry=vi.fn();
 await commitRound({roundsUsed:1,maxRounds:3,userTappedReveal:false,resolvedRoster:[],resolveOutcome,effects:{persistLock,telemetry}});
 expect(persistLock).not.toHaveBeenCalled();expect(resolveOutcome).not.toHaveBeenCalled();expect(telemetry).not.toHaveBeenCalled();
});
it('persists only roster and score before announcing a confirmed lock',async()=>{
 const events:string[]=[];let record:any;
 const result=await commitRound({roundsUsed:2,maxRounds:3,userTappedReveal:false,resolvedRoster:[],resolveOutcome:()=>({totalFp:200,tier:'STARTER'}),effects:{persistLock:async r=>{events.push('saved');record=r;return{ok:true,handId:'h'};},telemetry:()=>events.push('locked')}});
 expect(record).toEqual({roster:[],totalFp:200,tier:'STARTER'});expect(events).toEqual(['saved','locked']);expect(result.next).toBe('REVEALING');
});
it('keeps an unconfirmed solo lock in selection state',async()=>{
 const result=await commitRound({roundsUsed:2,maxRounds:3,userTappedReveal:false,resolvedRoster:[],resolveOutcome:()=>({totalFp:200,tier:'STARTER'}),effects:{persistLock:async()=>({ok:false,handId:''}),telemetry:vi.fn()}});
 expect(result).toEqual({next:'HOLD',roundsUsed:2,locked:false});
});
