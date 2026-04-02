/**
 * shared/utils/soundManager.ts — Event-layer sounds
 *
 * Every sound has an EMOTIONAL JOB, not a foley job.
 *
 * Card flip     → anticipation punctuation ("what's underneath?")
 * FP tick       → addictive counter (ascending pitch = "it's going up!")
 * Hold on/off   → agency confirmation ("I chose this")
 * Tier cross    → breakthrough moment ("YES, next level!")
 * Heat hot      → crowd-lift reward ("this player is ON FIRE")
 * Heat cold     → muted disappointment (not punishing)
 * Tier slam     → medium win impact ("solid hit")
 * Big win       → staged eruption: breath → impact → horn → crowd
 * Near miss     → "so close" tension-release ("run it back!")
 * Bust          → brief deflection ("whatever, deal again")
 * Streak        → escalating crowd energy
 *
 * Mix: 60–70% satisfying synthetic game-feel, 30–40% basketball texture.
 * Optimize for anticipation, clarity, pacing, reward psychology.
 */

import { audioDirector } from "./audioDirector";
import { soundPackLoader, type SoundPackManifest } from "./soundPack";

// ═══════════════════════════════════════════════════════════════════════════
// VOLUME KNOBS — tune by ear
// ═══════════════════════════════════════════════════════════════════════════
const V = {
  // Card flip layers
  FLIP_WHOOSH: 0.75,   // was 0.65
  FLIP_CLICK: 0.60,   // was 0.50
  FLIP_BODY: 0.40,   // was 0.35 — sub-bass "weight" — felt not heard

  // FP count-up
  TICK_BASE: 0.30,   // was 0.22 — starting volume
  TICK_PEAK: 0.52,   // was 0.38 — volume at end of count (swells)
  TICK_PITCH_LO: 700,    // Hz start
  TICK_PITCH_HI: 1100,   // Hz end — ascending = rewarding
  TICK_TEXTURE: 0.10,   // was 0.07 — micro-squeak undertone

  // Hold
  HOLD_ON: 0.50,   // was 0.45
  HOLD_OFF: 0.30,   // was 0.25

  // Tier crossing
  TIER_THUMP: 0.65,   // was 0.60
  TIER_CHIME: 0.60,   // was 0.55
  TIER_RING: 0.30,   // was 0.25 — harmonic tail / fifth
  TIER_SWISH: 0.25,   // was 0.20 — basketball texture (background)

  // Heat stamps
  HOT_SHIMMER: 0.55,   // was 0.50
  HOT_CRACKLE: 0.60,   // was 0.55
  HOT_CROWD: 0.35,   // was 0.30
  COLD_CLANK: 0.45,   // was 0.40
  COLD_MURMUR: 0.20,   // was 0.15

  // Medium win (STARTER / ALL_STAR)
  SLAM_HIT: 0.85,   // was 0.75
  SLAM_TEXTURE: 0.55,   // was 0.50
  SLAM_CROWD: 0.50,   // was 0.45

  // Big win (MVP / GOAT) — procedural fallback only; real track used when loaded
  BIG_BREATH: 0.0,    // silence IS the breath — no sound for 40ms
  BIG_IMPACT: 0.85,   // was 0.80
  BIG_SWISH: 0.65,   // was 0.60
  BIG_HORN: 0.60,   // was 0.55
  BIG_CROWD: 0.60,   // was 0.55
  BIG_STOMP: 0.45,   // was 0.40
  // Music track volume — normalized slightly below peak (track peaks at 0dBFS)
  BIG_MUSIC: 0.78,

  // Near miss (ROOKIE)
  MISS_RIM: 0.70,   // was 0.55
  MISS_RIM2: 0.40,   // was 0.30
  MISS_GROAN: 0.40,   // was 0.35

  // Bust
  BUST_BUZZ: 0.45,   // was 0.35 — soft — not punishing
  BUST_CROWD: 0.25,   // was 0.20 — tiny deflation

  // Tier result sounds
  ROOKIE_CHIME: 0.55,
  ROOKIE_CROWD: 0.30,
  STARTER_FANFARE: 0.65,
  STARTER_CROWD: 0.45,
  ALL_STAR_HORN: 0.70,
  ALL_STAR_CROWD: 0.55,
  ALL_STAR_STOMP: 0.40,

  // Streak milestones
  STREAK_CROWD: 0.60,   // was 0.55
  STREAK_STOMP: 0.50,   // was 0.45
  STREAK_HORN: 0.50,   // was 0.45
} as const;

// ═══════════════════════════════════════════════════════════════════════════

class SoundManager {
  private ensureCtx(): AudioContext | null { return audioDirector.getContext(); }
  private get out(): AudioNode { return audioDirector.getEventOutput(); }

