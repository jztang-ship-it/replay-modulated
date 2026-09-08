import { authorityUnavailable } from "./hand/_lib/authorityErrors.js";
/** Read-only pool API. Verified settlement contributes inside the PostgreSQL
 * transaction. Legacy browser-controlled KV pools are deliberately not imported.
 * A missing row starts at 1000; storage errors return 503, never a fake balance. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./hand/_lib/supabaseServer.js";

const SEED = 1000;
const SUPPORTED_SPORTS = new Set(["basketball", "baseball", "football"]);
const SUPPORTED_COMPETITIONS: Record<string, Set<string>> = {
  football: new Set(["world_cup"]),
};
const COMPETITION_REQUIRED = new Set(["football"]);

function validateRequest(sport: string, competition?: string): string | null {
  if (!SUPPORTED_SPORTS.has(sport)) {
    return `Unsupported sport: ${sport}`;
  }
  if (COMPETITION_REQUIRED.has(sport) && !competition) {
    return `competition required for sport: ${sport}`;
  }
  if (competition && (!SUPPORTED_COMPETITIONS[sport] || !SUPPORTED_COMPETITIONS[sport].has(competition))) {
    return `Unsupported competition: ${competition}`;
  }
  return null;
}

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function readPool(sport: string, competition?: string): Promise<number> {
  if (!supabaseAdmin) throw new Error("Authority unavailable");
  const {data,error} = await supabaseAdmin.from("authoritative_bonus_pools").select("amount").eq("scope", competition ? `${sport}:${competition}` : sport).maybeSingle();
  if (error) throw error;
  return data ? Number(data.amount) : SEED;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      const sport = String(req.query?.sport ?? "").trim().toLowerCase();
      const competition = req.query?.competition
        ? String(req.query.competition).trim().toLowerCase()
        : undefined;

      const err = validateRequest(sport, competition);
      if (err) return json(res, 400, { error: err });

      const pool = await readPool(sport, competition);
      return json(res, 200, { pool });
    }

    if (req.method === "POST") {
      // Contributions are an accounting side effect of a verified hand
      // resolve. Never accept a caller-supplied amount from the browser.
      return json(res, 403, { error: "Bonus pool contributions are server-only" });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return json(res, 503, authorityUnavailable(error, "Bonus pool unavailable"));
  }
}
