import type { VercelRequest, VercelResponse } from "@vercel/node";
/** Legacy route tombstone: no pool, balance read or contribution in free play. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
 res.setHeader("Cache-Control", "no-store");
 return res.status(410).json({ error: "This feature is not available in free play" });
}
