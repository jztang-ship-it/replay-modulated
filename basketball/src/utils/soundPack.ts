/**
 * basketball/src/utils/soundPack.ts — Basketball sound pack
 *
 * Defines the basketball-specific audio manifest and registers it with the
 * shared soundPackLoader at module-load time. Imported once from the
 * basketball SportAdapter so the registration happens before audio playback.
 */

import { type SoundPackManifest, setSoundPack, SUPABASE_AUDIO_URL } from "@shared/utils/soundPack";

export const BASKETBALL_PACK: SoundPackManifest = {
  crowd: {
    bed: [
      "/audio/basketball/crowd/bed-murmur-alt.mp3",  // 51s basketball crowd (CC BY 4.0)
      "/audio/basketball/crowd/bed-murmur.mp3",       // 40s sports crowd (Attribution 3.0)
    ],
    anticipation: ["/audio/basketball/crowd/anticipation.mp3"],
    reactionSmall: ["/audio/basketball/crowd/reaction-small.mp3"],
    eruption: ["/audio/basketball/crowd/eruption.mp3"],
    groan: ["/audio/basketball/crowd/groan.mp3"],
  },
  events: {
    swish: ["/audio/basketball/events/swish.mp3"],
    rimOut: ["/audio/basketball/events/rim-out.mp3"],
    rimRattle: [],  // not yet sourced
    squeak: ["/audio/basketball/events/squeak.mp3"],
    bounce: ["/audio/basketball/events/bounce.mp3"],
    buzzer: ["/audio/basketball/events/buzzer.mp3"],
    horn: ["/audio/basketball/events/horn.mp3"],
  },
  vocals: {
    oh: ["/audio/basketball/vocals/oh.mp3"],
    letsGo: [],  // not yet sourced
  },
  music: {
    // Hosted on Supabase — fetched lazily, cached in AudioBuffer memory.
    // Upload the file to your Supabase `audio` bucket at:
    //   audio/basketball/music/big-win.mp3
    bigWin: SUPABASE_AUDIO_URL
      ? [`${SUPABASE_AUDIO_URL}/basketball/music/big-win.mp3`]
      : [],
  },
};

setSoundPack(BASKETBALL_PACK);
