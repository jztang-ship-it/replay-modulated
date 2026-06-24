/**
 * shared/components/BossScreen.tsx
 *
 * Full-screen overlay opened by the GameBar BOSS pill (solo basketball). The
 * "A" layout — one meaning: "here's today's boss, take it," leaderboard as
 * secondary context below. Top→bottom, centered:
 *   1 header (DAILY BOSS + close) · 2 title (boss display) · 3 story slot
 *   (context + Target) · 4 compact lineup strip · 5 TAKE THE BOSS CTA ·
 *   6 today's-boss leaderboard (top 10, internal scroll) · 7 pinned your-rank bar.
 *
 * Structure: fixed top chrome (1-5) + flex:1 middle (the leaderboard LIST, its
 * own scroll) + pinned bottom rank bar (7). Chrome + rank bar never scroll.
 *
 * Data: boss identity/lineup come from GET /api/challenge/{bossChallengeId}
 * (challenger_name=display, share_headline=flavor, target_score, initial_roster
 * .cards=the five). The story slot prefers a richer `story` field if the GET
 * ever carries one (authored boss stories land in docs/boss-bank-v1.json and
 * will be plumbed through), else the flavor one-liner — so it upgrades
 * automatically. Boss play = the existing /{sport}/challenge/{id} open path
 * (H2HRecipientPlay), no fork. board=boss leaderboard endpoint untouched.
 */
import { useEffect, useState, useCallback } from "react";

const FF = "'Rajdhani', 'Arial Narrow', sans-serif";

type Entry = { uid: string; nickname: string; score: number; session_id?: string | null };

type LineupCard = { name: string; position: string; photoCode: string | null; basePlayerId: string };

interface BossInfo {
  display: string;
  story: string;          // story ?? flavor (see header note)
  target: number | null;
  cards: LineupCard[];
}

interface Props {
  sport: "basketball" | "baseball" | "football";
  currentUid: string;
  bossChallengeId: string | null;
  bossPlayerCount: number | null;
  /** Optional headshot resolver (sport adapter). Absent → name/position tiles. */
  headshotUrl?: (playerId: string) => string | null;
  onClose: () => void;
}

function isMe(e: Entry, uid: string, sessId: string | null): boolean {
  if (uid && e.uid === uid) return true;
  if (sessId && e.session_id && e.session_id === sessId) return true;
  return false;
}

function BossEntryRow({ e, rank, me }: { e: Entry; rank: number; me: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "6px 8px", borderRadius: 6,
      background: me ? "rgba(255,177,74,0.12)" : "transparent",
      borderLeft: me ? "2px solid #FFB14A" : "2px solid transparent",
    }}>
      <span style={{
        fontSize: 11, fontWeight: 900,
        color: rank <= 3 ? "#FFB14A" : "rgba(255,255,255,0.3)",
        minWidth: 18, textAlign: "right",
      }}>{rank}</span>
      <span style={{
        flex: 1, fontSize: 12, fontWeight: me ? 800 : 600,
        color: me ? "#FFB14A" : "rgba(255,255,255,0.7)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{me ? "YOU" : e.nickname}</span>
      <span style={{
        fontSize: 12, fontWeight: 900,
        color: me ? "#FFB14A" : "#EAF0FF",
        fontVariantNumeric: "tabular-nums",
      }}>{e.score.toFixed(1)}</span>
    </div>
  );
}

function LineupTile({ card, headshotUrl }: { card: LineupCard; headshotUrl?: (id: string) => string | null }) {
  const id = card.photoCode || card.basePlayerId;
  const src = headshotUrl && id ? headshotUrl(id) : null;
  const first = card.name.split(" ")[0] ?? "";
  const last = card.name.split(" ").slice(1).join(" ");
  return (
    // flex:1 so the five tiles fill the content width edge-to-edge (the hero);
    // maxWidth caps them card-sized on wide screens. Real ~2:3 card aspect.
    <div style={{ flex: 1, minWidth: 0, maxWidth: 76, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div style={{
        width: "100%", aspectRatio: "2 / 3", borderRadius: 8, overflow: "hidden",
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}>
        {src ? (
          // NBA headshot is landscape; cover + top-center crops it to the
          // portrait card showing the face.
          <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }} />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.5)", paddingBottom: 8 }}>{card.position}</span>
        )}
      </div>
      <span style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.8)", width: "100%", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.1 }}>
        {last || first}
      </span>
    </div>
  );
}

