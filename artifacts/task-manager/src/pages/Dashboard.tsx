import React, { lazy, Suspense, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetDashboardOverview,
  useListTasks,
  useCompleteTask,
  useUpdateTask,
  getListTasksQueryKey,
  getGetDashboardOverviewQueryKey,
  getGetUserStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { DailyChecklist } from "@/components/DailyChecklist";
import { QuickCapture } from "@/components/QuickCapture";
import {
  playCompletionSound,
  primeCompletionSound,
} from "@/lib/completionSound";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@workspace/replit-auth-web";
import {
  Zap,
  Target,
  ChevronRight,
  CheckCircle2,
  Circle,
  Clock,
  Trophy,
  Plus,
} from "lucide-react";
import { MomentumIcon } from "@/components/MomentumIcon";

const CreateTaskModal = lazy(() =>
  import("@/components/CreateTaskModal").then((module) => ({
    default: module.CreateTaskModal,
  })),
);
const TaskDetailsModal = lazy(() =>
  import("@/components/TaskDetailsModal").then((module) => ({
    default: module.TaskDetailsModal,
  })),
);
const OverdueTriageModal = lazy(() =>
  import("@/components/OverdueTriageModal").then((module) => ({
    default: module.OverdueTriageModal,
  })),
);

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-rose-600 bg-rose-50 border-rose-200",
  high: "text-amber-600 bg-amber-50 border-amber-200",
  medium: "text-zinc-600 bg-zinc-50 border-zinc-200",
  low: "text-slate-500 bg-slate-50 border-slate-200",
};

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-rose-500",
  high: "bg-amber-500",
  medium: "bg-zinc-400",
  low: "bg-slate-400",
};

function getHourGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function canvasCategoryLabel(taskKind: string | undefined) {
  if (taskKind === "test" || taskKind === "quiz") return "Quiz / Test";
  if (taskKind === "class_event") return "Class Event";
  if (taskKind === "meeting") return "Meeting";
  if (taskKind === "deadline" || taskKind === "assignment") return "Deadline";
  return "Other";
}

function useCountUp(target: number, duration = 900, start = true) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start) return;
    if (target === 0) {
      setDisplay(0);
      return;
    }
    const startTime = performance.now();
    const startVal = 0;
    const update = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(startVal + eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, start]);

  return display;
}

interface TaskRowProps {
  task: any;
  onComplete: (id: number) => void;
  completing: boolean;
  onClick: (task: any) => void;
  delay?: number;
}