  private noiseBuffer(duration: number): AudioBuffer {
    const ctx = this.ensureCtx()!;
    const len = Math.ceil(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  toggleMute() { audioDirector.toggleMute(); }
  isMuted() { return audioDirector.isMuted(); }

  /**
   * Play a sound pack asset as a one-shot. Returns true if asset was found and played.
   * If asset isn't loaded, returns false so caller can fall back to procedural.
   */
  private playAsset(
    category: keyof SoundPackManifest, key: string,
    volume: number, loop = false,
  ): boolean {
    const ctx = this.ensureCtx();
    if (!ctx) return false;
    const buf = soundPackLoader.getRandomBuffer(category, key);
    if (!buf) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.out);
    src.start(ctx.currentTime);
    return true;
  }

  // ─── CARD FLIP ────────────────────────────────────────────────────────────
  // Emotional job: anticipation punctuation. "What's under this card?"
  // Three layers: whoosh (motion), click (tactile snap), body (weight/gravity).
  playCardFlip() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Whoosh — descending noise sweep = something moving fast
    const whoosh = ctx.createBufferSource();
    whoosh.buffer = this.noiseBuffer(0.1);
    const wBp = ctx.createBiquadFilter();
    wBp.type = "bandpass";
    wBp.frequency.setValueAtTime(4500, now);
    wBp.frequency.exponentialRampToValueAtTime(600, now + 0.09);
    wBp.Q.value = 0.7;
    const wG = ctx.createGain();
    wG.gain.setValueAtTime(0, now);
    wG.gain.linearRampToValueAtTime(V.FLIP_WHOOSH, now + 0.004);
    wG.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    whoosh.connect(wBp).connect(wG).connect(this.out);
    whoosh.start(now);
    whoosh.stop(now + 0.11);

    // Click — sharp transient = moment of impact when card lands face-up
    const click = ctx.createOscillator();
    click.type = "square";
    click.frequency.setValueAtTime(2200, now);
    click.frequency.exponentialRampToValueAtTime(500, now + 0.018);
    const cG = ctx.createGain();
    cG.gain.setValueAtTime(0, now);
    cG.gain.linearRampToValueAtTime(V.FLIP_CLICK, now + 0.001);
    cG.gain.exponentialRampToValueAtTime(0.01, now + 0.025);
    const cLp = ctx.createBiquadFilter();
    cLp.type = "lowpass";
    cLp.frequency.value = 3500;
    click.connect(cLp).connect(cG).connect(this.out);
    click.start(now);
    click.stop(now + 0.03);

    // Body — sub-bass thump = physical weight, makes it feel real
    const body = ctx.createOscillator();
    body.type = "sine";
    body.frequency.setValueAtTime(200, now + 0.008);
    body.frequency.exponentialRampToValueAtTime(55, now + 0.08);
    const bG = ctx.createGain();
    bG.gain.setValueAtTime(0, now + 0.008);
    bG.gain.linearRampToValueAtTime(V.FLIP_BODY, now + 0.012);
    bG.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
    body.connect(bG).connect(this.out);
    body.start(now + 0.008);
    body.stop(now + 0.1);
  }

  // ─── FP TICK ──────────────────────────────────────────────────────────────
  // Emotional job: ADDICTIVE ascending counter. "It's going up! More!"
  // Pitch rises with progress. Volume swells. Late ticks are brighter.
  // This is the slot-machine reel sound — the single most important
  // dopamine driver in the audio system.
  playFpTick(progress = 0) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Primary plink — triangle wave. Pitch rises across the count.
    const freq = V.TICK_PITCH_LO + (V.TICK_PITCH_HI - V.TICK_PITCH_LO) * progress;
    const vol = V.TICK_BASE + (V.TICK_PEAK - V.TICK_BASE) * progress;

    const plink = ctx.createOscillator();
    plink.type = "triangle";
    plink.frequency.value = freq;
    const pG = ctx.createGain();
    pG.gain.setValueAtTime(0, now);
    pG.gain.linearRampToValueAtTime(vol, now + 0.002);
    pG.gain.exponentialRampToValueAtTime(0.01, now + 0.035);
    plink.connect(pG).connect(this.out);
    plink.start(now);
    plink.stop(now + 0.04);

    // Late-count shimmer — adds brightness in top 40% of count
    if (progress > 0.6) {
      const shimmer = ctx.createOscillator();
      shimmer.type = "sine";
      shimmer.frequency.value = freq * 2; // octave above
      const sG = ctx.createGain();
      const sVol = (progress - 0.6) / 0.4 * vol * 0.15; // fades in
      sG.gain.setValueAtTime(0, now);
      sG.gain.linearRampToValueAtTime(sVol, now + 0.002);
      sG.gain.exponentialRampToValueAtTime(0.01, now + 0.03);
      shimmer.connect(sG).connect(this.out);
      shimmer.start(now);
      shimmer.stop(now + 0.035);
    }

