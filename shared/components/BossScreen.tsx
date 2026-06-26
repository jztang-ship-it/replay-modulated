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
import { useEffect, useState, useCallback, useRef } from "react";
// Path B: authored per-boss stories, generated from docs/boss-bank-v1.json
// (keyed by bank id == boss_identity_id). Regen via scripts/gen-boss-stories.mjs;
// a drift test keeps it synced to the bank.
import bossStories from "@shared/data/bossStories.generated.json";
// Reuse the SAME tier-color source the gameplay cards (CardFront) use — not a
// parallel recolor. getTier(tier) → { bg, bgEnd, frame, ... }. TIER_POSITION_TEXT
// is the same top-right position palette CardFront uses; replicated (not a
// CardFront import) so the boss tile matches the gameplay card face token-for-token.
import { getTier, TIER_POSITION_TEXT, type TierKey } from "@shared/theme";
// Shared "0304" → "03-04" formatter (values-only; not CardFront's private copy).
import { formatSeasonRange } from "@shared/utils/seasonRange";
// Returning-player win-state — the SAME local key BossLandingView reads. Additive
// display over existing data (no new fetch); getBossResult was previously ungrepped here.
import { getBossResult, hasSeenBossReveal, markBossRevealSeen, bossRevealForce, type BossResult } from "@shared/utils/bossResultMemory";
import { useBossReveal } from "@shared/hooks/useBossReveal";
import type { CardRenderer } from "@shared/components/H2HRevealScreen";

// First-view reveal renders the boss five as REAL cards scaled into the strip slot
// (recon B); mirrors the H2H strip's natural-card box (width + height + absolute).
const REVEAL_CARD_W = 150;
const REVEAL_CARD_H = (150 * 478) / 329;

const FF = "'Rajdhani', 'Arial Narrow', sans-serif";

const BOSS_STORIES = bossStories as Record<string, string>;

export type Entry = { uid: string; nickname: string; score: number; session_id?: string | null };

type LineupCard = { name: string; position: string; salary: number; photoCode: string | null; basePlayerId: string; tier: string; fp: number };

export interface BossInfo {
  display: string;
  story: string;          // story ?? flavor (see header note)
  target: number | null;
  team: string;           // derived from boss_identity_id prefix (see GET handler)
  seasonRange: string;    // top-level season "0304" → "03-04"
  cards: LineupCard[];
}

