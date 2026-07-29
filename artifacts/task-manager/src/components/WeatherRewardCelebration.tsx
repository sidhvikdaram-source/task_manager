import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, CloudFog, CloudLightning, Sparkles, Sun, Wind, X } from "lucide-react";
import { NimbusMascot, type NimbusMascotState } from "@/components/NimbusMascot";
import { subscribeToForecastRewards, type ForecastReward } from "@/lib/forecastRewardEvents";

const WEATHER_COPY = {
  sunny: {
    title: "Sunny bonus collected",
    detail: "Your forecast multiplied the progress from this task.",
    icon: Sun,
    accent: "#f5b942",
  },
  stormy: {
    title: "Storm charge cleared",
    detail: "You finished today's charged action and claimed the full forecast reward.",
    icon: CloudLightning,
    accent: "#8b7cf6",
  },
  foggy: {
    title: "A reward is waiting in the fog",
    detail: "Nimbus logged it safely. The amount appears after midnight.",
    icon: CloudFog,
    accent: "#aaa4bb",
  },
  windy: {
    title: "A tailwind found you",
    detail: "Bonus Breeze Points landed on this completion.",
    icon: Wind,
    accent: "#40c4df",
  },
  rainbow: {
    title: "Rainbow reward unlocked",
    detail: "A rare forecast added something special to your collection.",
    icon: Sparkles,
    accent: "#e886c8",
  },
} as const;

export function WeatherRewardCelebration() {
  const [reward, setReward] = useState<ForecastReward | null>(null);
  const dismissTimer = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const unsubscribe = subscribeToForecastRewards((nextReward) => {
      setReward(nextReward);
      if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
      dismissTimer.current = window.setTimeout(() => setReward(null), 5200);
    });
    return () => {
      unsubscribe();
      if (dismissTimer.current) window.clearTimeout(dismissTimer.current);
    };
  }, []);

  const weather = reward?.weather;
  const copy = weather ? WEATHER_COPY[weather] : null;
  const Icon = copy?.icon ?? Sparkles;
  const hidden = reward?.hidden || weather === "foggy";
  const mascotState = (weather ?? "ready") as NimbusMascotState;

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {reward && copy && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[170] flex items-end justify-center p-3 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-live="assertive"
          role="status"
        >
          <motion.div
            className="pointer-events-auto relative w-full max-w-[31rem] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#171522] p-5 text-white shadow-[0_32px_90px_rgba(20,15,44,.45)] sm:p-7"
            initial={reduceMotion ? false : { y: 34, scale: 0.92, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: 18, scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 27 }}
          >
            <motion.div
              className="absolute inset-x-0 top-0 h-1 origin-left"
              style={{ backgroundColor: copy.accent }}
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 5.2, ease: "linear" }}
            />
            <button
              type="button"
              onClick={() => setReward(null)}
              className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Dismiss forecast reward"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="grid grid-cols-[5rem_1fr] items-center gap-4 sm:grid-cols-[6.5rem_1fr] sm:gap-6">
              <div className="relative">
                <motion.div
                  className="absolute inset-1 rounded-full blur-2xl"
                  style={{ backgroundColor: copy.accent }}
                  animate={reduceMotion ? undefined : { opacity: [0.18, 0.42, 0.18], scale: [0.9, 1.18, 0.9] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                />
                <NimbusMascot state={mascotState} className="relative w-full" />
              </div>
              <div className="min-w-0 pr-7">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em]" style={{ color: copy.accent }}>
                  <Icon className="h-4 w-4" />
                  Forecast fulfilled
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] sm:text-3xl">{copy.title}</h2>
                <p className="mt-2 text-sm leading-6 text-white/62">{copy.detail}</p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10">
                <Check className="h-5 w-5" style={{ color: copy.accent }} />
              </span>
              {hidden ? (
                <p className="text-sm font-bold text-white/78">Reward secured. Come back tomorrow to reveal it.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                  {reward.bonusNp > 0 && <span className="text-xl font-black">+{reward.bonusNp} NP</span>}
                  {reward.bonusBp > 0 && <span className="text-xl font-black" style={{ color: copy.accent }}>+{reward.bonusBp} BP</span>}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
