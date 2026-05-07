/**
 * football/src/components/FootballSlatePanel.tsx
 *
 * Sport-specific wrapper around @shared/components/TodaysSlatePanel for
 * football. Mirrors BasketballSlatePanel/BaseballSlatePanel; swaps in
 * football's image resolver (API-Football → flag fallback) for thumbs.
 *
 * Pre-beta: gated by isSlateV2Enabled("football") at the call site so the
 * panel never renders when the flag is OFF.
 *
 * Data-load gate: dataEngine.getPlayers()/getLogsByKey() throw before
 * ensureLoaded() resolves. The panel awaits ensureLoaded and only mounts
 * the inner content once data is ready.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TodaysSlatePanel, type SlatePanelAdapter } from "@shared/components/TodaysSlatePanel";
import { useDailySlate, slateSignature } from "@shared/hooks/useDailySlate";
import { SlateChip } from "@shared/components/SlateChip";
import { ensureLoaded, getPlayers } from "@shared/engines/dataEngine";
import { resolvePlayerImage } from "@shared/media/playerImages";
import { sportAdapter } from "../adapters/SportAdapter";
import { getTodaysStars } from "../adapters/gameAdapter";
import { getExternalIds } from "../data/playerImageManifest";
import type { TierColor } from "@shared/types";

type ResolvedPlayer = { name: string; tier: TierColor; team: string };

/** Country flag emoji map — mirrors SoccerCard's TEAM_FLAGS for the
 *  fallback thumb when no API-Football image resolves. */
const TEAM_FLAGS: Record<string, string> = {
  "France":"🇫🇷","Brazil":"🇧🇷","Argentina":"🇦🇷","Germany":"🇩🇪","Spain":"🇪🇸",
  "England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Portugal":"🇵🇹","Netherlands":"🇳🇱","Belgium":"🇧🇪","Croatia":"🇭🇷",
  "Morocco":"🇲🇦","Uruguay":"🇺🇾","Japan":"🇯🇵","South Korea":"🇰🇷","Senegal":"🇸🇳",
  "Australia":"🇦🇺","Mexico":"🇲🇽","USA":"🇺🇸","Canada":"🇨🇦","Ecuador":"🇪🇨",
  "Qatar":"🇶🇦","Saudi Arabia":"🇸🇦","Iran":"🇮🇷","Poland":"🇵🇱","Denmark":"🇩🇰",
  "Switzerland":"🇨🇭","Serbia":"🇷🇸","Cameroon":"🇨🇲","Ghana":"🇬🇭","Tunisia":"🇹🇳",
  "Wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿","Costa Rica":"🇨🇷","United States":"🇺🇸",
};
function getFlag(team: string): string { return TEAM_FLAGS[team] ?? "🏳️"; }

/** Build a one-shot lookup from basePlayerId → display data, scoped to
 *  active-season players. */
function buildPlayerIndex(): Map<string, ResolvedPlayer> {
  const idx = new Map<string, ResolvedPlayer>();
  const activeSeasons = new Set<string>(
    ((sportAdapter.config as any).activeSeasons as string[] | undefined) ?? [],
  );
  for (const p of getPlayers()) {
    if (activeSeasons.size > 0 && !activeSeasons.has(String((p as any).season ?? ""))) continue;
    const baseId = String((p as any).basePlayerId ?? (p as any).id ?? "").trim();
    if (!baseId) continue;
    if (idx.has(baseId)) continue;
    idx.set(baseId, {
      name: String((p as any).name ?? baseId),
      tier: sportAdapter.normalizeTier((p as any).tier),
      team: String((p as any).team ?? ""),
    });
  }
  return idx;
}

const FootballCardThumb: React.FC<{ playerId: string; isAnchor: boolean; index: Map<string, ResolvedPlayer> }> = ({
  playerId,
  isAnchor,
  index,
}) => {
  const meta = index.get(playerId);
  const externalIds = getExternalIds(playerId);
  const resolved = resolvePlayerImage({ sport: "football", playerId, externalIds });
  const url = resolved.confidence !== "fallback" ? resolved.src : null;
  const flag = getFlag(meta?.team ?? "");
  const [imgFailed, setImgFailed] = React.useState(false);
  const showImage = url && !imgFailed;

  return (
    <div
      className={`football-thumb ${isAnchor ? "is-anchor" : ""}`}
      data-testid={`thumb-${playerId}`}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        padding: 6, minWidth: 64,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 48, height: 48, borderRadius: "50%",
          background: "rgba(255,255,255,0.05)",
          overflow: "hidden",
          display: "grid", placeItems: "center",
        }}
      >
        {/* Flag fallback always rendered behind; image overlays when loaded */}
        <span style={{ fontSize: 26, lineHeight: 1, opacity: showImage ? 0 : 1 }}>{flag}</span>
        {showImage && (
          <img
            src={url!}
            alt={meta?.name ?? playerId}
            onError={() => setImgFailed(true)}
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%",
              objectFit: "cover",
            }}
          />
        )}
      </div>
      <span style={{ fontSize: 10, color: "rgba(240,242,245,0.85)", textAlign: "center", lineHeight: 1.2 }}>
        {meta?.name ?? playerId}
      </span>
    </div>
  );
};

