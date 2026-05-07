/**
 * basketball/src/components/BasketballSlatePanel.tsx
 *
 * Sport-specific wrapper around @shared/components/TodaysSlatePanel. Builds
 * the panel adapter from basketball's data layer (player lookup, today's
 * bonus stars, theme metadata stub) and the shared useDailySlate hook.
 *
 * Pre-beta: gated by isSlateV2Enabled("basketball") at the call site so the
 * panel never renders when the flag is OFF.
 *
 * Data-load gate: dataEngine.getPlayers()/getLogsByKey() throw before
 * ensureLoaded() resolves. The panel awaits ensureLoaded and only mounts
 * the inner content once data is ready, so it's safe to render from the
 * landing page (which is shown before GameView triggers the data load).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { TodaysSlatePanel, type SlatePanelAdapter } from "@shared/components/TodaysSlatePanel";
import { useDailySlate, slateSignature } from "@shared/hooks/useDailySlate";
import { SlateChip } from "@shared/components/SlateChip";
import { ensureLoaded, getPlayers } from "@shared/engines/dataEngine";
import { headshotUrl } from "@shared/utils/headshotUrl";
import { sportAdapter } from "../adapters/SportAdapter";
import { getTodaysStars } from "../adapters/gameAdapter";
import type { TierColor } from "@shared/types";

type ResolvedPlayer = { name: string; tier: TierColor; photoCode?: string };

/** Build a one-shot lookup map from basePlayerId → display data. */
function buildPlayerIndex(): Map<string, ResolvedPlayer> {
  const idx = new Map<string, ResolvedPlayer>();
  for (const p of getPlayers()) {
    const baseId = String((p as any).basePlayerId ?? (p as any).id ?? "").trim();
    if (!baseId) continue;
    // Don't overwrite — first row wins, since players.json contains one row
    // per (player, season) and any season's identity fields are equivalent.
    if (idx.has(baseId)) continue;
    idx.set(baseId, {
      name: String((p as any).name ?? baseId),
      tier: sportAdapter.normalizeTier((p as any).tier),
      photoCode: (p as any).photoCode != null ? String((p as any).photoCode) : baseId,
    });
  }
  return idx;
}

const BasketballCardThumb: React.FC<{ playerId: string; isAnchor: boolean; index: Map<string, ResolvedPlayer> }> = ({
  playerId,
  isAnchor,
  index,
}) => {
  const meta = index.get(playerId);
  const url = headshotUrl(meta?.photoCode ?? playerId);
  return (
    <div
      className={`basketball-thumb ${isAnchor ? "is-anchor" : ""}`}
      data-testid={`thumb-${playerId}`}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        padding: 6, minWidth: 64,
      }}
    >
      {url ? (
        <img
          src={url}
          alt={meta?.name ?? playerId}
          style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", background: "rgba(255,255,255,0.05)" }}
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
        />
      ) : (
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
      )}
      <span style={{ fontSize: 10, color: "rgba(240,242,245,0.85)", textAlign: "center", lineHeight: 1.2 }}>
        {meta?.name ?? playerId}
      </span>
    </div>
  );
};

export function BasketballSlatePanel() {
  const [dataReady, setDataReady] = useState(false);
  const [playerIndex, setPlayerIndex] = useState<Map<string, ResolvedPlayer>>(() => new Map());

  // Wait for dataEngine to load before building the index. Landing renders
  // before GameView, so getPlayers() would throw if called eagerly.
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
  return <BasketballSlatePanelInner playerIndex={playerIndex} />;
}

function BasketballSlatePanelInner({ playerIndex }: { playerIndex: Map<string, ResolvedPlayer> }) {
  // useCallback so useDailySlate's memo deps stay stable across renders.
  const resolvePlayer = useCallback(
    (id: string) => {
      const meta = playerIndex.get(id);
      if (!meta) return undefined;
      return { name: meta.name, tier: meta.tier };
    },
    [playerIndex],
  );

  const slate = useDailySlate(sportAdapter as any, resolvePlayer);

  // Today's bonus stars (built off the slate when flag is ON; off the full
  // pool when OFF — gameAdapter.buildBonusPool() handles that switch).
  // Depend on slate.players so this re-runs when useDailySlate ticks at UTC
  // midnight — otherwise bonus stars would go stale across the rotation.
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
  // Bonus players are now drawn FROM the slate (gameAdapter.buildBonusPool
  // filters to the cached slate when slate v2 is ON), so they live in the
  // slate.players list. Rotating count is just slate-minus-anchors — the
  // bonus row in the UI shows them as a highlighted subset, but they're
  // still counted under "supporting players" in the rotating tally so the
  // visible totals add up to slateSize.
  const rotatingPlayers = slate.players.filter(p => !p.isAnchor);

  const themeMetadata = slate.themeKey
    ? (sportAdapter as any).getThemeMetadata?.(slate.themeKey) ?? null
    : null;

  // Bind the player index into the thumb component so the panel adapter's
  // CardThumb signature stays sport-agnostic.
  const CardThumb = useCallback(
    (props: { playerId: string; isAnchor: boolean }) => (
      <BasketballCardThumb {...props} index={playerIndex} />
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
 * BasketballSlateChip — sport-bound chip + overlay for in-game header.
 *
 * Mirrors the data-load gate in BasketballSlatePanel: until ensureLoaded
 * resolves, it renders a static fallback chip with just the slate
 * signature (counts default to 0). Once data is ready, the chip swaps
 * to the live slate counts and the overlay tap reveals the panel.
 *
 * Pre-beta: callers MUST gate by isSlateV2Enabled("basketball") so the
 * component never mounts when the flag is OFF.
 */
export function BasketballSlateChip() {
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

  // Fallback chip (data not yet loaded): show signature with 0 count.
  // Avoids any flash; signature is computable without player data.
  if (!dataReady) {
    const sig = slateSignature(new Date());
    return (
      <SlateChip label={sig.label} playerCount={0} sportKey="basketball">
        <BasketballSlatePanel />
      </SlateChip>
    );
  }
  return <BasketballSlateChipInner playerIndex={playerIndex} />;
}

function BasketballSlateChipInner({ playerIndex }: { playerIndex: Map<string, ResolvedPlayer> }) {
  const resolvePlayer = useCallback(
    (id: string) => {
      const meta = playerIndex.get(id);
      if (!meta) return undefined;
      return { name: meta.name, tier: meta.tier };
    },
    [playerIndex],
  );
  const slate = useDailySlate(sportAdapter as any, resolvePlayer);
  const playerCount = slate.players.length;
  return (
    <SlateChip
      label={slate.signature.label}
      playerCount={playerCount}
      sportKey="basketball"
    >
      <BasketballSlatePanel />
    </SlateChip>
  );
}

/**
 * Auto-expand the slate drawer once per UTC day. Subsequent renders on the
 * same day stay collapsed unless the user opens the drawer manually.
 */
export function useAutoExpandOncePerDay(sport: string): boolean {
  const [autoExpanded, setAutoExpanded] = useState(false);
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    // Lazy import to avoid pulling dailyBonus into module init paths.
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
