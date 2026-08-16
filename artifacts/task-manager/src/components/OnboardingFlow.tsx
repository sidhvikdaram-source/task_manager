import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  CircleCheck,
  FolderKanban,
  Loader2,
  Repeat2,
  Sparkles,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { type MainGoal, useExperience } from "@/experience";
import { NimbusMascot } from "@/components/NimbusMascot";

const goals: Array<{
  id: MainGoal;
  title: string;
  detail: string;
  icon: typeof BookOpenCheck;
}> = [
  {
    id: "school",
    title: "School / Homework",
    detail: "Keep assignments and classes in one place.",
    icon: BookOpenCheck,
  },
  {
    id: "habits",
    title: "Daily Habits",
    detail: "Build a consistent daily rhythm.",
    icon: Repeat2,
  },
  {
    id: "projects",
    title: "Personal Projects",
    detail: "Turn bigger goals into clear next steps.",
    icon: FolderKanban,
  },
];

const suggestions: Record<MainGoal, string> = {
  school: "Finish math homework tomorrow high priority",
  habits: "Plan tomorrow's top priority",
  projects: "Define the next step for my project",
};

export function OnboardingFlow() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { updatePreferences } = useExperience();
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<MainGoal | null>(null);
  const [task, setTask] = useState("");
  const [canvasLater, setCanvasLater] = useState(false);
  const [saving, setSaving] = useState(false);

  async function finish() {
    if (!goal || saving) return;
    setSaving(true);
    try {
      if (task.trim()) {
        const response = await fetch("/api/quick-capture", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: task }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(result.error || "Your first task could not be added");
        if (result.task?.id)
          sessionStorage.setItem(
            "velocity-highlight-task",
            String(result.task.id),
          );
      }
      await updatePreferences({ mainGoal: goal, onboardingCompleted: true });
      void queryClient.invalidateQueries();
      navigate("/today", { replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Setup could not be saved",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/95 px-4 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-xl overflow-hidden rounded-lg border bg-card shadow-2xl"
      >
        <header className="flex items-center justify-between border-b px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <NimbusMascot variant="mark" className="h-10 w-12" />
            <div>
              <p className="font-black">Set up Nimbus</p>
              <p className="text-xs text-muted-foreground">About 30 seconds</p>
            </div>
          </div>
          <span className="text-xs font-bold text-muted-foreground">
            {step} / 3
          </span>
        </header>
        <div className="h-1 bg-muted">
          <motion.div
            className="h-full bg-primary"
            animate={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
        <div className="min-h-[390px] p-5 sm:p-7">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="goal"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
              >
                <p className="text-xs font-black uppercase text-primary">
                  One quick question
                </p>
                <h1 className="mt-2 text-2xl font-black">
                  What is your main goal?
                </h1>
                <div className="mt-5 grid gap-2">
                  {goals.map((item) => {
                    const Icon = item.icon;
                    const selected = goal === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setGoal(item.id)}
                        className={`flex items-center gap-4 rounded-lg border p-4 text-left transition-colors ${selected ? "border-primary bg-primary/8" : "hover:bg-muted/50"}`}
                      >
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold">{item.title}</span>
                          <span className="text-sm text-muted-foreground">
                            {item.detail}
                          </span>
                        </span>
                        {selected && <Check className="h-5 w-5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
            {step === 2 && goal && (
              <motion.div
                key="first-task"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
              >
                <p className="text-xs font-black uppercase text-primary">
                  Start with one thing
                </p>
                <h1 className="mt-2 text-2xl font-black">
                  Add your first task
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Dates and priority are detected automatically. You can also
                  choose Canvas and connect it from Academics after setup.
                </p>
                <textarea
                  value={task}
                  onChange={(event) => {
                    setTask(event.target.value);
                    setCanvasLater(false);
                  }}
                  rows={3}
                  autoFocus
                  placeholder={suggestions[goal]}
                  className="mt-5 w-full resize-none rounded-lg border bg-background p-4 text-sm outline-none focus:border-primary"
                />
                <div className="my-4 flex items-center gap-3 text-xs font-bold uppercase text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  or
                  <span className="h-px flex-1 bg-border" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCanvasLater(true);
                    setTask("");
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left ${canvasLater ? "border-primary bg-primary/8" : "hover:bg-muted/50"}`}
                >
                  <BookOpenCheck className="h-5 w-5 text-primary" />
                  <span className="flex-1">
                    <span className="block font-bold">Import from Canvas</span>
                    <span className="text-sm text-muted-foreground">
                      I will connect my school calendar next.
                    </span>
                  </span>
                  {canvasLater && <Check className="h-5 w-5 text-primary" />}
                </button>
              </motion.div>
            )}
            {step === 3 && (
              <motion.div
                key="ready"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex min-h-[330px] flex-col items-center justify-center text-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CircleCheck className="h-8 w-8" />
                </div>
                <h1 className="mt-5 text-2xl font-black">Your day is ready</h1>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  A short, resumable flight plan will introduce My Day,
                  recommendations, habits, Academics, Focus, planning, rewards,
                  and Nimbo without asking you to learn everything at once.
                </p>
                {canvasLater && (
                  <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs font-semibold">
                    Open Academics after the tour to connect Canvas.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <footer className="flex items-center justify-between border-t px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={() => setStep((value) => Math.max(1, value - 1))}
            disabled={step === 1 || saving}
            className="text-sm font-bold text-muted-foreground disabled:opacity-0"
          >
            Back
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((value) => value + 1)}
              disabled={
                (step === 1 && !goal) ||
                (step === 2 && !task.trim() && !canvasLater)
              }
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-40"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void finish()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Open Today
            </button>
          )}
        </footer>
      </motion.div>
    </div>
  );
}
