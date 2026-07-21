import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Atom,
  BookOpen,
  Bot,
  Box,
  Cloud,
  CloudLightning,
  Code2,
  Coffee,
  Compass,
  Gamepad2,
  GraduationCap,
  Headphones,
  Leaf,
  Music2,
  Palette,
  Sparkles,
  Telescope,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AvatarDefinition = {
  background: string;
  skin: string;
  hair: string;
  shirt: string;
  icon: React.ComponentType<{ className?: string }>;
};

const avatarDefinitions: Record<string, AvatarDefinition> = {
  "starter-bolt": { background: "bg-sky-200", skin: "bg-amber-200", hair: "bg-zinc-800", shirt: "bg-sky-700", icon: Compass },
  "ember-bolt": { background: "bg-orange-200", skin: "bg-amber-300", hair: "bg-amber-950", shirt: "bg-orange-700", icon: GraduationCap },
  "prism-core": { background: "bg-fuchsia-200", skin: "bg-orange-200", hair: "bg-violet-950", shirt: "bg-fuchsia-700", icon: Palette },
  "mono-core": { background: "bg-zinc-300", skin: "bg-stone-300", hair: "bg-zinc-950", shirt: "bg-zinc-700", icon: Code2 },
  "aurora-core": { background: "bg-emerald-200", skin: "bg-amber-100", hair: "bg-emerald-950", shirt: "bg-emerald-700", icon: Telescope },
  "atlas-reader": { background: "bg-blue-200", skin: "bg-amber-200", hair: "bg-stone-800", shirt: "bg-blue-800", icon: BookOpen },
  "nova-coder": { background: "bg-indigo-200", skin: "bg-orange-300", hair: "bg-zinc-950", shirt: "bg-indigo-800", icon: Code2 },
  "sage-scholar": { background: "bg-lime-200", skin: "bg-amber-100", hair: "bg-amber-900", shirt: "bg-lime-800", icon: GraduationCap },
  "orbit-listener": { background: "bg-cyan-200", skin: "bg-orange-200", hair: "bg-slate-800", shirt: "bg-cyan-800", icon: Headphones },
  "quill-writer": { background: "bg-rose-200", skin: "bg-amber-300", hair: "bg-rose-950", shirt: "bg-rose-800", icon: BookOpen },
  "terra-explorer": { background: "bg-teal-200", skin: "bg-orange-300", hair: "bg-stone-900", shirt: "bg-teal-800", icon: Leaf },
  "tempo-maker": { background: "bg-purple-200", skin: "bg-amber-200", hair: "bg-purple-950", shirt: "bg-purple-800", icon: Music2 },
  "pixel-planner": { background: "bg-yellow-200", skin: "bg-orange-200", hair: "bg-neutral-800", shirt: "bg-yellow-700", icon: Gamepad2 },
  "lab-thinker": { background: "bg-violet-200", skin: "bg-stone-300", hair: "bg-indigo-950", shirt: "bg-violet-800", icon: Atom },
  "cafe-creator": { background: "bg-red-200", skin: "bg-amber-200", hair: "bg-red-950", shirt: "bg-red-800", icon: Coffee },
};

const frameClasses: Record<string, string> = {
  none: "p-0",
  "orbit-frame": "p-1.5 rounded-[30%] bg-gradient-to-br from-cyan-400 via-blue-600 to-violet-500 shadow-[0_0_18px_rgba(59,130,246,.35)]",
  "signal-ring": "p-1 rounded-[24%] border-[3px] border-emerald-400 shadow-[0_0_0_3px_hsl(var(--background)),0_0_18px_rgba(52,211,153,.4)]",
  "precision-frame": "p-1.5 rounded-[18%] bg-zinc-900 ring-2 ring-zinc-400 shadow-[4px_4px_0_rgba(113,113,122,.45)]",
  "nova-frame": "p-1.5 rounded-[34%] bg-gradient-to-tr from-orange-500 via-rose-500 to-fuchsia-600 shadow-[0_0_22px_rgba(244,63,94,.42)]",
  "studio-frame": "p-1 rounded-[26%] border-[4px] border-amber-300 bg-slate-950 shadow-[0_0_0_2px_hsl(var(--background))]",
};

