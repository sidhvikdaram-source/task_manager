import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  ListChecks,
  Plus,
  Target,
} from "lucide-react";
import {
  getGetDashboardOverviewQueryKey,
  getGetUserStatsQueryKey,
  getListTasksQueryKey,
  useCompleteTask,
  useListTasks,
  type Task,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { Link } from "wouter";
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

type View = "today" | "all" | "completed";

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

export default function Today() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const completeTask = useCompleteTask();
  const { data: tasks = [], isLoading } = useListTasks(
    { sortBy: "dueDate" },
    { query: { queryKey: getListTasksQueryKey({ sortBy: "dueDate" }) } },
  );
  const [view, setView] = useState<View>("today");
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
          toast.success(
            result.vpAwarded ? `Done · +${result.vpAwarded} VP` : "Task done",
          );
          await refresh();
        },
        onError: () => toast.error("That task could not be completed"),
      },
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-primary">My Day</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">
            {greeting()},{" "}
            {user?.firstName || user?.email?.split("@")[0] || "there"}.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {overdue
              ? `${overdue} overdue · ${dueToday} due today`
              : dueToday
                ? `${dueToday} task${dueToday === 1 ? "" : "s"} due today`
                : "Choose one useful thing and begin."}
          </p>
        </div>
        <Link href="/focus">
          <Button size="sm" className="gap-2">
            <Target className="h-4 w-4" /> Start focus
          </Button>
        </Link>
      </header>

      <section data-tour="quick-capture" className="bento-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Quick capture</h2>
            <p className="text-xs text-muted-foreground">
              Try “Math homework tomorrow #Math high priority”.
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

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.75fr)]">
        <section data-tour="today-list" className="bento-card overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              <h2 className="font-black">Tasks</h2>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">
                {visibleTasks.length}
              </span>
            </div>
            <div className="flex rounded-lg bg-muted p-1">
              {(["today", "all", "completed"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setView(item)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-bold capitalize ${view === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </header>
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
                              ? "Overdue · "
                              : date === today
                                ? "Today · "
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
    </div>
  );
}
