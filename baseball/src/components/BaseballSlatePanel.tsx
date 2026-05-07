/**
 * baseball/src/components/BaseballSlatePanel.tsx
 *
 * Sport-specific wrapper around @shared/components/TodaysSlatePanel. Builds
 * the panel adapter from baseball's data layer (player lookup, today's
 * bonus stars, theme metadata stub) and the shared useDailySlate hook.
 *
 * Pre-beta: gated by isSlateV2Enabled("baseball") at the call site so the
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
import { ensureLoaded, getPlayers } from "../engines/dataEngine";
import { sportAdapter } from "../adapters/SportAdapter";
import { getTodaysStars } from "../adapters/gameAdapter";
import { tierFromSalary } from "../engines/economyEngine";
import type { TierColor } from "@shared/types";
import { getTier } from "@shared/theme";

type ResolvedPlayer = { name: string; tier: TierColor; basePlayerId: string };

// Baseball ships local headshots at /baseball/headshots/{id}.png. Vite serves
// the public/ folder at the SPA's base path (`/baseball/`). The shared
// headshotUrl helper is NBA-default and won't resolve for baseball IDs.
function baseballHeadshotUrl(id: string): string {
  return id ? `/baseball/headshots/${id}.png` : "";
}

/** Build a one-shot lookup map from basePlayerId → display data. */
function buildPlayerIndex(): Map<string, ResolvedPlayer> {
  const idx = new Map<string, ResolvedPlayer>();
  for (const p of getPlayers()) {
    const baseId = String((p as any).basePlayerId ?? (p as any).id ?? "").trim();
    if (!baseId) continue;
    // Don't overwrite — first row wins, since players.json contains one row
    // per (player, season) and any season's identity fields are equivalent.
    if (idx.has(baseId)) continue;
    // Compute tier from salary at runtime; players.json may carry stale
    // tier strings from older thresholds. See basketball panel for the
    // detailed rationale (Morant/Brown were tagged BLUE in data but
    // their salary maps to PURPLE under current breakpoints).
    const salary = Number((p as any).salary ?? 0);
    const computedTier = tierFromSalary(salary, sportAdapter.economyConfig);
    idx.set(baseId, {
      name: String((p as any).name ?? baseId),
      tier: sportAdapter.normalizeTier(computedTier),
      basePlayerId: baseId,
    });
  }
  return idx;
}

const BaseballCardThumb: React.FC<{ playerId: string; isAnchor: boolean; index: Map<string, ResolvedPlayer> }> = ({
  playerId,
  isAnchor,
  index,
}) => {
  const meta = index.get(playerId);
  const url = baseballHeadshotUrl(meta?.basePlayerId ?? playerId);
  const tier = getTier(meta?.tier ?? "WHITE");
  // Tier color on the avatar circle, not the card body — see basketball
  // panel for rationale.
  const circleBg = `linear-gradient(160deg, ${tier.bg} 0%, ${tier.bgEnd} 120%)`;
  return (
    <div
      className={`baseball-thumb ${isAnchor ? "is-anchor" : ""}`}
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
          style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", background: circleBg }}
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
        />
      ) : (
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: circleBg }} />
      )}
      <span style={{ fontSize: 10, color: "rgba(240,242,245,0.85)", textAlign: "center", lineHeight: 1.2 }}>
        {meta?.name ?? playerId}
      </span>
    </div>
  );
};

export function BaseballSlatePanel() {
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
  return <BaseballSlatePanelInner playerIndex={playerIndex} />;
}

function BaseballSlatePanelInner({ playerIndex }: { playerIndex: Map<string, ResolvedPlayer> }) {
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
  // Bonus players are drawn FROM the slate (gameAdapter.buildBonusPool
  // filters to the cached slate when slate v2 is ON). Count them in
  // rotating so visible totals = slateSize.
  const rotatingPlayers = slate.players.filter(p => !p.isAnchor);

  const themeMetadata = slate.themeKey
    ? (sportAdapter as any).getThemeMetadata?.(slate.themeKey) ?? null
    : null;

  // Bind the player index into the thumb component so the panel adapter's
  // CardThumb signature stays sport-agnostic.
  const CardThumb = useCallback(
    (props: { playerId: string; isAnchor: boolean }) => (
      <BaseballCardThumb {...props} index={playerIndex} />
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
 * BaseballSlateChip — sport-bound chip + overlay for in-game header.
 *
 * Mirrors the data-load gate in BaseballSlatePanel: until ensureLoaded
 * resolves, it renders a static fallback chip with just the slate
 * signature (counts default to 0). Once data is ready, the chip swaps
 * to the live slate counts and the overlay tap reveals the panel.
 *
 * Pre-beta: callers MUST gate by isSlateV2Enabled("baseball") so the
 * component never mounts when the flag is OFF.
 */
export function BaseballSlateChip() {
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
      <SlateChip label={sig.label} playerCount={0} sportKey="baseball">
        <BaseballSlatePanel />
      </SlateChip>
    );
  }
  return <BaseballSlateChipInner playerIndex={playerIndex} />;
}

function BaseballSlateChipInner({ playerIndex }: { playerIndex: Map<string, ResolvedPlayer> }) {
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
      sportKey="baseball"
    >
      <BaseballSlatePanel />
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
