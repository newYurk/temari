type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let rustleGain: GainNode | null = null;
let rustleFilter: BiquadFilterNode | null = null;
let rustleSrc: AudioBufferSourceNode | null = null;
let lastTurn = -1;
let reduced = false;

function AC(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext || (window as WebkitWindow).webkitAudioContext;
}

function noiseBuffer(ac: AudioContext) {
  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.86 + white * 0.14;
    data[i] = last * 1.6;
  }
  return buf;
}

function graph(ac: AudioContext) {
  master = ac.createGain();
  master.gain.value = 0.52;
  master.connect(ac.destination);

  rustleFilter = ac.createBiquadFilter();
  rustleFilter.type = "bandpass";
  rustleFilter.frequency.value = 1400;
  rustleFilter.Q.value = 0.85;

  rustleGain = ac.createGain();
  rustleGain.gain.value = 0;

  rustleSrc = ac.createBufferSource();
  rustleSrc.buffer = noiseBuffer(ac);
  rustleSrc.loop = true;
  rustleSrc.connect(rustleFilter);
  rustleFilter.connect(rustleGain);
  rustleGain.connect(master);
  rustleSrc.start();
}

function ensure() {
  if (ctx) return ctx;
  const Ctor = AC();
  if (!Ctor) return null;
  ctx = new Ctor({ latencyHint: "interactive" });
  graph(ctx);
  if (typeof window !== "undefined") {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void ctx?.resume();
    });
  }
  return ctx;
}

export function unlock() {
  const ac = ensure();
  if (ac && ac.state === "suspended") void ac.resume();
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  delay = 0,
  decay = 0.45,
) {
  const ac = ctx;
  if (!ac || !master) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * decay), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.04);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

export function haptic(pattern: number | number[]) {
  try {
    if (typeof navigator === "undefined" || !navigator.vibrate) return;
    if (Array.isArray(pattern)) navigator.vibrate(pattern);
    else navigator.vibrate(pattern);
  } catch {
    /* unsupported */
  }
}

export function setSpin(speed: number) {
  if (!rustleGain || !rustleFilter || !ctx) return;
  const t = ctx.currentTime;
  const g = reduced ? 0 : Math.min(0.11, speed * 0.018);
  rustleGain.gain.setTargetAtTime(g, t, 0.05);
  rustleFilter.frequency.setTargetAtTime(900 + Math.min(speed, 12) * 80, t, 0.08);
}

export function wrapTurn(turn: number) {
  if (turn === lastTurn || turn <= 0) return;
  lastTurn = turn;
  haptic(8);
}

export function resetTurns() {
  lastTurn = -1;
}

export function pin() {
  unlock();
  tone(1860, 0.07, "sine", 0.07, 0, 0.7);
  tone(2480, 0.05, "triangle", 0.035, 0.012, 0.6);
  haptic(12);
}

export function stitch() {
  unlock();
  tone(784, 0.14, "triangle", 0.06, 0, 0.55);
  tone(1174, 0.18, "sine", 0.04, 0.04, 0.5);
  haptic([8, 18, 8]);
}

export function layer() {
  unlock();
  tone(392, 0.2, "sine", 0.07, 0, 0.7);
  tone(494, 0.22, "sine", 0.06, 0.11, 0.65);
  tone(587, 0.38, "triangle", 0.055, 0.24, 0.55);
  haptic([16, 40, 18]);
}

export function kikuFill() {
  unlock();
  tone(523, 0.16, "sine", 0.05, 0, 0.6);
  tone(659, 0.2, "triangle", 0.045, 0.08, 0.55);
  tone(784, 0.28, "sine", 0.04, 0.16, 0.5);
  haptic([10, 24, 10, 24, 14]);
}
