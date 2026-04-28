/**
 * baseball/src/components/BaseballCard.tsx
 * Card component for MLB baseball.
 * Front: shared CardFront with MLB headshot hero.
 * Back: baseball stat tiles (H, HR, RBI, K, IP, etc.)
 */

import React, { useMemo } from "react";
import type { GamePhase, PlayerCard } from "../adapters/types";
import { PlayerCardShell, resetAllOverlays } from "@shared/components/PlayerCardShell";
import type { CardFrontProps as ShellFrontProps, CardBackProps } from "@shared/components/PlayerCardShell";
import { CardFront, type CardFrontHeroProps } from "@shared/components/CardFront";
import { TopGameStamp } from "@shared/components/TopGameOverlay";
import type { TopGameTier } from "@shared/commentary/types";
import type { ShakeType } from "../hooks/useEmotionalReveal";
import { sportAdapter } from "../adapters/SportAdapter";
// Baseball ships local headshots at /baseball/headshots/{id}.png. The shared
// headshotUrl helper is NBA-default; using it here would land on /headshots
// (no /baseball/ prefix) or on the NBA CDN namespace via VITE_HEADSHOT_BASE_URL.
// Both fail. Always use the local sport-prefixed path.
function baseballHeadshotUrl(id: string): string {
  return id ? `/baseball/headshots/${id}.png` : "";
}

export { resetAllOverlays };

// ── Stat helpers ────────────────────────────────────────────────────────────

function safeNumber(v: any): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function round1(n: number) { return Math.round(n * 10) / 10; }

function isPitcher(position: string): boolean {
  return sportAdapter.isPitcherPosition(position);
}

// ── MLBHero ─────────────────────────────────────────────────────────────────