interface Props {
  sport: "basketball" | "baseball" | "football";
  currentUid: string;
  bossChallengeId: string | null;
  bossPlayerCount: number | null;
  /** Optional headshot resolver (sport adapter). Absent → name/position tiles. */
  headshotUrl?: (playerId: string) => string | null;
  /** Sport card renderer (basketball: h2hArcRenderer, via the GameAdapter) — used
   *  ONLY by the first-view reveal to render the five as real cards. Absent → the
   *  reveal is skipped and the LineupTile strip shows as today. */
  renderBossCard?: CardRenderer;
  /** DEV-only fixture injection (the boss-hub-mock glass route). When provided,
   *  BossScreen uses these directly and SKIPS both /api fetches — so the mock is
   *  fully self-contained (no backend, glassable under plain `vite`). */
  __devBoss?: BossInfo;
  __devEntries?: Entry[];
  /** Consolidation Phase 3 step 1 — in-app boss-direct accept. When provided,
   *  the TAKE THE BOSS CTA fires this with the raw GET row (the hub's OWN fetch)
   *  instead of full-page-navigating to /challenge/{id}, so the in-app path skips
   *  the redundant landing render. App builds the ctx (buildChallengeCtx) and runs
   *  the existing boss accept. Absent (cold-link safety / other sports / dev mock)
   *  → the CTA stays the <a href> nav. */
  onTakeBoss?: (raw: unknown) => void;
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
  // Track a failed LOAD (404/broken), not just a missing url — onError swaps
  // to the name/position tile so a broken-image glyph never shows.
  const [imgFailed, setImgFailed] = useState(false);
  const first = card.name.split(" ")[0] ?? "";
  const last = card.name.split(" ").slice(1).join(" ");
  const showImg = !!src && !imgFailed;
  const t = getTier(card.tier);
  // Replica of CardFront's face tokens (NOT a CardFront import — no refactor):
  // salary uses onCardText (white only on the dark WHITE-tier body, else black);
  // position uses the TIER_POSITION_TEXT palette. Same italic/900 treatment,
  // scaled to the mini-tile.
  const derivedTier = String(card.tier ?? "WHITE").toUpperCase();
  const onCardText = derivedTier === "WHITE" ? "#FFFFFF" : "#000000";
  const positionTextColor = TIER_POSITION_TEXT[(derivedTier as TierKey)] ?? TIER_POSITION_TEXT.WHITE;
  return (
    // flex:1 so the five tiles fill the content width edge-to-edge (the hero);
    // maxWidth caps them card-sized on wide screens. Real ~2:3 card aspect.
    <div style={{ flex: 1, minWidth: 0, maxWidth: 76, display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Composition B — a miniature of the gameplay card: the TIER GRADIENT is
          the card body (getTier — same source as CardFront), tier frame border,
          salary top-left + position top-right (CardFront token replica),
          headshot anchored in the top region (NOT full-bleed) so the gradient
          band reads at the bottom, and the name on that band over a slight dark
          scrim (guaranteed-readable on every tier — see note). onError → the
          gradient body + position glyph + name (a colored tile, not flat dark). */}
      <div style={{
        position: "relative",
        width: "100%", aspectRatio: "2 / 3", borderRadius: 8, overflow: "hidden",
        background: `linear-gradient(to bottom, ${t.bg} 0%, ${t.bgEnd} 100%)`,
        border: `1.5px solid ${t.frame}`,
        display: "flex", flexDirection: "column",
      }}>
        {/* SALARY — top-left (replica of CardFront salary token, mini scale) */}
        <span style={{
          position: "absolute", top: 3, left: 4, zIndex: 3, pointerEvents: "none",
          fontSize: 10, fontWeight: 900, fontStyle: "italic", color: onCardText, letterSpacing: -0.5, lineHeight: 1,
        }}>${card.salary}</span>
        {/* POSITION — top-right (replica of CardFront position token, mini scale) */}
        <span style={{
          position: "absolute", top: 3, right: 4, zIndex: 3, pointerEvents: "none",
          fontSize: 10, fontWeight: 900, fontStyle: "italic", color: positionTextColor, letterSpacing: -0.5, lineHeight: 1, textTransform: "uppercase",
        }}>{card.position}</span>
        <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden" }}>
          {showImg ? (
            // NBA headshot is landscape; cover + top-center crops it to the face.
            // onError → fall back so a broken-image glyph never shows.
            <img src={src!} alt="" onError={() => setImgFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }} />
          ) : (
            <span style={{ fontSize: 15, fontWeight: 900, color: "rgba(255,255,255,0.7)", paddingBottom: 10 }}>{card.position}</span>
          )}
        </div>
        {/* Name band — light text on a slight dark scrim. NOTE: getTier's
            `isLight` is a tier-RANK flag (WHITE=true) with a DARK gradient, and
            even bgEnd luminance varies (teal/lime bright vs purple dark), so a
            literal isLight→text-color would mis-contrast (esp. WHITE). The scrim
            + light text is the robust read of "names stay readable on any tier." */}
        <div style={{
          flexShrink: 0, padding: "3px 4px",
          background: "rgba(7,10,18,0.5)",
          fontSize: 9, fontWeight: 900, color: "#F4F7FF",
          textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.15,
        }}>
          {last || first}
        </div>
      </div>
    </div>
  );
}

