/**
 * shared/media/playerImages.ts
 *
 * Sport-agnostic resolver for player headshot/image URLs. Each sport
 * decides its own primary source via the externalIds shape carried on
 * each player. The resolver constructs URLs without making API calls
 * (image-only paths are CDN-served directly), so rendering is fast and
 * doesn't burn API quota.
 *
 * Football's primary source: API-Football
 *   - URL pattern: https://media.api-sports.io/football/players/{id}.png
 *   - No API key needed for the image URL itself — only for metadata
 *     lookups (used by an offline manifest-population script, NOT here)
 *   - Free for direct image embedding per their CDN terms
 *
 * Future sources (slot in via the same resolver shape):
 *   - TheSportsDB (theSportsDbId) — broader coverage, lower image quality
 *   - Wikimedia Commons (wikiCommonsFile) — CC-licensed, manual curation
 *   - Sport-specific paid APIs (SportMonks, etc.)
 *
 * Local fallback strategy: when no externalId is known, the resolver
 * returns confidence: "fallback" with src: null. The caller (sport's
 * card hero component) is expected to render its own visual fallback —
 * football's FootballHero shows country flag + last-name initials.
 */

export interface ExternalIds {
  /** API-Football player ID (the primary source for football). */
  apiFootballId?: string | number;
  /** TheSportsDB player ID (future fallback for football). */
  theSportsDbId?: string | number;
  /**
   * True when the image has been mirrored locally to
   * football/public/players/{basePlayerId}.png. Set by the nightly
   * manifest-refresh job. When true the resolver serves the local copy
   * (immune to API-Football CDN outages) and falls back to the CDN URL
   * only if the local file 404s.
   */
  local?: boolean;
  /**
   * True when the locally-mirrored image has had its white background
   * alpha-cut by football/scripts/processPlayerImages.mjs and saved into
   * football/public/players-processed/{basePlayerId}.png. When true the
   * resolver serves the alpha-cut version so the card's tier color shows
   * through where the original studio white-bg used to be.
   *
   * NOTE: even when this is true, the resolver may still REFUSE to serve
   * the processed file if the per-id quality registry (set via
   * setProcessedQualityRegistry) marks it as "badCutout" or
   * "manualBadCutout". See the registry section below.
   */
  processed?: boolean;
}

export type ImageSource =
  | "local-cache-processed" // alpha-cut PNG at /<sport>/players-processed/<id>.png
  | "local-cache"           // raw mirrored PNG at /<sport>/players/<id>.png
  | "api-football"
  | "thesportsdb"
  | "local-fallback";       // no image — caller renders sport-specific visual fallback

/**
 * Per-id processing-quality flag, sourced from
 * football/public/players-processed/_quality.json (written by
 * processPlayerHeadshots.mjs).
 *
 *   "cleanCutout"      processed file is good — resolver may serve it
 *   "badCutout"        processed file produced damage; resolver MUST
 *                      NOT use it. Falls through to raw local image
 *                      (or further fallbacks) so a slightly-rough but
 *                      whole subject is shown rather than an eaten one.
 *   "manualBadCutout"  same as badCutout but explicitly marked by a
 *                      human; resolver behaves identically.
 *   "skipUseOriginal"  per-player override: do not attempt processed,
 *                      use the raw local image as-is. Same as not
 *                      having "processed: true" in the manifest, but
 *                      explicit.
 *   "unprocessed"      no processed pass has run for this id. Same as
 *                      cleanCutout if a file exists, but the resolver
 *                      treats it conservatively.
 */
export type ProcessedQuality =
  | "cleanCutout"
  | "badCutout"
  | "manualBadCutout"
  | "skipUseOriginal"
  | "unprocessed";

let processedQualityRegistry: Record<string, { quality: ProcessedQuality }> = {};

/**
 * Register the per-id processed-quality map (read from the quality JSON
 * sidecar). Called once at SPA startup. Replaces the entire registry —
 * subsequent calls are idempotent re-registrations.
 *
 * The football SPA imports football/public/players-processed/_quality.json
 * statically (Vite resolves it as a JSON module). Other sports either
 * call this with their own registry or never call it (in which case the
 * registry stays empty and the resolver behaves as before).
 */
export function setProcessedQualityRegistry(
  registry: Record<string, { quality: ProcessedQuality }>,
): void {
  processedQualityRegistry = registry ?? {};
}

/** Read the quality flag for a given id. Defaults to "unprocessed". */
export function getProcessedQuality(playerId: string): ProcessedQuality {
  return processedQualityRegistry[playerId]?.quality ?? "unprocessed";
}

