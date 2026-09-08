import type { VercelRequest,VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../hand/_lib/supabaseServer.js';
import { verifyAuth } from '../../hand/_lib/auth.js';
import { boundedBody,quota } from '../../hand/_lib/security.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function handler(req: VercelRequest,res: VercelResponse) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({error:'POST required'});
 try {
  const {user}=await verifyAuth(req); if(!user) return res.status(401).json({error:'Unauthorized'});
  const b=boundedBody(req); const id=req.query.id;
  if(typeof id!=='string'||!UUID.test(id)||typeof b.hand_id!=='string'||!UUID.test(b.hand_id)) return res.status(400).json({error:'Invalid identifiers'});
  if(!await quota(`attempt:${user.id}`,60,3600)) return res.status(429).json({error:'Too many attempts'});
  const {data,error}=await supabaseAdmin.rpc('submit_authoritative_attempt',{
   p_user:user.id,p_challenge:id,p_hand:b.hand_id,p_name:typeof b.user_name==='string'?b.user_name.slice(0,32):'Player',
   p_ref:typeof b.referrer_token==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(b.referrer_token)?b.referrer_token:null,
  });
  if(error) return res.status(409).json({error:'Challenge result cannot be accepted'});
  return res.status(200).json(data);
 } catch { return res.status(503).json({error:'Challenge service unavailable'}); }
}
