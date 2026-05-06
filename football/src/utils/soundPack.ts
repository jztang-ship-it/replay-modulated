/**
 * football/src/utils/soundPack.ts — Football sound pack
 *
 * Football has no bundled audio assets at launch. All categories are empty
 * arrays — the shared audio director silently no-ops on missing assets.
 * Imported once from football's App.tsx so the registration happens before
 * any audio playback attempt.
 *
 * The manifest event keys (swish/rimOut/etc) are basketball-shaped because
 * shared/utils/soundPack.ts owns the canonical type. Football reuses the
 * keys but provides no files — when the football audio library lands, this
 * gets a real manifest (and likely a SoundPackManifest reshaping into
 * sport-agnostic categories).
 */

import { type SoundPackManifest, setSoundPack } from "@shared/utils/soundPack";

export const FOOTBALL_PACK: SoundPackManifest = {
  crowd: {
    bed: [],
    anticipation: [],
    reactionSmall: [],
    eruption: [],
    groan: [],
  },
  events: {
    swish: [],
    rimOut: [],
    rimRattle: [],
    squeak: [],
    bounce: [],
    buzzer: [],
    horn: [],
  },
  vocals: {
    oh: [],
    letsGo: [],
  },
  music: {
    bigWin: [],
  },
};

setSoundPack(FOOTBALL_PACK);
