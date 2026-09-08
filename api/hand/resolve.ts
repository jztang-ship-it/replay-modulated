import { authorityUnavailable, isAuthoritySchemaMissing } from "./_lib/authorityErrors.js";
import type { VercelRequest,VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from './_lib/supabaseServer.js';
import { verifyAuth } from './_lib/auth.js';
import { quota,ipKey,boundedBody,digest } from './_lib/security.js';
import { SPORTS,deal,draw,resolve,outcome } from './_lib/catalog.js';
import { awardVerifiedAchievements } from './_lib/achievements.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function view(h:any) {return {hand_id:h.hand_id,revision:h.revision,roster:h.state.roster,settled:h.settled,hand:h.state.hand??null,sport:h.sport,season:h.season,competition:h.competition,challenge_id:h.challenge_id};}
async function complete(h:any,userId:string) {
 if(h.settled) { try { await awardVerifiedAchievements(userId,h.hand_id,h.sport,h.season); } catch { console.error('[hand] achievement grant deferred'); } }
 return view(h);
}
export default async function handler(req:VercelRequest,res:VercelResponse) {
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'POST required'});
 try {
  const {user}=await verifyAuth(req);if(!user)return res.status(401).json({error:'Authentication required'});
  let b:any;try{b=boundedBody(req);}catch{return res.status(400).json({error:'Invalid body'});}
  if(!['start','draw','lock','status'].includes(b.action))return res.status(400).json({error:'Server session required; refresh the client'});
  if(!await quota(`hand:write:${user.id}`,240,3600))return res.status(429).json({error:'Too many requests'});
  if(b.action==='start') {
   if(!SPORTS.includes(b.sport)||typeof b.season!=='string'||!/^\d{4}$/.test(b.season)||!UUID.test(b.request_id??''))return res.status(400).json({error:'Invalid game context'});
   const competition=b.sport==='football'?'world_cup':null;
   if((b.competition??null)!==competition)return res.status(400).json({error:'Invalid competition'});
   let challenge:any=null;
   if(b.challenge_id){
    if(!UUID.test(b.challenge_id))return res.status(400).json({error:'Invalid challenge'});
    const {data,error}=await supabaseAdmin.from('shared_challenges').select('*').eq('challenge_id',b.challenge_id).single();
    if(isAuthoritySchemaMissing(error))throw error;
    if(error||!data||data.sport!==b.sport||data.season!==b.season||(data.sender_kind!=='boss'&&data.authority_version!==2))return res.status(409).json({error:'Challenge unavailable; legacy challenges must be recreated'});
    challenge=data;
   }
   // Basketball has its economy disabled; challenges never debit the wallet.
   const bet=challenge||b.sport==='basketball'?0:b.bet_amount;
   if(!Number.isInteger(bet)||!(bet===0||[10,30,50,100].includes(bet))||(!challenge&&b.sport!=='basketball'&&bet===0))return res.status(400).json({error:'Invalid stake'});
   const {data:existing,error:lookupError}=await supabaseAdmin.from('hand_sessions').select('*').eq('player_id',user.id).eq('request_id',b.request_id).maybeSingle();
   if(lookupError)throw lookupError;
   if(existing){
    if(existing.sport!==b.sport||existing.season!==b.season||existing.competition!==competition||existing.challenge_id!==(b.challenge_id??null)||existing.bet_amount!==bet)return res.status(409).json({error:'Request context mismatch'});
    return res.status(200).json(await complete(existing,user.id));
   }
   if(!await quota(`hand:start:${user.id}`,30,3600)||!await quota(`hand:start-ip:${ipKey(req)}`,120,3600))return res.status(429).json({error:'Too many games'});
   const roster=deal(b.sport,b.season,challenge);
   const {data,error}=await supabaseAdmin.rpc('start_authoritative_hand',{p_user:user.id,p_id:randomUUID(),p_request:b.request_id,p_sport:b.sport,p_season:b.season,p_competition:competition,p_challenge:b.challenge_id??null,p_bet:bet,p_state:{roster,draws:0,resolved:false}});
   if(isAuthoritySchemaMissing(error))throw error;
   if(error)return res.status(409).json({error:'Cannot start hand; check balance or retry'});
   return res.status(200).json(view(data));
  }
  if(typeof b.hand_id!=='string'||!UUID.test(b.hand_id))return res.status(400).json({error:'Invalid hand'});
  const {data:h,error}=await supabaseAdmin.from('hand_sessions').select('*').eq('player_id',user.id).eq('hand_id',b.hand_id).maybeSingle();
  if(error)throw error;if(!h)return res.status(404).json({error:'Hand not found'});
  if(b.action==='status')return res.status(200).json(await complete(h,user.id));
  const held=Array.isArray(b.held_slots)?b.held_slots:[];
  if(held.length>5||new Set(held).size!==held.length||held.some((n:any)=>!Number.isInteger(n)||n<0||n>4))return res.status(400).json({error:'Invalid held slots'});
  const fingerprint=digest(JSON.stringify([b.action,b.revision,[...held].sort()]));
  if(h.state.last_request===fingerprint)return res.status(200).json(await complete(h,user.id));
  if(h.settled){if(b.action!=='lock')return res.status(409).json({error:'Hand already settled'});return res.status(200).json(await complete(h,user.id));}
  if(h.revision!==b.revision||new Date(h.expires_at).getTime()<=Date.now())return res.status(409).json({error:'Hand expired or stale revision'});
  if(h.state.roster.some((c:any,i:number)=>c.wasHeld && !held.includes(i)))return res.status(409).json({error:'Previously held cards must stay held'});
  // Only selection indices are accepted. No client cards, points, tier, season or payout is read here.
  const state={...h.state,last_request:fingerprint};
  if(b.action==='draw'){
   const maxDraws=h.sport==='basketball'?2:1;
   if(state.draws>=maxDraws)return res.status(409).json({error:'No draws remaining'});
   state.roster=draw(h.sport,h.season,state.roster,held);state.draws++;
   state.roster=resolve(h.sport,h.season,state.roster,h.created_at,!!h.state.resolved);state.resolved=true;
  }else{
   state.roster=state.roster.map((c:any,i:number)=>({...c,wasHeld:held.includes(i)}));
   if(!state.resolved)state.roster=resolve(h.sport,h.season,state.roster,h.created_at);
   state.resolved=true;
  }
  const tier=outcome(h.sport,h.season,state.roster);
  const {data:committed,error:commitError}=await supabaseAdmin.rpc('commit_authoritative_hand',{p_user:user.id,p_id:h.hand_id,p_revision:b.revision,p_state:state,p_settle:b.action==='lock',p_tier:tier.tier,p_multiplier:tier.multiplier});
  if(isAuthoritySchemaMissing(commitError))throw commitError;
  if(commitError)return res.status(409).json({error:'Concurrent turn; retry the same action'});
  if(committed.settled){try{await awardVerifiedAchievements(user.id,h.hand_id,h.sport,h.season);}catch(e){console.error('[hand] achievement grant deferred');}}
  return res.status(200).json(view(committed));
 }catch(error){console.error('[hand] request failed',error instanceof Error?error.message:'backend error');return res.status(503).json(authorityUnavailable(error));}
}