export function FootballSlatePanel() {
  const [dataReady, setDataReady] = useState(false);
  const [playerIndex, setPlayerIndex] = useState<Map<string, ResolvedPlayer>>(() => new Map());

  useEffect(() => {
    let cancelled = false;
    ensureLoaded()
      .then(() => {
        if (cancelled) return;
        try {
          setPlayerIndex(buildPlayerIndex());
          setDataReady(true);
        } catch {
          // Data load failed — leave panel hidden rather than crashing.
        }
      })
      .catch(() => { /* silent — panel just won't render */ });
    return () => { cancelled = true; };
  }, []);

  if (!dataReady) return null;
  return <FootballSlatePanelInner playerIndex={playerIndex} />;
}

function FootballSlatePanelInner({ playerIndex }: { playerIndex: Map<string, ResolvedPlayer> }) {
  const resolvePlayer = useCallback(
    (id: string) => {
      const meta = playerIndex.get(id);
      if (!meta) return undefined;
      return { name: meta.name, tier: meta.tier };
    },
    [playerIndex],
  );

  const slate = useDailySlate(sportAdapter as any, resolvePlayer);

  const bonusPlayers = useMemo(() => {
    try {
      return getTodaysStars().map(b => ({
        id: b.basePlayerId,
        name: b.name,
        tier: sportAdapter.normalizeTier(b.tier) as TierColor,
        bonus: b.bonus,
      }));
    } catch (e) {
      console.warn("getTodaysStars failed:", e);
      return [];
    }
  }, [slate.players]);

  const anchors = slate.players.filter(p => p.isAnchor);
  // Bonus players are drawn FROM the slate (gameAdapter.buildBonusPool
  // filters to the cached slate when slate v2 is ON). Count them in
  // rotating so visible totals = slateSize.
  const rotatingPlayers = slate.players.filter(p => !p.isAnchor);

  const themeMetadata = slate.themeKey
    ? (sportAdapter as any).getThemeMetadata?.(slate.themeKey) ?? null
    : null;

  const CardThumb = useCallback(
    (props: { playerId: string; isAnchor: boolean }) => (
      <FootballCardThumb {...props} index={playerIndex} />
    ),
    [playerIndex],
  );

  const adapter: SlatePanelAdapter = {
    themeMetadata,
    anchors: anchors.map(p => ({ id: p.id, name: p.name, tier: p.tier as TierColor })),
    bonusPlayers,
    rotatingCount: rotatingPlayers.length,
    msUntilRotation: slate.msUntilRotation,
    CardThumb,
    fullSlatePlayers: slate.players.map(p => ({
      id: p.id,
      name: p.name,
      tier: p.tier as TierColor,
      isAnchor: p.isAnchor,
    })),
    signature: slate.signature,
  };

  return <TodaysSlatePanel adapter={adapter} />;
}

/**
 * FootballSlateChip — sport-bound chip + overlay for in-game header.
 * Pre-beta: callers MUST gate by isSlateV2Enabled("football").
 */
export function FootballSlateChip() {
  const [dataReady, setDataReady] = useState(false);
  const [playerIndex, setPlayerIndex] = useState<Map<string, ResolvedPlayer>>(() => new Map());

  useEffect(() => {
    let cancelled = false;
    ensureLoaded()
      .then(() => {
        if (cancelled) return;
        try {
          setPlayerIndex(buildPlayerIndex());
          setDataReady(true);
        } catch { /* leave chip on fallback */ }
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, []);

  if (!dataReady) {
    const sig = slateSignature(new Date());
    return (
      <SlateChip label={sig.label} playerCount={0} sportKey="football">
        <FootballSlatePanel />
      </SlateChip>
    );
  }
  return <FootballSlateChipInner playerIndex={playerIndex} />;
}

function FootballSlateChipInner({ playerIndex }: { playerIndex: Map<string, ResolvedPlayer> }) {
  const resolvePlayer = useCallback(
    (id: string) => {
      const meta = playerIndex.get(id);
      if (!meta) return undefined;
      return { name: meta.name, tier: meta.tier };
    },
    [playerIndex],
  );
  const slate = useDailySlate(sportAdapter as any, resolvePlayer);
  return (
    <SlateChip
      label={slate.signature.label}
      playerCount={slate.players.length}
      sportKey="football"
    >
      <FootballSlatePanel />
    </SlateChip>
  );
}

/**
 * Auto-expand the slate drawer once per UTC day. Mirrors basketball/baseball.
 */
export function useAutoExpandOncePerDay(sport: string): boolean {
  const [autoExpanded, setAutoExpanded] = useState(false);
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    import("@shared/utils/dailyBonus").then(({ getDailyBonusDateKey }) => {
      const key = `slate-panel-seen-${getDailyBonusDateKey(new Date())}-${sport}`;
      if (!localStorage.getItem(key)) {
        setAutoExpanded(true);
        localStorage.setItem(key, "1");
      }
    });
  }, [sport]);
  return autoExpanded;
}
