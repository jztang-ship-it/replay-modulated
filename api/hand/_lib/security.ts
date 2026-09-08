import { createHash } from "node:crypto";
import { kv } from "@vercel/kv";
export function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
// INCR and TTL are one operation. Storage failure MUST NOT open a paid/write path.
export async function quota(key: string, limit: number, seconds: number): Promise<boolean> {
 const count = await kv.eval(`local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n`, ["security:v2:"+key], [seconds]);
 const n=Number(count);
 if(!Number.isSafeInteger(n)||n<1)throw new Error("Invalid quota response");
 return n<=limit;
}
export function ipKey(req: any): string {
 // Vercel overwrites this header; do not trust the client-controlled x-forwarded-for.
 const raw=process.env.VERCEL ? req.headers['x-vercel-forwarded-for'] : req.socket?.remoteAddress;
 return digest(typeof raw==='string' ? raw.split(',')[0].trim() : 'unknown');
}
export function boundedBody(req: any, maxBytes=8192): any {
 const text=typeof req.body==='string' ? req.body : JSON.stringify(req.body ?? {});
 if (Buffer.byteLength(text,'utf8')>maxBytes) throw new Error('Request too large');
 const body=JSON.parse(text);
 if (!body || typeof body!=='object' || Array.isArray(body)) throw new Error('Invalid body');
 return body;
}
