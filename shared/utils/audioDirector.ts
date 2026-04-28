/**
 * shared/utils/audioDirector.ts — Phase-based layered audio system
 *
 * Three always-running layers:
 *   BED    — always-on arena crowd presence
 *   STATE  — crowd-based tension/energy that shifts with game phase
 *   EVENT  — one-shot sounds (from SoundManager)
 *
 * Content strategy:
 *   1. Try to play real audio assets from the sound pack (basketball crowd recordings)
 *   2. Fall back to procedural filtered noise if assets aren't loaded yet
 *   3. LFO modulation and gain control are always procedural (control logic)
 *
 * The director owns routing, phase management, ducking, and gain scheduling.
 * It does NOT decide what sounds to use — it asks the SoundPackLoader for content.
 */

import { soundPackLoader } from "./soundPack";

// ═══════════════════════════════════════════════════════════════════════════
// TUNING CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const GAINS = {
  MASTER: 1.0,

  // ── Bed layer ──────────────────────────────────────────────────────────
  BED_ASSET: 0.18,    // volume for real crowd bed asset
  BED_LOW: 0.14,    // procedural fallback: low crowd rumble
  BED_MID: 0.05,    // procedural fallback: mid chatter
  BED_HIGH: 0.025,   // procedural fallback: upper arena air
  BED_LFO_RATE: 0.25,    // Hz — slow crowd wave
  BED_LFO_DEPTH: 0.035,   // subtle gain modulation

  // ── Bed phase modulation ───────────────────────────────────────────────
  BED_PHASE_IDLE: 1.0,
  BED_PHASE_DEAL: 1.15,
  BED_PHASE_HOLD: 0.85,
  BED_PHASE_DRAW: 1.1,
  BED_PHASE_REVEAL: 0.7,
  BED_PHASE_RESULTS: 0.3,
  BED_PHASE_CELEBRATION: 0.5,

  // ── State layer ────────────────────────────────────────────────────────
  STATE_IDLE: 0.0,
  STATE_DEAL: 0.06,
  STATE_HOLD: 0.0,
  STATE_DRAW: 0.10,
  STATE_REVEAL_BASE: 0.12,
  STATE_REVEAL_PEAK: 0.30,
  STATE_RESULTS: 0.0,
  STATE_CELEBRATION: 0.0,

  // State crowd shaping (procedural fallback)
  DEAL_CROWD_FREQ: [400, 600] as readonly [number, number],
  DRAW_CROWD_LO: [350, 700] as readonly [number, number],
  DRAW_CROWD_HI: [1200, 2000] as readonly [number, number],
  REVEAL_CROWD_LOW: 300,
  REVEAL_CROWD_MID: 1000,
  REVEAL_CROWD_HIGH: 2800,
  REVEAL_LFO_HZ: 2.0,
  REVEAL_LFO_DEPTH: 0.12,
  REVEAL_FREQ_RISE: 150,

  // ── Event layer ────────────────────────────────────────────────────────
  EVENT_MASTER: 1.0,

  // ── Ducking ────────────────────────────────────────────────────────────
  DUCK_HEAVY: 0.25,
  DUCK_LIGHT: 0.55,
  DUCK_NONE: 1.0,

  // ── Timing (seconds) ──────────────────────────────────────────────────
  FADE_BED_IN: 2.0,
  FADE_BED_PHASE: 0.6,
  FADE_STATE_IN: 0.5,
  FADE_STATE_OUT: 0.25,
  FADE_DUCK: 0.08,
  FADE_UNDUCK: 0.8,
} as const;

// ═══════════════════════════════════════════════════════════════════════════

export type AudioPhase =
  | "IDLE" | "DEAL" | "HOLD" | "DRAW"
  | "REVEAL" | "RESULTS" | "CELEBRATION";

class AudioDirector {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted: boolean;
  private started = false;
  private phase: AudioPhase = "IDLE";
  private packLoaded = false;

  // Routing
  private bedBus: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private stateBus: GainNode | null = null;
  private eventBus: GainNode | null = null;

  // Bed nodes (persistent)
  private bedSources: AudioBufferSourceNode[] = [];
  private bedOscs: OscillatorNode[] = [];
  private bedGains: GainNode[] = [];