export function BossScreen({ sport, currentUid, bossChallengeId, bossPlayerCount, headshotUrl, renderBossCard, __devBoss, __devEntries, onTakeBoss, onClose }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [boss, setBoss] = useState<BossInfo | null>(null);
  // Raw GET row retained for the in-app boss-direct accept (Phase 3 step 1). The
  // hub already fetches /api/challenge/{id} for the lineup/target; keeping the
  // raw row lets onTakeBoss build the SAME ctx the cold landing does — no second
  // fetch, no veil. State (not a ref) so the CTA re-renders into the in-app button
  // once the row lands. null until the fetch resolves (CTA falls back to href).
  const [rawData, setRawData] = useState<unknown>(null);
  // Returning-player result for THIS boss (won/score), read from the same local
  // key BossLandingView uses. Sync localStorage read on the prop id — no fetch.
  const [bossResult, setBossResult] = useState<BossResult | null>(null);
  useEffect(() => { setBossResult(getBossResult(bossChallengeId)); }, [bossChallengeId]);

  // Consolidation Phase 1 (hub) — first-VIEW reveal arming. Fires once per boss
  // (rm_boss_reveal_seen_{id}); returning players (priorResult) never reveal;
  // ?reveal=force (DEV, via the boss-hub-mock route) re-fires. Waits for the boss
  // fetch so the target/five are present. Display-only — no deal/share/routing.
  const [armReveal, setArmReveal] = useState(false);
  // Decide arming SYNCHRONOUSLY on the first render the boss is available — so the
  // count-up starts from 0 with no target-flash (a state+effect would paint `target`
  // for one frame first). Latch keyed on the boss id (re-decides on a new boss). The
  // seen-flag WRITE happens in the effect below so it can't un-arm a live reveal.
  const armDecidedForRef = useRef<string | null>(null);
  if (armDecidedForRef.current !== bossChallengeId && boss && boss.target != null && bossChallengeId && renderBossCard) {
    armDecidedForRef.current = bossChallengeId;
    const eligible = bossRevealForce() || (!getBossResult(bossChallengeId) && !hasSeenBossReveal(bossChallengeId));
    setArmReveal(eligible);
  }
  useEffect(() => {
    // Consume the once-per-boss flag once armed (not on force — leave it re-glassable).
    if (armReveal && bossChallengeId && !bossRevealForce()) markBossRevealSeen(bossChallengeId);
  }, [armReveal, bossChallengeId]);
  const reveal = useBossReveal(armReveal, boss?.target ?? 0, bossChallengeId ?? "");
  const sessId = typeof localStorage !== "undefined" ? localStorage.getItem("rm_session_id") : null;

  // Leaderboard (board=boss — endpoint unchanged). Top 10.
  useEffect(() => {
    if (__devEntries) { setEntries(__devEntries); setLoaded(true); return; } // DEV fixture — no fetch
    fetch(`/api/leaderboard?sport=${sport}&board=boss&limit=10`)
      .then(r => r.json())
      .catch(() => ({ entries: [] }))
      .then((d) => { setEntries(d.entries ?? []); setLoaded(true); });
  }, [sport, __devEntries]);

  // Boss identity + lineup. Best-effort: any failure leaves boss=null and the
  // page falls back to generic chrome (never crashes / never a dead end).
  useEffect(() => {
    if (__devBoss) { setBoss(__devBoss); return; }                            // DEV fixture — no fetch
    if (!bossChallengeId) { setBoss(null); return; }
    let cancelled = false;
    fetch(`/api/challenge/${bossChallengeId}`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        if (cancelled || !d) return;
        setRawData(d);  // retain for in-app onTakeBoss (Phase 3 step 1)
        const rawCards = (d.initial_roster && (d.initial_roster as any).cards) || [];
        const cards: LineupCard[] = Array.isArray(rawCards)
          ? rawCards.slice(0, 5).map((c: any) => ({
              name: String(c.name ?? ""),
              // On the wire the field is `pos` (revealedFive shape); `position`
              // is the legacy fallback — neither is `position` today.
              position: String(c.pos ?? c.position ?? ""),
              salary: Number(c.salary ?? 0),
              photoCode: c.photoCode != null ? String(c.photoCode) : null,
              basePlayerId: String(c.basePlayerId ?? ""),
              tier: String(c.tier ?? "WHITE"),
              // fp — needed by the first-view reveal (per-card roll + Σ == target).
              fp: Number(c.fp ?? c.actualFp ?? 0),
            }))
          : [];
        const mappedStory = d.boss_identity_id ? BOSS_STORIES[String(d.boss_identity_id)] : undefined;
        // Title team — derive from the SAME boss_identity_id already consumed
        // for the story map (no re-fetch, no threading). Relies on the
        // authoritative {TEAM}-{YYYY} bank-key convention (e.g. "DET-0304" →
        // "DET"); every serveable boss key conforms.
        const team = String(d.boss_identity_id ?? "").split("-")[0];
        setBoss({
          display: String(d.challenger_name ?? "Today's Boss"),
          // Prefer the authored per-boss story (bundled map, keyed by
          // boss_identity_id); else a `story` row field if ever plumbed; else
          // the flavor one-liner. Flavor stays the fallback for a missing entry.
          story: String(mappedStory ?? d.story ?? d.share_headline ?? ""),
          target: typeof d.target_score === "number" ? d.target_score : null,
          team,
          seasonRange: formatSeasonRange(d.season),
          cards,
        });
      });
    return () => { cancelled = true; };
  }, [bossChallengeId, __devBoss]);

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

        {/* 2 — Title: boss display name · {TEAM} {season-range}
            (e.g. "Goin' to Work · DET 03-04"). Team + season are per-boss from
            data — team from boss_identity_id, season from the top-level row —
            never hardcoded. Suffix only when the boss (and thus both) resolved. */}
        <div style={{ fontSize: 24, fontWeight: 950, color: "#EAF0FF", fontFamily: FF, letterSpacing: 0.5, textAlign: "center", padding: "8px 16px 0" }}>
          {boss?.display ?? "Today's Boss"}
          {boss?.team && boss?.seasonRange && (
            <span style={{ fontWeight: 800, color: "rgba(234,240,255,0.55)" }}>{` · ${boss.team} ${boss.seasonRange}`}</span>
          )}
        </div>

        {/* 3 — Story slot: context + Target */}
        <div style={{ maxWidth: 340, textAlign: "center", padding: "8px 16px 0" }}>
          {boss?.story ? (
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: "rgba(234,240,255,0.82)" }}>{boss.story}</div>
          ) : bossPlayerCount != null && bossPlayerCount > 0 ? (
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(234,240,255,0.6)" }}>{bossPlayerCount.toLocaleString()} players have tried</div>
          ) : null}
          {boss?.target != null && (
            <>
              {/* Line 1 — standalone target to beat. On a first VIEW this counts
                  0→target with the lineup reveal and snaps to the baked target
                  (reveal.running == boss.target when not revealing). */}
              <div data-testid="boss-target" style={{ fontSize: 13, fontWeight: 900, color: "#FFB14A", letterSpacing: 0.5, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
                Target to beat: {(armReveal ? reveal.running : boss.target).toFixed(1)}
              </div>
              {/* Line 2 — returning-player verdict + score, BELOW the target. Verdict
                  copy matches BossOutwardEnding.tsx:74 verbatim (one voice across the
                  hub + interstitial). Separate from the leaderboard rank (a distinct
                  ahead-of-humans signal) — that section stays untouched. */}
              {bossResult && (
                <div
                  data-testid="boss-verdict"
                  data-won={bossResult.won ? "true" : "false"}
                  style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase", color: bossResult.won ? "#4ADE80" : "#FF6B6B", marginTop: 4 }}
                >
                  {(bossResult.won ? "YOU BEAT TODAY'S BOSS" : "TODAY'S BOSS GOT YOU")} · {bossResult.score.toFixed(1)}
                </div>
              )}
            </>
          )}
        </div>

        {/* 4 — Lineup strip (compact, centered, h-scroll if needed) */}
        {boss && boss.cards.length > 0 && (
          <div style={{ width: "100%", padding: "16px 14px 0", boxSizing: "border-box" }}>
            {/* The lineup is the page hero: five flex:1 cards fill the row
                edge-to-edge, one row, no scroll, all five visible. */}
            <div data-testid="boss-lineup" data-revealing={armReveal && reveal.phase !== "settled" ? "true" : "false"} style={{ display: "flex", gap: 6, width: "100%", justifyContent: "center", alignItems: "flex-start" }}>
              {!renderBossCard
                ? /* No card renderer (other sports): the compact LineupTile miniatures. */
                  boss.cards.map((c, i) => <LineupTile key={`lu-${i}`} card={c} headshotUrl={headshotUrl} />)
                : /* ONE state — the real AthleteCards ARE the resting state: first-VIEW
                     reveals (present → blast → count-up → settle-and-stay), returning/seen
                     show the same cards static. INTERIM: the full real card at its natural
                     329/478 aspect (un-squashed). The accent-strip trim + clean boss-card
                     format are PARKED to polish (see docs/boss-surface-consolidation-spec.md
                     — clipping into a shorter box squashed the card; needs a proper
                     frameless/short variant, not a crop). CardFront untouched. */
                  boss.cards.map((c, i) => (
                    <div key={`rv-${i}`} style={{ flex: 1, minWidth: 0, maxWidth: 76, aspectRatio: "329 / 478", containerType: "inline-size", position: "relative", overflow: "visible" }}>
                      <div style={{ position: "absolute", top: 0, left: 0, width: REVEAL_CARD_W, height: REVEAL_CARD_H, transform: `scale(calc(100cqw / ${REVEAL_CARD_W}px))`, transformOrigin: "top left" }}>
                        {renderBossCard!(
                          { ...c, cardId: `${c.basePlayerId || "boss"}-hub-${i}`, wasHeld: false, actualFp: c.fp, projectedFp: c.fp } as never,
                          reveal.optsFor(c) as never,
                        )}
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        )}

        {/* 5 — CTA: TAKE THE BOSS (centered, content-width) */}
        {/* In-app boss-direct (Phase 3 step 1): when onTakeBoss is wired AND the
            hub's own row has landed, the CTA fires the deal-flow directly (no
            full-page nav → no redundant landing render). Cold links / other
            sports / the dev mock have no onTakeBoss → the <a href> nav stays. */}
        {onTakeBoss && rawData ? (
          <button
            data-testid="boss-take-cta"
            onClick={() => onTakeBoss(rawData)}
            style={{
              margin: "16px 0 6px", padding: "11px 28px", borderRadius: 12,
              background: "#FFB14A", color: "#070A12", border: "none", cursor: "pointer",
              fontWeight: 950, fontSize: 14, letterSpacing: 0.8, textTransform: "uppercase",
              fontFamily: "inherit",
            }}
          >
            {bossResult ? "Play Again" : "Take the Boss"}
          </button>
        ) : href ? (
          <a
            data-testid="boss-take-cta"
            href={href}
            style={{
              margin: "16px 0 6px", padding: "11px 28px", borderRadius: 12,
              background: "#FFB14A", color: "#070A12", textDecoration: "none",
              fontWeight: 950, fontSize: 14, letterSpacing: 0.8, textTransform: "uppercase",
            }}
          >
            {bossResult ? "Play Again" : "Take the Boss"}
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
