import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { MomentumIcon } from "@/components/MomentumIcon";

export function ConsecutiveMomentumCelebration() {
  const [momentumDays, setMomentumDays] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<{ momentumDays?: number }>).detail;
      if (typeof detail?.momentumDays === "number" && detail.momentumDays > 0) {
        setMomentumDays(detail.momentumDays);
      }
    };
    window.addEventListener("velocity:consecutive-momentum", show);
    return () => window.removeEventListener("velocity:consecutive-momentum", show);
  }, []);

  useEffect(() => {
    if (momentumDays === null) return;
    const timer = window.setTimeout(() => setMomentumDays(null), reduceMotion ? 2800 : 4800);
    return () => window.clearTimeout(timer);
  }, [momentumDays, reduceMotion]);

  return (
    <AnimatePresence>
      {momentumDays !== null && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-background/55 p-3 backdrop-blur-sm sm:items-center sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
          onClick={() => setMomentumDays(null)}
        >
          <motion.section
            role="status"
            aria-live="polite"
            onClick={(event) => event.stopPropagation()}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="relative w-full max-w-sm overflow-hidden rounded-xl border border-primary/30 bg-card p-6 text-center shadow-2xl sm:p-7"
          >
            <button type="button" onClick={() => setMomentumDays(null)} aria-label="Close Consecutive Momentum" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            <div className="relative mx-auto flex h-28 w-28 items-center justify-center" aria-hidden="true">
              {!reduceMotion && (
                <>
                  <motion.span className="absolute inset-0 rounded-full border border-primary/25" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: [0.6, 1.08, 1], opacity: [0, 0.8, 0.35] }} transition={{ duration: 0.9 }} />
                  <motion.span className="absolute inset-3 rounded-full border-2 border-dashed border-secondary/50" animate={{ rotate: 360 }} transition={{ duration: 7, repeat: Infinity, ease: "linear" }} />
                  {[0, 1, 2, 3].map((index) => <motion.span key={index} className="absolute h-1.5 w-1.5 rounded-full bg-primary" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: [0, 1, 0], scale: [0, 1, 0], x: Math.cos(index * Math.PI / 2) * 50, y: Math.sin(index * Math.PI / 2) * 50 }} transition={{ duration: 1.1, delay: 0.15 + index * 0.08 }} />)}
                </>
              )}
              <motion.div animate={reduceMotion ? undefined : { y: [0, -5, 0], scale: [1, 1.1, 1] }} transition={{ duration: 0.9 }} className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_30px_hsl(var(--primary)/.28)]">
                <MomentumIcon className="h-9 w-9" />
              </motion.div>
              <div className="absolute bottom-0 flex h-5 items-end gap-1">{[8, 15, 11, 19, 13].map((height, index) => <motion.span key={index} className="w-1 rounded-full bg-secondary" initial={reduceMotion ? false : { height: 2 }} animate={{ height: reduceMotion ? height : [2, height, 4] }} transition={{ duration: 0.72, delay: 0.28 + index * 0.05 }} />)}</div>
            </div>
            <p className="mt-4 text-xs font-black uppercase text-primary">Consecutive Momentum</p>
            <p className="mt-1 text-3xl font-black">{momentumDays} active days</p>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-5 text-muted-foreground">You completed work on consecutive days. Momentum is your lifetime active-day total and never resets.</p>
            <div className="mx-auto mt-5 h-1.5 w-24 overflow-hidden rounded-full bg-muted"><motion.div className="h-full rounded-full bg-primary" initial={{ x: "-100%" }} animate={{ x: 0 }} transition={{ duration: reduceMotion ? 0 : 0.7, ease: "easeOut" }} /></div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