  // State nodes (replaced on phase change)
  private stateSources: AudioBufferSourceNode[] = [];
  private stateOscs: OscillatorNode[] = [];
  private stateGains: GainNode[] = [];
  private stateFilters: BiquadFilterNode[] = [];

  constructor() {
    this.muted = localStorage.getItem("replaymod_muted") === "true";
    if (typeof document !== "undefined") {
      const handler = () => {
        this.initContext();
        document.removeEventListener("pointerdown", handler);
      };
      document.addEventListener("pointerdown", handler);
    }
  }

  // ── Context / routing ─────────────────────────────────────────────────────
  private initContext() {
    if (this.ctx) return;
    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : GAINS.MASTER;
    this.masterGain.connect(this.ctx.destination);

    this.duckGain = this.ctx.createGain();
    this.duckGain.gain.value = GAINS.DUCK_NONE;
    this.duckGain.connect(this.masterGain);

    this.bedBus = this.ctx.createGain();
    this.bedBus.gain.value = 1.0;
    this.bedBus.connect(this.duckGain);

    this.stateBus = this.ctx.createGain();
    this.stateBus.gain.value = 0;
    this.stateBus.connect(this.masterGain);

    this.eventBus = this.ctx.createGain();
    this.eventBus.gain.value = GAINS.EVENT_MASTER;
    this.eventBus.connect(this.masterGain);

    // Kick off asset loading (non-blocking — procedural runs until ready)
    this.loadPack();
  }

  private async loadPack() {
    if (!this.ctx) return;
    await soundPackLoader.preloadAll(this.ctx);
    this.packLoaded = true;
    // If bed is already running with procedural, rebuild with assets
    if (this.started && soundPackLoader.hasCrowdAssets()) {
      this.teardownBed();
      this.bootBed();
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  getContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) this.initContext();
    return this.ctx;
  }

  getEventOutput(): AudioNode {
    return this.eventBus ?? this.ctx!.destination;
  }

