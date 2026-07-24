import confetti from "canvas-confetti";

let completionAudioContext: AudioContext | null = null;
let completionAudioPrimed = false;

function getCompletionAudioContext() {
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return null;
  completionAudioContext ??= new AudioContextClass();
  return completionAudioContext;
}

export async function primeCompletionSound() {
  try {
    const context = getCompletionAudioContext();
    if (!context) return;
    if (!completionAudioPrimed) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.00001, context.currentTime);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + 0.025);
      completionAudioPrimed = true;
    }
    if (context.state === "suspended") await context.resume();
  } catch {
    // Completion still succeeds when a browser blocks audio initialization.
  }
}

export async function playCompletionSound(ready?: Promise<void>) {
  await ready;
  const context = getCompletionAudioContext();
  if (!context) return;
  if (context.state === "suspended") await context.resume();
  if (context.state !== "running") return;

  const master = context.createGain();
  master.gain.setValueAtTime(0.28, context.currentTime);
  master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.58);
  master.connect(context.destination);

  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === 0 ? "sine" : "triangle";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(master);
    const start = context.currentTime + index * 0.055;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.2 : 0.12, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
    oscillator.start(start);
    oscillator.stop(start + 0.32);
  });

  if ("vibrate" in navigator) navigator.vibrate([18, 25, 24]);
}

export async function playCompletionTick(ready?: Promise<void>) {
  await ready;
  const context = getCompletionAudioContext();
  if (!context) return;
  if (context.state === "suspended") await context.resume();
  if (context.state !== "running") return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(440, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + 0.08);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.11);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(context.currentTime);
  oscillator.stop(context.currentTime + 0.12);
}

export type CompletionOrigin = { x: number; y: number };

export function completionOrigin(element?: HTMLElement | null): CompletionOrigin {
  if (!element) return { x: 0.5, y: 0.65 };
  const rect = element.getBoundingClientRect();
  return {
    x: Math.min(0.95, Math.max(0.05, (rect.left + rect.width / 2) / window.innerWidth)),
    y: Math.min(0.95, Math.max(0.05, (rect.top + rect.height / 2) / window.innerHeight)),
  };
}

export function playCompletionEffect(
  effectId: string,
  origin: CompletionOrigin,
) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const base = { origin, disableForReducedMotion: true, zIndex: 120 };
  if (effectId === "signal-finish") {
    void confetti({ ...base, particleCount: 30, spread: 360, startVelocity: 17, gravity: 0.72, scalar: 0.68, colors: ["#22d3ee", "#3b82f6", "#ffffff"] });
    return;
  }
  if (effectId === "signal-rings") {
    void confetti({ ...base, particleCount: 22, spread: 360, startVelocity: 14, gravity: 0.45, scalar: 0.58, colors: ["#67e8f9", "#60a5fa", "#ffffff"] });
    window.setTimeout(() => {
      void confetti({ ...base, particleCount: 34, spread: 360, startVelocity: 22, gravity: 0.72, scalar: 0.72, colors: ["#22d3ee", "#2563eb", "#ffffff"] });
    }, 90);
    return;
  }
  if (effectId === "prism-pop") {
    void confetti({ ...base, particleCount: 50, spread: 82, startVelocity: 29, gravity: 0.92, scalar: 0.84, colors: ["#22d3ee", "#a78bfa", "#fb7185", "#facc15"] });
    return;
  }
  if (effectId === "prism-check") {
    const colors = ["#22d3ee", "#a78bfa", "#fb7185", "#facc15"];
    void confetti({ ...base, particleCount: 28, angle: 52, spread: 46, startVelocity: 26, gravity: 0.86, scalar: 0.8, colors });
    void confetti({ ...base, particleCount: 28, angle: 128, spread: 46, startVelocity: 26, gravity: 0.86, scalar: 0.8, colors });
    return;
  }
  if (effectId === "paper-stream") {
    void confetti({ ...base, particleCount: 56, spread: 52, startVelocity: 24, gravity: 0.62, scalar: 1.05, drift: 0.4, colors: ["#f8fafc", "#fdba74", "#60a5fa", "#34d399"] });
    return;
  }
  if (effectId === "aurora-finish") {
    void confetti({ ...base, particleCount: 64, spread: 92, startVelocity: 26, gravity: 0.7, scalar: 0.88, colors: ["#67e8f9", "#c4b5fd", "#fda4af", "#ffffff"] });
    return;
  }
  void confetti({ ...base, particleCount: 28, spread: 52, startVelocity: 22, gravity: 0.95, scalar: 0.72, colors: ["#22d3ee", "#fb923c", "#f8fafc"] });
}
