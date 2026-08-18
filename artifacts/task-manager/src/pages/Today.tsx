import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  ListChecks,
  Loader2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  getGetDashboardOverviewQueryKey,
  getGetUserStatsQueryKey,
  getListTasksQueryKey,
  useGetUserStats,
  useListTasks,
  type Task,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DailyChecklist } from "@/components/DailyChecklist";
import { QuickCapture } from "@/components/QuickCapture";
import { TaskInlineNotes } from "@/components/TaskInlineNotes";
import { useReliableTaskCompletion } from "@/hooks/useReliableTaskCompletion";
import { subjectColor, useSubjects } from "@/hooks/useSubjects";
import { localDateKey } from "@/lib/localDate";

const TaskDetailsModal = lazy(() =>
  import("@/components/TaskDetailsModal").then((module) => ({
    default: module.TaskDetailsModal,
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
  const queryClient = useQueryClient();
  const taskCompletion = useReliableTaskCompletion();
  const reduceMotion = useReducedMotion();
  const { data: stats } = useGetUserStats();
  const { data: tasks = [], isLoading } = useListTasks(
    { sortBy: "dueDate" },
    { query: { queryKey: getListTasksQueryKey({ sortBy: "dueDate" }) } },
  );
  const { data: subjects = [] } = useSubjects();
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
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<number | null>(() => {
    const value = sessionStorage.getItem("velocity-highlight-task");
    return value ? Number(value) : null;
  });
  const today = localDateKey(new Date());

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

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
      queryClient.invalidateQueries({
        queryKey: getGetDashboardOverviewQueryKey(),
      }),
      queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: ["rewards"] }),
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
      const endKey = localDateKey(end);
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

  function complete(task: Task, target?: HTMLElement | null) {
    void taskCompletion.complete(task, target);
  }

  return (
    <div className="page-stack space-y-5">
      <section data-tour="quick-capture" className="bento-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Quick capture</h2>
            <p className="text-xs text-muted-foreground">
              Try "Math homework tomorrow #Math high priority".
            </p>
          </div>
        </div>
        <QuickCapture onCreated={() => void refresh()} />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section data-tour="today-list" className="bento-card overflow-hidden">
          <header className="border-b px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <ListChecks className="h-4 w-4 text-primary" />
                <h2 className="font-black">Tasks</h2>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">
                  {visibleTasks.length}
                </span>
              </div>
              <div
                data-tour="recommend-next"
                className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
              >
                <select
                  aria-label="Available time"
                  value={availableMinutes}
                  onChange={(event) => {
                    setAvailableMinutes(Number(event.target.value));
                    setRecommendation(null);
                  }}
                  className="h-8 min-w-20 flex-1 rounded-md border bg-background px-2 text-xs font-bold sm:flex-none"
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
                  onChange={(event) => {
                    setEnergy(event.target.value as typeof energy);
                    setRecommendation(null);
                  }}
                  className="h-8 min-w-28 flex-1 rounded-md border bg-background px-2 text-xs font-bold sm:flex-none"
                >
                  <option value="low">Low energy</option>
                  <option value="medium">Medium energy</option>
                  <option value="high">High energy</option>
                </select>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void recommendNext()}
                  disabled={recommendationLoading}
                  className="h-8 flex-1 gap-1.5 sm:flex-none"
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
                  <AnimatePresence>
                    {viewsOpen && (
                      <motion.div
                        initial={
                          reduceMotion
                            ? false
                            : { opacity: 0, y: -5, scale: 0.98 }
                        }
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -3, scale: 0.98 }}
                        transition={{ duration: 0.14 }}
                        className="absolute right-0 top-10 z-30 w-52 rounded-lg border bg-popover p-2 shadow-xl"
                      >
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
                                    ? current.filter(
                                        (value) => value !== item.id,
                                      )
                                    : [...current, item.id],
                                );
                                if (enabled && view === item.id)
                                  setView("today");
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
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
            <div className="mt-3 flex max-w-full overflow-x-auto rounded-lg bg-muted p-1">
              {(["today", "all", "completed", ...enabledViews] as View[]).map(
                (item) => (
                  <motion.button
                    key={item}
                    type="button"
                    onClick={() => setView(item)}
                    whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                    className={`relative shrink-0 rounded-md px-2.5 py-1.5 text-xs font-bold ${view === item ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {view === item && (
                      <motion.span
                        layoutId="today-view-active"
                        className="absolute inset-0 rounded-md bg-background shadow-sm"
                        transition={{
                          type: "spring",
                          stiffness: 420,
                          damping: 34,
                        }}
                      />
                    )}
                    <span className="relative">{viewLabel(item)}</span>
                  </motion.button>
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
                <div className="flex shrink-0 items-center gap-2">
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
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    onClick={() => setSelectedTask(task.id)}
                    className={`cursor-pointer px-4 py-3.5 transition-colors hover:bg-muted/35 ${isHighlighted ? "bg-primary/10 ring-2 ring-inset ring-primary/45" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        disabled={
                          isComplete || taskCompletion.isPending(task.id)
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          complete(task, event.currentTarget);
                        }}
                        aria-label={
                          isComplete ? "Task completed" : "Complete task"
                        }
                        aria-busy={taskCompletion.isPending(task.id)}
                        className="-ml-2 flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-70"
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={
                              taskCompletion.isPending(task.id)
                                ? "pending"
                                : isComplete
                                  ? "complete"
                                  : "open"
                            }
                            initial={
                              reduceMotion
                                ? false
                                : { opacity: 0, scale: 0.72, rotate: -10 }
                            }
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            exit={
                              reduceMotion
                                ? undefined
                                : { opacity: 0, scale: 0.72 }
                            }
                            transition={{ duration: 0.14 }}
                          >
                            {taskCompletion.isPending(task.id) ? (
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            ) : isComplete ? (
                              <CheckCircle2 className="h-6 w-6 text-primary" />
                            ) : (
                              <Circle className="h-6 w-6" />
                            )}
                          </motion.span>
                        </AnimatePresence>
                      </button>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-bold ${isComplete ? "text-muted-foreground line-through" : ""}`}
                          style={{
                            color: isComplete
                              ? undefined
                              : subjectColor(task.subject, subjects),
                          }}
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
                              {new Date(
                                `${date}T12:00:00`,
                              ).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="h-3 w-3" /> No due date
                            </span>
                          )}
                          {task.subject && (
                            <span
                              style={{
                                color: subjectColor(task.subject, subjects),
                              }}
                            >
                              {task.subject}
                            </span>
                          )}
                          {task.priority !== "medium" && (
                            <span className="capitalize">{task.priority}</span>
                          )}
                        </div>
                        <TaskInlineNotes
                          taskId={task.id}
                          taskTitle={task.title}
                          notes={task.notes}
                        />
                      </div>
                      {isHighlighted && (
                        <span className="inline-flex items-center gap-1 text-xs font-black text-primary">
                          <Check className="h-3.5 w-3.5" /> Added
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {isLoading &&
              [0, 1, 2].map((item) => (
                <div key={item} className="flex items-center gap-3 px-4 py-3.5">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-2/5" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            {!isLoading && visibleTasks.length === 0 && (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-5 py-12 text-center"
              >
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
              </motion.div>
            )}
          </div>
        </section>

        <aside className="self-start lg:sticky lg:top-5" aria-label="Habits">
          <DailyChecklist />
        </aside>
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
    </div>
  );
}
