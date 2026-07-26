import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CloudFog,
  CloudLightning,
  CloudSun,
  Eye,
  Lock,
  Rainbow,
  RotateCcw,
  Sparkles,
  Wind,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { NimbusMascot, type NimbusMascotState } from "@/components/NimbusMascot";

type Weather = "sunny" | "stormy" | "foggy" | "windy" | "rainbow";

type ForecastDay = {
  id: number;
  date: string;
  weather: Weather;
  name: string;
  headline: string;
  description: string;
  targetTaskId: number | null;
  targetTaskTitle: string | null;
  freeItemId: string | null;
  freeItemName: string | null;
  taskCompletions: number;
  rewardNp: number;
  rewardBp: number;
  boostPercent: number;
  canReroll: boolean;
};

type ForecastDashboard = {
  eligible: boolean;
  requirements: null | {
    tutorial: boolean;
    tasksCompleted: number;
    returningDay: boolean;
  };
  today: ForecastDay | null;
  shouldReveal: boolean;
  yesterdayReveal: null | {
    weather: "foggy";
    rewardBp: number;
    rewardNp: number;
    taskCompletions: number;
  };
  tomorrow: ForecastDay | null;
  weeklyReport: null | {
    tasksDone: number;
    npEarned: number;
    forecastBp: number;
    luckiestWeather: string;
    nextWeekPrediction: string;
  };
};

const weatherUi: Record<Weather, {
  icon: typeof CloudSun;
  surface: string;
  accent: string;
  mascot: NimbusMascotState;
}> = {
  sunny: { icon: CloudSun, surface: "from-amber-300/25 via-orange-200/10 to-transparent", accent: "text-amber-500", mascot: "sunny" },
  stormy: { icon: CloudLightning, surface: "from-slate-700/35 via-violet-700/15 to-transparent", accent: "text-violet-400", mascot: "stormy" },
  foggy: { icon: CloudFog, surface: "from-slate-400/25 via-slate-300/10 to-transparent", accent: "text-slate-400", mascot: "foggy" },
  windy: { icon: Wind, surface: "from-cyan-400/20 via-sky-300/10 to-transparent", accent: "text-cyan-500", mascot: "windy" },
  rainbow: { icon: Rainbow, surface: "from-fuchsia-400/20 via-amber-300/15 to-cyan-300/20", accent: "text-fuchsia-500", mascot: "rainbow" },
};

