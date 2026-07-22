import React, { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Asterisk,
  AudioWaveform,
  BookHeart,
  BookOpen,
  Bot,
  Box,
  Boxes,
  Circle,
  CircleDot,
  Cloud,
  CloudLightning,
  Cpu,
  Flower2,
  Gem,
  Leaf,
  Mountain,
  Music2,
  Orbit,
  Rocket,
  Sparkles,
  Star,
  TreePine,
} from "lucide-react";
import { cn } from "@/lib/utils";

const frameClasses: Record<string, string> = {
  none: "p-0 rounded-full",
  "orbit-frame": "p-1.5 rounded-full bg-cyan-500 shadow-[0_0_0_3px_rgb(37,99,235),0_0_18px_rgba(6,182,212,.35)]",
  "signal-ring": "p-1 rounded-full border-[3px] border-emerald-400 shadow-[0_0_0_3px_hsl(var(--background)),0_0_18px_rgba(52,211,153,.4)]",
  "precision-frame": "p-1.5 rounded-full bg-zinc-900 ring-2 ring-zinc-400 shadow-[3px_3px_0_rgba(113,113,122,.45)]",
  "nova-frame": "p-1.5 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgb(217,70,239),0_0_22px_rgba(244,63,94,.42)]",
  "studio-frame": "p-1 rounded-full border-[4px] border-amber-300 bg-slate-950 shadow-[0_0_0_2px_hsl(var(--background))]",
  "summit-frame": "p-1.5 rounded-full border-[3px] border-sky-300 bg-blue-950 shadow-[0_0_20px_rgba(125,211,252,.4)]",
  "terminal-frame": "p-1 rounded-full border-[3px] border-lime-400 bg-zinc-950 shadow-[0_0_18px_rgba(163,230,53,.35)]",
  "honor-frame": "p-1.5 rounded-full border-[3px] border-yellow-400 bg-indigo-950 shadow-[0_0_20px_rgba(250,204,21,.35)]",
  "zen-frame": "p-1 rounded-full border-[4px] border-teal-300 bg-teal-950 shadow-[0_0_0_2px_hsl(var(--background))]",
  "velocity-frame": "p-1.5 rounded-full border-[3px] border-white bg-primary shadow-[0_0_24px_hsl(var(--primary)/.55)]",
  "aperture-frame": "p-1.5 rounded-full border-[3px] border-cyan-300 bg-zinc-950 shadow-[0_0_0_2px_hsl(var(--background)),0_0_20px_rgba(103,232,249,.45)]",
  "pulse-grid": "p-1 rounded-full border-[4px] border-blue-500 bg-slate-950 shadow-[0_0_18px_rgba(59,130,246,.5)]",
  "aurora-edge": "p-1.5 rounded-full border-[3px] border-emerald-300 bg-indigo-950 shadow-[0_0_20px_rgba(110,231,183,.42)]",
  "carbon-halo": "p-1 rounded-full border-[4px] border-zinc-500 bg-black shadow-[0_0_0_2px_rgb(212,212,216),0_0_22px_rgba(255,255,255,.22)]",
  "founders-edge": "p-1.5 rounded-full border-[3px] border-rose-300 bg-zinc-950 shadow-[0_0_0_2px_rgb(251,113,133),0_0_24px_rgba(244,63,94,.38)]",
};

