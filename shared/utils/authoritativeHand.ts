import { supabase } from '../lib/supabase';
export type ServerHand = {hand_id:string;revision:number;roster:any[];settled:boolean;hand:any;sport:string;season:string;challenge_id:string|null};
export class AuthoritativeHandError extends Error {
 constructor(public code: string, message: string) { super(message); this.name = 'AuthoritativeHandError'; }
}
export function handErrorMessage(error: unknown, fallback: string): string {
 if (!(error instanceof AuthoritativeHandError)) return fallback;
 switch (error.code) {
  case 'AUTHORITY_SCHEMA_MISSING': return 'Game database needs an update. Please contact the administrator.';
  case 'AUTH_REQUIRED': return 'Sign-in is not ready. Check your connection and sign in again.';
  case 'API_NOT_FOUND': return 'Game API is not connected. Check the local API server and proxy.';
  case 'AUTHORITY_UNAVAILABLE': return 'Game service unavailable. Please try again later.';
  default: return fallback;
 }
}
// One controller per mounted game surface, never a global cross-user/cross-tab hand.
export class AuthoritativeHand {
 snapshot:ServerHand|null=null;
 get pendingAction(): string | null { return this.pending?.action ?? null; }
 private startKey:string|null=null;
 private pending:any=null;
 private inFlight:Promise<ServerHand>|null=null;
 private flightKey:string|null=null;
 private startContext:any=null;
 private async send(body:any):Promise<ServerHand> {
  const key=JSON.stringify(body);
  if(this.inFlight){if(key!==this.flightKey)throw new Error("A different server action is pending");return this.inFlight;}
  this.flightKey=key;
  this.inFlight=(async()=>{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw new AuthoritativeHandError('AUTH_REQUIRED', 'Sign in before playing');
   const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
   try{
    const r=await fetch('/api/hand/resolve',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body),signal:controller.signal});
    let d:any;
    try { d=await r.json(); } catch {
     throw new AuthoritativeHandError(r.status===404 ? 'API_NOT_FOUND' : 'AUTHORITY_UNAVAILABLE', 'Invalid game API response');
    }
    if(!r.ok)throw new AuthoritativeHandError(r.status===404 ? 'API_NOT_FOUND' : r.status===401 ? 'AUTH_REQUIRED' : d.code??'AUTHORITY_UNAVAILABLE',d.error??'Server game unavailable');
    if(!d.hand_id||!Array.isArray(d.roster)||d.roster.length!==5)throw new Error('Invalid server response');
    this.snapshot=d;return d;
   }finally{clearTimeout(timeout);}
  })();
  try{return await this.inFlight;}finally{this.inFlight=null;this.flightKey=null;}
 }
 async start(context:{sport:string;season:string;competition?:string;challenge_id?:string;bet_amount:number}):Promise<ServerHand> {
  // Retain the request id on network failure: a retry must not debit a second stake.
  if(!this.startKey){this.startKey=crypto.randomUUID();this.startContext=context;}
  if(JSON.stringify(context)!==JSON.stringify(this.startContext))throw new Error("Retry the original game context first");
  const result=await this.send({action:'start',request_id:this.startKey,...context});
  this.startKey=null;this.pending=null;return result;
 }
 async turn(action:'draw'|'lock',held:number[]):Promise<ServerHand> {
  if(!this.snapshot)throw new Error('Start a server hand first');
  if(this.snapshot.settled){if(action==='lock')return this.snapshot;throw new Error('Hand already settled');}
  // Retry the SAME command after an ambiguous timeout, not a new random draw.
  if(!this.pending)this.pending={action,hand_id:this.snapshot.hand_id,revision:this.snapshot.revision,held_slots:held};
  if(this.pending.action!==action)throw new Error('Retry the pending turn first');
  const result=await this.send(this.pending);this.pending=null;return result;
 }
}
