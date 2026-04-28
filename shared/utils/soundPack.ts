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
    bed: string[];   // loopable arena murmur (6–10s)
    anticipation: string[];   // loopable building tension (6–8s)
    reactionSmall: string[];   // one-shot small crowd reaction (1–2s)
    eruption: string[];   // one-shot big crowd eruption (3–4s)
    groan: string[];   // one-shot disappointed crowd (1–2s)
  };
  events: {
    swish: string[];   // net swish
    rimOut: string[];   // ball bouncing off rim and out
    rimRattle: string[];   // ball rattling around rim
    squeak: string[];   // sneaker squeak
    bounce: string[];   // ball bounce on hardwood
    buzzer: string[];   // game buzzer
    horn: string[];   // arena horn
  };
  vocals: {
    oh: string[];   // crowd "ohhh" reaction
    letsGo: string[];   // crowd energy vocal
  };
  /**
   * music: full tracks played during high-impact moments (big win celebration).
   * Hosted on Supabase — lazy-fetched and decoded on first game load, cached
   * in memory. Not looped; plays once then fades.
   */
  music: {
    bigWin: string[];   // MVP / LEGEND celebration track (~35s)
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE AUDIO BASE URL
// Music assets are too large to ship in the static bundle — host on Supabase
// and lazy-fetch. Same bucket strategy as headshots.
// Set VITE_SUPABASE_AUDIO_URL in your env (e.g. https://<project>.supabase.co/storage/v1/object/public/audio)
// ═══════════════════════════════════════════════════════════════════════════

export const SUPABASE_AUDIO_URL = import.meta.env.VITE_SUPABASE_AUDIO_URL ?? "";

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY PACK — silent default. Each sport replaces this via setSoundPack()
// from its own adapter at module-load time. Sports that don't register stay
// silent rather than playing another sport's audio.
// ═══════════════════════════════════════════════════════════════════════════

export const EMPTY_PACK: SoundPackManifest = {
  crowd:  { bed: [], anticipation: [], reactionSmall: [], eruption: [], groan: [] },
  events: { swish: [], rimOut: [], rimRattle: [], squeak: [], bounce: [], buzzer: [], horn: [] },
  vocals: { oh: [], letsGo: [] },
  music:  { bigWin: [] },
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

  /**
   * Preload all non-music assets in the manifest. Call once after AudioContext
   * is available. Music tracks are excluded here — they're large and fetched
   * separately via prefetchMusic() so they don't block crowd/event sounds.
   */
  async preloadAll(ctx: AudioContext): Promise<void> {
    const allPaths = this.allPaths(/* excludeMusic */ true);
    await Promise.all(allPaths.map(path => this.load(ctx, path)));
    const loaded = allPaths.filter(p => this.cache.has(p)).length;
    console.log(`[SoundPack] Loaded ${loaded}/${allPaths.length} assets`);
  }

  /**
   * Prefetch music tracks in the background. Call during DEAL/REVEALING phase
   * so the track is decoded and ready before the player could ever hit MVP.
   * Non-blocking — returns immediately, resolves when done.
   */
  prefetchMusic(ctx: AudioContext): void {
    const paths = this.manifest.music?.bigWin ?? [];
    if (paths.length === 0) return;
    paths.forEach(path => {
      if (!this.cache.has(path) && !this.loading.has(path)) {
        this.load(ctx, path).then(buf => {
          if (buf) console.log("[SoundPack] Music track ready:", path.split("/").pop());
        });
      }
    });
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

  private allPaths(excludeMusic = false): string[] {
    const paths: string[] = [];
    for (const [catKey, category] of Object.entries(this.manifest)) {
      if (excludeMusic && catKey === "music") continue;
      for (const arr of Object.values(category as Record<string, string[]>)) {
        paths.push(...arr);
      }
    }
    return paths;
  }
}

// ── Singleton for the active sport ──────────────────────────────────────────
// Boots silent (EMPTY_PACK). Each sport's adapter calls setSoundPack(pack)
// at module-load time. Sports that don't register stay silent rather than
// playing another sport's audio.

export const soundPackLoader = new SoundPackLoader(EMPTY_PACK);

/** Replace the singleton's manifest. Called by each sport's adapter at load. */
export function setSoundPack(manifest: SoundPackManifest): void {
  (soundPackLoader as any).manifest = manifest;
}
