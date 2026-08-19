import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BatteryMedium, CalendarClock, Check, CheckCircle2, ChevronDown, Circle, ClipboardList, Clock3, FileCheck2, GraduationCap, GripVertical, House, ListTodo, Loader2, Plus, SlidersHorizontal, Sparkles, Zap } from "lucide-react";
import { getListTasksQueryKey, useListTasks, type Task } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreateTaskModal } from "@/components/CreateTaskModal";
import { QuickCapture } from "@/components/QuickCapture";
import { TaskDetailsModal } from "@/components/TaskDetailsModal";
import { TaskInlineNotes } from "@/components/TaskInlineNotes";
import { Button } from "@/components/ui/button";
import { useReliableTaskCompletion } from "@/hooks/useReliableTaskCompletion";
import { subjectColor, useSubjects } from "@/hooks/useSubjects";
import { localDateKey } from "@/lib/localDate";

type SortMode = "manual" | "dueDate" | "importance";
type View = "all" | "completed" | "today" | "overdue" | "week" | "high" | "no-date" | "canvas";
type OptionalView = Exclude<View, "all" | "completed">;
type Lane = "tests" | "assignments" | "personal";
type Recommendation = { recommendation: Task | null; reason: string };
type WorkspaceTask = Task & {
  sortOrder?: number;
  workspaceContext?: "school" | "personal";
};

const priorityRank: Record<Task["priority"], number> = { critical: 0, high: 1, medium: 2, low: 3 };
const optionalViews: Array<{ id: OptionalView; label: string }> = [
  { id: "today", label: "Today" }, { id: "overdue", label: "Overdue" },
  { id: "week", label: "This week" }, { id: "high", label: "High priority" },
  { id: "no-date", label: "No due date" }, { id: "canvas", label: "Canvas" },
];

function taskDate(task: WorkspaceTask) { return task.dueDate || task.calendarDate; }
function isTestTask(task: WorkspaceTask) {
  const kind = String(task.taskKind ?? "").toLowerCase();
  if (kind === "task") return false;
  return ["test", "quiz", "exam", "assessment"].includes(kind) || /\b(test|quiz|exam|midterm|final|assessment)\b/i.test(task.title);
}
function sortTasks(tasks: WorkspaceTask[], mode: SortMode) {
  return [...tasks].sort((a, b) => {
    if (mode === "manual") {
      const orderDifference = (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id);
      if (orderDifference !== 0) return orderDifference;
    }
    const dueA = taskDate(a) ?? "9999-12-31";
    const dueB = taskDate(b) ?? "9999-12-31";
    if (mode === "importance") {
      const difference = priorityRank[a.priority] - priorityRank[b.priority];
      if (difference !== 0) return difference;
    }
    return dueA.localeCompare(dueB) || priorityRank[a.priority] - priorityRank[b.priority];
  });
}
function viewLabel(view: View) {
  return optionalViews.find((option) => option.id === view)?.label ?? (view === "all" ? "All active" : "Completed");
}