function TaskRow({
  task,
  onComplete,
  completing,
  onClick,
  delay = 0,
}: TaskRowProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -14, filter: "blur(2px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: 12, scale: 0.97 }}
      transition={{ delay, duration: 0.28, ease: "easeOut" }}
      whileHover={{ x: 1 }}
      className="flex items-center gap-4 py-3.5 px-4 rounded-xl transition-colors group cursor-pointer"
      onClick={() => onClick(task)}
      data-testid={`task-row-${task.id}`}
    >
      <motion.button
        onClick={(e) => {
          e.stopPropagation();
          primeCompletionSound();
          onComplete(task.id);
        }}
        disabled={completing || task.externalSource === "canvas"}
        title={
          task.externalSource === "canvas"
            ? "Canvas will mark this complete after submission"
            : "Complete task"
        }
        data-testid={`button-complete-task-${task.id}`}
        className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.88 }}
      >
        {completing ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
            className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full"
          />
        ) : (
          <Circle className="w-5 h-5" />
        )}
      </motion.button>

      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-foreground truncate">
          {task.title}
        </div>
        {(task.dueDate || task.externalSource?.startsWith("canvas")) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
            {task.externalSource?.startsWith("canvas") && (
              <span className="rounded bg-[#0f6cbf]/10 px-1.5 py-0.5 font-bold text-[#0f6cbf]">
                {canvasCategoryLabel(task.taskKind)}
              </span>
            )}
            {task.dueDate && (
              <>
                <Clock className="w-3 h-3" />
                {new Date(task.dueDate).toLocaleDateString()}
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border ${PRIORITY_COLORS[task.priority] ?? "text-zinc-600 bg-zinc-50 border-zinc-200"}`}
        >
          {task.priority}
        </span>
        <div className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
          <Zap className="w-3 h-3 fill-primary" />+{task.vpValue} VP
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </motion.div>
  );
}

function AnimatedProgressBar({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDisplayed(value), 120);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <Progress
      aria-label="Tier progress"
      value={displayed}
      className="h-2"
      style={{ transition: "all 1.1s cubic-bezier(0.34,1.56,0.64,1)" }}
    />
  );
}

function fadeIn(delay: number) {
  return {
    initial: { opacity: 0, y: 18, filter: "blur(3px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { delay, duration: 0.38, ease: "easeOut" as const },
  };
}

export default function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: overview, isLoading: overviewLoading } =
    useGetDashboardOverview();
  const { data: allTasks, isLoading: tasksLoading } = useListTasks(
    { sortBy: "priority" },
    { query: { queryKey: getListTasksQueryKey({ sortBy: "priority" }) } },
  );
  const completeTask = useCompleteTask();
  const updateTask = useUpdateTask();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [showOverdueTriage, setShowOverdueTriage] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const overdueTasks = (allTasks ?? []).filter(
    (t) => t.status !== "completed" && t.dueDate && t.dueDate < today,
  );

  useEffect(() => {
    if (!tasksLoading && overdueTasks.length > 0) {
      const key = "velocity-overdue-seen-" + today;
      try {
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          setShowOverdueTriage(true);
        }
      } catch {
        /* ignore */
      }
    }
  }, [tasksLoading]);

  const isLoading = overviewLoading || tasksLoading;

  const invalidate = () => {
    qc.invalidateQueries({
      queryKey: getListTasksQueryKey({ sortBy: "priority" }),
    });
    qc.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
    qc.invalidateQueries({ queryKey: getGetUserStatsQueryKey() });
  };

  const handleComplete = (id: number) => {
    setCompletingId(id);
    completeTask.mutate(
      { id },
      {
        onSuccess: (result) => {
          playCompletionSound();
          invalidate();
          if (result.tierUp) {
            toast.success(`Tier ${result.newTier} unlocked!`, {
              description: `+${result.vpAwarded} VP earned. You've advanced to the next tier.`,
            });
          } else {
            toast.success(`+${result.vpAwarded} VP earned`, {
              description:
                result.multiplier > 1
                  ? `${result.multiplier}× multiplier applied`
                  : "Task complete",
            });
          }
        },
        onSettled: () => setCompletingId(null),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-3">
            <Skeleton className="h-6 w-32" />
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!overview) return null;

  const stats = overview.userStats;
  const activeTasks = (allTasks ?? []).filter((t) => t.status !== "completed");
  const criticalTasks = activeTasks.filter((t) => t.priority === "critical");
  const inFlightTasks = activeTasks.filter(
    (t) => t.status === "in_progress" && t.priority !== "critical",
  );
  const unscheduledTasks = activeTasks.filter(
    (t) =>
      t.status === "todo" &&
      t.priority !== "critical" &&
      !t.dueDate &&
      !t.calendarDate,
  );
  const backlogTasks = activeTasks.filter(
    (t) =>
      t.status === "todo" &&
      t.priority !== "critical" &&
      (t.dueDate || t.calendarDate),
  );

  const totalActive = activeTasks.length;
  const vpToNextTier = 100 - stats.tierProgress;

  const statCards = [
    {
      label: "Active tasks",
      rawValue: totalActive,
      icon: <Target className="w-4 h-4 text-primary" />,
      color: "text-primary",
      countUp: true,
    },
    {
      label: "Completed",
      rawValue: overview.completedCount,
      icon: <CheckCircle2 className="w-4 h-4 text-foreground" />,
      color: "text-foreground",
      countUp: true,
    },
    {
      label: "Momentum days",
      rawValue: stats.streakDays,
      displayValue: `${stats.streakDays} day${stats.streakDays !== 1 ? "s" : ""}`,
      icon: <MomentumIcon className="h-4 w-4 text-primary" />,
      color: "text-amber-600",
    },
  ];

  return (
    <motion.div
      key="dashboard-content"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <motion.div
        {...fadeIn(0.05)}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-black text-foreground sm:text-3xl">
            {getHourGreeting()},{" "}
            {user?.firstName || user?.email?.split("@")[0] || "there"}.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats.totalVp === 0
              ? "Start completing tasks to build your velocity."
              : `${vpToNextTier} VP to Tier ${stats.tier + 1}. ${activeTasks.length} active task${activeTasks.length === 1 ? "" : "s"}.`}
          </p>
        </div>
        <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
          <Button
            onClick={() => {
              window.location.href = `${(import.meta.env.BASE_URL ?? "/").replace(/\/$/, "")}/focus`;
            }}
            size="sm"
            className="h-10 rounded-xl bg-secondary text-secondary-foreground shadow-[0_0_26px_rgba(255,111,26,0.24)]"
            data-testid="button-start-focus"
          >
            <Target className="mr-1.5 h-4 w-4" />
            Start Focus Session
          </Button>
        </motion.div>
      </motion.div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {statCards.map((stat, i) => (
          <StatCard key={stat.label} stat={stat} index={i} />
        ))}
      </div>

      <motion.section
        {...fadeIn(0.14)}
        initial="hidden"
        animate="visible"
        className="bento-card p-4 sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">Quick capture</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add a task now, with optional checklist steps.
            </p>
          </div>
        </div>
        <QuickCapture onCreated={invalidate} />
      </motion.section>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Task columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Urgent tasks stay out of the way until they need attention. */}
          {criticalTasks.length > 0 && (
            <motion.div
              {...fadeIn(0.22)}
              initial="hidden"
              animate="visible"
              className="bento-card bento-card-hot overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b neon-rule bg-white/[0.035]">
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-2 h-2 rounded-full bg-rose-500"
                    animate={{
                      scale: criticalTasks.length > 0 ? [1, 1.3, 1] : 1,
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: criticalTasks.length > 0 ? Infinity : 0,
                      repeatDelay: 2,
                    }}
                  />
                  <span className="font-semibold text-sm">Priority</span>
                  {criticalTasks.length > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 20,
                      }}
                      className="text-xs bg-rose-100 text-rose-700 font-bold px-1.5 py-0.5 rounded-md"
                    >
                      {criticalTasks.length}
                    </motion.span>
                  )}
                </div>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
                  data-testid="button-view-all-critical"
                >
                  Add <Plus className="w-3 h-3" />
                </button>
              </div>
              <div className="divide-y divide-border/50">
                <AnimatePresence>
                  {criticalTasks.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="px-4 py-3 text-center text-xs text-muted-foreground"
                    >
                      No critical tasks — you're ahead of the curve.
                    </motion.div>
                  ) : (
                    criticalTasks.map((task, i) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onComplete={handleComplete}
                        completing={completingId === task.id}
                        onClick={setSelectedTask}
                        delay={i * 0.05}
                      />
                    ))
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* In progress */}
          <motion.div
            {...fadeIn(0.3)}
            initial="hidden"
            animate="visible"
            className={`bento-card overflow-hidden ${inFlightTasks.length === 0 ? "hidden" : ""}`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b neon-rule bg-white/[0.035]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="font-semibold text-sm">In progress</span>
                {inFlightTasks.length > 0 && (
                  <span className="text-xs bg-muted text-muted-foreground font-medium px-1.5 py-0.5 rounded-md">
                    {inFlightTasks.length} Task
                    {inFlightTasks.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-border/50">
              <AnimatePresence>
                {inFlightTasks.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-8 text-center text-muted-foreground text-sm"
                  >
                    No in-progress tasks. Move something from the backlog.
                  </motion.div>
                ) : (
                  inFlightTasks.map((task, i) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onComplete={handleComplete}
                      completing={completingId === task.id}
                      onClick={setSelectedTask}
                      delay={i * 0.05}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Backlog */}
          <AnimatePresence>
            {backlogTasks.length > 0 && (
              <motion.div
                {...fadeIn(0.38)}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: 8 }}
                className="bento-card overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b neon-rule bg-white/[0.035]">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-400" />
                    <span className="font-semibold text-sm">Backlog</span>
                    <span className="text-xs bg-muted text-muted-foreground font-medium px-1.5 py-0.5 rounded-md">
                      {backlogTasks.length}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-border/50">
                  <AnimatePresence>
                    {backlogTasks.map((task, i) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onComplete={handleComplete}
                        completing={completingId === task.id}
                        onClick={(t) => {
                          updateTask.mutate(
                            { id: t.id, data: { status: "in_progress" } },
                            { onSuccess: invalidate },
                          );
                        }}
                        delay={i * 0.04}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            {...fadeIn(0.4)}
            initial="hidden"
            animate="visible"
            className={`bento-card overflow-hidden ${unscheduledTasks.length === 0 ? "hidden" : ""}`}
          >
            <div className="flex items-center justify-between border-b neon-rule bg-white/[0.035] px-4 py-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">No due date</span>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {unscheduledTasks.length}
                </span>
              </div>
            </div>
            <div className="divide-y divide-border/50">
              {unscheduledTasks.length > 0 ? (
                unscheduledTasks.map((task, index) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onComplete={handleComplete}
                    completing={completingId === task.id}
                    onClick={setSelectedTask}
                    delay={index * 0.03}
                  />
                ))
              ) : (
                <p className="px-4 py-3 text-xs text-muted-foreground">
                  Tasks without deadlines will stay visible here.
                </p>
              )}
            </div>
          </motion.div>

          {/* Daily Habits */}
          <DailyChecklist />
        </div>

        {/* Right Panel */}
        <div className="space-y-4">
          {/* Tier Progression */}
          <motion.div
            {...fadeIn(0.18)}
            initial="hidden"
            animate="visible"
            className="bento-card p-5"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Tier {stats.tier} Progression
              </span>
              <motion.div
                animate={{ rotate: [0, -12, 12, 0] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  repeatDelay: 5,
                }}
              >
                <Trophy className="w-4 h-4 text-amber-500" />
              </motion.div>
            </div>

            <div className="mt-3 mb-4">
              <div className="text-xl font-bold text-foreground">
                {stats.totalVp === 0
                  ? "Begin your journey"
                  : stats.tier === 1 && stats.tierProgress < 25
                    ? "Rising Operator"
                    : "Building Momentum"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Earn {vpToNextTier} VP to unlock Tier {stats.tier + 1}
              </div>
            </div>

            <div className="flex gap-1.5 mb-3">
              {[1, 2, 3, 4, 5].map((t, idx) => (
                <motion.div
                  key={t}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    delay: 0.2 + idx * 0.07,
                    type: "spring",
                    stiffness: 400,
                    damping: 20,
                  }}
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                    t < stats.tier
                      ? "bg-primary border-primary text-white"
                      : t === stats.tier
                        ? "bg-primary/15 border-primary text-primary"
                        : "bg-muted border-border text-muted-foreground"
                  }`}
                >
                  {t}
                </motion.div>
              ))}
            </div>

            <div className="space-y-1.5">
              <AnimatedProgressBar value={stats.tierProgress} />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{stats.tierProgress} VP earned</span>
                <span>{stats.tierProgress}%</span>
              </div>
            </div>
          </motion.div>

          {/* Recent Achievements */}
          <motion.div
            {...fadeIn(0.26)}
            initial="hidden"
            animate="visible"
            className="bento-card p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Recent Achievements
              </span>
            </div>

            {overview.completedCount === 0 ? (
              <div className="text-center py-4">
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    repeatDelay: 3,
                  }}
                  className="w-8 h-8 rounded-full bg-muted mx-auto mb-2 flex items-center justify-center"
                >
                  <Trophy className="w-4 h-4 text-muted-foreground/50" />
                </motion.div>
                <p className="text-xs text-muted-foreground">
                  Complete tasks to earn achievements
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {overview.completedCount >= 1 && (
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex items-center gap-3 p-2.5 bg-muted/50 rounded-lg border"
                  >
                    <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                      <Zap className="w-3.5 h-3.5 text-amber-600" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold">
                        First Completion
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {overview.completedCount} task
                        {overview.completedCount !== 1 ? "s" : ""} done
                      </div>
                    </div>
                  </motion.div>
                )}
                {stats.streakDays >= 2 && (
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="flex items-center gap-3 p-2.5 bg-muted/50 rounded-lg border"
                  >
                    <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                      <MomentumIcon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold">Momentum building</div>
                      <div className="text-[10px] text-muted-foreground">
                        {stats.streakDays} active days total
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {isCreateModalOpen && (
        <Suspense fallback={null}>
          <CreateTaskModal
            open
            onOpenChange={setIsCreateModalOpen}
            onSuccess={invalidate}
          />
        </Suspense>
      )}
      {selectedTask && (
        <Suspense fallback={null}>
          <TaskDetailsModal
            taskId={selectedTask.id}
            open
            onOpenChange={(open) => {
              if (!open) setSelectedTask(null);
            }}
          />
        </Suspense>
      )}
      {overdueTasks.length > 0 && showOverdueTriage && (
        <Suspense fallback={null}>
          <OverdueTriageModal
            open={showOverdueTriage}
            onOpenChange={setShowOverdueTriage}
            overdueTasks={overdueTasks}
          />
        </Suspense>
      )}
    </motion.div>
  );
}

interface StatCardProps {
  stat: {
    label: string;
    rawValue: number;
    displayValue?: string;
    icon: React.ReactNode;
    color: string;
    countUp?: boolean;
  };
  index: number;
}

function StatCard({ stat, index }: StatCardProps) {
  const counted = useCountUp(stat.rawValue, 900, !!stat.countUp);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{
        delay: 0.06 + index * 0.08,
        duration: 0.4,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      className="bento-card p-4 cursor-default"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
        {stat.icon}
        {stat.label}
      </div>
      <div className={`text-2xl font-bold ${stat.color}`}>
        {stat.countUp
          ? counted.toLocaleString()
          : (stat.displayValue ?? stat.rawValue)}
      </div>
    </motion.div>
  );
}
