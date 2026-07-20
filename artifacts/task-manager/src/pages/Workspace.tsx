import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock3,
  Inbox,
  Lightbulb,
  ListFilter,
  Loader2,
  Plus,
  Sparkles,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { TaskDetailsModal } from "@/components/TaskDetailsModal";

type WorkTask = {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  calendarDate: string | null;
  estimatedMinutes: number | null;
  subject: string | null;
  taskKind: string;
  difficulty: number;
  blocked: boolean;
  organized: boolean;
  vpValue: number;
  externalSource?: string | null;
};
type ViewId =
  | "today"
  | "tomorrow"
  | "week"
  | "overdue"
  | "upcoming"
  | "high"
  | "nodate"
  | "blocked"
  | "completed"
  | "inbox"
  | "focus";
const views: Array<{ id: ViewId; label: string }> = [
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "week", label: "This Week" },
  { id: "overdue", label: "Overdue" },
  { id: "upcoming", label: "Upcoming" },
  { id: "high", label: "High Priority" },
  { id: "nodate", label: "No Due Date" },
  { id: "blocked", label: "Waiting / Blocked" },
  { id: "completed", label: "Completed" },
  { id: "inbox", label: "Inbox" },
  { id: "focus", label: "Focus Mode" },
];
const dateKey = (date: Date) => date.toISOString().slice(0, 10);

function canvasCategoryLabel(taskKind: string) {
  if (taskKind === "test" || taskKind === "quiz") return "Quiz / Test";
  if (taskKind === "meeting") return "Meeting";
  if (taskKind === "class_event") return "Class Event";
  if (taskKind === "deadline") return "Deadline";
  return "Other";
}