export default function Tasks() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("all");
  const [sortMode, setSortMode] = useState<SortMode>("dueDate");
  const [workspaceMode, setWorkspaceMode] = useState<"school" | "personal">("school");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [enabledViews, setEnabledViews] = useState<OptionalView[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("velocity-task-views") ?? "[]");
      return Array.isArray(saved) ? saved.filter((value): value is OptionalView => optionalViews.some((item) => item.id === value)) : [];
    } catch { return []; }
  });
  const [availableMinutes, setAvailableMinutes] = useState(30);
  const [energy, setEnergy] = useState<"low" | "medium" | "high">("medium");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<Lane | null>(null);
  const reduceMotion = useReducedMotion();
  const { data: tasks = [] } = useListTasks({ sortBy: "priority" }, { query: { queryKey: getListTasksQueryKey({ sortBy: "priority" }) } });
  const { data: subjects = [] } = useSubjects();
  const taskCompletion = useReliableTaskCompletion();
  const today = localDateKey(new Date());

  useEffect(() => { localStorage.setItem("velocity-task-views", JSON.stringify(enabledViews)); }, [enabledViews]);

  const visible = useMemo(() => {
    const completed = view === "completed";
    let filtered = (tasks as WorkspaceTask[]).filter((task) => {
      const inferredContext = task.workspaceContext ?? (/^(personal|home|errands?)$/i.test(task.subject ?? "") ? "personal" : "school");
      return inferredContext === workspaceMode && (completed ? task.status === "completed" : task.status !== "completed");
    });
    if (!completed && view !== "all") {
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);
      const endKey = localDateKey(weekEnd);
      filtered = filtered.filter((task) => {
        const date = taskDate(task);
        if (view === "today") return !date || date <= today;
        if (view === "overdue") return Boolean(date && date < today);
        if (view === "week") return Boolean(date && date >= today && date <= endKey);
        if (view === "high") return task.priority === "critical" || task.priority === "high";
        if (view === "no-date") return !date;
        return task.externalSource?.startsWith("canvas");
      });
    }
    return sortTasks(filtered, sortMode);
  }, [sortMode, tasks, today, view, workspaceMode]);
  const tests = visible.filter(isTestTask);
  const assignments = visible.filter((task) => !isTestTask(task));

  async function refreshTasks() { await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }); }
  async function recommendNext() {
    setRecommendationLoading(true);
    try {
      const response = await fetch(`/api/recommendations/next?minutes=${availableMinutes}&energy=${energy}&workspace=${workspaceMode}`, { credentials: "include" });
      const data = (await response.json()) as Recommendation & { error?: string };
      if (!response.ok) throw new Error(data.error || "Recommendation failed");
      setRecommendation(data);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not recommend a task"); }
    finally { setRecommendationLoading(false); }
  }
  async function moveTask(taskId: number, lane: Lane) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || view === "completed" || lane === "personal") return;
    if ((lane === "tests") === isTestTask(task)) { setDropTarget(null); return; }
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskKind: lane === "tests" ? "test" : "task" }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      toast.error(data?.error ?? "Task could not be moved");
    } else {
      await refreshTasks();
      toast.success(lane === "tests" ? "Moved to tests and quizzes" : "Moved to assignments and tasks");
    }
    setDraggingTaskId(null); setDropTarget(null);
  }

  async function reorderTask(targetId: number, placeAfter: boolean) {
    if (!draggingTaskId || draggingTaskId === targetId || view === "completed") return;
    const dragged = (tasks as WorkspaceTask[]).find((task) => task.id === draggingTaskId);
    const target = (tasks as WorkspaceTask[]).find((task) => task.id === targetId);
    if (!dragged || !target) return;
    const targetLane: Lane = workspaceMode === "personal" ? "personal" : isTestTask(target) ? "tests" : "assignments";
    const laneTasks = (targetLane === "tests" ? tests : targetLane === "assignments" ? assignments : visible)
      .filter((task) => task.id !== dragged.id);
    const targetIndex = Math.max(0, laneTasks.findIndex((task) => task.id === targetId));
    laneTasks.splice(targetIndex + (placeAfter ? 1 : 0), 0, dragged);
    const updates = laneTasks.map((task, index) => ({
      id: task.id,
      data: {
        sortOrder: (index + 1) * 100,
        ...(task.id === dragged.id && targetLane !== "personal"
          ? { taskKind: targetLane === "tests" ? "test" : "task" }
          : {}),
      },
    }));
    const responses = await Promise.all(updates.map((update) => fetch(`/api/tasks/${update.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update.data),
    })));
    if (responses.some((response) => !response.ok)) toast.error("Task order could not be saved");
    else {
      setSortMode("manual");
      await refreshTasks();
    }
    setDraggingTaskId(null);
    setDropTarget(null);
  }

  function renderTask(task: WorkspaceTask, index: number) {
    const color = subjectColor(task.subject, subjects);
    const date = taskDate(task);
    const completed = view === "completed";
    return (
      <motion.article layout key={task.id} draggable={!completed}
        onDragStartCapture={(event) => { event.dataTransfer.setData("text/task-id", String(task.id)); event.dataTransfer.effectAllowed = "move"; setDraggingTaskId(task.id); }}
        onDragEndCapture={() => { setDraggingTaskId(null); setDropTarget(null); }}
        onDragOverCapture={(event) => { if (!completed) event.preventDefault(); }}
        onDropCapture={(event) => {
          if (completed) return;
          event.preventDefault();
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          void reorderTask(task.id, event.clientY > bounds.top + bounds.height / 2);
        }}
        initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: draggingTaskId === task.id ? 0.45 : 1, y: 0, scale: draggingTaskId === task.id ? 0.985 : 1 }}
        transition={{ duration: 0.18, delay: Math.min(index * 0.02, 0.1) }} className="px-4 py-3.5 transition-colors hover:bg-muted/30">
        <div className="flex items-start gap-3">
          {!completed && <GripVertical aria-hidden className="mt-3 h-4 w-4 shrink-0 cursor-grab text-muted-foreground/55 active:cursor-grabbing" />}
          {!completed ? (
            <button type="button" aria-label={`Complete ${task.title}`} disabled={taskCompletion.isPending(task.id)} className="-ml-2 flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-70" onClick={(event) => void taskCompletion.complete(task, event.currentTarget)}>
              {taskCompletion.isPending(task.id) ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Circle className="h-6 w-6" />}
            </button>
          ) : <div className="flex h-11 w-11 shrink-0 items-center justify-center"><CheckCircle2 className="h-6 w-6 text-primary" /></div>}
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => setSelectedId(task.id)} className="block w-full text-left">
              <p className="truncate font-bold" style={{ color: completed ? undefined : color }}>{task.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{date ? new Date(`${date}T12:00:00`).toLocaleDateString() : "No deadline"}</span>
                {task.subject && <span style={{ color }}>{task.subject}</span>}
                {task.priority !== "medium" && <span className="capitalize">{task.priority}</span>}
                <span className="inline-flex items-center gap-1"><Zap className="h-3 w-3 fill-current" /> {task.vpValue} NP</span>
              </div>
            </button>
            <TaskInlineNotes taskId={task.id} taskTitle={task.title} notes={task.notes} compact />
          </div>
        </div>
      </motion.article>
    );
  }

  function taskColumn(title: string, description: string, columnTasks: WorkspaceTask[], icon: typeof FileCheck2, lane: Lane) {
    const Icon = icon;
    const activeDrop = dropTarget === lane && draggingTaskId !== null;
    return (
      <section className={`bento-card min-w-0 overflow-hidden transition-[border-color,background-color] ${activeDrop ? "border-primary bg-primary/[0.035]" : ""}`}
        onDragOver={(event) => { if (view === "completed") return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(lane); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null); }}
        onDrop={(event) => { event.preventDefault(); const taskId = Number(event.dataTransfer.getData("text/task-id")); if (Number.isInteger(taskId)) void moveTask(taskId, lane); }}>
        <header className="border-b px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-black">{title}</h2><span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">{columnTasks.length}</span></div><p className="truncate text-xs text-muted-foreground">{activeDrop ? "Release to move here" : description}</p></div>
          </div>
          {view !== "completed" && (
            <QuickCapture
              compact
              contextTaskKind={lane === "tests" ? "test" : lane === "personal" ? "task" : "assignment"}
              contextWorkspace={workspaceMode}
              placeholder={lane === "tests" ? "Add a test or quiz..." : lane === "personal" ? "Add a personal task..." : "Add an assignment or task..."}
              onCreated={() => void refreshTasks()}
            />
          )}
        </header>
        <div className="divide-y divide-border/70">{columnTasks.map(renderTask)}{columnTasks.length === 0 && <p className="px-5 py-12 text-center text-sm text-muted-foreground">{activeDrop ? "Drop the task here." : `No ${view === "completed" ? "completed" : "active"} ${title.toLowerCase()}.`}</p>}</div>
      </section>
    );
  }

  return (
    <div className="page-stack space-y-5 overflow-x-hidden">
      <section className="bento-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex max-w-2xl items-start gap-4">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary shadow-[inset_0_1px_0_hsl(var(--foreground)/0.06)]">
              <ListTodo className="h-5 w-5" />
              <span className="absolute bottom-2 right-2 h-1.5 w-1.5 rounded-full bg-secondary" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-primary">Task workspace</p>
              <h1 className="tech-title mt-1 text-3xl sm:text-4xl">Plan by deadline. Act by importance.</h1>
              <p className="mt-2 text-sm text-muted-foreground">Capture work in place, compare workloads, or drag a task to the lane where it belongs.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
            <div className="flex rounded-xl border bg-muted/45 p-1" aria-label="Workspace mode">
              {(["school", "personal"] as const).map((mode) => {
                const Icon = mode === "school" ? GraduationCap : House;
                return <button key={mode} type="button" onClick={() => { setWorkspaceMode(mode); setView("all"); setRecommendation(null); }} className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-black capitalize transition-colors ${workspaceMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" />{mode}</button>;
              })}
            </div>
            <Button onClick={() => setCreateOpen(true)} className="h-11 rounded-xl bg-secondary px-5 text-secondary-foreground"><Plus className="mr-2 h-4 w-4" /> New task</Button>
          </div>
        </div>
      </section>

      <section className="bento-card p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-full overflow-x-auto rounded-xl bg-muted/70 p-1">{(["all", "completed", ...enabledViews] as View[]).map((item) => <button key={item} type="button" onClick={() => setView(item)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${view === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{viewLabel(item)}</button>)}</div>
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <div className="relative"><Button type="button" variant="outline" size="sm" onClick={() => setViewsOpen((open) => !open)} className="h-10 rounded-xl gap-1.5"><SlidersHorizontal className="h-3.5 w-3.5" /> Views <ChevronDown className="h-3 w-3" /></Button><AnimatePresence>{viewsOpen && <motion.div initial={reduceMotion ? false : { opacity: 0, y: -5, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -3, scale: 0.98 }} className="absolute right-0 top-12 z-30 w-52 rounded-xl border bg-popover p-2 shadow-xl"><p className="px-2 pb-1 text-[10px] font-black uppercase text-muted-foreground">Task views</p>{optionalViews.map((item) => { const enabled = enabledViews.includes(item.id); return <button key={item.id} type="button" onClick={() => { setEnabledViews((current) => enabled ? current.filter((value) => value !== item.id) : [...current, item.id]); if (enabled && view === item.id) setView("all"); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold hover:bg-muted"><span className={`flex h-4 w-4 items-center justify-center rounded border ${enabled ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{enabled && <Check className="h-3 w-3" />}</span>{item.label}</button>; })}</motion.div>}</AnimatePresence></div>
            <label className="flex h-10 items-center gap-2 rounded-xl border bg-background px-3 text-xs font-bold text-muted-foreground"><SlidersHorizontal className="h-3.5 w-3.5" /><select aria-label="Organize tasks by" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="bg-transparent font-bold text-foreground outline-none"><option value="manual">Manual order</option><option value="dueDate">Due date</option><option value="importance">Importance</option></select></label>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-3 lg:flex-row lg:items-end">
          <div className="hidden min-w-0 flex-1 items-center gap-3 lg:flex">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></div>
            <div><p className="text-sm font-black">Find the right next task</p><p className="text-xs text-muted-foreground">Nimbus balances time, energy, urgency, and priority.</p></div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
            <label className="min-w-0"><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-muted-foreground">Time available</span><span className="flex h-11 items-center gap-2 rounded-xl border bg-background px-3"><Clock3 className="h-4 w-4 text-primary" /><select aria-label="Available time" value={availableMinutes} onChange={(event) => { setAvailableMinutes(Number(event.target.value)); setRecommendation(null); }} className="min-w-0 flex-1 bg-transparent text-sm font-bold text-foreground outline-none">{[10, 20, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}</select></span></label>
            <label className="min-w-0"><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-muted-foreground">Energy</span><span className="flex h-11 items-center gap-2 rounded-xl border bg-background px-3"><BatteryMedium className="h-4 w-4 text-primary" /><select aria-label="Energy level" value={energy} onChange={(event) => { setEnergy(event.target.value as typeof energy); setRecommendation(null); }} className="min-w-0 flex-1 bg-transparent text-sm font-bold text-foreground outline-none"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></span></label>
            <Button type="button" onClick={() => void recommendNext()} disabled={recommendationLoading} className="col-span-2 h-11 rounded-xl px-5 sm:col-span-1">{recommendationLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Recommend next</Button>
          </div>
        </div>
        {recommendation && <div className="mt-3 flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3 sm:flex-row sm:items-center"><button type="button" disabled={!recommendation.recommendation} onClick={() => recommendation.recommendation && setSelectedId(recommendation.recommendation.id)} className="min-w-0 flex-1 text-left disabled:cursor-default"><p className="text-sm font-black text-primary">{recommendation.recommendation?.title ?? "No task fits right now"}</p><p className="mt-0.5 text-xs text-muted-foreground">{recommendation.reason}</p></button><Button variant="ghost" size="sm" onClick={() => void recommendNext()}>Refresh</Button></div>}
      </section>

      {workspaceMode === "school" ? (
        <div className="grid grid-flow-dense items-start gap-5 xl:grid-cols-2">{taskColumn("Tests & quizzes", "Assessments, exams, and study checkpoints", tests, FileCheck2, "tests")}{taskColumn("Assignments & tasks", "Homework, projects, and everyday school work", assignments, ClipboardList, "assignments")}</div>
      ) : (
        <div className="grid grid-flow-dense">{taskColumn("Personal tasks", "Home, errands, routines, and everything outside school", visible, House, "personal")}</div>
      )}
      <CreateTaskModal open={createOpen} onOpenChange={setCreateOpen} defaultWorkspaceContext={workspaceMode} />
      {selectedId !== null && <TaskDetailsModal taskId={selectedId} open onOpenChange={(open) => !open && setSelectedId(null)} />}
    </div>
  );
}