export function ForecastExperience() {
  const [dashboard, setDashboard] = useState<ForecastDashboard | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const load = useCallback(async () => {
    const response = await fetch("/api/rewards/forecast", { credentials: "include" });
    if (!response.ok) throw new Error("Your forecast could not be loaded.");
    const data = await response.json() as ForecastDashboard;
    setDashboard(data);
    if (data.shouldReveal) setOpen(true);
    return data;
  }, []);

  useEffect(() => {
    void load().catch(() => undefined);
    const refresh = () => void load().catch(() => undefined);
    window.addEventListener("nimbus:forecast-refresh", refresh);
    return () => window.removeEventListener("nimbus:forecast-refresh", refresh);
  }, [load]);

  async function useForecastItem(itemId: "weather-reroll" | "tomorrow-peek" | "tailwind-boost") {
    if (working) return;
    setWorking(itemId);
    try {
      const response = await fetch(`/api/rewards/${itemId}/purchase`, { method: "POST", credentials: "include" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "The forecast could not be updated.");
      await load();
      window.dispatchEvent(new CustomEvent("nimbus:rewards-refresh"));
      toast.success(
        itemId === "weather-reroll"
          ? "A new forecast rolled in"
          : itemId === "tomorrow-peek"
            ? "Tomorrow is visible"
            : "NP Tailwind activated",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The forecast could not be updated.");
    } finally {
      setWorking(null);
    }
  }

  if (!dashboard) {
    return <div className="bento-card h-40 animate-pulse bg-muted/40" aria-label="Loading daily forecast" />;
  }

  if (!dashboard.eligible) {
    const tasksLeft = Math.max(0, 3 - (dashboard.requirements?.tasksCompleted ?? 0));
    return (
      <section className="bento-card overflow-hidden p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Lock className="h-5 w-5" /></div>
          <div>
            <h2 className="font-black">Your forecast is still forming</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Finish the tutorial, complete {tasksLeft || "a few"} {tasksLeft === 1 ? "task" : "tasks"}, and return on another day. Nimbus introduces weather only after the basics feel familiar.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!dashboard.today) return null;
  const today = dashboard.today;
  const visual = weatherUi[today.weather];
  const WeatherIcon = visual.icon;

  return (
    <>
      <section className="bento-card relative overflow-hidden">
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${visual.surface}`} />
        <div className="relative grid grid-flow-dense grid-cols-12">
          <div className="col-span-12 flex flex-col justify-between p-5 sm:p-7 lg:col-span-7">
            <div className="flex items-center gap-2">
              <WeatherIcon className={`h-5 w-5 ${visual.accent}`} />
              <span className="text-sm font-black">Today’s {today.name.toLowerCase()} forecast</span>
            </div>
            <div className="mt-12">
              <h2 className="max-w-2xl text-3xl font-black leading-[.95] tracking-[-.045em] sm:text-5xl">{today.headline}</h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">{today.description}</p>
              {today.targetTaskTitle && <p className="mt-4 rounded-xl border border-violet-400/25 bg-violet-400/10 px-4 py-3 text-sm font-black">Charged task: {today.targetTaskTitle}</p>}
              {today.freeItemName && <p className="mt-4 rounded-xl border border-fuchsia-400/25 bg-fuchsia-400/10 px-4 py-3 text-sm font-black">Rainbow unlock: {today.freeItemName}</p>}
            </div>
          </div>
          <div className="col-span-12 flex min-h-64 items-center justify-center border-t bg-background/35 p-6 lg:col-span-5 lg:border-l lg:border-t-0">
            <NimbusMascot state={visual.mascot} className="w-full max-w-[17rem]" />
          </div>
          <div className="col-span-12 grid gap-2 border-t p-4 sm:grid-cols-3">
            <button type="button" disabled={!today.canReroll || working !== null} onClick={() => void useForecastItem("weather-reroll")} className="group flex items-center gap-3 rounded-xl border bg-background/70 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-45">
              <RotateCcw className="h-4 w-4 text-primary transition-transform duration-700 group-hover:rotate-180" /><span><b className="block text-xs">Reroll today</b><small className="text-muted-foreground">45 BP</small></span>
            </button>
            <button type="button" disabled={Boolean(dashboard.tomorrow) || working !== null} onClick={() => void useForecastItem("tomorrow-peek")} className="group flex items-center gap-3 rounded-xl border bg-background/70 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-45">
              <Eye className="h-4 w-4 text-primary" /><span><b className="block text-xs">Peek tomorrow</b><small className="text-muted-foreground">65 BP</small></span>
            </button>
            <button type="button" disabled={today.boostPercent > 0 || working !== null} onClick={() => void useForecastItem("tailwind-boost")} className="group flex items-center gap-3 rounded-xl border bg-background/70 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-45">
              <Sparkles className="h-4 w-4 text-primary" /><span><b className="block text-xs">25% NP Tailwind</b><small className="text-muted-foreground">90 BP</small></span>
            </button>
          </div>
        </div>
      </section>

      {dashboard.tomorrow && (
        <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 text-sm">
          <b>Tomorrow’s early look: {dashboard.tomorrow.name}.</b> <span className="text-muted-foreground">{dashboard.tomorrow.headline}</span>
        </div>
      )}
      {dashboard.yesterdayReveal && dashboard.yesterdayReveal.taskCompletions > 0 && (
        <div className="rounded-2xl border border-slate-400/25 bg-slate-400/10 p-4 text-sm">
          <b>The fog cleared: +{dashboard.yesterdayReveal.rewardBp} BP.</b> <span className="text-muted-foreground">Yesterday’s {dashboard.yesterdayReveal.taskCompletions} completions were quietly counted.</span>
        </div>
      )}
      {dashboard.weeklyReport && (
        <section className="bento-card p-5 sm:p-6">
          <div className="flex items-center gap-2"><CloudSun className="h-5 w-5 text-primary" /><h2 className="font-black">Sunday weather report</h2></div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <ReportMetric value={dashboard.weeklyReport.tasksDone} label="Tasks done" />
            <ReportMetric value={dashboard.weeklyReport.npEarned} label="Base NP" />
            <ReportMetric value={dashboard.weeklyReport.forecastBp} label="Forecast BP" />
          </div>
          <p className="mt-5 text-sm text-muted-foreground">Next week looks like {dashboard.weeklyReport.nextWeekPrediction}. Nimbo admits this prediction is mostly for fun.</p>
        </section>
      )}

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/82 p-4 backdrop-blur-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div role="dialog" aria-modal="true" aria-labelledby="forecast-title" initial={reduceMotion ? false : { opacity: 0, y: 36, scale: .94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: .97 }} transition={{ type: "spring", stiffness: 260, damping: 24 }} className="bento-card relative grid w-full max-w-4xl overflow-hidden lg:grid-cols-[1.08fr_.92fr]">
                <button type="button" aria-label="Close forecast" onClick={() => setOpen(false)} className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border bg-background/70 text-muted-foreground backdrop-blur hover:text-foreground"><X className="h-4 w-4" /></button>
                <div className="p-7 sm:p-10">
                  <div className="flex items-center gap-2"><WeatherIcon className={`h-5 w-5 ${visual.accent}`} /><span className="text-sm font-black">{today.name} over Nimbus today</span></div>
                  <h2 id="forecast-title" className="mt-9 max-w-xl text-4xl font-black leading-[.92] tracking-[-.05em] sm:text-6xl">{today.headline}</h2>
                  <p className="mt-5 max-w-lg leading-7 text-muted-foreground">{today.description}</p>
                  {today.targetTaskTitle && <p className="mt-5 text-sm font-black">Today’s charged task is “{today.targetTaskTitle}.”</p>}
                  {today.freeItemName && <p className="mt-5 text-sm font-black">Your free unlock is {today.freeItemName}.</p>}
                  <button type="button" onClick={() => setOpen(false)} className="group mt-9 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-primary-foreground">
                    Enter today <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </div>
                <div className={`relative flex min-h-80 items-center justify-center overflow-hidden bg-gradient-to-br ${visual.surface} p-8`}>
                  <motion.div animate={reduceMotion ? undefined : { y: [0, -7, 0] }} transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}>
                    <NimbusMascot state={visual.mascot} className="w-full max-w-[22rem]" />
                  </motion.div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

function ReportMetric({ value, label }: { value: number; label: string }) {
  return <div className="rounded-xl bg-muted/45 p-3"><p className="text-xl font-black">{value}</p><p className="text-[11px] font-bold text-muted-foreground">{label}</p></div>;
}
