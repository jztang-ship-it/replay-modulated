/**
 * shared/utils/soundManager.ts — Web Audio API synthesizer
 * Zero audio files. All sounds generated programmatically.
 * Casino energy: LOUD, punchy, unmissable.
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  private muted: boolean;
  // Ambience loop state
  private ambienceNodes: { oscs: OscillatorNode[]; gains: GainNode[]; lfo: OscillatorNode; lfoGain: GainNode } | null = null;

  constructor() {
    this.muted = localStorage.getItem("replaymod_muted") === "true";
    if (typeof document !== "undefined") {
      document.addEventListener("pointerdown", () => this.init(), { once: true });
    }
  }

  private init() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
  }

  private ensureCtx(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) this.init();
    return this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem("replaymod_muted", String(this.muted));
    if (this.muted) this.stopRevealAmbience();
  }

  isMuted() { return this.muted; }

  // ── Sound 1: Card Flip — sharp mechanical snap ────────────────────────
  playCardFlip() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // White noise burst — punchy
    const bufSize = Math.ceil(ctx.sampleRate * 0.08);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.6, now + 0.005);
    noiseGain.gain.linearRampToValueAtTime(0, now + 0.08);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3000;
    bp.Q.value = 0.8;
    noise.connect(bp).connect(noiseGain).connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.08);

    // Low thud layer
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 180;
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0, now);
    oscGain.gain.linearRampToValueAtTime(0.6, now + 0.003);
    oscGain.gain.linearRampToValueAtTime(0, now + 0.04);
    osc.connect(oscGain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  // ── Sound 2: FP Tick — rapid slot machine counter ─────────────────────
  playFpTick() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 880;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.003);
    gain.gain.linearRampToValueAtTime(0, now + 0.018);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.02);
  }

  // ── Sound 3: Tier Cross — ascending tone per tier ─────────────────────
  playTierCross(tier: string) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const freqMap: Record<string, number> = {
      ROOKIE: 440, STARTER: 523, ALL_STAR: 659, MVP: 784, GOAT: 1047,
    };
    const freq = freqMap[tier] ?? 440;

    // Main tone — loud
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = freq;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.9, now + 0.01);
    g1.gain.linearRampToValueAtTime(0, now + 0.25);
    osc1.connect(g1).connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Harmony (fifth above)
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 1.5;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, now);
    g2.gain.linearRampToValueAtTime(0.35, now + 0.01);
    g2.gain.linearRampToValueAtTime(0, now + 0.25);
    osc2.connect(g2).connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.25);
  }

  // ── Sound 4: Tier Slam — heavy thud + bright chime ────────────────────
  playTierSlam() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // THUD — pitch-bend down, punchy
    const thud = ctx.createOscillator();
    thud.type = "sine";
    thud.frequency.setValueAtTime(120, now);
    thud.frequency.exponentialRampToValueAtTime(40, now + 0.2);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0, now);
    thudGain.gain.linearRampToValueAtTime(1.0, now + 0.01);
    thudGain.gain.linearRampToValueAtTime(0, now + 0.25);
    thud.connect(thudGain).connect(ctx.destination);
    thud.start(now);
    thud.stop(now + 0.25);

    // CHIME — bright sine, delayed 30ms
    const chime = ctx.createOscillator();
    chime.type = "sine";
    chime.frequency.value = 1200;
    const chimeGain = ctx.createGain();
    chimeGain.gain.setValueAtTime(0, now + 0.03);
    chimeGain.gain.linearRampToValueAtTime(0.8, now + 0.06);
    chimeGain.gain.linearRampToValueAtTime(0, now + 0.5);
    chime.connect(chimeGain).connect(ctx.destination);
    chime.start(now + 0.03);
    chime.stop(now + 0.51);
  }

  // ── Sound 5: Heat Reveal — fire crackle or ice shimmer ────────────────
  playHeatReveal(isHot: boolean) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (isHot) {
      // Fire crackle — filtered white noise, loud
      const bufSize = Math.ceil(ctx.sampleRate * 0.3);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2000;
      bp.Q.value = 1.5;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.8, now + 0.02);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.15);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      noise.connect(bp).connect(gain).connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.3);
    } else {
      // Ice shimmer — two detuned sines with tremolo
      [1800, 2200].forEach(freq => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 14;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.25;
        lfo.connect(lfoGain);
        const mainGain = ctx.createGain();
        mainGain.gain.setValueAtTime(0, now);
        mainGain.gain.linearRampToValueAtTime(0.55, now + 0.02);
        mainGain.gain.linearRampToValueAtTime(0, now + 0.25);
        lfoGain.connect(mainGain.gain);
        osc.connect(mainGain).connect(ctx.destination);
        osc.start(now);
        lfo.start(now);
        osc.stop(now + 0.26);
        lfo.stop(now + 0.26);
      });
    }
  }

  // ── Sound 6: Streak Milestone — escalating fanfare ────────────────────
  playStreakMilestone(streak: number) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    let notes: number[];
    let noteMs: number;
    let gapMs: number;
    let vol: number;

    if (streak >= 10) {
      notes = [523, 587, 659, 698, 784, 880, 988, 1047];
      noteMs = 70; gapMs = 10; vol = 1.0;
    } else if (streak >= 5) {
      notes = [523, 587, 659, 784, 880];
      noteMs = 80; gapMs = 15; vol = 0.85;
    } else {
      notes = [523, 659, 784];
      noteMs = 80; gapMs = 20; vol = 0.7;
    }

    notes.forEach((freq, i) => {
      const start = now + i * (noteMs + gapMs) / 1000;
      const dur = noteMs / 1000;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(vol, start + 0.005);
      gain.gain.linearRampToValueAtTime(0, start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.01);
    });

    if (streak >= 10) {
      const chordStart = now + notes.length * (noteMs + gapMs) / 1000;
      [523, 659, 784].forEach(freq => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, chordStart);
        gain.gain.linearRampToValueAtTime(0.6, chordStart + 0.02);
        gain.gain.linearRampToValueAtTime(0, chordStart + 0.25);
        osc.connect(gain).connect(ctx.destination);
        osc.start(chordStart);
        osc.stop(chordStart + 0.26);
      });
    }
  }

  // ── Sound 7: Reveal Ambience — looping low rhythmic pulse (tension) ───
  playRevealAmbience() {
    const ctx = this.ensureCtx();
    if (!ctx || this.ambienceNodes) return; // already playing

    // Two low oscillators with slow LFO tremolo
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 2; // 2Hz pulse
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.15;
    lfo.connect(lfoGain);

    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];

    [55, 82.5].forEach(freq => { // A1 + E2 — low power chord
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.2;
      lfoGain.connect(g.gain); // tremolo modulates gain
      osc.connect(g).connect(ctx.destination);
      osc.start();
      oscs.push(osc);
      gains.push(g);
    });

    lfo.start();
    this.ambienceNodes = { oscs, gains, lfo, lfoGain };
  }

  stopRevealAmbience() {
    if (!this.ambienceNodes) return;
    const now = this.ctx?.currentTime ?? 0;
    // Fade out over 300ms
    this.ambienceNodes.gains.forEach(g => {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + 0.3);
    });
    const nodes = this.ambienceNodes;
    this.ambienceNodes = null;
    setTimeout(() => {
      nodes.oscs.forEach(o => { try { o.stop(); } catch {} });
      try { nodes.lfo.stop(); } catch {}
    }, 350);
  }

  // ── Sound 8: Big Win — MVP/GOAT celebratory fanfare (3 seconds) ───────
  playBigWin() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Ascending major fanfare: C5 → E5 → G5 → C6, building to a sustained chord
    const fanfare = [
      { freq: 523, start: 0,    dur: 0.25 },  // C5
      { freq: 659, start: 0.2,  dur: 0.25 },  // E5
      { freq: 784, start: 0.4,  dur: 0.25 },  // G5
      { freq: 1047, start: 0.6, dur: 0.4  },  // C6 — held longer
    ];

    fanfare.forEach(n => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now + n.start);
      g.gain.linearRampToValueAtTime(0.7, now + n.start + 0.01);
      g.gain.linearRampToValueAtTime(0.5, now + n.start + n.dur * 0.7);
      g.gain.linearRampToValueAtTime(0, now + n.start + n.dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.01);

      // Octave doubling for richness
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = n.freq * 2;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0, now + n.start);
      g2.gain.linearRampToValueAtTime(0.2, now + n.start + 0.01);
      g2.gain.linearRampToValueAtTime(0, now + n.start + n.dur);
      osc2.connect(g2).connect(ctx.destination);
      osc2.start(now + n.start);
      osc2.stop(now + n.start + n.dur + 0.01);
    });

    // Sustained resolution chord: C major (C5 + E5 + G5 + C6) — 2s tail
    const chordStart = now + 1.0;
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, chordStart);
      g.gain.linearRampToValueAtTime(i === 3 ? 0.6 : 0.4, chordStart + 0.05);
      g.gain.linearRampToValueAtTime(0, chordStart + 2.0);
      osc.connect(g).connect(ctx.destination);
      osc.start(chordStart);
      osc.stop(chordStart + 2.01);
    });
  }

  // ── Sound 9: Near Miss — rising phrase that doesn't resolve ────────────
  playNearMiss() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Rising notes that end on a dissonant tritone — "almost had it"
    const notes = [
      { freq: 392,  start: 0,    dur: 0.2  },  // G4
      { freq: 440,  start: 0.18, dur: 0.2  },  // A4
      { freq: 494,  start: 0.36, dur: 0.2  },  // B4
      { freq: 523,  start: 0.54, dur: 0.25 },  // C5
      { freq: 587,  start: 0.72, dur: 0.3  },  // D5
      { freq: 622,  start: 0.95, dur: 0.6  },  // Eb5 — tritone against A, unresolved
    ];

    notes.forEach((n, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      const g = ctx.createGain();
      const vol = i === notes.length - 1 ? 0.6 : 0.5;
      g.gain.setValueAtTime(0, now + n.start);
      g.gain.linearRampToValueAtTime(vol, now + n.start + 0.01);
      g.gain.linearRampToValueAtTime(0, now + n.start + n.dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.01);
    });
  }

  // ── Sound 10: Bust — descending minor tone, round over ────────────────
  playBust() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Descending minor: D5 → Bb4 → G4 → D4 — definitive, not punishing
    const notes = [
      { freq: 587, start: 0,    dur: 0.35 },  // D5
      { freq: 466, start: 0.3,  dur: 0.35 },  // Bb4
      { freq: 392, start: 0.6,  dur: 0.35 },  // G4
      { freq: 294, start: 0.9,  dur: 0.6  },  // D4 — held, final
    ];

    notes.forEach((n, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      const g = ctx.createGain();
      const vol = i === notes.length - 1 ? 0.5 : 0.6;
      g.gain.setValueAtTime(0, now + n.start);
      g.gain.linearRampToValueAtTime(vol, now + n.start + 0.015);
      g.gain.linearRampToValueAtTime(0, now + n.start + n.dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.01);
    });
  }
}

export const soundManager = new SoundManager();
