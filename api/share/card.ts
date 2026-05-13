// api/share/card.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ImageResponse } from "@vercel/og";
import { supabaseAdmin } from "../hand/lib/supabaseServer.js";

// Tier accent colors for card backgrounds
const TIER_ACCENT: Record<string, string> = {
  RED: "#EF4444", ORANGE: "#FB923C", PURPLE: "#C084FC",
  BLUE: "#3B82F6", GREEN: "#22C55E", WHITE: "#9CA3AF",
};

const TIER_BG: Record<string, string> = {
  RED: "rgba(239,68,68,0.25)", ORANGE: "rgba(251,146,60,0.25)",
  PURPLE: "rgba(192,132,252,0.22)", BLUE: "rgba(59,130,246,0.18)",
  GREEN: "rgba(34,197,94,0.18)", WHITE: "rgba(156,163,175,0.08)",
};

function formatStatLine(card: any): string {
  return `$${card.salary} · ${card.position}`;
}

// Layout helper: splits rosterSize cards into rows per layout
function getRows(cards: any[], layout: string): any[][] {
  if (layout === "3+2") return [cards.slice(0, 3), cards.slice(3, 5)];
  if (layout === "2+3") return [cards.slice(0, 2), cards.slice(2, 5)];
  return [cards.slice(0, 3), cards.slice(3, 5)];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const challengeId = req.query.challenge_id as string;
  if (!challengeId) return res.status(400).json({ error: "Missing challenge_id" });

  const { data: challenge, error } = await supabaseAdmin
    .from("shared_challenges")
    .select("challenge_id, challenger_name, target_fp, sport, share_headline, initial_roster, trigger_type")
    .eq("challenge_id", challengeId)
    .single();

  if (error || !challenge) return res.status(404).end();

  const cards: any[] = (challenge.initial_roster as any)?.cards ?? [];
  const targetFp = Number(challenge.target_fp).toFixed(1);
  const challengerName = challenge.challenger_name ?? "Anonymous";
  const headline = challenge.share_headline || `${targetFp} FP. Same slate. Beat them.`;
  const rows = getRows(cards, "3+2");

  // Build JSX element for satori (must be plain object style — no imports)
  const element = {
    type: "div",
    props: {
      style: {
        display: "flex", flexDirection: "column", width: "1080px", height: "1920px",
        background: "linear-gradient(180deg, #070A12 0%, #0D1628 50%, #070A12 100%)",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#EAF0FF",
        padding: "80px 60px",
        boxSizing: "border-box",
      },
      children: [
        // Header
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", gap: "16px", marginBottom: "48px" },
            children: [
              { type: "span", props: { style: { fontSize: "36px", fontWeight: 950, letterSpacing: "-1px", color: "#EAF0FF" }, children: "REPLAY" } },
              { type: "span", props: { style: { fontSize: "22px", fontWeight: 900, letterSpacing: "4px", color: "#FFB14A" }, children: "IFS" } },
            ],
          },
        },
        // Challenger name + score
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: "16px", marginBottom: "56px" },
            children: [
              { type: "div", props: { style: { fontSize: "52px", fontWeight: 900, color: "#EAF0FF" }, children: challengerName } },
              {
                type: "div",
                props: {
                  style: { display: "flex", alignItems: "baseline", gap: "12px" },
                  children: [
                    { type: "span", props: { style: { fontSize: "100px", fontWeight: 950, color: "#FFB14A", lineHeight: 1, fontStyle: "italic" }, children: targetFp } },
                    { type: "span", props: { style: { fontSize: "36px", fontWeight: 700, color: "rgba(255,255,255,0.5)" }, children: "FP" } },
                  ],
                },
              },
            ],
          },
        },
        // Headline
        {
          type: "div",
          props: {
            style: { fontSize: "48px", fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: "72px", lineHeight: 1.3 },
            children: headline,
          },
        },
        // Card grid rows
        ...rows.map((row: any[]) => ({
          type: "div",
          props: {
            style: { display: "flex", gap: "24px", marginBottom: "24px", justifyContent: row.length === 2 ? "center" : "flex-start" },
            children: row.map((card: any) => ({
              type: "div",
              props: {
                style: {
                  display: "flex", flexDirection: "column", alignItems: "center",
                  width: row.length === 3 ? "292px" : "440px",
                  background: TIER_BG[card.tier] ?? "rgba(255,255,255,0.05)",
                  border: `2px solid ${TIER_ACCENT[card.tier] ?? "#9CA3AF"}`,
                  borderRadius: "16px", padding: "20px",
                },
                children: [
                  { type: "div", props: { style: { fontSize: "20px", fontWeight: 700, color: TIER_ACCENT[card.tier] ?? "#9CA3AF", letterSpacing: "2px" }, children: card.tier } },
                  { type: "div", props: { style: { fontSize: "26px", fontWeight: 800, color: "#EAF0FF", marginTop: "8px", textAlign: "center" }, children: card.name } },
                  { type: "div", props: { style: { fontSize: "18px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }, children: formatStatLine(card) } },
                ],
              },
            })),
          },
        })),
        // CTA
        {
          type: "div",
          props: {
            style: {
              marginTop: "auto", padding: "40px 60px", borderRadius: "20px",
              background: "rgba(255,177,74,0.15)", border: "2px solid rgba(255,177,74,0.4)",
              textAlign: "center",
            },
            children: [
              { type: "div", props: { style: { fontSize: "44px", fontWeight: 900, color: "#FFB14A" }, children: "Same starting cards." } },
              { type: "div", props: { style: { fontSize: "40px", fontWeight: 700, color: "rgba(255,255,255,0.7)", marginTop: "8px" }, children: "Your hold/draw decisions." } },
            ],
          },
        },
      ],
    },
  };

  try {
    const imageResponse = new ImageResponse(element as any, { width: 1080, height: 1920 });
    const ab = await imageResponse.arrayBuffer();
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.end(Buffer.from(ab));
  } catch (err) {
    console.error("[share/card]", err);
    res.status(500).end();
  }
}
