/**
 * shared/utils/soundPack.ts — Sport sound pack system
 *
 * Defines the manifest shape for any sport's sound pack and provides
 * loading/caching of audio assets. Each sport supplies a manifest
 * pointing to audio files. The loader decodes them into AudioBuffers
 * and makes them available to the AudioDirector and SoundManager.
 *
 * File structure per sport:
 *   public/audio/{sport}/crowd/   — loopable crowd layers
 *   public/audio/{sport}/events/  — one-shot game sounds
 *   public/audio/{sport}/vocals/  — short crowd vocal reactions
 */

// ═══════════════════════════════════════════════════════════════════════════
// MANIFEST TYPES — same shape for every sport, different files
// ═══════════════════════════════════════════════════════════════════════════

/** Each category has an array of file paths (multiple variants = random selection) */
export type SoundPackManifest = {
  crowd: {
    bed:            string[];   // loopable arena murmur (6–10s)
    anticipation:   string[];   // loopable building tension (6–8s)
    reactionSmall:  string[];   // one-shot small crowd reaction (1–2s)
    eruption:       string[];   // one-shot big crowd eruption (3–4s)
    groan:          string[];   // one-shot disappointed crowd (1–2s)
  };
  events: {
    swish:          string[];   // net swish
    rimOut:         string[];   // ball bouncing off rim and out
    rimRattle:      string[];   // ball rattling around rim
    squeak:         string[];   // sneaker squeak
    bounce:         string[];   // ball bounce on hardwood
    buzzer:         string[];   // game buzzer
    horn:           string[];   // arena horn
  };
  vocals: {
    oh:             string[];   // crowd "ohhh" reaction
    letsGo:         string[];   // crowd energy vocal
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// BASKETBALL MANIFEST — paths relative to public/
// ═══════════════════════════════════════════════════════════════════════════

export const BASKETBALL_PACK: SoundPackManifest = {
  crowd: {
    bed:            [
      "/audio/basketball/crowd/bed-murmur-alt.mp3",  // 51s basketball crowd (CC BY 4.0)
      "/audio/basketball/crowd/bed-murmur.mp3",       // 40s sports crowd (Attribution 3.0)
    ],
    anticipation:   ["/audio/basketball/crowd/anticipation.mp3"],
    reactionSmall:  ["/audio/basketball/crowd/reaction-small.mp3"],
    eruption:       ["/audio/basketball/crowd/eruption.mp3"],
    groan:          ["/audio/basketball/crowd/groan.mp3"],
  },
  events: {
    swish:          ["/audio/basketball/events/swish.mp3"],
    rimOut:         ["/audio/basketball/events/rim-out.mp3"],
    rimRattle:      [],  // not yet sourced
    squeak:         ["/audio/basketball/events/squeak.mp3"],
    bounce:         ["/audio/basketball/events/bounce.mp3"],
    buzzer:         ["/audio/basketball/events/buzzer.mp3"],
    horn:           ["/audio/basketball/events/horn.mp3"],
  },
  vocals: {
    oh:             ["/audio/basketball/vocals/oh.mp3"],
    letsGo:         [],  // not yet sourced
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// LOADER — decodes audio files into AudioBuffers, caches results
// ═══════════════════════════════════════════════════════════════════════════

type BufferCache = Map<string, AudioBuffer>;

export class SoundPackLoader {
  private cache: BufferCache = new Map();
  private loading: Map<string, Promise<AudioBuffer | null>> = new Map();
  private manifest: SoundPackManifest;

  constructor(manifest: SoundPackManifest) {
    this.manifest = manifest;
  }

  /** Preload all assets in the manifest. Call once after AudioContext is available. */
  async preloadAll(ctx: AudioContext): Promise<void> {
    const allPaths = this.allPaths();
    await Promise.all(allPaths.map(path => this.load(ctx, path)));
    const loaded = allPaths.filter(p => this.cache.has(p)).length;
    console.log(`[SoundPack] Loaded ${loaded}/${allPaths.length} assets`);
  }

  /** Get a decoded AudioBuffer for a specific path. Returns null if not loaded. */
  getBuffer(path: string): AudioBuffer | null {
    return this.cache.get(path) ?? null;
  }

  /**
   * Get a random buffer from a category.
   * e.g. getRandomBuffer("crowd", "bed") picks from crowd.bed[]
   */
  getRandomBuffer(
    category: keyof SoundPackManifest,
    key: string,
  ): AudioBuffer | null {
    const paths = (this.manifest[category] as Record<string, string[]>)[key];
    if (!paths || paths.length === 0) return null;
    const path = paths[Math.floor(Math.random() * paths.length)];
    return this.cache.get(path) ?? null;
  }

  /** Check if any assets are loaded for a given category+key */
  hasAsset(category: keyof SoundPackManifest, key: string): boolean {
    const paths = (this.manifest[category] as Record<string, string[]>)[key];
    if (!paths) return false;
    return paths.some(p => this.cache.has(p));
  }

  /** Check if the pack has any crowd assets loaded at all */
  hasCrowdAssets(): boolean {
    return this.hasAsset("crowd", "bed") ||
           this.hasAsset("crowd", "anticipation") ||
           this.hasAsset("crowd", "eruption");
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async load(ctx: AudioContext, path: string): Promise<AudioBuffer | null> {
    if (this.cache.has(path)) return this.cache.get(path)!;
    if (this.loading.has(path)) return this.loading.get(path)!;

    const promise = (async () => {
      try {
        const res = await fetch(path);
        if (!res.ok) return null;
        const arrayBuf = await res.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        this.cache.set(path, audioBuf);
        return audioBuf;
      } catch {
        // Asset not available — procedural fallback will be used
        return null;
      }
    })();

    this.loading.set(path, promise);
    const result = await promise;
    this.loading.delete(path);
    return result;
  }

  private allPaths(): string[] {
    const paths: string[] = [];
    for (const category of Object.values(this.manifest)) {
      for (const arr of Object.values(category as Record<string, string[]>)) {
        paths.push(...arr);
      }
    }
    return paths;
  }
}

// ── Singleton for the active sport ──────────────────────────────────────────
export const soundPackLoader = new SoundPackLoader(BASKETBALL_PACK);