export default function Workspace() {
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [view, setView] = useState<ViewId>("today");
  const [selected, setSelected] = useState<number | null>(null);
  const [capture, setCapture] = useState("");
  const [captureDate, setCaptureDate] = useState("");
  const [capturePriority, setCapturePriority] = useState("medium");
  const [captureSubject, setCaptureSubject] = useState("");
  const [subjects, setSubjects] = useState<Array<{ id: number; name: string }>>(
    [],
  );
  const [minutes, setMinutes] = useState(30);
  const [energy, setEnergy] = useState("medium");
  const [recommendation, setRecommendation] = useState<{
    recommendation: WorkTask | null;
    reason: string;
  } | null>(null);
  const [recommending, setRecommending] = useState(false);
  const load = async () => {
    const response = await fetch("/api/tasks?sortBy=dueDate", {
      credentials: "include",
    });
    if (response.ok) setTasks(await response.json());
  };
  useEffect(() => {
    void load();
    fetch("/api/subjects", { credentials: "include" })
      .then((response) => response.json())
      .then(setSubjects)
      .catch(() => undefined);
  }, []);
  const today = dateKey(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = dateKey(tomorrowDate);
  const weekEndDate = new Date();
  weekEndDate.setDate(weekEndDate.getDate() + 7);
  const weekEnd = dateKey(weekEndDate);
  const matches = (task: WorkTask, id: ViewId) => {
    const active = task.status !== "completed";
    if (id === "today")
      return active && (task.calendarDate === today || task.dueDate === today);
    if (id === "tomorrow")
      return (
        active && (task.calendarDate === tomorrow || task.dueDate === tomorrow)
      );
    if (id === "week")
      return (
        active &&
        !!task.dueDate &&
        task.dueDate >= today &&
        task.dueDate <= weekEnd
      );
    if (id === "overdue")
      return active && !!task.dueDate && task.dueDate < today;
    if (id === "upcoming")
      return active && !!task.dueDate && task.dueDate > weekEnd;
    if (id === "high")
      return active && ["critical", "high"].includes(task.priority);
    if (id === "nodate") return active && !task.dueDate && !task.calendarDate;
    if (id === "blocked") return active && task.blocked;
    if (id === "completed") return !active;
    if (id === "inbox") return active && !task.organized;
    return active && !task.blocked;
  };
  const visible = useMemo(
    () => tasks.filter((task) => matches(task, view)),
    [tasks, view, today, tomorrow, weekEnd],
  );
  const captureTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!capture.trim()) return;
    const response = await fetch("/api/inbox/capture", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: capture,
        dueDate: captureDate || null,
        priority: capturePriority,
        subject: captureSubject || null,
      }),
    });
    if (response.ok) {
      setCapture("");
      setCaptureDate("");
      await load();
      toast.success("Captured to Inbox");
    }
  };
  const complete = async (id: number) => {
    const response = await fetch(`/api/tasks/${id}/complete`, {
      method: "POST",
      credentials: "include",
    });
    if (response.ok) {
      await load();
      toast.success("Task complete");
      return;
    }
    const data = await response.json().catch(() => null);
    toast.error(data?.error ?? "Could not complete this task.");
  };
  const organize = async (id: number) => {
    await fetch(`/api/inbox/${id}/organize`, {
      method: "PATCH",
      credentials: "include",
    });
    await load();
  };
  const recommend = async () => {
    setRecommending(true);
    try {
      const response = await fetch(
        `/api/recommendations/next?minutes=${minutes}&energy=${energy}`,
        { credentials: "include" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not create a recommendation.");
      setRecommendation(data);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create a recommendation.",
      );
    } finally {
      setRecommending(false);
    }
  };
  return (
    <div className="space-y-5">
      <section className="bento-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-primary">
              Personal workspace
            </p>
            <h1 className="tech-title mt-1 text-3xl">Plan and execute</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Smart lists, Inbox capture, and deterministic next-step guidance.
            </p>
          </div>
          <form
            onSubmit={captureTask}
            className="flex min-w-0 flex-1 flex-wrap gap-2 lg:max-w-3xl"
          >
            <input
              value={capture}
              onChange={(e) => setCapture(e.target.value)}
              placeholder="Quick capture a task"
              className="min-w-[220px] flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              type="date"
              value={captureDate}
              onChange={(e) => setCaptureDate(e.target.value)}
              className="rounded-xl border bg-background px-2 text-sm"
            />
            <select
              value={captureSubject}
              onChange={(e) => setCaptureSubject(e.target.value)}
              className="rounded-xl border bg-background px-2 text-sm"
            >
              <option value="">No subject</option>
              {subjects.map((subject) => (
                <option key={subject.id}>{subject.name}</option>
              ))}
            </select>
            <select
              value={capturePriority}
              onChange={(e) => setCapturePriority(e.target.value)}
              className="rounded-xl border bg-background px-2 text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <button className="rounded-xl bg-primary p-2.5 text-primary-foreground">
              <Plus className="h-4 w-4" />
            </button>
          </form>
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)_300px]">
        <aside className="bento-card self-start overflow-hidden">
          <div className="border-b p-3 text-xs font-black uppercase text-muted-foreground">
            Smart views
          </div>
          {views.map((item) => {
            const count = tasks.filter((task) => matches(task, item.id)).length;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm ${view === item.id ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
              >
                <span>{item.label}</span>
                <span
                  className={`rounded-md px-1.5 text-[10px] ${view === item.id ? "bg-white/20" : "bg-muted"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </aside>
        <section className="bento-card overflow-hidden">
          <header className="flex items-center justify-between border-b p-4">
            <div>
              <h2 className="text-lg font-black">
                {views.find((item) => item.id === view)?.label}
              </h2>
              <p className="text-xs text-muted-foreground">
                {visible.length} task{visible.length === 1 ? "" : "s"}
              </p>
            </div>
            <ListFilter className="h-4 w-4 text-muted-foreground" />
          </header>
          <div className="divide-y">
            {visible.map((task, index) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                onClick={() => setSelected(task.id)}
                className="group flex cursor-pointer items-center gap-3 p-4 hover:bg-muted/40"
              >
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    void complete(task.id);
                  }}
                  disabled={
                    task.status === "completed" || task.externalSource === "canvas"
                  }
                  title={
                    task.externalSource === "canvas"
                      ? "Canvas updates this assignment when it is submitted or graded"
                      : "Mark task complete"
                  }
                  className="text-muted-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {task.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold">{task.title}</p>
                    {task.blocked && (
                      <span className="rounded bg-secondary/15 px-1.5 text-[10px] font-bold text-secondary">
                        Blocked
                      </span>
                    )}
                    {task.externalSource?.startsWith("canvas") && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        Canvas · {canvasCategoryLabel(task.taskKind)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    {task.subject && <span>{task.subject}</span>}
                    <span>{task.estimatedMinutes ?? 30} min</span>
                    {task.dueDate && (
                      <span>
                        Due{" "}
                        {new Date(
                          `${task.dueDate}T12:00:00`,
                        ).toLocaleDateString()}
                      </span>
                    )}
                    <span>Difficulty {task.difficulty}/3</span>
                  </div>
                </div>
                <span className="rounded-lg bg-primary/10 px-2 py-1 text-xs font-black text-primary">
                  {task.priority}
                </span>
                {view === "inbox" && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      void organize(task.id);
                    }}
                    className="rounded-lg border px-2 py-1 text-xs font-bold"
                  >
                    Organized
                  </button>
                )}
              </motion.div>
            ))}
            {visible.length === 0 && (
              <div className="p-12 text-center">
                <Inbox className="mx-auto h-7 w-7 text-primary" />
                <p className="mt-3 font-bold">Nothing here</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This smart view updates automatically as tasks change.
                </p>
              </div>
            )}
          </div>
        </section>
        <aside className="bento-card self-start p-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            <h2 className="font-black">What should I do next?</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Uses due date, priority, duration, difficulty, blocked state, and
            energy.
          </p>
          <div className="mt-4">
            <p className="mb-2 text-xs font-bold text-muted-foreground">
              Available time
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {[10, 20, 30, 45, 60].map((value) => (
                <button
                  key={value}
                  onClick={() => setMinutes(value)}
                  className={`rounded-lg px-2 py-2 text-xs font-bold ${minutes === value ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {value}m
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs font-bold text-muted-foreground">
              Energy
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {["low", "medium", "high"].map((value) => (
                <button
                  key={value}
                  onClick={() => setEnergy(value)}
                  className={`rounded-lg px-2 py-2 text-xs font-bold capitalize ${energy === value ? "bg-secondary text-secondary-foreground" : "bg-muted"}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={recommend}
            disabled={recommending}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-60"
          >
            {recommending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {recommending ? "Ranking tasks" : "Recommend"}
          </button>
          {recommendation && (
            <div className="mt-4 rounded-xl border border-primary/30 bg-primary/8 p-3">
              <p className="text-sm font-semibold leading-relaxed">
                {recommendation.reason}
              </p>
              {recommendation.recommendation && (
                <button
                  onClick={() => setSelected(recommendation.recommendation!.id)}
                  className="mt-3 text-xs font-black text-primary"
                >
                  Open task
                </button>
              )}
            </div>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            Low energy only changes matching. It never reduces VP or streaks.
          </p>
        </aside>
      </div>
      {selected !== null && (
        <TaskDetailsModal
          taskId={selected}
          open
          onOpenChange={(open) => !open && setSelected(null)}
        />
      )}
    </div>
  );
}