  isMuted(): boolean { return this.muted; }
  getPhase(): AudioPhase { return this.phase; }
  isPackLoaded(): boolean { return this.packLoaded; }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem("replaymod_muted", String(this.muted));
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(this.muted ? 0 : GAINS.MASTER, now + 0.15);
    }
    if (this.muted) {
      this.teardownBed();
      this.teardownState();
    } else if (!this.started) {
      this.bootBed();
      this.started = true;
    }
  }

  // ── Phase management ──────────────────────────────────────────────────────
  setPhase(phase: AudioPhase) {
    if (phase === this.phase && this.started) return;
    this.phase = phase;
    if (this.muted || !this.ctx) return;

    if (!this.started) {
      this.bootBed();
      this.started = true;
    }

    // Kick off music prefetch as soon as reveal starts — by the time cards
    // finish revealing the track will be decoded and ready in memory.
    if (phase === "REVEAL" && this.ctx) {
      soundPackLoader.prefetchMusic(this.ctx);
    }

    this.modulateBedForPhase(phase);
    this.transitionState(phase);
    this.duckForPhase(phase);
  }

  setRevealProgress(cardIndex: number, totalCards: number) {
    if (this.phase !== "REVEAL" || !this.ctx || !this.stateBus) return;
    const progress = totalCards > 1 ? cardIndex / (totalCards - 1) : 1;
    const now = this.ctx.currentTime;

    // Escalate crowd gain
    const gain = GAINS.STATE_REVEAL_BASE +
      (GAINS.STATE_REVEAL_PEAK - GAINS.STATE_REVEAL_BASE) * progress;
    this.stateBus.gain.cancelScheduledValues(now);
    this.stateBus.gain.setValueAtTime(this.stateBus.gain.value, now);
    this.stateBus.gain.linearRampToValueAtTime(gain, now + 0.4);

    // Shift procedural crowd filters up (no-op if using assets — filters array empty)
    const freqRise = GAINS.REVEAL_FREQ_RISE * progress;
    if (this.stateFilters.length >= 3) {
      this.stateFilters[0].frequency.setValueAtTime(GAINS.REVEAL_CROWD_LOW + freqRise * 0.5, now);
      this.stateFilters[1].frequency.setValueAtTime(GAINS.REVEAL_CROWD_MID + freqRise, now);
      this.stateFilters[2].frequency.setValueAtTime(GAINS.REVEAL_CROWD_HIGH + freqRise, now);
    }
  }

  duckForEvent(durationSec: number, heavy = true) {
    if (!this.ctx || !this.duckGain) return;
    const now = this.ctx.currentTime;
    const target = heavy ? GAINS.DUCK_HEAVY : GAINS.DUCK_LIGHT;
    this.duckGain.gain.cancelScheduledValues(now);
    this.duckGain.gain.setValueAtTime(this.duckGain.gain.value, now);
    this.duckGain.gain.linearRampToValueAtTime(target, now + GAINS.FADE_DUCK);
    this.duckGain.gain.linearRampToValueAtTime(GAINS.DUCK_NONE, now + GAINS.FADE_DUCK + durationSec + GAINS.FADE_UNDUCK);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // BED LAYER
  // Strategy: use real crowd bed asset if available, else procedural noise.
  // LFO breathing is always procedural (control, not content).
  // ═════════════════════════════════════════════════════════════════════════

  private bootBed() {
    if (!this.ctx || this.bedSources.length > 0) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const bedBuffer = soundPackLoader.getRandomBuffer("crowd", "bed");

    if (bedBuffer) {
      // ── Asset-driven bed ──────────────────────────────────────────────
      const src = ctx.createBufferSource();
      src.buffer = bedBuffer;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(GAINS.BED_ASSET, now + GAINS.FADE_BED_IN);
      src.connect(g).connect(this.bedBus!);
      src.start(now);
      this.bedSources.push(src);
      this.bedGains.push(g);

      // Optional: keep a quiet procedural low-end underneath for sub-bass fill
      this.addProceduralBand(ctx, now, 200, 0.25, GAINS.BED_LOW * 0.4, 8);
    }
    // No procedural fallback: sports that haven't shipped a real crowd-bed
    // asset (i.e. baseball today) stay silent rather than playing generic
    // filtered-noise "crowd" that doesn't fit the sport. Per-sport game
    // sounds (FP tick, hold, tier-result, etc.) are oscillator-based and
    // play independent of bed presence.

    // LFO: slow crowd wave (always procedural — it's gain control, not content)
    const mainGain = this.bedGains[0];
    if (mainGain) {
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = GAINS.BED_LFO_RATE;
      const lfoG = ctx.createGain();
      lfoG.gain.value = GAINS.BED_LFO_DEPTH;
      lfo.connect(lfoG).connect(mainGain.gain);
      lfo.start(now);
      this.bedOscs.push(lfo);
    }
  }

  /** Creates one filtered-noise band for procedural crowd. */
  private addProceduralBand(
    ctx: AudioContext, now: number,
    freq: number, q: number, gain: number, bufSec: number,
  ): GainNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(bufSec);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + GAINS.FADE_BED_IN);
    src.connect(bp).connect(g).connect(this.bedBus!);
    src.start(now);
    this.bedSources.push(src);
    this.bedGains.push(g);
    return g;
  }

  private teardownBed() {
    this.bedSources.forEach(s => { try { s.stop(); } catch { } });
    this.bedOscs.forEach(o => { try { o.stop(); } catch { } });
    this.bedSources = [];
    this.bedOscs = [];
    this.bedGains = [];
    this.started = false;
  }

  private modulateBedForPhase(phase: AudioPhase) {
    if (!this.ctx || !this.bedBus) return;
    const now = this.ctx.currentTime;
    const mul = this.bedPhaseMultiplier(phase);
    this.bedBus.gain.cancelScheduledValues(now);
    this.bedBus.gain.setValueAtTime(this.bedBus.gain.value, now);
    this.bedBus.gain.linearRampToValueAtTime(mul, now + GAINS.FADE_BED_PHASE);
  }

  private bedPhaseMultiplier(phase: AudioPhase): number {
    switch (phase) {
      case "IDLE": return GAINS.BED_PHASE_IDLE;
      case "DEAL": return GAINS.BED_PHASE_DEAL;
      case "HOLD": return GAINS.BED_PHASE_HOLD;
      case "DRAW": return GAINS.BED_PHASE_DRAW;
      case "REVEAL": return GAINS.BED_PHASE_REVEAL;
      case "RESULTS": return GAINS.BED_PHASE_RESULTS;
      case "CELEBRATION": return GAINS.BED_PHASE_CELEBRATION;
      default: return 1.0;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // STATE LAYER
  // Strategy: use real crowd assets if available, else procedural noise.
  // REVEAL always gets LFO pulse (procedural control on top of any source).
  // ═════════════════════════════════════════════════════════════════════════

  private transitionState(phase: AudioPhase) {
    if (!this.ctx || !this.stateBus) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    this.fadeOutState(now);
    setTimeout(() => this.teardownState(), (GAINS.FADE_STATE_OUT + 0.05) * 1000);

    const targetGain = this.stateGainForPhase(phase);
    if (targetGain <= 0) return;

    if (phase === "DEAL") {
      this.buildDealState(ctx, now, targetGain);
    } else if (phase === "DRAW") {
      this.buildDrawState(ctx, now, targetGain);
    } else if (phase === "REVEAL") {
      this.buildRevealState(ctx, now, targetGain);
    }
  }

  private buildDealState(ctx: AudioContext, now: number, targetGain: number) {
    // Try anticipation asset at low volume for a gentle crowd stir
    const buf = soundPackLoader.getRandomBuffer("crowd", "anticipation");
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0.6; // quieter — just a stir, not full anticipation
      src.connect(g).connect(this.stateBus!);
      src.start(now);
      this.stateSources.push(src);
      this.stateGains.push(g);
    } else {
      // Procedural: gentle filtered noise brightening slightly
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(3);
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(GAINS.DEAL_CROWD_FREQ[0], now);
      bp.frequency.linearRampToValueAtTime(GAINS.DEAL_CROWD_FREQ[1], now + 1.5);
      bp.Q.value = 0.5;
      const g = ctx.createGain();
      g.gain.value = 1.0;
      src.connect(bp).connect(g).connect(this.stateBus!);
      src.start(now);
      this.stateSources.push(src);
      this.stateGains.push(g);
    }

    this.stateBus!.gain.setValueAtTime(0, now);
    this.stateBus!.gain.linearRampToValueAtTime(targetGain, now + GAINS.FADE_STATE_IN);
  }

  private buildDrawState(ctx: AudioContext, now: number, targetGain: number) {
    // Try anticipation asset at higher volume
    const buf = soundPackLoader.getRandomBuffer("crowd", "anticipation");
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 1.0;
      src.connect(g).connect(this.stateBus!);
      src.start(now);
      this.stateSources.push(src);
      this.stateGains.push(g);
    } else {
      // Procedural: two rising noise bands
      const lo = ctx.createBufferSource();
      lo.buffer = this.noiseBuffer(4);
      lo.loop = true;
      const loBp = ctx.createBiquadFilter();
      loBp.type = "bandpass";
      loBp.frequency.setValueAtTime(GAINS.DRAW_CROWD_LO[0], now);
      loBp.frequency.linearRampToValueAtTime(GAINS.DRAW_CROWD_LO[1], now + 2.5);
      loBp.Q.value = 0.5;
      const loG = ctx.createGain();
      loG.gain.value = 0.8;
      lo.connect(loBp).connect(loG).connect(this.stateBus!);
      lo.start(now);
      this.stateSources.push(lo);
      this.stateGains.push(loG);

      const hi = ctx.createBufferSource();
      hi.buffer = this.noiseBuffer(3);
      hi.loop = true;
      const hiBp = ctx.createBiquadFilter();
      hiBp.type = "bandpass";
      hiBp.frequency.setValueAtTime(GAINS.DRAW_CROWD_HI[0], now);
      hiBp.frequency.linearRampToValueAtTime(GAINS.DRAW_CROWD_HI[1], now + 2.5);
      hiBp.Q.value = 0.6;
      const hiG = ctx.createGain();
      hiG.gain.value = 0.5;
      hi.connect(hiBp).connect(hiG).connect(this.stateBus!);
      hi.start(now);
      this.stateSources.push(hi);
      this.stateGains.push(hiG);
    }

    this.stateBus!.gain.setValueAtTime(0, now);
    this.stateBus!.gain.linearRampToValueAtTime(targetGain, now + GAINS.FADE_STATE_IN);
  }

  private buildRevealState(ctx: AudioContext, now: number, targetGain: number) {
    this.stateFilters = [];

    const buf = soundPackLoader.getRandomBuffer("crowd", "anticipation");
    if (buf) {
      // ── Asset-driven reveal tension ───────────────────────────────────
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 1.0;
      src.connect(g).connect(this.stateBus!);
      src.start(now);
      this.stateSources.push(src);
      this.stateGains.push(g);
      // No stateFilters needed — gain escalation via setRevealProgress is enough
    } else {
      // ── Procedural fallback ───────────────────────────────────────────
      const bands: Array<{ freq: number; q: number; vol: number; bufSec: number }> = [
        { freq: GAINS.REVEAL_CROWD_LOW, q: 0.4, vol: 0.5, bufSec: 8 },
        { freq: GAINS.REVEAL_CROWD_MID, q: 0.5, vol: 0.4, bufSec: 6 },
        { freq: GAINS.REVEAL_CROWD_HIGH, q: 0.6, vol: 0.25, bufSec: 4 },
      ];

      bands.forEach(band => {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer(band.bufSec);
        src.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = band.freq;
        bp.Q.value = band.q;
        const g = ctx.createGain();
        g.gain.value = band.vol;
        src.connect(bp).connect(g).connect(this.stateBus!);
        src.start(now);
        this.stateSources.push(src);
        this.stateGains.push(g);
        this.stateFilters.push(bp);
      });
    }

    // LFO pulse — always procedural (crowd heartbeat control)
    if (this.stateGains.length > 0) {
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = GAINS.REVEAL_LFO_HZ;
      const lfoG = ctx.createGain();
      lfoG.gain.value = GAINS.REVEAL_LFO_DEPTH;
      lfo.connect(lfoG);
      this.stateGains.forEach(g => lfoG.connect(g.gain));
      lfo.start(now);
      this.stateOscs.push(lfo);
    }

    this.stateBus!.gain.setValueAtTime(0, now);
    this.stateBus!.gain.linearRampToValueAtTime(targetGain, now + GAINS.FADE_STATE_IN);
  }

  private fadeOutState(now: number) {
    if (!this.stateBus) return;
    this.stateBus.gain.cancelScheduledValues(now);
    this.stateBus.gain.setValueAtTime(this.stateBus.gain.value, now);
    this.stateBus.gain.linearRampToValueAtTime(0, now + GAINS.FADE_STATE_OUT);
  }

  private teardownState() {
    this.stateSources.forEach(s => { try { s.stop(); } catch { } });
    this.stateOscs.forEach(o => { try { o.stop(); } catch { } });
    this.stateSources = [];
    this.stateOscs = [];
    this.stateGains = [];
    this.stateFilters = [];
  }

  private stateGainForPhase(phase: AudioPhase): number {
    switch (phase) {
      case "DEAL": return GAINS.STATE_DEAL;
      case "DRAW": return GAINS.STATE_DRAW;
      case "REVEAL": return GAINS.STATE_REVEAL_BASE;
      default: return 0;
    }
  }

  // ── Phase-based ducking ───────────────────────────────────────────────────
  private duckForPhase(phase: AudioPhase) {
    if (!this.ctx || !this.duckGain) return;
    const now = this.ctx.currentTime;
    if (phase === "RESULTS") {
      // Slow fade to heavy duck over 600ms — avoids the jarring silence cut
      // that previously happened when reveal ended and results phase snapped in.
      this.duckGain.gain.cancelScheduledValues(now);
      this.duckGain.gain.setValueAtTime(this.duckGain.gain.value, now);
      this.duckGain.gain.linearRampToValueAtTime(GAINS.DUCK_HEAVY, now + 0.6);
    } else if (phase === "CELEBRATION") {
      this.setDuck(GAINS.DUCK_LIGHT, now);
    } else {
      this.setDuck(GAINS.DUCK_NONE, now);
    }
  }

  private setDuck(target: number, now: number) {
    if (!this.duckGain) return;
    const fadeTime = target < GAINS.DUCK_NONE ? GAINS.FADE_DUCK : GAINS.FADE_UNDUCK;
    this.duckGain.gain.cancelScheduledValues(now);
    this.duckGain.gain.setValueAtTime(this.duckGain.gain.value, now);
    this.duckGain.gain.linearRampToValueAtTime(target, now + fadeTime);
  }

  // ── Utility ───────────────────────────────────────────────────────────────
  private noiseBuffer(duration: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.ceil(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
}

export const audioDirector = new AudioDirector();
