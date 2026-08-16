import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  CalendarDays,
  Check,
  ChevronLeft,
  ListChecks,
  Minimize2,
  Repeat2,
  Sparkles,
  Store,
  TimerReset,
} from "lucide-react";
import { useLocation } from "wouter";
import { NimbusMascot } from "@/components/NimbusMascot";
import { useExperience } from "@/experience";

const chapters = [
  {
    path: "/today",
    target: "[data-tour='quick-capture']",
    title: "Capture what is on your mind",
    detail: "Write naturally. Nimbus recognizes dates, subjects, projects, priority, and useful details without making you fill out a form first.",
    prompt: 'Try something like “Review biology notes tomorrow #Science high priority.”',
    icon: ListChecks,
  },
  {
    path: "/today",
    target: "[data-tour='recommend-next']",
    title: "Choose work that fits the moment",
    detail: "Set the time and energy you actually have. Recommend next balances both with priority, urgency, and the effort implied by the task.",
    prompt: "Use this when your list is clear but your next move is not.",
    icon: Sparkles,
  },
  {
    path: "/today",
    target: "[data-tour='daily-habits']",
    title: "Keep routines separate from tasks",
    detail: "Habits repeat on the days you choose and build a visible rhythm. Tasks remain finite work with a clear finish.",
    prompt: "Add only one routine at first. A small habit you can repeat beats an ambitious one you avoid.",
    icon: Repeat2,
  },
  {
    path: "/school",
    target: "[data-tour='academics']",
    title: "Bring schoolwork into one orbit",
    detail: "Academics groups assignments, assessments, projects, focus history, and Canvas imports by subject.",
    prompt: "Connect a Canvas calendar feed or customize your subjects when you are ready.",
    icon: BookOpenCheck,
  },
  {
    path: "/focus",
    target: "[data-tour='focus-arena']",
    title: "Turn a decision into focused time",
    detail: "Tie a 25, 50, or 90 minute session to a real task. Ambient sounds and recent sessions help you build a repeatable focus ritual.",
    prompt: "Start with 25 minutes. Longer is not automatically better.",
    icon: TimerReset,
  },
  {
    path: "/calendar",
    target: "[data-tour='calendar']",
    title: "Plan beyond today when you need to",
    detail: "Calendar, Projects, Insights, and Weekly Review are the deeper planning layer. They stay out of the way until you choose to use them.",
    prompt: "Turn on Advanced workspace below if you want these tools kept in your navigation.",
    icon: CalendarDays,
  },
  {
    path: "/profile",
    target: "[data-tour='profile-rewards']",
    title: "Let progress change the workspace",
    detail: "Your Profile holds Nimbus Points, Breeze Points, chests, cosmetics, completion effects, and weather tools. Equipped items alter the real interface.",
    prompt: "Daily forecasts arrive only after the basics are complete and you return on another day.",
    icon: Store,
  },
  {
    path: "/today",
    target: "[data-tour='nimbo']",
    title: "Ask Nimbo for planning help",
    detail: "Nimbo can clarify, organize, break down, and reschedule work. Meaningful workspace changes always appear as a preview before you confirm.",
    prompt: 'Try “Break my biggest task into a checklist” when you have real work in Nimbus.',
    icon: Brain,
  },
  {
    path: "/settings",
    target: "[data-tour='settings-tutorial']",
    title: "Make Nimbus work on your terms",
    detail: "Settings controls advanced tools, Social, sounds, privacy, admin testing, and this tutorial. Social stays private and off unless you enable it.",
    prompt: "Nothing here is irreversible. You can replay this flight plan whenever you want.",
    icon: Check,
  },
] as const;