function MLBHero({ card, initials, isActiveReveal }: CardFrontHeroProps) {
  const [imgReady, setImgReady] = React.useState(false);
  const photoCode = String((card as any)?.photoCode ?? (card as any)?.basePlayerId ?? "").trim();
  const headshotSrc = baseballHeadshotUrl(photoCode);

  return (
    <>
      {/* Initials fallback */}
      <div style={{
        position: "absolute", inset: 0,
        display: "grid", placeItems: "center",
        fontSize: 32, fontWeight: 950,
        color: "rgba(255,255,255,0.50)",
        userSelect: "none",
      }}>
        {initials}
      </div>
      {headshotSrc && (
        <img
          key={headshotSrc}
          src={headshotSrc}
          alt={String((card as any)?.name ?? "")}
          style={{
            position: "absolute",
            top: "12%", left: "-5%",
            width: "110%", height: "100%",
            objectFit: "cover",
            objectPosition: "50% 10%",
            opacity: imgReady ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}
          draggable={false}
          onLoad={() => setImgReady(true)}
          onError={() => setImgReady(false)}
        />
      )}
    </>
  );
}

// ── BackBaseballStats ────────────────────────────────────────────────────────

function BackBaseballStats({ card, topGameTier }: { card: PlayerCard; topGameTier?: TopGameTier | null }) {
  const gi = (card as any).gameInfo || {};
  const sl = (card as any).statLine || {};
  const pos = String(card.position ?? "");
  const pitcher = isPitcher(pos);

  const tiles = useMemo(() => {
    if (pitcher) {
      return [
        { key: "ip", label: "IP", value: sl.ip ?? 0 },
        { key: "k", label: "K", value: sl.k ?? 0 },
        { key: "er", label: "ER", value: sl.er ?? 0 },
        { key: "w", label: "W", value: sl.w ?? 0 },
        { key: "qs", label: "QS", value: sl.qs ?? 0 },
        { key: "bb", label: "BB", value: sl.bb ?? 0 },
      ];
    }
    return [
      { key: "h", label: "H", value: sl.h ?? 0 },
      { key: "hr", label: "HR", value: sl.hr ?? 0 },
      { key: "rbi", label: "RBI", value: sl.rbi ?? 0 },
      { key: "r", label: "R", value: sl.r ?? 0 },
      { key: "bb", label: "BB", value: sl.bb ?? 0 },
      { key: "sb", label: "SB", value: sl.sb ?? 0 },
      { key: "doubles", label: "2B", value: sl.doubles ?? 0 },
      { key: "triples", label: "3B", value: sl.triples ?? 0 },
      { key: "pa", label: "PA", value: sl.pa ?? 0 },
    ];
  }, [pitcher, sl]);

  const actual = safeNumber((card as any).actualFp) ?? 0;
  const rawDate = gi.date || sl.date || "";
  const dateStr = fmtDate(String(rawDate));
  const rawOpp = gi.opponent || sl.opponent || "";
  const opponent = String(rawOpp).trim();
  const ha = gi.homeAway || "";
  const oppStr = opponent ? `${ha === "A" ? "@" : "vs"} ${opponent}` : "";
  const badgesData: Array<{ icon: string; label: string; fp: number }> =
    Array.isArray((card as any).achievements) ? (card as any).achievements.filter(Boolean) : [];
  const badgeFpBonus = badgesData.reduce((s, b) => s + (b.fp ?? 0), 0);
  const hasStats = Object.keys(sl).length > 0;
  const allZero = tiles.every(t => Number(t.value) === 0);

  return (
    <div style={S.backWrap}>
      <div style={S.backTopRow}>
        <div style={S.backDate}>{dateStr || "—"}</div>
        <div style={S.backOpp}>{oppStr || "—"}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", minWidth: 0, minHeight: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexShrink: 0 }}>
          <span style={S.fpLabel}>FP</span>
          <span style={{ ...S.fpValue, fontSize: 18 }}>{round1(actual)}</span>
          {badgeFpBonus > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#FFD700", alignSelf: "flex-end", marginBottom: 2 }}>
              (+{badgeFpBonus})
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, flexWrap: "wrap" }}>
          {badgesData.slice(0, 6).map((b: any, i: number) => (
            <span key={b.id ?? b.label ?? i} style={{ fontSize: 11, lineHeight: 1, flexShrink: 0 }}>{b.icon}</span>
          ))}
        </div>
        {topGameTier && (
          <div style={{ flexShrink: 0, transform: "rotate(-4deg) scale(0.7)", transformOrigin: "right center" }}>
            <TopGameStamp tier={topGameTier} />
          </div>
        )}
      </div>
      <div style={S.divider} />
      {!hasStats || allZero ? (
        <div style={S.noStatsWrap}><div style={S.noStatsText}>No game log</div></div>
      ) : (
        <div style={S.tilesGrid}>
          {tiles.slice(0, 9).map(s => (
            <div key={s.key} style={S.tile}>
              <div style={S.tileLabel}>{s.label}</div>
              <div style={S.tileValue}>{String(s.value)}</div>
            </div>
          ))}
        </div>
      )}
      <div style={S.tapHint}>TAP TO FLIP BACK</div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backWrap: { height: "100%", padding: "10px 10px 8px", display: "flex", flexDirection: "column", gap: 8, background: "linear-gradient(180deg,rgba(11,15,20,0.97),rgba(11,15,20,1.0))", borderRadius: 18, overflow: "hidden", boxSizing: "border-box" },
  backTopRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  backDate: { fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.90)" },
  backOpp: { fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.65)", textAlign: "right" },
  fpLabel: { fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.65)" },
  fpValue: { fontSize: 22, fontWeight: 900, color: "rgba(255,255,255,0.95)" },
  divider: { height: 1, background: "rgba(255,255,255,0.08)" },
  tilesGrid: { flex: 1, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 4, alignContent: "start", minWidth: 0 },
  tile: { borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", padding: "3px 6px", display: "flex", flexDirection: "column", gap: 1, minWidth: 0 },
  tileLabel: { fontSize: 8, fontWeight: 900, color: "rgba(255,255,255,0.55)", lineHeight: "10px" },
  tileValue: { fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.92)" },
  tapHint: { fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.30)", letterSpacing: 0.4, textAlign: "center" },
  noStatsWrap: { flex: 1, display: "flex", flexDirection: "column", gap: 10 },
  noStatsText: { fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.70)" },
};

// ── Public component ────────────────────────────────────────────────────────

type Props = {
  card: PlayerCard;
  phase: GamePhase;
  locked?: boolean;
  isMvp?: boolean;
  flipped?: boolean;
  canFlip?: boolean;
  onToggleLock?: () => void;
  onToggleFlip?: () => void;
  isRevealing?: boolean;
  visibleFp?: number;
  noTransition?: boolean;
  flipDurationMs?: number;
  fpCountUpMs?: number;
  performanceTag?: any;
  pulse?: any;
  shakeType?: ShakeType | null;
  cardShakeType?: ShakeType | null;
  badges?: Array<{ id: string; icon: string; label: string; fp: number }>;
  isSpotlight?: boolean;
  spotlightLevel?: number;
  isDimmed?: boolean;
  onRollComplete?: () => void;
  heldFpVisible?: boolean;
  isTapTarget?: boolean;
  isFTUE?: boolean;
  glowActive?: boolean;
  glowTier?: string;
  glowDurationMs?: number;
  /** Top Games tier — forwarded to CardFront for fire/sheen/recoil + stamp. */
  topGameTier?: TopGameTier | null;
};

export function BaseballCard(props: Props) {
  const { glowActive, glowTier, glowDurationMs, topGameTier, ...rest } = props;
  return (
    <PlayerCardShell
      {...rest}
      glowActive={glowActive}
      glowTier={glowTier}
      glowDurationMs={glowDurationMs}
      renderFront={(p: ShellFrontProps) => (
        <CardFront
          {...p}
          topGameTier={topGameTier ?? null}
          displayPosition={sportAdapter.displayPosition((p.card as any)?.position)}
          renderHero={(heroProps: CardFrontHeroProps) => (
            <MLBHero {...heroProps} />
          )}
        />
      )}
      renderBack={(p: CardBackProps) => <BackBaseballStats card={p.card} topGameTier={topGameTier ?? null} />}
    />
  );
}