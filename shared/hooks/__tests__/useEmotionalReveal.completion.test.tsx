// @vitest-environment jsdom
import {act,renderHook,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../utils/soundManager',()=>({soundManager:new Proxy({},{get:()=>vi.fn()})}));
import {useEmotionalReveal} from '../useEmotionalReveal';
const cards=(held:boolean)=>Array.from({length:5},(_,i)=>({cardId:String(i),tier:'WHITE',salary:20+i,actualFp:20,projectedFp:20,wasHeld:held,badges:[]}));
const flip={beginReveal:vi.fn(),revealCard:vi.fn(),completeReveal:vi.fn()} as any;
beforeEach(()=>vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']}));
afterEach(()=>{cleanup();vi.useRealTimers();});
it('completes all-backed hands and calls each card completion exactly once',async()=>{
 const complete=vi.fn(),each=vi.fn(),anchor=vi.fn();
 const {result,rerender}=renderHook(({active,roster})=>useEmotionalReveal({cards:roster,isActive:active,revealMode:'tap',flipState:flip,onAllComplete:complete,onCardComplete:each,onAnchorFpComplete:anchor}),{initialProps:{active:true,roster:cards(true)}});
 await act(()=>vi.advanceTimersByTimeAsync(15000));
 expect(complete).toHaveBeenCalledTimes(1);expect(each).toHaveBeenCalledTimes(5);expect(anchor).toHaveBeenCalledTimes(1);
 rerender({active:false,roster:cards(true)});act(()=>result.current.reset());
 rerender({active:true,roster:cards(true)});
 await act(()=>vi.advanceTimersByTimeAsync(15000));
 expect(complete).toHaveBeenCalledTimes(2);expect(each).toHaveBeenCalledTimes(10);
});
it('ignores repeated taps on the active card and completes the five distinct cards',async()=>{
 const complete=vi.fn(),each=vi.fn();
 const {result}=renderHook(()=>useEmotionalReveal({cards:cards(false),isActive:true,revealMode:'tap',flipState:flip,onAllComplete:complete,onCardComplete:each}));
 act(()=>{result.current.tapRevealCard('0');result.current.tapRevealCard('0');for(let i=1;i<5;i++)result.current.tapRevealCard(String(i));});
 await act(()=>vi.advanceTimersByTimeAsync(20000));
 expect(complete).toHaveBeenCalledTimes(1);
 expect(each.mock.calls.map(c=>c[0])).toEqual(['0','1','2','3','4']);
});
