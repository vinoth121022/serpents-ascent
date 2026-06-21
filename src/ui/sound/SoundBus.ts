/**
 * SoundBus — short procedurally generated WebAudio blips (oscillators + filtered
 * noise; no samples, nothing copyrighted). Lazy AudioContext: created on first
 * user gesture per browser policy. Mute persists with the rest of the settings.
 */
export type SoundEvent = 'roll' | 'land' | 'step' | 'ladder' | 'snake' | 'win';

class SoundBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    if (this.ctx === null) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, start: number, duration: number, type: OscillatorType, peak = 0.5): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + start;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  private gliss(from: number, to: number, duration: number, type: OscillatorType, peak = 0.4): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    const t0 = ctx.currentTime;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
    gain.gain.setValueAtTime(peak, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  private noiseBurst(duration: number, cutoff: number, peak = 0.35, start = 0): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.value = peak;
    src.connect(filter).connect(gain).connect(master);
    src.start(ctx.currentTime + start);
  }

  play(event: SoundEvent): void {
    if (this.muted) return;
    if (this.ensure() === null) return;
    switch (event) {
      case 'roll':
        // Dice rattle — a quick run of dry clacks as it tumbles.
        this.noiseBurst(0.05, 2600, 0.42, 0);
        this.noiseBurst(0.05, 2200, 0.36, 0.09);
        this.noiseBurst(0.05, 2400, 0.34, 0.17);
        this.noiseBurst(0.06, 2000, 0.3, 0.26);
        break;
      case 'land':
        // Firm clack + low thud as it settles onto the tray floor.
        this.noiseBurst(0.07, 3000, 0.5);
        this.tone(170, 0, 0.13, 'sine', 0.32);
        break;
      case 'step':
        this.tone(640, 0, 0.07, 'sine', 0.22);
        break;
      case 'ladder':
        this.tone(523, 0, 0.12, 'triangle', 0.35);
        this.tone(659, 0.09, 0.12, 'triangle', 0.35);
        this.tone(784, 0.18, 0.2, 'triangle', 0.4);
        break;
      case 'snake':
        this.gliss(700, 140, 0.5, 'sawtooth', 0.18);
        break;
      case 'win':
        this.tone(523, 0, 0.25, 'triangle', 0.4);
        this.tone(659, 0.12, 0.25, 'triangle', 0.4);
        this.tone(784, 0.24, 0.3, 'triangle', 0.4);
        this.tone(1047, 0.38, 0.5, 'triangle', 0.45);
        this.noiseBurst(0.4, 4000, 0.12);
        break;
    }
  }
}

export const soundBus = new SoundBus();
