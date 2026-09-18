import {describe,it,expect} from 'vitest';
import {catalog,deal,draw,resolve,outcome} from '../hand/_lib/catalog';
describe('private trusted catalog',()=>{
 it.each([['basketball','2425'],['basketball','2526']])('deals and resolves %s from real server data',(sport,season)=>{
  const c=catalog(sport,season);expect(c.pool.length).toBeGreaterThan(5);
  for(let trial=0;trial<20;trial++) {
  const initial=deal(sport,season);expect(initial).toHaveLength(5);expect(initial.reduce((n,x)=>n+x.salary,0)).toBeLessThanOrEqual(c.eco.capMax);
  const first=resolve(sport,season,draw(sport,season,initial,[0]),'2026-09-07');expect(first.every(x=>Number.isFinite(x.actualFp))).toBe(true);
  const second=resolve(sport,season,draw(sport,season,first,[0,2]),'2026-09-07',true);
  expect(second[0]).toMatchObject({basePlayerId:first[0].basePlayerId,actualFp:first[0].actualFp,statLine:first[0].statLine});
  expect(second[2].actualFp).toBe(first[2].actualFp);expect(outcome(sport,season,second).tier).toBeTruthy();
  }
 },30000);
 it('rejects a path traversal before filesystem access',()=>expect(()=>catalog('basketball','../../env')).toThrow());
 it('rejects unknown sports',()=>expect(()=>deal('__proto__','2425')).toThrow());
 it('rebuilds a human challenge from trusted player records, never snapshot scores or salaries',()=>{
  const initial=deal('basketball','2425');const replay=deal('basketball','2425',{sender_kind:'human',initial_roster:initial.map(c=>({...c,salary:0,actualFp:99999}))});
  expect(replay.map(c=>c.salary)).toEqual(initial.map(c=>c.salary));expect(replay.every(c=>c.actualFp===0)).toBe(true);
 });
});

it.each(['baseball','football'])('does not expose a %s authority catalog during the basketball beta',sport=>expect(()=>catalog(sport,'2425')).toThrow('Unsupported sport'));

 it.each([[0,'ROOKIE'],[184.9,'ROOKIE'],[185,'STARTER'],[207,'ALL_STAR'],[224,'MVP'],[246,'LEGEND']])('settles 2526 score %s using existing display thresholds', (fp,tier)=>{expect(outcome('basketball','2526',[{actualFp:fp}]).tier).toBe(tier);});
