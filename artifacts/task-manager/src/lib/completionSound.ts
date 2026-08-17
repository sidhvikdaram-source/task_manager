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
  // Reward cards sit above the app at z-170. Keep completion particles above
  // them so the reward and its affirmation arrive as one immediate moment.
  const base = { origin, disableForReducedMotion: true, zIndex: 190, ticks: 90 };
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
    void confetti({ ...base, particleCount: 72, spread: 112, startVelocity: 38, gravity: 1.18, scalar: 0.92, ticks: 105, colors: ["#22d3ee", "#a78bfa", "#fb7185", "#facc15"] });
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
    void confetti({ ...base, origin: paperOrigin, particleCount: 72, angle: 270, spread: 74, startVelocity: 18, gravity: 0.72, scalar: 1.16, drift: 0.65, ticks: 135, shapes: ["square"], colors: ["#f8fafc", "#fdba74", "#60a5fa", "#34d399"] });
    return;
  }
  if (effectId === "aurora-finish") {
    const layer = effectLayer(effectId, origin);
    const sky = document.createElement("div");
    Object.assign(sky.style, {
      position: "absolute",
      inset: "0",
      background: `radial-gradient(circle at ${origin.x * 100}% ${origin.y * 100}%, rgba(255,255,255,.28), rgba(103,232,249,.1) 22%, transparent 52%)`,
      mixBlendMode: "screen",
    });
    layer.append(sky);
    sky.animate(
      [
        { opacity: 0 },
        { opacity: 1, offset: 0.28 },
        { opacity: 0 },
      ],
      { duration: 1650, easing: "ease-out", fill: "forwards" },
    );

    const colors = [
      ["rgba(103,232,249,.88)", "rgba(45,212,191,.18)"],
      ["rgba(196,181,253,.92)", "rgba(129,140,248,.2)"],
      ["rgba(253,164,175,.72)", "rgba(244,114,182,.12)"],
    ];
    colors.forEach(([bright, fade], index) => {
      const ribbon = document.createElement("div");
      const width = 460 + index * 90;
      Object.assign(ribbon.style, {
        position: "absolute",
        left: `${origin.x * 100}%`,
        top: `${origin.y * 100}%`,
        width: `${width}px`,
        height: `${82 + index * 16}px`,
        marginLeft: `${-width / 2}px`,
        marginTop: `${-58 - index * 18}px`,
        borderRadius: "50%",
        background: `linear-gradient(90deg, transparent 3%, ${fade} 18%, ${bright} 48%, ${fade} 78%, transparent 97%)`,
        filter: `blur(${10 + index * 3}px) saturate(1.35)`,
        mixBlendMode: "screen",
        transformOrigin: "center",
      });
      layer.append(ribbon);
      ribbon.animate(
        [
          { opacity: 0, transform: `translate3d(-22px, ${30 + index * 8}px, 0) scaleX(.58) rotate(${-12 + index * 5}deg)` },
          { opacity: 0.92 - index * 0.12, offset: 0.32, transform: `translate3d(0, ${-8 - index * 5}px, 0) scaleX(1) rotate(${-5 + index * 4}deg)` },
          { opacity: 0, transform: `translate3d(26px, ${-48 - index * 8}px, 0) scaleX(1.16) rotate(${2 + index * 4}deg)` },
        ],
        {
          duration: 1320 + index * 140,
          delay: index * 70,
          easing: "cubic-bezier(.22,1,.36,1)",
          fill: "forwards",
        },
      );
    });

    ring(layer, origin, { size: 86, color: "#c4b5fd", width: 2 });
    void confetti({
      ...base,
      particleCount: 34,
      spread: 88,
      startVelocity: 18,
      gravity: 0.32,
      drift: -0.2,
      scalar: 0.72,
      ticks: 115,
      colors: ["#67e8f9", "#c4b5fd", "#fda4af", "#ffffff"],
    });
    return;
  }
  void confetti({ ...base, particleCount: 28, spread: 52, startVelocity: 22, gravity: 0.95, scalar: 0.72, colors: ["#22d3ee", "#fb923c", "#f8fafc"] });
}
