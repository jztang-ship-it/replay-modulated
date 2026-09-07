import {describe,it,expect} from 'vitest';
import {generateRoster,mulberry32} from '../../shared/engines/rosterEngine';
import {catalog,deal,draw,resolve,outcome} from '../hand/_lib/catalog';
describe('private trusted catalog',()=>{
 it.each([['basketball','2425'],['baseball','2425'],['football','2022']])('deals and resolves %s from real server data',(sport,season)=>{
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

it.each([['baseball','2425'],['football','2022']])('fixed seeds never trade position eligibility for budget: %s',(sport,season)=>{
 const c=catalog(sport,season);
 for(let seed=0;seed<1000;seed++){
  const roster=generateRoster(c.pool,c.rosterConfig,c.eco,mulberry32(seed));
  expect(roster,`seed=${seed}`).toHaveLength(5);
  expect(new Set(roster.map(p=>p.personKey)).size,`seed=${seed}`).toBe(5);
  expect(roster.reduce((n,p)=>n+p.salary,0),`seed=${seed}`).toBeLessThanOrEqual(c.eco.capMax);
  roster.forEach((p,i)=>{const req=c.rosterConfig.slotRequirements[i];expect(req==='FLEX'?!c.rosterConfig.excludeFromFlex.includes(p.position):p.position===req,`seed=${seed} slot=${i} expected=${req} actual=${p.position}`).toBe(true);});
 }
},30000);