export function BossScreen({ sport, currentUid, bossChallengeId, bossPlayerCount, headshotUrl, onClose }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [boss, setBoss] = useState<BossInfo | null>(null);
  const sessId = typeof localStorage !== "undefined" ? localStorage.getItem("rm_session_id") : null;

  // Leaderboard (board=boss — endpoint unchanged). Top 10.
  useEffect(() => {
    fetch(`/api/leaderboard?sport=${sport}&board=boss&limit=10`)
      .then(r => r.json())
      .catch(() => ({ entries: [] }))
      .then((d) => { setEntries(d.entries ?? []); setLoaded(true); });
  }, [sport]);

  // Boss identity + lineup. Best-effort: any failure leaves boss=null and the
  // page falls back to generic chrome (never crashes / never a dead end).
  useEffect(() => {
    if (!bossChallengeId) { setBoss(null); return; }
    let cancelled = false;
    fetch(`/api/challenge/${bossChallengeId}`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        if (cancelled || !d) return;
        const rawCards = (d.initial_roster && (d.initial_roster as any).cards) || [];
        const cards: LineupCard[] = Array.isArray(rawCards)
          ? rawCards.slice(0, 5).map((c: any) => ({
              name: String(c.name ?? ""),
              position: String(c.position ?? ""),
              photoCode: c.photoCode != null ? String(c.photoCode) : null,
              basePlayerId: String(c.basePlayerId ?? ""),
            }))
          : [];
        setBoss({
          display: String(d.challenger_name ?? "Today's Boss"),
          // Prefer a richer authored `story` when present; else the flavor
          // one-liner. Upgrades automatically when stories are plumbed through.
          story: String(d.story ?? d.share_headline ?? ""),
          target: typeof d.target_score === "number" ? d.target_score : null,
          cards,
        });
      });
    return () => { cancelled = true; };
  }, [bossChallengeId]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleClose = useCallback(() => onClose(), [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const myIdx = entries.findIndex(e => isMe(e, currentUid, sessId));
  const topScore = entries.length > 0 ? entries[0].score : null;
  const gapFromTop = myIdx >= 0 && topScore != null ? Math.max(0, topScore - entries[myIdx].score) : null;
  const href = bossChallengeId ? `/${sport}/challenge/${bossChallengeId}` : null;

  return (
    <div
      data-testid="boss-screen"
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "linear-gradient(180deg, #070A12 0%, #0A1020 60%, #070A12 100%)",
        color: "#EAF0FF",
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Fixed top chrome (1-5) ── */}
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* 1 — Header: DAILY BOSS eyebrow + close */}
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 4px" }}>
          <span style={{ width: 52 }} aria-hidden="true" />
          <span style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,177,74,0.85)", fontFamily: FF, letterSpacing: 2, textTransform: "uppercase" }}>
            Daily Boss
          </span>
          <button onClick={handleClose} style={{
            width: 52, textAlign: "right",
            background: "none", border: "none", color: "rgba(255,255,255,0.5)",
            fontSize: 12, cursor: "pointer",
          }}>Done</button>
        </div>

        {/* 2 — Title: boss display name */}
        <div style={{ fontSize: 24, fontWeight: 950, color: "#EAF0FF", fontFamily: FF, letterSpacing: 0.5, textAlign: "center", padding: "8px 16px 0" }}>
          {boss?.display ?? "Today's Boss"}
        </div>

        {/* 3 — Story slot: context + Target */}
        <div style={{ maxWidth: 340, textAlign: "center", padding: "8px 16px 0" }}>
          {boss?.story ? (
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: "rgba(234,240,255,0.82)" }}>{boss.story}</div>
          ) : bossPlayerCount != null && bossPlayerCount > 0 ? (
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(234,240,255,0.6)" }}>{bossPlayerCount.toLocaleString()} players have tried</div>
          ) : null}
          {boss?.target != null && (
            <div style={{ fontSize: 13, fontWeight: 900, color: "#FFB14A", letterSpacing: 0.5, marginTop: 8 }}>
              Target: {boss.target.toFixed(1)}
            </div>
          )}
        </div>

        {/* 4 — Lineup strip (compact, centered, h-scroll if needed) */}
        {boss && boss.cards.length > 0 && (
          <div style={{ width: "100%", padding: "16px 14px 0", boxSizing: "border-box" }}>
            {/* The lineup is the page hero: five flex:1 cards fill the row
                edge-to-edge, one row, no scroll, all five visible. */}
            <div style={{ display: "flex", gap: 6, width: "100%", justifyContent: "center", alignItems: "flex-start" }}>
              {boss.cards.map((c, i) => <LineupTile key={`lu-${i}`} card={c} headshotUrl={headshotUrl} />)}
            </div>
          </div>
        )}

        {/* 5 — CTA: TAKE THE BOSS (centered, content-width) */}
        {href ? (
          <a
            data-testid="boss-take-cta"
            href={href}
            style={{
              margin: "16px 0 6px", padding: "11px 28px", borderRadius: 12,
              background: "#FFB14A", color: "#070A12", textDecoration: "none",
              fontWeight: 950, fontSize: 14, letterSpacing: 0.8, textTransform: "uppercase",
            }}
          >
            Take the Boss
          </a>
        ) : (
          <div style={{ margin: "16px 16px 6px", padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", textAlign: "center", fontSize: 13, fontWeight: 700, color: "rgba(234,240,255,0.7)" }}>
            No boss today — check back tomorrow.
          </div>
        )}
      </div>

      {/* ── 6 — Leaderboard (own internal scroll) ── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "12px 16px 0", overflow: "hidden" }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: "#FFB14A", letterSpacing: 0.5, padding: "0 4px 6px", flexShrink: 0 }}>
          Boss Leaderboard
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {!loaded ? (
            [1, 2, 3].map(i => <div key={i} style={{ height: 32, borderRadius: 6, background: "rgba(255,255,255,0.03)", flexShrink: 0 }} />)
          ) : entries.length === 0 ? (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", padding: "8px 4px" }}>
              Be the first to challenge today's boss.
            </div>
          ) : (
            entries.slice(0, 10).map((e, i) => (
              <BossEntryRow key={`boss-${i}`} e={e} rank={i + 1} me={isMe(e, currentUid, sessId)} />
            ))
          )}
        </div>
      </div>

      {/* ── 7 — Pinned your-rank bar (always visible) ── */}
      <div style={{ flexShrink: 0, padding: "10px 16px 16px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        {myIdx >= 0 ? (
          <div style={{ fontSize: 12, fontWeight: 800, color: "#FFB14A" }}>
            Your rank: #{myIdx + 1}{gapFromTop != null && gapFromTop > 0 ? ` · −${gapFromTop.toFixed(1)} from top` : " · top of the board"}
          </div>
        ) : (
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>
            The board doesn't know your name yet. Fix that.
          </div>
        )}
      </div>
    </div>
  );
}