export function ProfileAvatar({
  avatarId = "starter-bolt",
  frameId = "none",
  profileImageUrl,
  name = "Velocity member",
  className,
}: {
  avatarId?: string | null;
  frameId?: string | null;
  profileImageUrl?: string | null;
  name?: string;
  className?: string;
}) {
  const avatar = avatarDefinitions[avatarId ?? "starter-bolt"] ?? avatarDefinitions["starter-bolt"];
  const Icon = avatar.icon;
  return (
    <div className={cn("relative aspect-square shrink-0", frameClasses[frameId ?? "none"] ?? frameClasses.none, className)}>
      <div className={cn("relative h-full w-full overflow-hidden rounded-[22%] border-2 border-background", avatar.background)}>
        {profileImageUrl ? (
          <img src={profileImageUrl} alt={`${name} profile`} className="h-full w-full object-cover" />
        ) : (
          <>
            <div className={cn("absolute left-[24%] top-[13%] h-[45%] w-[52%] rounded-[45%_45%_40%_40%]", avatar.skin)} />
            <div className={cn("absolute left-[20%] top-[7%] h-[23%] w-[60%] rounded-[55%_55%_32%_32%]", avatar.hair)} />
            <span className="absolute left-[36%] top-[34%] h-[5%] w-[5%] rounded-full bg-zinc-900" />
            <span className="absolute right-[36%] top-[34%] h-[5%] w-[5%] rounded-full bg-zinc-900" />
            <span className="absolute left-[43%] top-[45%] h-[3%] w-[14%] rounded-full bg-rose-700/60" />
            <div className={cn("absolute -bottom-[13%] left-[9%] h-[52%] w-[82%] rounded-[48%_48%_20%_20%]", avatar.shirt)} />
            <Icon className="absolute bottom-[10%] left-[39%] h-[22%] w-[22%] text-white/90" />
          </>
        )}
      </div>
    </div>
  );
}

export function FramePreview({ frameId, className }: { frameId: string; className?: string }) {
  return (
    <div className={cn("aspect-square w-12", frameClasses[frameId] ?? frameClasses.none, className)}>
      <div className="h-full w-full rounded-[20%] bg-muted" />
    </div>
  );
}

export function PetCompanion({ petId, className }: { petId?: string | null; className?: string }) {
  const reduceMotion = useReducedMotion();
  const [charged, setCharged] = useState(false);

  useEffect(() => {
    if (petId !== "cloud-bit" || reduceMotion) return;
    const interval = window.setInterval(() => {
      setCharged(true);
      window.setTimeout(() => setCharged(false), 900);
    }, 6500);
    return () => window.clearInterval(interval);
  }, [petId, reduceMotion]);

  if (!petId || petId === "none") return null;
  const Icon = petId === "cloud-bit"
    ? (charged ? CloudLightning : Cloud)
    : petId === "study-bot"
      ? Bot
      : petId === "leafling"
        ? Leaf
        : petId === "pixel-spark"
          ? Sparkles
          : petId === "focus-cube"
            ? Box
            : Compass;
  return (
    <motion.div
      aria-label={`${petId.replace(/-/g, " ")} companion`}
      animate={reduceMotion ? undefined : petId === "cloud-bit" && charged ? { y: [0, -5, 0], scale: [1, 1.12, 1] } : { y: [0, -3, 0] }}
      transition={{ duration: charged ? 0.75 : 2.8, repeat: charged ? 0 : Infinity, ease: "easeInOut" }}
      className={cn("flex items-center justify-center rounded-xl border-2 border-background bg-secondary text-secondary-foreground shadow-lg", className)}
    >
      <Icon className="h-[58%] w-[58%]" />
    </motion.div>
  );
}
