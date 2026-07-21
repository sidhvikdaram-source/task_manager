import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Flame,
  ListChecks,
  Loader2,
  Plus,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  getGetDashboardOverviewQueryKey,
  getGetUserStatsQueryKey,
  getListTasksQueryKey,
  useCompleteTask,
  useGetUserStats,
  useListTasks,
  type Task,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DailyChecklist } from "@/components/DailyChecklist";
import { QuickCapture } from "@/components/QuickCapture";
import {
  playCompletionSound,
  primeCompletionSound,
} from "@/lib/completionSound";

const TaskDetailsModal = lazy(() =>
  import("@/components/TaskDetailsModal").then((module) => ({
    default: module.TaskDetailsModal,
  })),
);
const CreateTaskModal = lazy(() =>
  import("@/components/CreateTaskModal").then((module) => ({
    default: module.CreateTaskModal,
  })),
);

type View =
  | "today"
  | "all"
  | "completed"
  | "overdue"
  | "week"
  | "high"
  | "no-date"
  | "canvas";

type OptionalView = Exclude<View, "today" | "all" | "completed">;
type Recommendation = { recommendation: Task | null; reason: string };

const optionalViews: Array<{ id: OptionalView; label: string }> = [
  { id: "overdue", label: "Overdue" },
  { id: "week", label: "This week" },
  { id: "high", label: "High priority" },
  { id: "no-date", label: "No due date" },
  { id: "canvas", label: "Canvas" },
];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function taskDate(task: Task) {
  return task.dueDate || task.calendarDate;
}

function viewLabel(view: View) {
  return (
    optionalViews.find((option) => option.id === view)?.label ??
    (view === "all"
      ? "All active"
      : view.charAt(0).toUpperCase() + view.slice(1))
  );
}

