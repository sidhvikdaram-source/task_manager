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

function effectLayer(effectId: string, origin: CompletionOrigin) {
  const layer = document.createElement("div");
  layer.dataset.completionEffect = effectId;
  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "120",
    overflow: "hidden",
    "--effect-x": `${origin.x * 100}%`,
    "--effect-y": `${origin.y * 100}%`,
  });
  document.body.append(layer);
  window.setTimeout(() => layer.remove(), 1800);
  return layer;
}

function ring(
  layer: HTMLElement,
  origin: CompletionOrigin,
  options: { size: number; color: string; delay?: number; width?: number },
) {
  const element = document.createElement("span");
  Object.assign(element.style, {
    position: "absolute",
    left: `${origin.x * 100}%`,
    top: `${origin.y * 100}%`,
    width: `${options.size}px`,
    height: `${options.size}px`,
    marginLeft: `${-options.size / 2}px`,
    marginTop: `${-options.size / 2}px`,
    border: `${options.width ?? 2}px solid ${options.color}`,
    borderRadius: "999px",
    boxShadow: `0 0 22px ${options.color}`,
  });
  layer.append(element);
  element.animate(
    [
      { opacity: 0, transform: "scale(.24)" },
      { opacity: 1, offset: 0.22, transform: "scale(.55)" },
      { opacity: 0, transform: "scale(1.35)" },
    ],
    {
      duration: 780,
      delay: options.delay ?? 0,
      easing: "cubic-bezier(.2,.8,.2,1)",
      fill: "forwards",
    },
  );
}

function drawCheck(layer: HTMLElement, origin: CompletionOrigin, color: string) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  const path = document.createElementNS(namespace, "path");
  path.setAttribute("d", "M14 34 27 47 51 18");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", "6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("pathLength", "1");
  path.style.strokeDasharray = "1";
  path.style.strokeDashoffset = "1";
  svg.append(path);
  Object.assign(svg.style, {
    position: "absolute",
    left: `${origin.x * 100}%`,
    top: `${origin.y * 100}%`,
    width: "72px",
    height: "72px",
    marginLeft: "-36px",
    marginTop: "-36px",
    filter: `drop-shadow(0 0 10px ${color})`,
  });
  layer.append(svg);
  path.animate(
    [
      { strokeDashoffset: 1 },
      { strokeDashoffset: 0, offset: 0.55 },
      { strokeDashoffset: 0 },
    ],
    { duration: 920, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" },
  );
  svg.animate(
    [
      { opacity: 0, transform: "scale(.7) rotate(-6deg)" },
      { opacity: 1, offset: 0.24, transform: "scale(1.08) rotate(0)" },
      { opacity: 0, transform: "scale(1)" },
    ],
    { duration: 1100, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" },
  );
}

export function playCompletionEffect(
  effectId: string,
  origin: CompletionOrigin,
) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const base = { origin, disableForReducedMotion: true, zIndex: 120 };
  if (effectId === "signal-finish") {
    const layer = effectLayer(effectId, origin);
    ring(layer, origin, { size: 76, color: "#22d3ee", width: 3 });
    drawCheck(layer, origin, "#e0f2fe");
    return;
  }
  if (effectId === "signal-rings") {
    const layer = effectLayer(effectId, origin);
    ring(layer, origin, { size: 62, color: "#67e8f9", delay: 0 });
    ring(layer, origin, { size: 94, color: "#38bdf8", delay: 90 });
    ring(layer, origin, { size: 128, color: "#2563eb", delay: 180 });
    return;
  }
  if (effectId === "prism-pop") {
    void confetti({ ...base, particleCount: 72, spread: 112, startVelocity: 36, gravity: 1.08, scalar: 0.92, ticks: 150, colors: ["#22d3ee", "#a78bfa", "#fb7185", "#facc15"] });
    return;
  }
  if (effectId === "prism-check") {
    const layer = effectLayer(effectId, origin);
    const glow = document.createElement("span");
    Object.assign(glow.style, {
      position: "absolute",
      left: `${origin.x * 100}%`,
      top: `${origin.y * 100}%`,
      width: "132px",
      height: "132px",
      margin: "-66px",
      borderRadius: "28px",
      background: "conic-gradient(from 45deg, #22d3ee, #a78bfa, #fb7185, #facc15, #22d3ee)",
      filter: "blur(18px)",
    });
    layer.append(glow);
    glow.animate(
      [
        { opacity: 0, transform: "scale(.4) rotate(-35deg)" },
        { opacity: 0.72, offset: 0.3, transform: "scale(1) rotate(15deg)" },
        { opacity: 0, transform: "scale(1.3) rotate(55deg)" },
      ],
      { duration: 1150, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" },
    );
    drawCheck(layer, origin, "#ffffff");
    return;
  }
  if (effectId === "paper-stream") {
    const paperOrigin = { x: origin.x, y: Math.max(0, origin.y - 0.32) };
    void confetti({ ...base, origin: paperOrigin, particleCount: 72, angle: 270, spread: 74, startVelocity: 14, gravity: 0.48, scalar: 1.28, drift: 0.65, ticks: 260, shapes: ["square"], colors: ["#f8fafc", "#fdba74", "#60a5fa", "#34d399"] });
    return;
  }
  if (effectId === "aurora-finish") {
    const layer = effectLayer(effectId, origin);
    const aurora = document.createElement("span");
    Object.assign(aurora.style, {
      position: "absolute",
      inset: "-20%",
      background: "radial-gradient(circle at var(--effect-x) var(--effect-y), rgba(255,255,255,.75) 0 2%, transparent 16%), conic-gradient(from 190deg at var(--effect-x) var(--effect-y), transparent 0 18%, rgba(103,232,249,.55) 26%, rgba(196,181,253,.58) 36%, rgba(253,164,175,.4) 44%, transparent 58%)",
      filter: "blur(22px) saturate(1.25)",
      mixBlendMode: "screen",
    });
    layer.append(aurora);
    aurora.animate(
      [
        { opacity: 0, transform: "scale(.72) rotate(-8deg)" },
        { opacity: 0.9, offset: 0.34, transform: "scale(1.02) rotate(0)" },
        { opacity: 0, transform: "scale(1.22) rotate(7deg)" },
      ],
      { duration: 1450, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" },
    );
    return;
  }
  void confetti({ ...base, particleCount: 28, spread: 52, startVelocity: 22, gravity: 0.95, scalar: 0.72, colors: ["#22d3ee", "#fb923c", "#f8fafc"] });
}