export function ProfilePhoto({
  frameId = "none",
  profileImageUrl,
  name = "Velocity member",
  className,
}: {
  frameId?: string | null;
  profileImageUrl?: string | null;
  name?: string;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "V";
  return (
    <div className={cn("relative aspect-square shrink-0", frameClasses[frameId ?? "none"] ?? frameClasses.none, className)}>
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-background bg-primary text-xl font-black text-primary-foreground">
        {profileImageUrl ? (
          <img src={profileImageUrl} alt={`${name} profile`} className="h-full w-full object-cover" />
        ) : (
          <span aria-label={`${name} profile initial`}>{initial}</span>
        )}
      </div>
    </div>
  );
}

export function FramePreview({ frameId, className }: { frameId: string; className?: string }) {
  return (
    <div className={cn("aspect-square w-12", frameClasses[frameId] ?? frameClasses.none, className)}>
      <div className="h-full w-full rounded-full bg-muted" />
    </div>
  );
}

const stageThresholds = [0, 500, 1200, 2200, 3600];
const petDefinitions = {
  "pixel-spark": { stages: 5, icons: [Sparkles, Star, Asterisk, Star, Sparkles], color: "bg-violet-500 text-white" },
  "cloud-bit": { stages: 4, icons: [Cloud, Cloud, CloudLightning, CloudLightning], color: "bg-sky-200 text-sky-950" },
  "focus-cube": { stages: 3, icons: [Box, Boxes, Boxes], color: "bg-orange-400 text-slate-950" },
  "study-bot": { stages: 5, icons: [Bot, Bot, Cpu, Bot, Cpu], color: "bg-slate-800 text-cyan-300" },
  leafling: { stages: 4, icons: [Leaf, Flower2, TreePine, TreePine], color: "bg-emerald-400 text-emerald-950" },
  "orbit-orb": { stages: 3, icons: [CircleDot, Orbit, Orbit], color: "bg-indigo-500 text-white" },
  "book-bit": { stages: 2, icons: [BookOpen, BookHeart], color: "bg-amber-300 text-amber-950" },
  "tempo-dot": { stages: 4, icons: [Music2, AudioWaveform, Music2, AudioWaveform], color: "bg-fuchsia-500 text-white" },
  comet: { stages: 3, icons: [Circle, Rocket, Rocket], color: "bg-blue-600 text-white" },
  pebble: { stages: 2, icons: [Gem, Mountain], color: "bg-stone-400 text-stone-950" },
  "nova-pod": { stages: 3, icons: [CircleDot, Star, Rocket], color: "bg-cyan-400 text-slate-950" },
  "lumen-bot": { stages: 4, icons: [Bot, Cpu, Bot, AudioWaveform], color: "bg-yellow-300 text-zinc-950" },
  "orbit-bud": { stages: 3, icons: [Circle, CircleDot, Orbit], color: "bg-indigo-400 text-white" },
  "tempo-kite": { stages: 4, icons: [Asterisk, Music2, Star, Rocket], color: "bg-rose-400 text-zinc-950" },
  "vector-pet": { stages: 5, icons: [Gem, Boxes, Orbit, Cpu, Sparkles], color: "bg-zinc-950 text-rose-300" },
} as const;

export function PetPreview({ petId, earnedVp = 0, className }: { petId?: string | null; earnedVp?: number; className?: string }) {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(false);
  const definition = petId && petId !== "none" ? petDefinitions[petId as keyof typeof petDefinitions] : null;
  const stage = useMemo(() => {
    if (!definition) return 0;
    return Math.min(definition.stages - 1, stageThresholds.filter((threshold) => earnedVp >= threshold).length - 1);
  }, [definition, earnedVp]);

  useEffect(() => {
    if (!definition || reduceMotion) return;
    const delay = 4300 + stage * 650;
    const interval = window.setInterval(() => {
      setActive(true);
      window.setTimeout(() => setActive(false), 1100);
    }, delay);
    return () => window.clearInterval(interval);
  }, [definition, petId, reduceMotion, stage]);

  if (!definition || !petId) return null;
  const Icon = definition.icons[stage] ?? definition.icons[0];
  const activeAnimation = petId === "cloud-bit"
    ? { y: [0, -7, 1, 0], x: [0, 3, -2, 0], scale: [1, 1.13, 0.98, 1] }
    : petId === "study-bot"
      ? { rotate: [0, -7, 7, 0], y: [0, -3, 0], scale: [1, 1.08, 1] }
      : petId === "pixel-spark" || petId === "orbit-orb"
        ? { rotate: [0, 120, 240, 360], scale: [1, 1.18, 1] }
        : petId === "leafling"
          ? { rotate: [0, -8, 8, -4, 0], y: [0, -4, 0] }
          : { y: [0, -6, 0], rotate: [0, 4, -4, 0] };

  return (
    <motion.div
      aria-label={`${petId.replace(/-/g, " ")} pet`}
      animate={reduceMotion ? undefined : active ? activeAnimation : { y: [0, -2, 0] }}
      transition={{ duration: active ? 1 : 2.8, repeat: active ? 0 : Infinity, ease: "easeInOut" }}
      className={cn("relative flex items-center justify-center rounded-2xl border-2 border-background shadow-lg", definition.color, className)}
    >
      <Icon className="h-[55%] w-[55%]" />
    </motion.div>
  );
}
