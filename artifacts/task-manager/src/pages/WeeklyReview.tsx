import React, { useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Inbox,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { MomentumIcon } from "@/components/MomentumIcon";

type Task = {
  id: number;
  title: string;
  dueDate: string | null;
  priority: string;
};
type Project = {
  id: number;
  name: string;
  progress: number;
  dueDate: string | null;
};
type Review = {
  weekStart: string;
  completed: Task[];
  overdue: Task[];
  dueNextWeek: Task[];
  focusMinutes: number;
  vpEarned: number;
  streakDays: number;
  projects: Project[];
  inboxCount: number;
  unfinished: Task[];
  completedReview: boolean;
  review: { topPriorities: string[]; focusGoalMinutes: number } | null;
};

export default function WeeklyReview() {
  const [data, setData] = useState<Review | null>(null);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [focusGoal, setFocusGoal] = useState(180);
  const [finishing, setFinishing] = useState(false);

  async function load() {
    const response = await fetch("/api/weekly-review", {
      credentials: "include",
    });
    if (!response.ok) return;
    const value = (await response.json()) as Review;
    setData(value);
    if (value.review) {
      setPriorities(value.review.topPriorities);
      setFocusGoal(value.review.focusGoalMinutes);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function togglePriority(title: string) {
    setPriorities((current) =>
      current.includes(title)
        ? current.filter((item) => item !== title)
        : current.length < 3
          ? [...current, title]
          : current,
    );
  }

  async function moveUnfinished() {
    if (!window.confirm("Move every unfinished task to tomorrow?")) return;
    const response = await fetch("/api/ai/actions/confirm", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "reschedule-unfinished-tomorrow" }),
    });
    if (!response.ok) {
      toast.error("Could not move unfinished tasks.");
      return;
    }
    const result = (await response.json()) as { updated: number };
    toast.success(`${result.updated} tasks moved`);
    await load();
  }

  async function finish() {
    setFinishing(true);
    try {
      const response = await fetch("/api/weekly-review/complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topPriorities: priorities,
          focusGoalMinutes: focusGoal,
        }),
      });
      const result = (await response.json()) as {
        alreadyCompleted?: boolean;
        awarded?: number;
        error?: string;
      };
      if (!response.ok) {
        toast.error(result.error ?? "Could not complete the review.");
        return;
      }
      toast.success(
        result.alreadyCompleted
          ? "Review already completed this week"
          : `Weekly review complete - +${result.awarded ?? 0} VP`,
      );
      await load();
    } finally {
      setFinishing(false);
    }
  }

  if (!data)
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Preparing your weekly review...
      </div>
    );

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-primary">
            Weekly review
          </p>
          <h1 className="tech-title mt-1 text-2xl">Reset the week</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review the signal, choose three priorities, and move on.
          </p>
        </div>
        {data.completedReview && (
          <span className="inline-flex items-center gap-2 text-sm font-bold text-primary">
            <CheckCircle2 className="h-4 w-4" />
            Complete this period
          </span>
        )}
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          icon={CheckCircle2}
          label="Completed"
          value={data.completed.length}
        />
        <Metric icon={Clock3} label="Focus" value={`${data.focusMinutes}m`} />
        <Metric icon={Zap} label="VP earned" value={data.vpEarned} />
        <Metric icon={MomentumIcon} label="Momentum" value={`${data.streakDays}d`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <section className="bento-card p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <TaskSummary
              title="Completed"
              tasks={data.completed}
              empty="None this week"
            />
            <TaskSummary
              title="Overdue"
              tasks={data.overdue}
              empty="Nothing overdue"
              accent
            />
            <TaskSummary
              title="Next week"
              tasks={data.dueNextWeek}
              empty="Nothing scheduled"
            />
          </div>
          <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-3">
            <button
              onClick={moveUnfinished}
              disabled={!data.unfinished.length}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40"
            >
              <CalendarClock className="h-4 w-4" />
              Move {data.unfinished.length} unfinished
            </button>
            <Link href="/calendar">
              <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background">
                <CalendarClock className="h-4 w-4" />
                Schedule blocks
              </button>
            </Link>
            <Link href="/workspace">
              <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-secondary-foreground">
                <Inbox className="h-4 w-4" />
                Inbox {data.inboxCount}
              </button>
            </Link>
          </div>
        </section>

        <section className="bento-card p-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h2 className="font-black">Top priorities</h2>
            <span className="ml-auto text-xs text-muted-foreground">
              {priorities.length}/3
            </span>
          </div>
          <div className="mt-3 grid max-h-44 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-1">
            {data.unfinished.slice(0, 12).map((task) => {
              const selected = priorities.includes(task.title);
              return (
                <button
                  key={task.id}
                  onClick={() => togglePriority(task.title)}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left ${selected ? "border-primary bg-primary/10" : ""}`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? "bg-primary text-primary-foreground" : ""}`}
                  >
                    {selected && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold">
                    {task.title}
                  </span>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {task.priority}
                  </span>
                </button>
              );
            })}
            {!data.unfinished.length && (
              <p className="py-3 text-sm text-muted-foreground">
                No unfinished work to prioritize.
              </p>
            )}
          </div>
          <label className="mt-4 block text-xs font-black uppercase text-muted-foreground">
            Focus goal: {focusGoal} minutes
          </label>
          <input
            type="range"
            min={30}
            max={600}
            step={30}
            value={focusGoal}
            onChange={(event) => setFocusGoal(Number(event.target.value))}
            className="mt-2 w-full accent-[hsl(var(--primary))]"
          />
          <button
            onClick={finish}
            disabled={finishing || data.completedReview}
            className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-55"
          >
            {data.completedReview
              ? "Review completed"
              : finishing
                ? "Saving..."
                : "Complete review - +40 VP"}
          </button>
        </section>
      </div>

      {data.projects.length > 0 && (
        <section className="bento-card flex items-center gap-3 overflow-x-auto p-3">
          <div className="flex shrink-0 items-center gap-2 px-1 text-xs font-black uppercase text-muted-foreground">
            <FolderKanban className="h-4 w-4 text-primary" />
            Needs attention
          </div>
          {data.projects.slice(0, 6).map((project) => (
            <div
              key={project.id}
              className="min-w-40 rounded-lg border px-3 py-2"
            >
              <div className="flex justify-between gap-3 text-xs">
                <span className="max-w-28 truncate font-bold">
                  {project.name}
                </span>
                <span className="text-muted-foreground">
                  {project.progress}%
                </span>
              </div>
              <div className="mt-2 h-1 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bento-card flex items-center gap-3 p-3">
      <Icon className="h-4 w-4 text-primary" />
      <div>
        <p className="text-lg font-black leading-none">{value}</p>
        <p className="mt-1 text-[10px] font-bold uppercase text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}

function TaskSummary({
  title,
  tasks,
  empty,
  accent = false,
}: {
  title: string;
  tasks: Task[];
  empty: string;
  accent?: boolean;
}) {
  return (
    <div className={accent && tasks.length ? "text-secondary" : ""}>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black uppercase">{title}</h2>
        <span className="text-[10px] text-muted-foreground">
          {tasks.length}
        </span>
      </div>
      <div className="mt-2 space-y-1.5">
        {tasks.slice(0, 3).map((task) => (
          <div
            key={task.id}
            className="rounded-lg bg-muted/45 px-2.5 py-2 text-foreground"
          >
            <p className="truncate text-xs font-bold">{task.title}</p>
            {task.dueDate && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Due {new Date(`${task.dueDate}T12:00:00`).toLocaleDateString()}
              </p>
            )}
          </div>
        ))}
        {!tasks.length && (
          <p className="py-2 text-xs text-muted-foreground">{empty}</p>
        )}
        {tasks.length > 3 && (
          <p className="text-[10px] text-muted-foreground">
            +{tasks.length - 3} more
          </p>
        )}
      </div>
    </div>
  );
}