    // Micro texture — barely-there court squeak (basketball identity)
    if (Math.random() < 0.4) { // only 40% of ticks — avoids fatiguing
      const sq = ctx.createBufferSource();
      sq.buffer = this.noiseBuffer(0.015);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 3000 + Math.random() * 1200;
      bp.Q.value = 12;
      const sqG = ctx.createGain();
      sqG.gain.setValueAtTime(0, now);
      sqG.gain.linearRampToValueAtTime(V.TICK_TEXTURE, now + 0.001);
      sqG.gain.exponentialRampToValueAtTime(0.01, now + 0.012);
      sq.connect(bp).connect(sqG).connect(this.out);
      sq.start(now);
      sq.stop(now + 0.015);
    }
  }

  // ─── HOLD ON / OFF ────────────────────────────────────────────────────────
  // Emotional job: agency confirmation. "I made a choice."
  playHoldOn() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Confident ascending two-note: "locked in"
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(V.HOLD_ON, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.connect(g).connect(this.out);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  playHoldOff() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Soft descending note: "let go"
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(350, now + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(V.HOLD_OFF, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    osc.connect(g).connect(this.out);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  // ─── TIER CROSSING ────────────────────────────────────────────────────────
  // Emotional job: BREAKTHROUGH. "I just leveled up!"
  // Three layers: thump (impact), chime (musical reward), swish (identity).
  // Intensity scales with tier — GOAT crossing should feel massive.
  playTierCross(tier: string) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const intensityMap: Record<string, number> = {
      ROOKIE: 0.4, STARTER: 0.6, ALL_STAR: 0.8, MVP: 0.9, GOAT: 1.0,
    };
    const intensity = intensityMap[tier] ?? 0.4;

    // Duck bed — give the crossing clean space
    audioDirector.duckForEvent(0.25 + intensity * 0.15, false);

    // Layer 1: Impact thump — the "barrier breaking" transient
    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(180 + intensity * 80, now);
    thump.frequency.exponentialRampToValueAtTime(40, now + 0.1);
    const tG = ctx.createGain();
    tG.gain.setValueAtTime(0, now);
    tG.gain.linearRampToValueAtTime(V.TIER_THUMP * intensity, now + 0.003);
    tG.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    thump.connect(tG).connect(this.out);
    thump.start(now);
    thump.stop(now + 0.13);

    // Layer 2: Musical chime — ascending pitch per tier = progress
    const chimeFreq: Record<string, number> = {
      ROOKIE: 523, STARTER: 587, ALL_STAR: 698, MVP: 880, GOAT: 1047,
    };
    const freq = chimeFreq[tier] ?? 523;
    const chime = ctx.createOscillator();
    chime.type = "sine";
    chime.frequency.value = freq;
    const chG = ctx.createGain();
    chG.gain.setValueAtTime(0, now + 0.008);
    chG.gain.linearRampToValueAtTime(V.TIER_CHIME * intensity, now + 0.015);
    chG.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    chime.connect(chG).connect(this.out);
    chime.start(now + 0.008);
    chime.stop(now + 0.21);

    // Harmonic fifth on higher tiers — richer, more rewarding
    if (intensity >= 0.7) {
      const fifth = ctx.createOscillator();
      fifth.type = "sine";
      fifth.frequency.value = freq * 1.5;
      const fG = ctx.createGain();
      fG.gain.setValueAtTime(0, now + 0.012);
      fG.gain.linearRampToValueAtTime(V.TIER_RING * intensity, now + 0.02);
      fG.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      fifth.connect(fG).connect(this.out);
      fifth.start(now + 0.012);
      fifth.stop(now + 0.19);
    }

    // Layer 3: Swish tail — basketball identity (subtle on low tiers)
    if (intensity >= 0.5) {
      const sw = ctx.createBufferSource();
      sw.buffer = this.noiseBuffer(0.15);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(3000 + intensity * 2000, now + 0.02);
      bp.frequency.exponentialRampToValueAtTime(700, now + 0.14);
      bp.Q.value = 1.0;
      const sG = ctx.createGain();
      sG.gain.setValueAtTime(0, now + 0.02);
      sG.gain.linearRampToValueAtTime(V.TIER_SWISH * intensity, now + 0.04);
      sG.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      sw.connect(bp).connect(sG).connect(this.out);
      sw.start(now + 0.02);
      sw.stop(now + 0.17);
    }
  }

  // ─── HEAT REVEAL ──────────────────────────────────────────────────────────
  // Hot: crowd-lift shimmer. Cold: muted clank (don't overdo negativity).
  playHeatReveal(isHot: boolean) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (isHot) {
      audioDirector.duckForEvent(0.35, false);

      // Bright shimmer — reward signal
      const shimmer = ctx.createOscillator();
      shimmer.type = "sine";
      shimmer.frequency.setValueAtTime(1400, now);
      shimmer.frequency.exponentialRampToValueAtTime(900, now + 0.2);
      const shG = ctx.createGain();
      shG.gain.setValueAtTime(0, now);
      shG.gain.linearRampToValueAtTime(V.HOT_SHIMMER, now + 0.008);
      shG.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      shimmer.connect(shG).connect(this.out);
      shimmer.start(now);
      shimmer.stop(now + 0.23);

      // Crackle texture
      const crackle = ctx.createBufferSource();
      crackle.buffer = this.noiseBuffer(0.25);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(3500, now);
      bp.frequency.linearRampToValueAtTime(1200, now + 0.2);
      bp.Q.value = 2.5;
      const cG = ctx.createGain();
      cG.gain.setValueAtTime(0, now);
      cG.gain.linearRampToValueAtTime(V.HOT_CRACKLE, now + 0.01);
      cG.gain.linearRampToValueAtTime(V.HOT_CRACKLE * 0.4, now + 0.1);
      cG.gain.linearRampToValueAtTime(0, now + 0.25);
      crackle.connect(bp).connect(cG).connect(this.out);
      crackle.start(now);
      crackle.stop(now + 0.26);

      // Crowd lift — quick swell
      this.crowdBurst(V.HOT_CROWD, 0.04, 0.3);
    } else {
      // Cold: single muted clank — don't dwell on it
      const clank = ctx.createOscillator();
      clank.type = "triangle";
      clank.frequency.setValueAtTime(1100, now);
      clank.frequency.exponentialRampToValueAtTime(400, now + 0.1);
      const cG = ctx.createGain();
      cG.gain.setValueAtTime(0, now);
      cG.gain.linearRampToValueAtTime(V.COLD_CLANK, now + 0.003);
      cG.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      clank.connect(cG).connect(this.out);
      clank.start(now);
      clank.stop(now + 0.13);

      // Tiny crowd murmur — barely there
      const murmur = ctx.createBufferSource();
      murmur.buffer = this.noiseBuffer(0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 350;
      bp.Q.value = 0.4;
      const mG = ctx.createGain();
      mG.gain.setValueAtTime(0, now + 0.04);
      mG.gain.linearRampToValueAtTime(V.COLD_MURMUR, now + 0.08);
      mG.gain.linearRampToValueAtTime(0, now + 0.2);
      murmur.connect(bp).connect(mG).connect(this.out);
      murmur.start(now + 0.04);
      murmur.stop(now + 0.22);
    }
  }

  // ─── TIER SLAM (medium win: STARTER / ALL_STAR) ───────────────────────────
  // Emotional job: "Solid! Good hit."
  playTierSlam() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    audioDirector.duckForEvent(0.7);

    // Impact — heavy, authoritative
    const hit = ctx.createOscillator();
    hit.type = "sine";
    hit.frequency.setValueAtTime(140, now);
    hit.frequency.exponentialRampToValueAtTime(30, now + 0.2);
    const hG = ctx.createGain();
    hG.gain.setValueAtTime(0, now);
    hG.gain.linearRampToValueAtTime(V.SLAM_HIT, now + 0.006);
    hG.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    hit.connect(hG).connect(this.out);
    hit.start(now);
    hit.stop(now + 0.26);

    // Noise texture — physical weight
    const tex = ctx.createBufferSource();
    tex.buffer = this.noiseBuffer(0.1);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    const tG = ctx.createGain();
    tG.gain.setValueAtTime(0, now);
    tG.gain.linearRampToValueAtTime(V.SLAM_TEXTURE, now + 0.004);
    tG.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    tex.connect(lp).connect(tG).connect(this.out);
    tex.start(now);
    tex.stop(now + 0.1);

    // Crowd "oh!" — try real asset, fall back to procedural burst
    if (!this.playAsset("crowd", "reactionSmall", V.SLAM_CROWD)) {
      this.crowdBurst(V.SLAM_CROWD, 0.06, 0.5);
    }
  }

  // ─── BIG WIN (MVP / GOAT) ────────────────────────────────────────────────
  // Emotional job: STAGED ERUPTION. The biggest dopamine hit in the game.
  //
  // PRIMARY PATH (music track loaded from Supabase):
  //   Impact thud → music track fades in over 300ms → plays for up to 30s
  //   → fades out over 2s as player transitions to deal screen.
  //   stopBigWin() triggers the fade-out when the user taps Deal.
  //
  // FALLBACK PATH (track not yet loaded — procedural):
  //   Sequence: micro-breath (40ms silence) → impact+swish → arena horn → crowd eruption + stomps
  //
  private bigWinMusicSource: AudioBufferSourceNode | null = null;
  private bigWinMusicGain: GainNode | null = null;

  playBigWin() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    audioDirector.duckForEvent(3.0);

    // ── Always: sub-bass impact thud (the "moment of truth") ─────────────
    const impact = ctx.createOscillator();
    impact.type = "sine";
    impact.frequency.setValueAtTime(180, now);
    impact.frequency.exponentialRampToValueAtTime(35, now + 0.15);
    const impG = ctx.createGain();
    impG.gain.setValueAtTime(0, now);
    impG.gain.linearRampToValueAtTime(V.BIG_IMPACT, now + 0.005);
    impG.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    impact.connect(impG).connect(this.out);
    impact.start(now);
    impact.stop(now + 0.21);

    // ── Try music track (Supabase asset) ─────────────────────────────────
    const musicBuf = soundPackLoader.getRandomBuffer("music", "bigWin");
    if (musicBuf) {
      // Stop any existing music (shouldn't happen, but be safe)
      this.stopBigWin(/* immediate */ true);

      const src = ctx.createBufferSource();
      src.buffer = musicBuf;
      src.loop = false;

      const g = ctx.createGain();
      // Fade in over 300ms starting 200ms after impact — music emerges from the thud
      g.gain.setValueAtTime(0, now);
      g.gain.setValueAtTime(0, now + 0.2);
      g.gain.linearRampToValueAtTime(V.BIG_MUSIC, now + 0.5);

      src.connect(g).connect(this.out);
      src.start(now);

      this.bigWinMusicSource = src;
      this.bigWinMusicGain = g;

      // Auto-stop: fade out gracefully near end of track (track is ~35s)
      const autoFadeAt = now + Math.max(musicBuf.duration - 2.5, 5);
      const autoStop = window.setTimeout(() => this.stopBigWin(), 0);
      // Override: schedule based on track duration
      window.clearTimeout(autoStop);
      window.setTimeout(() => this.stopBigWin(), (musicBuf.duration - 2.5) * 1000);
      return;
    }

    // ── Procedural fallback (music not loaded yet) ────────────────────────
    const breathEnd = now + 0.04;

    if (!this.playAsset("events", "swish", V.BIG_SWISH)) {
      const swish = ctx.createBufferSource();
      swish.buffer = this.noiseBuffer(0.2);
      const swBp = ctx.createBiquadFilter();
      swBp.type = "bandpass";
      swBp.frequency.setValueAtTime(5500, breathEnd);
      swBp.frequency.exponentialRampToValueAtTime(800, breathEnd + 0.18);
      swBp.Q.value = 1.0;
      const swG = ctx.createGain();
      swG.gain.setValueAtTime(0, breathEnd);
      swG.gain.linearRampToValueAtTime(V.BIG_SWISH, breathEnd + 0.008);
      swG.gain.linearRampToValueAtTime(0, breathEnd + 0.2);
      swish.connect(swBp).connect(swG).connect(this.out);
      swish.start(breathEnd);
      swish.stop(breathEnd + 0.22);
    }

    if (!this.playAsset("events", "horn", V.BIG_HORN)) {
      this.arenaHorn(breathEnd + 0.16, 1.8, V.BIG_HORN);
    }

    if (!this.playAsset("crowd", "eruption", V.BIG_CROWD)) {
      const crowdStart = breathEnd + 0.2;
      const crowdDur = 3.0;
      [
        { freq: 250, q: 0.3, peak: V.BIG_CROWD },
        { freq: 800, q: 0.5, peak: V.BIG_CROWD * 0.8 },
        { freq: 2200, q: 0.8, peak: V.BIG_CROWD * 0.5 },
        { freq: 5000, q: 1.2, peak: V.BIG_CROWD * 0.2 },
      ].forEach(band => {
        const n = ctx.createBufferSource();
        n.buffer = this.noiseBuffer(crowdDur + 0.3);
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = band.freq;
        bp.Q.value = band.q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, crowdStart);
        g.gain.linearRampToValueAtTime(band.peak, crowdStart + 0.35);
        g.gain.setValueAtTime(band.peak * 0.9, crowdStart + crowdDur * 0.4);
        g.gain.linearRampToValueAtTime(0, crowdStart + crowdDur);
        n.connect(bp).connect(g).connect(this.out);
        n.start(crowdStart);
        n.stop(crowdStart + crowdDur + 0.05);
      });
    }

    for (let i = 0; i < 8; i++) {
      const t = breathEnd + 0.5 + i * 0.2;
      const stomp = ctx.createOscillator();
      stomp.type = "sine";
      stomp.frequency.setValueAtTime(65, t);
      stomp.frequency.exponentialRampToValueAtTime(22, t + 0.07);
      const sG = ctx.createGain();
      sG.gain.setValueAtTime(0, t);
      sG.gain.linearRampToValueAtTime(V.BIG_STOMP, t + 0.004);
      sG.gain.exponentialRampToValueAtTime(0.01, t + 0.09);
      stomp.connect(sG).connect(this.out);
      stomp.start(t);
      stomp.stop(t + 0.1);
    }
  }

  /**
   * Fade out and stop the big win music track.
   * Called when the player taps Deal (transitions away from celebration).
   * @param immediate — skip fade, stop right now (used when starting a new track)
   */
  stopBigWin(immediate = false) {
    const ctx = this.ensureCtx();
    if (!this.bigWinMusicGain || !this.bigWinMusicSource || !ctx) return;
    const src = this.bigWinMusicSource;
    const gain = this.bigWinMusicGain;
    this.bigWinMusicSource = null;
    this.bigWinMusicGain = null;
    if (immediate) {
      try { src.stop(); } catch { }
      return;
    }
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 2.0);
    window.setTimeout(() => { try { src.stop(); } catch { } }, 2200);
  }

  // ─── NEAR MISS (ROOKIE) ──────────────────────────────────────────────────
  // Emotional job: "So close! One more try!" Not sad. Motivating.
  // Rim bounce creates the "almost" feeling. Short crowd sigh, not groan.
  playNearMiss() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    audioDirector.duckForEvent(0.7);

    // Brief pause (30ms) — micro-suspense before the rim sound
    const t0 = now + 0.03;

    // Rim hit — try real asset first
    this.playAsset("events", "rimOut", V.MISS_RIM);
    // Procedural rim (plays alongside or as fallback)
    const rim = ctx.createOscillator();
    rim.type = "triangle";
    rim.frequency.setValueAtTime(1100, t0);
    rim.frequency.exponentialRampToValueAtTime(300, t0 + 0.2);
    const rG = ctx.createGain();
    rG.gain.setValueAtTime(0, t0);
    rG.gain.linearRampToValueAtTime(V.MISS_RIM, t0 + 0.004);
    rG.gain.exponentialRampToValueAtTime(0.01, t0 + 0.25);
    rim.connect(rG).connect(this.out);
    rim.start(t0);
    rim.stop(t0 + 0.26);

    // Second bounce — softer, rattling out
    const rim2 = ctx.createOscillator();
    rim2.type = "triangle";
    rim2.frequency.setValueAtTime(750, t0 + 0.12);
    rim2.frequency.exponentialRampToValueAtTime(200, t0 + 0.28);
    const r2G = ctx.createGain();
    r2G.gain.setValueAtTime(0, t0 + 0.12);
    r2G.gain.linearRampToValueAtTime(V.MISS_RIM2, t0 + 0.125);
    r2G.gain.exponentialRampToValueAtTime(0.01, t0 + 0.3);
    rim2.connect(r2G).connect(this.out);
    rim2.start(t0 + 0.12);
    rim2.stop(t0 + 0.31);

    // Short crowd sigh — try real groan asset, fall back to procedural
    if (!this.playAsset("crowd", "groan", V.MISS_GROAN)) {
      const sigh = ctx.createBufferSource();
      sigh.buffer = this.noiseBuffer(0.7);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 400;
      bp.Q.value = 0.5;
      const sG = ctx.createGain();
      sG.gain.setValueAtTime(0, t0 + 0.08);
      sG.gain.linearRampToValueAtTime(V.MISS_GROAN, t0 + 0.2);
      sG.gain.linearRampToValueAtTime(V.MISS_GROAN * 0.5, t0 + 0.4);
      sG.gain.linearRampToValueAtTime(0, t0 + 0.65);
      sigh.connect(bp).connect(sG).connect(this.out);
      sigh.start(t0 + 0.08);
      sigh.stop(t0 + 0.7);
    }
  }

  // ─── BUST ─────────────────────────────────────────────────────────────────
  // Emotional job: BRIEF deflection. "Whatever. Deal again."
  // Short, soft, non-toxic. Player should reach for DEAL, not close the app.
  playBust() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    audioDirector.duckForEvent(0.4);

    // Soft buzzer — warm, not harsh. Low-passed sawtooth.
    const buzz = ctx.createOscillator();
    buzz.type = "sawtooth";
    buzz.frequency.value = 110;
    const bLp = ctx.createBiquadFilter();
    bLp.type = "lowpass";
    bLp.frequency.value = 400; // very warm — tames the sawtooth harshness
    const bG = ctx.createGain();
    bG.gain.setValueAtTime(0, now);
    bG.gain.linearRampToValueAtTime(V.BUST_BUZZ, now + 0.02);
    bG.gain.setValueAtTime(V.BUST_BUZZ * 0.85, now + 0.25);
    bG.gain.linearRampToValueAtTime(0, now + 0.4);
    buzz.connect(bLp).connect(bG).connect(this.out);
    buzz.start(now);
    buzz.stop(now + 0.42);

    // Tiny crowd deflation — barely audible
    const deflate = ctx.createBufferSource();
    deflate.buffer = this.noiseBuffer(0.4);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(400, now + 0.03);
    bp.frequency.linearRampToValueAtTime(200, now + 0.35);
    bp.Q.value = 0.35;
    const dG = ctx.createGain();
    dG.gain.setValueAtTime(0, now + 0.03);
    dG.gain.linearRampToValueAtTime(V.BUST_CROWD, now + 0.1);
    dG.gain.linearRampToValueAtTime(0, now + 0.35);
    deflate.connect(bp).connect(dG).connect(this.out);
    deflate.start(now + 0.03);
    deflate.stop(now + 0.4);
  }

  // ─── UNIFIED TIER RESULT SOUND ─────────────────────────────────────────────
  playTierResult(tier: string) {
    switch (tier) {
      case "GOAT":
      case "MVP":
        this.playBigWin();
        break;
      case "ALL_STAR":
        this.playAllStarResult();
        break;
      case "STARTER":
        this.playStarterResult();
        break;
      case "ROOKIE":
        this.playNearMiss();
        break;
      case "BUST":
      default:
        this.playBust();
        break;
    }
  }

  // ─── STARTER RESULT ──────────────────────────────────────────────────────
  // Emotional job: HAPPY SURPRISE. Ascending two-tone chime + small crowd pop.
  private playStarterResult() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    audioDirector.duckForEvent(0.8);

    const note1 = ctx.createOscillator();
    note1.type = "sine";
    note1.frequency.value = 523;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(V.STARTER_FANFARE, now + 0.008);
    g1.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    note1.connect(g1).connect(this.out);
    note1.start(now);
    note1.stop(now + 0.36);

    const note2 = ctx.createOscillator();
    note2.type = "sine";
    note2.frequency.value = 659;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, now + 0.12);
    g2.gain.linearRampToValueAtTime(V.STARTER_FANFARE * 0.9, now + 0.13);
    g2.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    note2.connect(g2).connect(this.out);
    note2.start(now + 0.12);
    note2.stop(now + 0.52);

    if (!this.playAsset("crowd", "reactionSmall", V.STARTER_CROWD)) {
      this.crowdBurst(V.STARTER_CROWD, 0.08, 0.4);
    }
  }

  // ─── ALL_STAR RESULT ─────────────────────────────────────────────────────
  // Emotional job: BUILDING EXCITEMENT. Arena horn stab + crowd swell.
  private playAllStarResult() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    audioDirector.duckForEvent(1.2);

    const horn = ctx.createOscillator();
    horn.type = "sawtooth";
    horn.frequency.setValueAtTime(220, now);
    horn.frequency.linearRampToValueAtTime(233, now + 0.08);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 1.2;
    const hG = ctx.createGain();
    hG.gain.setValueAtTime(0, now);
    hG.gain.linearRampToValueAtTime(V.ALL_STAR_HORN, now + 0.012);
    hG.gain.setValueAtTime(V.ALL_STAR_HORN * 0.8, now + 0.15);
    hG.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
    horn.connect(bp).connect(hG).connect(this.out);
    horn.start(now);
    horn.stop(now + 0.56);

    const horn2 = ctx.createOscillator();
    horn2.type = "sawtooth";
    horn2.frequency.value = 330;
    const bp2 = ctx.createBiquadFilter();
    bp2.type = "bandpass";
    bp2.frequency.value = 1100;
    bp2.Q.value = 1.0;
    const h2G = ctx.createGain();
    h2G.gain.setValueAtTime(0, now + 0.04);
    h2G.gain.linearRampToValueAtTime(V.ALL_STAR_HORN * 0.6, now + 0.055);
    h2G.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    horn2.connect(bp2).connect(h2G).connect(this.out);
    horn2.start(now + 0.04);
    horn2.stop(now + 0.52);

    const stomp = ctx.createOscillator();
    stomp.type = "sine";
    stomp.frequency.setValueAtTime(80, now + 0.1);
    stomp.frequency.exponentialRampToValueAtTime(30, now + 0.25);
    const sG = ctx.createGain();
    sG.gain.setValueAtTime(0, now + 0.1);
    sG.gain.linearRampToValueAtTime(V.ALL_STAR_STOMP, now + 0.114);
    sG.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    stomp.connect(sG).connect(this.out);
    stomp.start(now + 0.1);
    stomp.stop(now + 0.32);

    if (!this.playAsset("crowd", "reactionSmall", V.ALL_STAR_CROWD)) {
      this.crowdBurst(V.ALL_STAR_CROWD, 0.06, 0.8);
    }
  }

  // ─── STREAK MILESTONE ────────────────────────────────────────────────────
  // Emotional job: escalating crowd energy. Reinforces winning streaks.
  playStreakMilestone(streak: number) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    let dur: number, vol: number;
    if (streak >= 10) { dur = 2.5; vol = 1.0; }
    else if (streak >= 5) { dur = 1.5; vol = 0.85; }
    else { dur = 0.8; vol = 0.7; }

    audioDirector.duckForEvent(dur * 0.6);

    // Crowd roar — layered bands
    [
      { freq: 300, q: 0.5, g: vol * V.STREAK_CROWD },
      { freq: 1200, q: 0.8, g: vol * V.STREAK_CROWD * 0.7 },
      { freq: 3500, q: 1.0, g: vol * V.STREAK_CROWD * 0.4 },
    ].forEach(band => {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer(dur + 0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = band.freq;
      bp.Q.value = band.q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(band.g, now + dur * 0.12);
      g.gain.setValueAtTime(band.g, now + dur * 0.5);
      g.gain.linearRampToValueAtTime(0, now + dur);
      n.connect(bp).connect(g).connect(this.out);
      n.start(now);
      n.stop(now + dur + 0.05);
    });

    if (streak >= 5) {
      const stomps = streak >= 10 ? 6 : 4;
      for (let i = 0; i < stomps; i++) {
        const t = now + 0.08 + i * 0.18;
        const s = ctx.createOscillator();
        s.type = "sine";
        s.frequency.setValueAtTime(75, t);
        s.frequency.exponentialRampToValueAtTime(25, t + 0.07);
        const sG = ctx.createGain();
        sG.gain.setValueAtTime(0, t);
        sG.gain.linearRampToValueAtTime(V.STREAK_STOMP, t + 0.004);
        sG.gain.exponentialRampToValueAtTime(0.01, t + 0.09);
        s.connect(sG).connect(this.out);
        s.start(t);
        s.stop(t + 0.1);
      }
    }

    if (streak >= 10) {
      this.arenaHorn(now + 0.25, 1.2, V.STREAK_HORN);
    }
  }

  // ─── DEPRECATED (bed/state handled by director) ───────────────────────────
  playRevealAmbience() { }
  stopRevealAmbience() { }

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  private arenaHorn(start: number, duration: number, volume: number) {
    const ctx = this.ensureCtx();
    if (!ctx) return;

    // Layered square + sawtooth = stadium horn character
    const h1 = ctx.createOscillator();
    h1.type = "square";
    h1.frequency.value = 185;
    const h2 = ctx.createOscillator();
    h2.type = "sawtooth";
    h2.frequency.value = 185;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 750; // warm horn, not shrill

    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, start);
    g1.gain.linearRampToValueAtTime(volume * 0.55, start + 0.1);
    g1.gain.setValueAtTime(volume * 0.5, start + duration * 0.7);
    g1.gain.linearRampToValueAtTime(0, start + duration);

    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, start);
    g2.gain.linearRampToValueAtTime(volume * 0.25, start + 0.1);
    g2.gain.setValueAtTime(volume * 0.2, start + duration * 0.7);
    g2.gain.linearRampToValueAtTime(0, start + duration);

    h1.connect(g1).connect(lp).connect(this.out);
    h2.connect(g2).connect(lp).connect(this.out);
    h1.start(start);
    h2.start(start);
    h1.stop(start + duration + 0.01);
    h2.stop(start + duration + 0.01);
  }

  private crowdBurst(volume: number, delay: number, duration: number) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const t0 = now + delay;

    [400, 1500].forEach((freq, i) => {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer(duration + 0.1);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = freq;
      bp.Q.value = 0.5;
      const g = ctx.createGain();
      const v = i === 0 ? volume : volume * 0.55;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(v, t0 + 0.035);
      g.gain.linearRampToValueAtTime(0, t0 + duration);
      n.connect(bp).connect(g).connect(this.out);
      n.start(t0);
      n.stop(t0 + duration + 0.02);
    });
  }
}

export const soundManager = new SoundManager();