export default function Today() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const completeTask = useCompleteTask();
  const { data: stats } = useGetUserStats();
  const { data: tasks = [], isLoading } = useListTasks(
    { sortBy: "dueDate" },
    { query: { queryKey: getListTasksQueryKey({ sortBy: "dueDate" }) } },
  );
  const [view, setView] = useState<View>("today");
  const [enabledViews, setEnabledViews] = useState<OptionalView[]>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("velocity-task-views") ?? "[]",
      );
      return Array.isArray(saved)
        ? saved.filter((value): value is OptionalView =>
            optionalViews.some((item) => item.id === value),
          )
        : [];
    } catch {
      return [];
    }
  });
  const [viewsOpen, setViewsOpen] = useState(false);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(
    null,
  );
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [availableMinutes, setAvailableMinutes] = useState(30);
  const [energy, setEnergy] = useState<"low" | "medium" | "high">("medium");
  const [streakCelebration, setStreakCelebration] = useState<number | null>(
    null,
  );
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<number | null>(() => {
    const value = sessionStorage.getItem("velocity-highlight-task");
    return value ? Number(value) : null;
  });
  const today = dateKey(new Date());

  useEffect(() => {
    if (!highlighted) return;
    const timer = window.setTimeout(() => {
      sessionStorage.removeItem("velocity-highlight-task");
      setHighlighted(null);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [highlighted]);

  useEffect(() => {
    localStorage.setItem("velocity-task-views", JSON.stringify(enabledViews));
  }, [enabledViews]);

  useEffect(() => {
    if (streakCelebration === null) return;
    const timer = window.setTimeout(() => setStreakCelebration(null), 3200);
    return () => window.clearTimeout(timer);
  }, [streakCelebration]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
      queryClient.invalidateQueries({
        queryKey: getGetDashboardOverviewQueryKey(),
      }),
      queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey() }),
    ]);
  }

  const visibleTasks = useMemo(() => {
    if (view === "completed")
      return tasks.filter((task) => task.status === "completed");
    const active = tasks.filter((task) => task.status !== "completed");
    if (view === "all") return active;
    if (view === "overdue")
      return active.filter((task) => {
        const date = taskDate(task);
        return Boolean(date && date < today);
      });
    if (view === "high")
      return active.filter(
        (task) => task.priority === "critical" || task.priority === "high",
      );
    if (view === "no-date") return active.filter((task) => !taskDate(task));
    if (view === "canvas")
      return active.filter((task) => task.externalSource?.startsWith("canvas"));
    if (view === "week") {
      const end = new Date();
      end.setDate(end.getDate() + 7);
      const endKey = dateKey(end);
      return active.filter((task) => {
        const date = taskDate(task);
        return Boolean(date && date >= today && date <= endKey);
      });
    }
    return active.filter((task) => {
      if (task.id === highlighted) return true;
      const date = taskDate(task);
      return !date || date <= today;
    });
  }, [highlighted, tasks, today, view]);

  const dueToday = tasks.filter(
    (task) => task.status !== "completed" && taskDate(task) === today,
  ).length;
  const overdue = tasks.filter((task) => {
    const date = taskDate(task);
    return task.status !== "completed" && Boolean(date && date < today);
  }).length;

  async function recommendNext() {
    setRecommendationLoading(true);
    try {
      const response = await fetch(
        `/api/recommendations/next?minutes=${availableMinutes}&energy=${energy}`,
        { credentials: "include" },
      );
      const data = (await response.json()) as Recommendation & {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Recommendation failed");
      setRecommendation(data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not recommend a task",
      );
    } finally {
      setRecommendationLoading(false);
    }
  }

  function complete(task: Task) {
    if (task.externalSource === "canvas") {
      toast("Canvas will complete this after you submit it.");
      return;
    }
    primeCompletionSound();
    completeTask.mutate(
      { id: task.id },
      {
        onSuccess: async (result) => {
          playCompletionSound();
          const completion = result as typeof result & {
            firstCompletionToday?: boolean;
            streakDays?: number | null;
          };
          if (completion.firstCompletionToday && completion.streakDays) {
            setStreakCelebration(completion.streakDays);
          }
          toast.success(
            result.vpAwarded ? `Done - +${result.vpAwarded} VP` : "Task done",
          );
          await refresh();
        },
        onError: () => toast.error("That task could not be completed"),
      },
    );
  }

  return (
    <div className="space-y-5">
      <header className="border-b border-border/70 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-black uppercase text-primary">My Day</p>
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-1 text-[11px] font-black text-secondary">
            <Flame className="h-3.5 w-3.5 fill-secondary" />
            {stats?.streakDays ?? 0} day streak
          </span>
        </div>
        <h1 className="mt-1 text-2xl font-black sm:text-3xl">
          {greeting()},{" "}
          {user?.firstName || user?.email?.split("@")[0] || "there"}.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {overdue
            ? `${overdue} overdue - ${dueToday} due today`
            : dueToday
              ? `${dueToday} task${dueToday === 1 ? "" : "s"} due today`
              : "Choose one useful thing and begin."}
        </p>
      </header>

      <section data-tour="quick-capture" className="bento-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Quick capture</h2>
            <p className="text-xs text-muted-foreground">
              Try "Math homework tomorrow #Math high priority".
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label="Open detailed task form"
            title="Detailed task"
            className="flex h-9 w-9 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <QuickCapture onCreated={() => void refresh()} />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.65fr)]">
        <section data-tour="today-list" className="bento-card overflow-hidden">
          <header className="border-b px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                <h2 className="font-black">Tasks</h2>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">
                  {visibleTasks.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void recommendNext()}
                  disabled={recommendationLoading}
                  className="h-8 gap-1.5"
                >
                  {recommendationLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Recommend next
                </Button>
                <div className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setViewsOpen((open) => !open)}
                    className="h-8 gap-1.5"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" /> Views
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  {viewsOpen && (
                    <div className="absolute right-0 top-10 z-30 w-52 rounded-lg border bg-popover p-2 shadow-xl">
                      <p className="px-2 pb-1 text-[10px] font-black uppercase text-muted-foreground">
                        Add task views
                      </p>
                      {optionalViews.map((item) => {
                        const enabled = enabledViews.includes(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setEnabledViews((current) =>
                                enabled
                                  ? current.filter((value) => value !== item.id)
                                  : [...current, item.id],
                              );
                              if (enabled && view === item.id) setView("today");
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold hover:bg-muted"
                          >
                            <span
                              className={`flex h-4 w-4 items-center justify-center rounded border ${enabled ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                            >
                              {enabled && <Check className="h-3 w-3" />}
                            </span>
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 flex max-w-full overflow-x-auto rounded-lg bg-muted p-1">
              {(["today", "all", "completed", ...enabledViews] as View[]).map(
                (item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setView(item)}
                    className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-bold ${view === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                  >
                    {viewLabel(item)}
                  </button>
                ),
              )}
            </div>
          </header>

          {recommendation && (
            <div className="border-b bg-primary/8 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  disabled={!recommendation.recommendation}
                  onClick={() =>
                    recommendation.recommendation &&
                    setSelectedTask(recommendation.recommendation.id)
                  }
                  className="min-w-0 flex-1 text-left disabled:cursor-default"
                >
                  <p className="text-xs font-black text-primary">
                    {recommendation.recommendation?.title ??
                      "No task fits right now"}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {recommendation.reason}
                  </p>
                </button>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <select
                    aria-label="Available time"
                    value={availableMinutes}
                    onChange={(event) =>
                      setAvailableMinutes(Number(event.target.value))
                    }
                    className="h-8 rounded-md border bg-background px-2 text-xs font-bold"
                  >
                    {[10, 20, 30, 45, 60].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} min
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Energy level"
                    value={energy}
                    onChange={(event) =>
                      setEnergy(event.target.value as typeof energy)
                    }
                    className="h-8 rounded-md border bg-background px-2 text-xs font-bold"
                  >
                    <option value="low">Low energy</option>
                    <option value="medium">Medium energy</option>
                    <option value="high">High energy</option>
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => void recommendNext()}
                  >
                    Refresh
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="divide-y divide-border/60">
            <AnimatePresence initial={false}>
              {visibleTasks.map((task) => {
                const date = taskDate(task);
                const isComplete = task.status === "completed";
                const isHighlighted = highlighted === task.id;
                return (
                  <motion.div
                    layout
                    key={task.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    onClick={() => setSelectedTask(task.id)}
                    className={`flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/35 ${isHighlighted ? "bg-primary/10 ring-2 ring-inset ring-primary/45" : ""}`}
                  >
                    <button
                      type="button"
                      disabled={isComplete || completeTask.isPending}
                      onClick={(event) => {
                        event.stopPropagation();
                        complete(task);
                      }}
                      aria-label={
                        isComplete ? "Task completed" : "Complete task"
                      }
                      className="text-muted-foreground hover:text-primary disabled:opacity-70"
                    >
                      {isComplete ? (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-bold ${isComplete ? "text-muted-foreground line-through" : ""}`}
                      >
                        {task.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                        {date ? (
                          <span
                            className={`inline-flex items-center gap-1 ${date < today && !isComplete ? "text-destructive" : ""}`}
                          >
                            <CalendarClock className="h-3 w-3" />
                            {date < today && !isComplete
                              ? "Overdue - "
                              : date === today
                                ? "Today - "
                                : ""}
                            {new Date(`${date}T12:00:00`).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3 w-3" /> No due date
                          </span>
                        )}
                        {task.subject && <span>{task.subject}</span>}
                        {task.priority !== "medium" && (
                          <span className="capitalize">{task.priority}</span>
                        )}
                      </div>
                    </div>
                    {isHighlighted && (
                      <span className="inline-flex items-center gap-1 text-xs font-black text-primary">
                        <Check className="h-3.5 w-3.5" /> Added
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {!isLoading && visibleTasks.length === 0 && (
              <div className="px-5 py-12 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <p className="mt-3 font-black">
                  {view === "completed" ? "Nothing completed yet" : "All clear"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {view === "today"
                    ? "Capture something above or take a real break."
                    : "Tasks in this view will appear here."}
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="bento-card overflow-hidden">
          <header className="border-b px-4 py-3">
            <h2 className="font-black">Habits</h2>
            <p className="text-xs text-muted-foreground">
              Small routines for today.
            </p>
          </header>
          <DailyChecklist />
        </section>
      </div>

      {selectedTask !== null && (
        <Suspense fallback={null}>
          <TaskDetailsModal
            taskId={selectedTask}
            open
            onOpenChange={(open) => !open && setSelectedTask(null)}
          />
        </Suspense>
      )}
      {createOpen && (
        <Suspense fallback={null}>
          <CreateTaskModal
            open
            onOpenChange={setCreateOpen}
            onSuccess={() => void refresh()}
          />
        </Suspense>
      )}

      <AnimatePresence>
        {streakCelebration !== null && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setStreakCelebration(null)}
          >
            <motion.div
              role="status"
              aria-live="polite"
              initial={{ scale: 0.72, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.88, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-sm rounded-xl border border-secondary/40 bg-card p-7 text-center shadow-2xl"
            >
              <motion.div
                animate={{ scale: [1, 1.18, 1], rotate: [0, -5, 5, 0] }}
                transition={{ duration: 0.9 }}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary/15 text-secondary"
              >
                <Flame className="h-9 w-9 fill-secondary" />
              </motion.div>
              <p className="mt-4 text-xs font-black uppercase text-secondary">
                Momentum kept
              </p>
              <p className="mt-1 text-3xl font-black">
                {streakCelebration} day streak
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Every active day counts. Missing a day never erases your
                progress.
              </p>
              <Button
                className="mt-5"
                size="sm"
                onClick={() => setStreakCelebration(null)}
              >
                Keep going
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