export type ImageConfidence =
  | "high"      // exact ID match → CDN image expected to load
  | "medium"    // fallback CDN with weaker match quality (TheSportsDB)
  | "fallback"; // no external ID known → caller renders sport-specific fallback

export interface ResolvedImage {
  /** Full image URL, or null when confidence === "fallback". */
  src: string | null;
  source: ImageSource;
  confidence: ImageConfidence;
}

export interface ResolveArgs {
  sport: string;
  playerId: string;
  externalIds?: ExternalIds;
  /** Optional metadata for future fuzzy-match resolvers (TheSportsDB by
   *  name+team). Currently unused; reserved so the call shape doesn't
   *  break when those resolvers land. */
  name?: string;
  team?: string;
  nationality?: string;
}

/**
 * Resolve a player's image URL. Sport-agnostic dispatch — each sport's
 * primary source is selected by the sport key. Returns immediately;
 * never blocks on an API call. Image accessibility is verified at
 * render time via <img onError> in the sport's card hero component.
 */
export function resolvePlayerImage(args: ResolveArgs): ResolvedImage {
  const { sport, externalIds } = args;

  // Football: prefer the alpha-cut processed image first (white-bg removed
  // so the card's tier color shows through behind the player), then fall
  // back to the raw locally-mirrored image, then the API-Football CDN, and
  // finally the visual flag fallback.
  //
  // Quality gate: the per-id processed-quality registry can disable
  // specific resolver branches per the "safe over aggressive" rule:
  //
  //   "cleanCutout"     → processed served (default for processed: true)
  //   "badCutout"       → processed REFUSED, fall through to raw local
  //                       (auto-detected damage; subject probably whole
  //                       under the original photo bg, just messy)
  //   "skipUseOriginal" → processed REFUSED, fall through to raw local
  //                       (per-player override: "the original is fine")
  //   "manualBadCutout" → processed AND raw-local REFUSED → resolver
  //                       returns null → caller renders the visual
  //                       fallback (flag + initials portrait tile)
  //
  // Never returns the API-Football CDN URL when local is marked, since
  // local: true means we already have the same image cached.
  if (sport === "football") {
    const quality = getProcessedQuality(args.playerId);
    const processedAllowed =
      externalIds?.processed === true &&
      quality !== "badCutout" &&
      quality !== "manualBadCutout" &&
      quality !== "skipUseOriginal";
    const localAllowed =
      externalIds?.local === true &&
      quality !== "manualBadCutout";

    if (processedAllowed) {
      return {
        src: `/football/players-processed/${encodeURIComponent(args.playerId)}.png`,
        source: "local-cache-processed",
        confidence: "high",
      };
    }
    if (localAllowed) {
      return {
        src: `/football/players/${encodeURIComponent(args.playerId)}.png`,
        source: "local-cache",
        confidence: "high",
      };
    }
    // manualBadCutout intentionally skips the API-Football CDN too —
    // it's the same source image as the local mirror, just remote.
    if (quality !== "manualBadCutout") {
      const id = externalIds?.apiFootballId;
      if (id !== undefined && id !== null && String(id).trim() !== "") {
        return {
          src: `https://media.api-sports.io/football/players/${encodeURIComponent(String(id))}.png`,
          source: "api-football",
          confidence: "high",
        };
      }
    }
    // TheSportsDB future-fallback — schema reserved, not yet wired.

    return { src: null, source: "local-fallback", confidence: "fallback" };
  }

  // Other sports: no external-image source configured here. Basketball uses
  // a separate NBA-specific path via shared/utils/headshotUrl.ts; baseball
  // currently has no headshot source. Both fall through to fallback.
  return { src: null, source: "local-fallback", confidence: "fallback" };
}

/**
 * Preload a list of player image URLs in the background. Fire-and-forget;
 * never throws. No-op on the server side. Use after dealing a roster so
 * card images are warm in the browser cache by the time the user reaches
 * the reveal phase.
 *
 * Skips entries where confidence is "fallback" (no URL to preload).
 */
export function preloadPlayerImages(
  cards: Array<{ basePlayerId?: string | null; externalIds?: ExternalIds; sport?: string }>,
  defaultSport?: string,
): void {
  if (typeof window === "undefined" || typeof Image === "undefined") return;
  for (const card of cards) {
    const sport = card.sport ?? defaultSport ?? "";
    const playerId = String(card.basePlayerId ?? "");
    if (!sport || !playerId) continue;
    const resolved = resolvePlayerImage({
      sport,
      playerId,
      externalIds: card.externalIds,
    });
    if (resolved.src) {
      // Browser caches the response; no DOM mounting needed. Errors are
      // swallowed (the eventual <img> in the card has its own onError).
      const img = new Image();
      img.src = resolved.src;
    }
  }
}
