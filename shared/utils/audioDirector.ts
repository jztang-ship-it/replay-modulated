/**
 * shared/utils/audioDirector.ts — Emotional phase-based audio system
 *
 * Three always-running layers:
 *   BED    — warm arena presence. Never silent. The "room tone" that makes
 *            the player feel like they're somewhere. Subtle enough to forget,
 *            noticeable the instant it disappears.
 *   STATE  — emotional tension/energy that shifts with game phase:
 *            anticipation → commitment → suspense → release.
 *   EVENT  — one-shot sounds that punctuate moments (from SoundManager).
 *
 * Emotional arc per hand:
 *   IDLE        warm hum, player is comfortable, wants to press DEAL
 *   DEAL        spark of energy — "something is about to happen"
 *   HOLD        quiet focus — player is making decisions, don't distract
 *   DRAW        commitment anxiety — cards leaving, new ones incoming
 *   REVEAL      escalating suspense — tension builds card by card
 *   RESULTS     silence-as-punctuation — then result sound fills the space
 *   CELEBRATION crowd energy — dopamine payoff
 */

// ═══════════════════════════════════════════════════════════════════════════
// TUNING CONSTANTS — every number here is a knob. Adjust by ear.
// ═══════════════════════════════════════════════════════════════════════════

export const GAINS = {
  MASTER: 1.0,

  // ── Bed layer ──────────────────────────────────────────────────────────
  // Always present. Should feel like "being in the arena" at a whisper.
  BED_MURMUR:       0.14,    // low crowd rumble (300–400 Hz)
  BED_CHATTER:      0.05,    // mid presence — voices in the distance
  BED_PAD:          0.07,    // tonal warmth — prevents "digital silence"
  BED_PAD_FREQ:     55,      // A1 — felt more than heard
  BED_LFO_RATE:     0.25,    // Hz — slow crowd wave (4-second period)
  BED_LFO_DEPTH:    0.035,   // subtle gain modulation on murmur

  // ── Bed phase modulation ───────────────────────────────────────────────
  // Bed gain multiplier per phase (1.0 = normal, <1 = quieter, >1 = louder)
  BED_PHASE_IDLE:        1.0,
  BED_PHASE_DEAL:        1.15,   // crowd stirs slightly
  BED_PHASE_HOLD:        0.85,   // quiet down for decisions
  BED_PHASE_DRAW:        1.1,    // slight energy
  BED_PHASE_REVEAL:      0.7,    // pull back to make room for tension layer
  BED_PHASE_RESULTS:     0.3,    // way down — result sound owns the space
  BED_PHASE_CELEBRATION: 0.5,    // low — event layer crowd takes over

  // ── State layer (tension/energy) ───────────────────────────────────────
  STATE_IDLE:        0.0,     // silence — bed is enough
  STATE_DEAL:        0.06,    // tiny anticipation lift
  STATE_HOLD:        0.0,     // clean decision space
  STATE_DRAW:        0.10,    // rising commitment energy
  STATE_REVEAL_BASE: 0.12,    // starting reveal tension
  STATE_REVEAL_PEAK: 0.30,    // peak tension on last cards
  STATE_RESULTS:     0.0,     // cut to zero — silence before result
  STATE_CELEBRATION: 0.0,     // event layer handles it

  // ── State layer musical parameters ─────────────────────────────────────
  REVEAL_DRONE_BASE: 55,      // A1 — low rumble
  REVEAL_DRONE_FIFTH:82.5,    // E2 — power chord
  REVEAL_TREMOLO_HZ: 2.5,     // pulse rate — heartbeat speed
  REVEAL_TREMOLO_DEPTH: 0.15, // how much the pulse swells
  REVEAL_NOISE_FREQ: 250,     // gritty filtered noise center
  REVEAL_PITCH_RISE: 20,      // Hz — drone rises as reveal progresses

  DRAW_TONE_START:   60,      // Hz — low hum at draw start
  DRAW_TONE_END:     110,     // Hz — rises to just before reveal
  DRAW_NOISE_SWEEP:  [300, 800] as readonly [number, number], // filter sweep

  // ── Event layer ────────────────────────────────────────────────────────
  EVENT_MASTER:      1.0,

  // ── Ducking ────────────────────────────────────────────────────────────
  DUCK_HEAVY:        0.25,    // bed drops to 25% for big moments
  DUCK_LIGHT:        0.55,    // lighter duck for tier crosses
  DUCK_NONE:         1.0,

  // ── Timing (seconds) ──────────────────────────────────────────────────
  FADE_BED_IN:       2.0,     // slow warm fade-in
  FADE_BED_PHASE:    0.6,     // bed level shifts between phases
  FADE_STATE_IN:     0.5,     // state layer builds in
  FADE_STATE_OUT:    0.25,    // state layer cuts fairly fast
  FADE_DUCK:         0.08,    // snap duck
  FADE_UNDUCK:       0.8,     // slow recovery — let result sound breathe
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

  // Routing
  private bedBus: GainNode | null = null;     // bed content → bedBus → duckGain → master
  private duckGain: GainNode | null = null;    // sits between bed and master
  private stateBus: GainNode | null = null;    // state content → stateBus → master
  private eventBus: GainNode | null = null;    // events → eventBus → master

  // Bed nodes (persistent)
  private bedSources: AudioBufferSourceNode[] = [];
  private bedOscs: OscillatorNode[] = [];
  private bedGains: GainNode[] = [];  // individual layer gains for phase modulation
  private bedMurmurGain: GainNode | null = null; // reference for LFO target

  // State nodes (replaced on phase change)
  private stateSources: AudioBufferSourceNode[] = [];
  private stateOscs: OscillatorNode[] = [];
  private stateGains: GainNode[] = [];

  // Reveal escalation
  private revealDroneGains: GainNode[] = [];
  private revealDroneOscs: OscillatorNode[] = [];

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
    this.stateBus.connect(this.masterGain); // state NOT ducked — tension persists

    this.eventBus = this.ctx.createGain();
    this.eventBus.gain.value = GAINS.EVENT_MASTER;
    this.eventBus.connect(this.masterGain);
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

    this.modulateBedForPhase(phase);
    this.transitionState(phase);
    this.duckForPhase(phase);
  }

  /** Called per card during reveal — escalates tension */
  setRevealProgress(cardIndex: number, totalCards: number) {
    if (this.phase !== "REVEAL" || !this.ctx || !this.stateBus) return;
    const progress = totalCards > 1 ? cardIndex / (totalCards - 1) : 1;
    const now = this.ctx.currentTime;

    // Escalate state bus gain
    const gain = GAINS.STATE_REVEAL_BASE +
      (GAINS.STATE_REVEAL_PEAK - GAINS.STATE_REVEAL_BASE) * progress;
    this.stateBus.gain.cancelScheduledValues(now);
    this.stateBus.gain.setValueAtTime(this.stateBus.gain.value, now);
    this.stateBus.gain.linearRampToValueAtTime(gain, now + 0.4);

    // Raise drone pitch slightly as we go
    const pitchOffset = GAINS.REVEAL_PITCH_RISE * progress;
    this.revealDroneOscs.forEach((osc, i) => {
      const base = i === 0 ? GAINS.REVEAL_DRONE_BASE : GAINS.REVEAL_DRONE_FIFTH;
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(osc.frequency.value, now);
      osc.frequency.linearRampToValueAtTime(base + pitchOffset, now + 0.5);
    });
  }

  /** Event-triggered duck — bed drops, auto-recovers */
  duckForEvent(durationSec: number, heavy = true) {
    if (!this.ctx || !this.duckGain) return;
    const now = this.ctx.currentTime;
    const target = heavy ? GAINS.DUCK_HEAVY : GAINS.DUCK_LIGHT;
    this.duckGain.gain.cancelScheduledValues(now);
    this.duckGain.gain.setValueAtTime(this.duckGain.gain.value, now);
    this.duckGain.gain.linearRampToValueAtTime(target, now + GAINS.FADE_DUCK);
    this.duckGain.gain.linearRampToValueAtTime(GAINS.DUCK_NONE, now + GAINS.FADE_DUCK + durationSec + GAINS.FADE_UNDUCK);
  }

  // ── Bed layer (always on) ─────────────────────────────────────────────────
  private bootBed() {
    if (!this.ctx || this.bedSources.length > 0) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Layer 1: Low crowd murmur — the "room"
    const murmurBuf = this.noiseBuffer(8);
    const murmur = ctx.createBufferSource();
    murmur.buffer = murmurBuf;
    murmur.loop = true;
    const murmurBp = ctx.createBiquadFilter();
    murmurBp.type = "bandpass";
    murmurBp.frequency.value = 350;
    murmurBp.Q.value = 0.3;
    const murmurG = ctx.createGain();
    murmurG.gain.setValueAtTime(0, now);
    murmurG.gain.linearRampToValueAtTime(GAINS.BED_MURMUR, now + GAINS.FADE_BED_IN);
    murmur.connect(murmurBp).connect(murmurG).connect(this.bedBus!);
    murmur.start(now);
    this.bedSources.push(murmur);
    this.bedGains.push(murmurG);
    this.bedMurmurGain = murmurG;

    // Layer 2: Mid chatter — distant voices
    const chatterBuf = this.noiseBuffer(5);
    const chatter = ctx.createBufferSource();
    chatter.buffer = chatterBuf;
    chatter.loop = true;
    const chatterBp = ctx.createBiquadFilter();
    chatterBp.type = "bandpass";
    chatterBp.frequency.value = 1600;
    chatterBp.Q.value = 0.45;
    const chatterG = ctx.createGain();
    chatterG.gain.setValueAtTime(0, now);
    chatterG.gain.linearRampToValueAtTime(GAINS.BED_CHATTER, now + GAINS.FADE_BED_IN);
    chatter.connect(chatterBp).connect(chatterG).connect(this.bedBus!);
    chatter.start(now);
    this.bedSources.push(chatter);
    this.bedGains.push(chatterG);

    // Layer 3: Tonal pad — warmth, prevents dead-digital silence
    const pad = ctx.createOscillator();
    pad.type = "sine";
    pad.frequency.value = GAINS.BED_PAD_FREQ;
    const padG = ctx.createGain();
    padG.gain.setValueAtTime(0, now);
    padG.gain.linearRampToValueAtTime(GAINS.BED_PAD, now + GAINS.FADE_BED_IN);
    pad.connect(padG).connect(this.bedBus!);
    pad.start(now);
    this.bedOscs.push(pad);
    this.bedGains.push(padG);

    // LFO: slow crowd wave — makes noise feel alive, not static
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = GAINS.BED_LFO_RATE;
    const lfoG = ctx.createGain();
    lfoG.gain.value = GAINS.BED_LFO_DEPTH;
    lfo.connect(lfoG).connect(murmurG.gain);
    lfo.start(now);
    this.bedOscs.push(lfo);
  }

  private teardownBed() {
    this.bedSources.forEach(s => { try { s.stop(); } catch {} });
    this.bedOscs.forEach(o => { try { o.stop(); } catch {} });
    this.bedSources = [];
    this.bedOscs = [];
    this.bedGains = [];
    this.bedMurmurGain = null;
    this.started = false;
  }

  /** Smoothly shift bed volume for each phase */
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
      case "IDLE":        return GAINS.BED_PHASE_IDLE;
      case "DEAL":        return GAINS.BED_PHASE_DEAL;
      case "HOLD":        return GAINS.BED_PHASE_HOLD;
      case "DRAW":        return GAINS.BED_PHASE_DRAW;
      case "REVEAL":      return GAINS.BED_PHASE_REVEAL;
      case "RESULTS":     return GAINS.BED_PHASE_RESULTS;
      case "CELEBRATION": return GAINS.BED_PHASE_CELEBRATION;
      default:            return 1.0;
    }
  }

  // ── State layer ───────────────────────────────────────────────────────────
  private transitionState(phase: AudioPhase) {
    if (!this.ctx || !this.stateBus) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Fade out + teardown old state
    this.fadeOutState(now);
    // Small delay so old layer fades before new one starts
    setTimeout(() => this.teardownState(), (GAINS.FADE_STATE_OUT + 0.05) * 1000);

    const targetGain = this.stateGainForPhase(phase);
    if (targetGain <= 0) return;

    // Build new state content
    if (phase === "DEAL") {
      this.buildDealState(ctx, now, targetGain);
    } else if (phase === "DRAW") {
      this.buildDrawState(ctx, now, targetGain);
    } else if (phase === "REVEAL") {
      this.buildRevealState(ctx, now, targetGain);
    }
  }

  private buildDealState(ctx: AudioContext, now: number, targetGain: number) {
    // Spark of anticipation: gentle filtered noise that brightens slightly
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(500, now);
    bp.frequency.linearRampToValueAtTime(700, now + 1.5);
    bp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 1.0;
    src.connect(bp).connect(g).connect(this.stateBus!);
    src.start(now);
    this.stateSources.push(src);
    this.stateGains.push(g);

    this.stateBus!.gain.setValueAtTime(0, now);
    this.stateBus!.gain.linearRampToValueAtTime(targetGain, now + GAINS.FADE_STATE_IN);
  }

  private buildDrawState(ctx: AudioContext, now: number, targetGain: number) {
    // Commitment energy: rising filtered noise + ascending sub-bass tone
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(4);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(GAINS.DRAW_NOISE_SWEEP[0], now);
    bp.frequency.linearRampToValueAtTime(GAINS.DRAW_NOISE_SWEEP[1], now + 2.5);
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.8;
    src.connect(bp).connect(ng).connect(this.stateBus!);
    src.start(now);
    this.stateSources.push(src);
    this.stateGains.push(ng);

    // Rising undertone — "here it comes"
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(GAINS.DRAW_TONE_START, now);
    osc.frequency.linearRampToValueAtTime(GAINS.DRAW_TONE_END, now + 2.5);
    const og = ctx.createGain();
    og.gain.value = 0.6;
    osc.connect(og).connect(this.stateBus!);
    osc.start(now);
    this.stateOscs.push(osc);
    this.stateGains.push(og);

    this.stateBus!.gain.setValueAtTime(0, now);
    this.stateBus!.gain.linearRampToValueAtTime(targetGain, now + GAINS.FADE_STATE_IN);
  }

  private buildRevealState(ctx: AudioContext, now: number, targetGain: number) {
    this.revealDroneOscs = [];
    this.revealDroneGains = [];

    // Two-voice drone — low power chord (felt in the chest)
    [GAINS.REVEAL_DRONE_BASE, GAINS.REVEAL_DRONE_FIFTH].forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g).connect(this.stateBus!);
      osc.start(now);
      this.stateOscs.push(osc);
      this.stateGains.push(g);
      this.revealDroneOscs.push(osc);
      this.revealDroneGains.push(g);
    });

    // Gritty noise layer — adds edge/anxiety
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(8);
    noise.loop = true;
    const nBp = ctx.createBiquadFilter();
    nBp.type = "bandpass";
    nBp.frequency.value = GAINS.REVEAL_NOISE_FREQ;
    nBp.Q.value = 0.4;
    const ng = ctx.createGain();
    ng.gain.value = 0.35;
    noise.connect(nBp).connect(ng).connect(this.stateBus!);
    noise.start(now);
    this.stateSources.push(noise);
    this.stateGains.push(ng);

    // Heartbeat tremolo — pulsing that makes it feel alive and urgent
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = GAINS.REVEAL_TREMOLO_HZ;
    const lfoG = ctx.createGain();
    lfoG.gain.value = GAINS.REVEAL_TREMOLO_DEPTH;
    lfo.connect(lfoG);
    // Modulate all state gains for unified pulse
    this.stateGains.forEach(g => lfoG.connect(g.gain));
    lfo.start(now);
    this.stateOscs.push(lfo);

    // Fade in at base level — setRevealProgress escalates from here
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
    this.stateSources.forEach(s => { try { s.stop(); } catch {} });
    this.stateOscs.forEach(o => { try { o.stop(); } catch {} });
    this.stateSources = [];
    this.stateOscs = [];
    this.stateGains = [];
    this.revealDroneOscs = [];
    this.revealDroneGains = [];
  }

  private stateGainForPhase(phase: AudioPhase): number {
    switch (phase) {
      case "DEAL":        return GAINS.STATE_DEAL;
      case "DRAW":        return GAINS.STATE_DRAW;
      case "REVEAL":      return GAINS.STATE_REVEAL_BASE;
      default:            return 0;
    }
  }

  // ── Phase-based ducking ───────────────────────────────────────────────────
  private duckForPhase(phase: AudioPhase) {
    if (!this.ctx || !this.duckGain) return;
    const now = this.ctx.currentTime;
    // RESULTS: hard duck so result sound has clean space
    // CELEBRATION: lighter duck, event-layer crowd fills in
    if (phase === "RESULTS") {
      this.duckGain.gain.cancelScheduledValues(now);
      this.duckGain.gain.setValueAtTime(this.duckGain.gain.value, now);
      this.duckGain.gain.linearRampToValueAtTime(GAINS.DUCK_HEAVY, now + GAINS.FADE_DUCK);
    } else if (phase === "CELEBRATION") {
      this.duckGain.gain.cancelScheduledValues(now);
      this.duckGain.gain.setValueAtTime(this.duckGain.gain.value, now);
      this.duckGain.gain.linearRampToValueAtTime(GAINS.DUCK_LIGHT, now + GAINS.FADE_DUCK);
    } else {
      this.duckGain.gain.cancelScheduledValues(now);
      this.duckGain.gain.setValueAtTime(this.duckGain.gain.value, now);
      this.duckGain.gain.linearRampToValueAtTime(GAINS.DUCK_NONE, now + GAINS.FADE_UNDUCK);
    }
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
