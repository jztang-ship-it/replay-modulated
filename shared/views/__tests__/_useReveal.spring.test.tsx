// @vitest-environment jsdom
import {act,renderHook,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {useReveal} from '../_useReveal';
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
it('finishes the decorative spring once even when animation frames stop',async()=>{
 vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
 const settled=vi.fn();
 const {result}=renderHook(()=>useReveal({adapter:{sportKey:'basketball'},state:{setSpringFp:vi.fn(),setSpringSettled:vi.fn()},rosterRef:{current:[]}} as any));
 act(()=>result.current.runSpring(150,settled));
 await act(()=>vi.advanceTimersByTimeAsync(900));
 expect(settled).toHaveBeenCalledTimes(1);
 await act(()=>vi.advanceTimersByTimeAsync(3000));expect(settled).toHaveBeenCalledTimes(1);
});