export function TutorialTour() {
  const { preferences, updatePreferences } = useExperience();
  const [location, navigate] = useLocation();
  const [minimized, setMinimized] = useState(
    () => sessionStorage.getItem("nimbus-tutorial-minimized") === "true",
  );
  const [saving, setSaving] = useState(false);
  const reduceMotion = useReducedMotion();
  const step = Math.min(preferences.tutorialStep ?? 0, chapters.length - 1);
  const chapter = chapters[step];
  const progress = ((step + 1) / chapters.length) * 100;
  const remaining = chapters.length - step - 1;

  useEffect(() => {
    if (preferences.tutorialCompleted || minimized) return;
    if (location !== chapter.path) {
      navigate(chapter.path);
      return;
    }
    let attempts = 0;
    let target: HTMLElement | undefined;
    const findTarget = window.setInterval(() => {
      target = Array.from(document.querySelectorAll<HTMLElement>(chapter.target))
        .find((element) => element.offsetParent !== null);
      attempts += 1;
      if (!target && attempts < 12) return;
      window.clearInterval(findTarget);
      target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      target?.classList.add("velocity-tour-target");
    }, 180);
    return () => {
      window.clearInterval(findTarget);
      target?.classList.remove("velocity-tour-target");
    };
  }, [chapter.path, chapter.target, location, minimized, navigate, preferences.tutorialCompleted, reduceMotion]);

  const milestones = useMemo(
    () => chapters.map((item, index) => ({
      label: item.title,
      state: index < step ? "complete" : index === step ? "current" : "upcoming",
    })),
    [step],
  );

  if (preferences.tutorialCompleted) return null;

  function setPaused(value: boolean) {
    setMinimized(value);
    if (value) sessionStorage.setItem("nimbus-tutorial-minimized", "true");
    else sessionStorage.removeItem("nimbus-tutorial-minimized");
  }

  async function move(nextStep: number) {
    if (saving) return;
    setSaving(true);
    try {
      if (nextStep >= chapters.length) {
        await updatePreferences({ tutorialStep: chapters.length, tutorialCompleted: true });
        sessionStorage.removeItem("nimbus-tutorial-minimized");
        return;
      }
      await updatePreferences({ tutorialStep: nextStep, tutorialCompleted: false });
    } finally {
      setSaving(false);
    }
  }

  if (minimized) {
    return (
      <motion.button
        type="button"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => setPaused(false)}
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-3 z-[75] flex max-w-[calc(100%-5.5rem)] items-center gap-3 rounded-2xl border bg-popover px-3 py-2.5 text-left shadow-xl md:bottom-4 md:left-[calc(var(--sidebar-width,17rem)+1rem)]"
        aria-label="Resume Nimbus tutorial"
      >
        <NimbusMascot state="assistant" className="h-10 w-12 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-xs font-black">Resume your Nimbus flight plan</span>
          <span className="block text-[11px] text-muted-foreground">{step + 1} of {chapters.length} · progress saved</span>
        </span>
      </motion.button>
    );
  }

  const Icon = chapter.icon;
  return (
    <AnimatePresence mode="wait">
      <motion.aside
        key={step}
        initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: 10 }}
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-[80] overflow-hidden rounded-[1.35rem] border bg-popover shadow-[0_24px_80px_rgba(0,0,0,.26)] sm:left-auto sm:right-5 sm:w-[27rem] md:bottom-5"
        aria-live="polite"
      >
        <div className="h-1 bg-muted">
          <motion.div className="h-full bg-primary" animate={{ width: `${progress}%` }} />
        </div>
        <div className="grid grid-cols-12 grid-flow-dense">
          <div className="col-span-9 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-xs font-black text-primary">
              <Icon className="h-4 w-4" />
              Your Nimbus flight plan
            </div>
            <h2 className="mt-3 max-w-sm text-xl font-black leading-tight tracking-[-.025em]">
              {chapter.title}
            </h2>
          </div>
          <div className="col-span-3 flex items-center justify-center bg-primary/8 p-3">
            <NimbusMascot state={step === chapters.length - 1 ? "momentum" : "assistant"} className="w-20" />
          </div>
          <div className="col-span-12 border-t px-4 py-4 sm:px-5">
            <p className="text-sm leading-6 text-muted-foreground">{chapter.detail}</p>
            <p className="mt-3 rounded-xl border border-primary/15 bg-primary/[.055] px-3 py-2.5 text-xs font-semibold leading-5 text-foreground">
              {chapter.prompt}
            </p>
            {step === 5 && !preferences.advancedFeaturesEnabled && (
              <button
                type="button"
                onClick={() => void updatePreferences({ advancedFeaturesEnabled: true })}
                className="mt-3 text-xs font-black text-primary hover:underline"
              >
                Keep planning tools in my navigation
              </button>
            )}
            <div className="mt-4 flex gap-1.5" aria-label={`Tutorial progress: ${step + 1} of ${chapters.length}`}>
              {milestones.map((item) => (
                <span
                  key={item.label}
                  title={item.label}
                  className={`h-1.5 flex-1 rounded-full ${
                    item.state === "complete"
                      ? "bg-primary"
                      : item.state === "current"
                        ? "bg-secondary"
                        : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => void move(step - 1)}
                    disabled={saving}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                    aria-label="Previous tutorial chapter"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPaused(true)}
                  className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Minimize2 className="h-3.5 w-3.5" /> Pause
                </button>
              </div>
              <button
                type="button"
                onClick={() => void move(step + 1)}
                disabled={saving}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-black text-primary-foreground shadow-sm disabled:opacity-50"
              >
                {remaining === 0 ? "Finish flight plan" : "Continue"}
                {remaining === 0 ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-3 text-[10px] font-semibold text-muted-foreground">
              {remaining ? `${remaining} short ${remaining === 1 ? "chapter" : "chapters"} left · your place is saved` : "You can replay this anytime from Settings."}
            </p>
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
