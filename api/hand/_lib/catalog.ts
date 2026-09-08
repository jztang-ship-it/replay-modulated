import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { randomInt,randomUUID } from 'node:crypto';
import { generateRoster,redrawRoster } from '../../../shared/engines/rosterEngine.js';
import { resolveCards } from '../../../shared/engines/resolveEngine.js';
import { DEFAULT_ECONOMY_CONFIG,tierFromSalary } from '../../../shared/engines/economyEngine.js';
import { SportAdapter } from '../../../shared/adapters/SportAdapter.js';
import { BasketballSportConfig } from '../../../basketball/src/adapters/basketballConfig.js';
import { FootballSportConfig } from '../../../football/src/adapters/footballConfig.js';
import BaseballSportConfig from '../../../baseball/src/adapters/baseballConfig.js';
import { computeBasketballFp } from '../../../basketball/src/adapters/fantasyPoints.js';
import { computeBasketballBadges } from '../../../basketball/src/adapters/badges.js';
import { buildDailyBonusMap } from '../../../shared/utils/dailyBonus.js';
import thresholds from '../../../basketball/src/data/winThresholds.json' with { type: 'json' };
export const SPORTS=['basketball','baseball','football'];
const rng=()=>randomInt(0,0x100000000)/0x100000000;
const configs:any={basketball:BasketballSportConfig,baseball:BaseballSportConfig,football:FootballSportConfig};
const cache=new Map<string,{players:any[];logs:any[]}>();
function data(sport:string,season:string) {
 if(!SPORTS.includes(sport)||!/^\d{4}$/.test(season)) throw new Error('Unsupported sport or season');
 const key=sport+':'+season;if(cache.has(key)) return cache.get(key)!;
 let d:{players:any[];logs:any[]};
 try {d=JSON.parse(gunzipSync(readFileSync(join(process.cwd(),'server-data',sport,season+'.json.gz'))).toString('utf8'));}
 catch(error) {
  if(process.env.VERCEL) throw new Error('Server catalog unavailable');
  const dir=join(process.cwd(),sport,'public','data',...(sport==='basketball'?['seasons',season]:[]));
  d={players:JSON.parse(readFileSync(join(dir,'players.json'),'utf8')),logs:JSON.parse(readFileSync(join(dir,sport==='basketball'?'gamelogs.json':'game-logs.json'),'utf8'))};
 }
 d={players:d.players.filter(p=>String(p.season)===season),logs:d.logs.filter(l=>String(l.season)===season)};
 if(!d.players.length||!d.logs.length) throw new Error('Unsupported season');
 if(cache.size>=2) cache.delete(cache.keys().next().value!);cache.set(key,d);return d;
}
export function scoring(sport:string):any {
 if(sport==='basketball') return {computeFantasyPoints:(s:any)=>computeBasketballFp(s,BasketballSportConfig.projectionWeights),computeBadges:(s:any)=>computeBasketballBadges(s,BasketballSportConfig.badges)};
 if(sport==='football') return new SportAdapter(FootballSportConfig);
 return {
  computeFantasyPoints(s:any) {const keys=s._position==='P'?['ip','k','er','w','qs']:['h','doubles','triples','hr','r','rbi','bb','sb'];return keys.reduce((n,k)=>n+Number(s[k]??s[k.toUpperCase()]??0)*Number((BaseballSportConfig.projectionWeights as any)[k]),0);},
  computeBadges(s:any) {return (s._position==='P'?BaseballSportConfig.badges.pitchers:BaseballSportConfig.badges.hitters).filter(b=>b.test(s)).map(({id,icon,label,fp})=>({id,icon,label,fp}));},
  isLogValidForCard(position:string,l:any) {const s=l.stats??{};return position==='P'?Number(s.ip??0)>0:['h','hr','rbi','r','bb','sb','doubles','triples'].some(k=>Number(s[k]??0)>0);},
 };
}
export function catalog(sport:string,season:string) {
 const d=data(sport,season),config=configs[sport],adapter=scoring(sport);
 const logs=new Map<string,any[]>();for(const l of d.logs){const id=String(l.basePlayerId??l.playerId);if(!logs.has(id))logs.set(id,[]);logs.get(id)!.push(l);}
 const eco={...DEFAULT_ECONOMY_CONFIG,capMax:config.salaryCap};
 const pool=d.players.filter(p=>p.active!==false&&logs.has(String(p.basePlayerId??p.id))).map(p=>{
  const id=String(p.basePlayerId??p.id),salary=Number(p.salary),position=sport==='baseball'?(/^(P|SP|RP|LHP|RHP)$/.test(String(p.position))?'P':'BAT'):String(p.position);
  return {...p,id:String(p.id),basePlayerId:id,personKey:id,cardId:randomUUID(),position,season,salary,projectedFp:Number(p.projectedFp??p.avgFP??0),tier:p.tier??tierFromSalary(salary,eco)};
 }).filter(p=>Number.isFinite(p.salary)&&p.salary>=eco.salaryMin&&p.salary<=eco.capMax);
 const rosterConfig={rosterSize:5,slotRequirements:config.rosterSlots,excludeFromFlex:config.excludeFromFlex??[],positionAware:config.positionAware!==false};
 return {pool,logs,adapter,eco,rosterConfig};
}
function validate(cards:any[],c:ReturnType<typeof catalog>) {
 if(cards.length!==5||new Set(cards.map(x=>x.personKey)).size!==5||cards.reduce((n,x)=>n+x.salary,0)>c.eco.capMax) throw new Error('Invalid server roster');
 if(c.rosterConfig.positionAware) cards.forEach((card,i)=>{const slot=c.rosterConfig.slotRequirements[i];if(slot==='FLEX'?c.rosterConfig.excludeFromFlex.includes(card.position):slot!==card.position)throw new Error('Invalid roster position');});
 return cards;
}
export function deal(sport:string,season:string,challenge?:any):any[] {
 const c=catalog(sport,season);
 let pool=c.pool;
 const snapshot=challenge?.initial_roster;const cards=Array.isArray(snapshot)?snapshot:snapshot?.cards;
 if(challenge&&challenge.sender_kind!=='boss') {
  if(!Array.isArray(cards))throw new Error('Invalid challenge roster');
  const trusted=cards.map((x:any,i:number)=>{const p=pool.find(p=>p.basePlayerId===String(x.basePlayerId) && p.position===x.position);if(!p)throw new Error('Challenge player unavailable');return {...p,slotIndex:i,wasHeld:false,actualFp:0,fpDelta:0,gameInfo:{},statLine:{},achievements:[]};});
  return validate(trusted,c);
 }
 if(challenge?.sender_kind==='boss'&&Array.isArray(cards)){const excluded=new Set(cards.map((x:any)=>String(x.basePlayerId)));pool=pool.filter(p=>!excluded.has(p.basePlayerId));}
 return validate(generateRoster(pool,c.rosterConfig,c.eco,rng),c);
}
export function draw(sport:string,season:string,current:any[],held:number[]):any[] {
 const c=catalog(sport,season);return validate(redrawRoster(current,new Set(held),c.pool,c.rosterConfig,c.eco,rng),c);
}
export function resolve(sport:string,season:string,cards:any[],createdAt:string, preserveHeld=false):any[] {
 const c=catalog(sport,season);
 const bonus=buildDailyBonusMap(c.pool,new Date(createdAt));
 const result=resolveCards(cards,c.logs,{fpScale:1,minMinutes:configs[sport].historicalLogFilters?.minMinutes??10,dailyBonusMap:bonus},c.adapter,rng).resolved;
 if(result.some(x=>!Number.isFinite(x.actualFp)))throw new Error('Invalid score');
 return result.map((c,i)=>preserveHeld && cards[i].wasHeld ? cards[i] : ({...c,actualFp:Math.round(c.actualFp*10)/10,fpDelta:Math.round(c.fpDelta*10)/10}));
}
export function outcome(sport:string,season:string,roster:any[]) {
 const fp=Math.round(roster.reduce((n,c)=>n+c.actualFp,0)*10)/10;
 const bb=(thresholds as any)[season];
 const rows=sport==='basketball'?Object.entries(bb??{}).map(([tier,minFp])=>({tier,minFp:Number(minFp),multiplier:({ROOKIE:.5,STARTER:1.5,ALL_STAR:3,MVP:8,LEGEND:20} as any)[tier]})):
 sport==='baseball'?BaseballSportConfig.winCondition.thresholds.map(t=>({tier:t.tier,minFp:t.minFP,multiplier:t.multiplier})):
 [{tier:'ROOKIE',minFp:130,multiplier:.5},{tier:'STARTER',minFp:150,multiplier:1.5},{tier:'ALL_STAR',minFp:167,multiplier:3},{tier:'MVP',minFp:192,multiplier:8},{tier:'LEGEND',minFp:215,multiplier:50}];
 if(!rows.length)throw new Error('Season thresholds unavailable');
 return rows.sort((a,b)=>b.minFp-a.minFp).find(t=>fp>=t.minFp)??{tier:'BUST',minFp:0,multiplier:0};
}
