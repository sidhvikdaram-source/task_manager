import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BatteryMedium, CalendarClock, Check, CheckCircle2, ChevronDown, Circle, ClipboardList, Clock3, FileCheck2, GraduationCap, GripVertical, House, Loader2, Square, SlidersHorizontal, Sparkles, Zap } from "lucide-react";
import { getListTasksQueryKey, useListTasks, type Task } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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

function DocumentTaskEntry({
  lane,
  workspaceMode,
  onCreated,
  noteValue,
  onNoteChange,
  onNoteSave,
  noteSaving,
}: {
  lane: Lane;
  workspaceMode: "school" | "personal";
  onCreated: () => void;
  noteValue: string;
  onNoteChange: (value: string) => void;
  onNoteSave: () => void;
  noteSaving: boolean;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [lineMode, setLineMode] = useState<"task" | "writing">("task");
  const taskInputRef = useRef<HTMLTextAreaElement>(null);
  const writingInputRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState<{ title?: string; dueDate?: string | null; subject?: string | null; priority?: string; estimatedMinutes?: number | null } | null>(null);
  const placeholder = lane === "tests"
    ? "Type a test or quiz, date, subject, and priority…"
    : lane === "personal"
      ? "Type a personal task with its date or priority…"
      : "Type an assignment, date, subject, and priority…";

  useEffect(() => {
    if (!text.trim()) { setPreview(null); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/quick-capture/preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            contextTaskKind: lane === "tests" ? "test" : lane === "personal" ? "task" : "assignment",
            contextWorkspace: workspaceMode,
          }),
          signal: controller.signal,
        });
        if (response.ok) setPreview(await response.json());
      } catch {
        if (!controller.signal.aborted) setPreview(null);
      }
    }, 160);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [lane, text, workspaceMode]);

  async function create() {
    if (!text.trim() || saving) return;
    const source = text.trim();
    setText("");
    setSaving(true);
    try {
      const response = await fetch("/api/quick-capture", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: source,
          contextTaskKind: lane === "tests" ? "test" : lane === "personal" ? "task" : "assignment",
          contextWorkspace: workspaceMode,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.task) throw new Error(data?.error ?? "Task could not be created");
      queryClient.setQueriesData<Task[]>({ queryKey: ["/api/tasks"] }, (current) => {
        if (!current || current.some((task) => task.id === data.task.id)) return current;
        return [...current, data.task];
      });
      onCreated();
      window.requestAnimationFrame(() => taskInputRef.current?.focus());
    } catch (error) {
      setText(source);
      window.requestAnimationFrame(() => taskInputRef.current?.focus());
      toast.error(error instanceof Error ? error.message : "Task could not be created");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-border/70 bg-background focus-within:bg-muted/[0.12]">
      {(noteValue || lineMode === "writing") && (
        <div className="group relative px-5 pb-3 pt-4">
          <textarea
            ref={writingInputRef}
            aria-label="Free writing"
            value={noteValue}
            onChange={(event) => onNoteChange(event.target.value)}
            onBlur={onNoteSave}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                onNoteSave();
                setLineMode("task");
                window.requestAnimationFrame(() => taskInputRef.current?.focus());
              }
            }}
            rows={lineMode === "writing" ? 4 : 2}
            placeholder="Write freely. This text stays as notes and is never parsed."
            className="min-h-16 w-full resize-y bg-transparent pl-7 pr-16 text-[15px] leading-7 outline-none [field-sizing:content] placeholder:text-muted-foreground/55"
          />
          <span className="absolute left-5 top-[1.15rem] select-none text-lg leading-7 text-muted-foreground/35">·</span>
          <span className="absolute right-5 top-4 text-[10px] font-bold text-muted-foreground/55">{noteSaving ? "Saving…" : "Notes"}</span>
        </div>
      )}
      {lineMode === "task" ? (
        <div className="flex items-start gap-3 px-4 py-3">
          <button type="button" aria-label="Current line will become a task" className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary" onClick={() => taskInputRef.current?.focus()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Square className="h-[18px] w-[18px]" />}
          </button>
          <textarea
            ref={taskInputRef}
            aria-label={`Add ${lane === "tests" ? "test or quiz" : "task"}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && text.length === 0) {
                event.preventDefault();
                setLineMode("writing");
                window.requestAnimationFrame(() => writingInputRef.current?.focus());
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void create();
              }
            }}
            rows={1}
            placeholder={placeholder}
            className="min-h-8 max-h-40 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-[15px] leading-6 outline-none [field-sizing:content] placeholder:text-muted-foreground/60"
          />
          <span className="mt-2 hidden shrink-0 text-[10px] font-bold text-muted-foreground/45 sm:block">Enter to add</span>
        </div>
      ) : (
        <div className="flex items-center justify-between border-t border-dashed px-5 py-2.5">
          <span className="text-[11px] text-muted-foreground">Writing normally · Ctrl + Enter starts a task</span>
          <button type="button" onClick={() => { onNoteSave(); setLineMode("task"); window.requestAnimationFrame(() => taskInputRef.current?.focus()); }} className="inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
            <Square className="h-3.5 w-3.5" /> Start a task line
          </button>
        </div>
      )}
      <AnimatePresence initial={false}>
        {lineMode === "task" && preview?.title && text.trim() && (
          <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center gap-1.5 border-t border-dashed bg-muted/20 px-12 py-2 text-[11px] text-muted-foreground">
            <span className="font-black text-foreground">{preview.title}</span>
            {preview.dueDate && <span className="rounded-md bg-background px-2 py-1">{preview.dueDate}</span>}
            {preview.subject && <span className="rounded-md bg-background px-2 py-1">{preview.subject}</span>}
            {preview.priority && <span className="rounded-md bg-background px-2 py-1 capitalize">{preview.priority}</span>}
            {preview.estimatedMinutes && <span className="rounded-md bg-background px-2 py-1">{preview.estimatedMinutes} min</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
  const [workspaceNotes, setWorkspaceNotes] = useState<Record<string, string>>({});
  const [savingNoteKey, setSavingNoteKey] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const { data: tasks = [] } = useListTasks({ sortBy: "priority" }, { query: { queryKey: getListTasksQueryKey({ sortBy: "priority" }) } });
  const { data: subjects = [] } = useSubjects();
  const { data: workspacePreferences } = useQuery({
    queryKey: ["task-workspace-preferences"],
    queryFn: async () => {
      const response = await fetch("/api/user/preferences", { credentials: "include" });
      if (!response.ok) throw new Error("Workspace notes could not be loaded");
      return response.json() as Promise<{ taskWorkspaceNotes?: Record<string, string> }>;
    },
  });
  const taskCompletion = useReliableTaskCompletion();
  const today = localDateKey(new Date());

  useEffect(() => { localStorage.setItem("velocity-task-views", JSON.stringify(enabledViews)); }, [enabledViews]);
  useEffect(() => {
    if (workspacePreferences?.taskWorkspaceNotes) setWorkspaceNotes(workspacePreferences.taskWorkspaceNotes);
  }, [workspacePreferences]);

  const notesKey = (lane: Lane) => `${workspaceMode}-${lane}`;
  async function saveWorkspaceNote(lane: Lane) {
    const key = notesKey(lane);
    setSavingNoteKey(key);
    try {
      const response = await fetch("/api/user/preferences", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskWorkspaceNotes: workspaceNotes }),
      });
      if (!response.ok) throw new Error("Notes could not be saved");
      queryClient.setQueryData(["task-workspace-preferences"], (current: { taskWorkspaceNotes?: Record<string, string> } | undefined) => ({ ...current, taskWorkspaceNotes: workspaceNotes }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Notes could not be saved");
    } finally {
      setSavingNoteKey(null);
    }
  }

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
    const nextTaskKind = lane === "tests" ? "test" : "task";
    const snapshots = queryClient.getQueriesData<Task[]>({ queryKey: ["/api/tasks"] });
    queryClient.setQueriesData<Task[]>({ queryKey: ["/api/tasks"] }, (current) =>
      current?.map((item) => item.id === taskId ? { ...item, taskKind: nextTaskKind } : item),
    );
    setDraggingTaskId(null); setDropTarget(null);
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskKind: nextTaskKind }),
    });
    if (!response.ok) {
      snapshots.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
      const data = await response.json().catch(() => null);
      toast.error(data?.error ?? "Task could not be moved");
    } else {
      void refreshTasks();
      toast.success(lane === "tests" ? "Moved to tests and quizzes" : "Moved to assignments and tasks");
    }
  }

  async function reorderTask(draggedId: number, targetId: number, placeAfter: boolean) {
    if (!draggedId || draggedId === targetId || view === "completed") return;
    const dragged = (tasks as WorkspaceTask[]).find((task) => task.id === draggedId);
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
    const listSnapshots = queryClient.getQueriesData<Task[]>({ queryKey: ["/api/tasks"] });
    const updateById = new Map(updates.map((update) => [update.id, update.data]));
    queryClient.setQueriesData<Task[]>({ queryKey: ["/api/tasks"] }, (current) =>
      current?.map((task) => {
        const change = updateById.get(task.id);
        return change ? { ...task, ...change } as Task : task;
      }),
    );
    setSortMode("manual");
    setDraggingTaskId(null);
    setDropTarget(null);
    const changedUpdates = updates.filter((update) => {
      const current = (tasks as WorkspaceTask[]).find((task) => task.id === update.id);
      return current?.sortOrder !== update.data.sortOrder || ("taskKind" in update.data && current?.taskKind !== update.data.taskKind);
    });
    const responses = await Promise.all(changedUpdates.map((update) => fetch(`/api/tasks/${update.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update.data),
    })));
    if (responses.some((response) => !response.ok)) {
      listSnapshots.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
      toast.error("Task order could not be saved");
    }
    else {
      void refreshTasks();
    }
  }

  function renderTask(task: WorkspaceTask) {
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
          const draggedId = Number(event.dataTransfer.getData("text/task-id")) || draggingTaskId;
          if (draggedId) void reorderTask(draggedId, task.id, event.clientY > bounds.top + bounds.height / 2);
        }}
        initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: draggingTaskId === task.id ? 0.45 : 1, y: 0, scale: draggingTaskId === task.id ? 0.985 : 1 }}
        transition={{ layout: { duration: 0.16 }, opacity: { duration: 0.12 } }} className="px-4 py-3.5 transition-colors hover:bg-muted/30">
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
      <section className={`min-w-0 overflow-hidden rounded-2xl border bg-card transition-[border-color,background-color] ${activeDrop ? "border-primary bg-primary/[0.035]" : ""}`}
        onDragOver={(event) => { if (view === "completed") return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(lane); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null); }}
        onDrop={(event) => { event.preventDefault(); const taskId = Number(event.dataTransfer.getData("text/task-id")); if (Number.isInteger(taskId)) void moveTask(taskId, lane); }}>
        <header className="border-b px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-black">{title}</h2><span className="text-xs font-bold tabular-nums text-muted-foreground">{columnTasks.length}</span></div><p className="truncate text-xs text-muted-foreground">{activeDrop ? "Release to move here" : description}</p></div>
          </div>
        </header>
        <div className="bg-background transition-colors focus-within:ring-1 focus-within:ring-inset focus-within:ring-primary/35">
          <div className="divide-y divide-border/70">{columnTasks.map(renderTask)}{columnTasks.length === 0 && (view === "completed" || activeDrop) && <p className="px-5 py-12 text-center text-sm text-muted-foreground">{activeDrop ? "Drop the task here." : `No completed ${title.toLowerCase()}.`}</p>}</div>
          {view !== "completed" && <DocumentTaskEntry lane={lane} workspaceMode={workspaceMode} onCreated={() => void refreshTasks()} noteValue={workspaceNotes[notesKey(lane)] ?? ""} onNoteChange={(value) => setWorkspaceNotes((current) => ({ ...current, [notesKey(lane)]: value }))} onNoteSave={() => void saveWorkspaceNote(lane)} noteSaving={savingNoteKey === notesKey(lane)} />}
        </div>
      </section>
    );
  }

  return (
    <div className="page-stack space-y-5 overflow-x-hidden">
      <header className="border-b pb-4 pt-1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <h1 className="tech-title text-3xl sm:text-4xl">Task workspace</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Write naturally, press Enter to make a task, or Backspace on an empty task line to keep writing.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
            <div className="flex rounded-xl border bg-muted/45 p-1" aria-label="Workspace mode">
              {(["school", "personal"] as const).map((mode) => {
                const Icon = mode === "school" ? GraduationCap : House;
                return <button key={mode} type="button" onClick={() => { setWorkspaceMode(mode); setView("all"); setRecommendation(null); }} className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-black capitalize transition-colors ${workspaceMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" />{mode}</button>;
              })}
            </div>
          </div>
        </div>
      </header>

      <section className="bento-card p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-full overflow-x-auto rounded-xl bg-muted/70 p-1">{(["all", "completed", ...enabledViews] as View[]).map((item) => <button key={item} type="button" onClick={() => setView(item)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${view === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{viewLabel(item)}</button>)}</div>
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <div className="relative"><Button type="button" variant="outline" size="sm" onClick={() => setViewsOpen((open) => !open)} className="h-10 rounded-xl gap-1.5"><SlidersHorizontal className="h-3.5 w-3.5" /> Views <ChevronDown className="h-3 w-3" /></Button><AnimatePresence>{viewsOpen && <motion.div initial={reduceMotion ? false : { opacity: 0, y: -5, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -3, scale: 0.98 }} className="absolute right-0 top-12 z-30 w-52 rounded-xl border bg-popover p-2 shadow-xl"><p className="px-2 pb-1 text-[10px] font-black uppercase text-muted-foreground">Task views</p>{optionalViews.map((item) => { const enabled = enabledViews.includes(item.id); return <button key={item.id} type="button" onClick={() => { setEnabledViews((current) => enabled ? current.filter((value) => value !== item.id) : [...current, item.id]); if (enabled && view === item.id) setView("all"); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold hover:bg-muted"><span className={`flex h-4 w-4 items-center justify-center rounded border ${enabled ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{enabled && <Check className="h-3 w-3" />}</span>{item.label}</button>; })}</motion.div>}</AnimatePresence></div>
            <label className="flex h-10 items-center gap-2 rounded-xl border bg-background px-3 text-xs font-bold text-muted-foreground"><SlidersHorizontal className="h-3.5 w-3.5" /><select aria-label="Organize tasks by" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="bg-transparent font-bold text-foreground outline-none"><option value="manual">Manual order</option><option value="dueDate">Due date</option><option value="importance">Importance</option></select></label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <label className="flex h-10 min-w-28 items-center gap-2 rounded-xl border bg-background px-3"><Clock3 className="h-4 w-4 text-primary" /><select aria-label="Available time" value={availableMinutes} onChange={(event) => { setAvailableMinutes(Number(event.target.value)); setRecommendation(null); }} className="min-w-0 flex-1 bg-transparent text-sm font-bold text-foreground outline-none">{[10, 20, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}</select></label>
          <label className="flex h-10 min-w-36 items-center gap-2 rounded-xl border bg-background px-3"><BatteryMedium className="h-4 w-4 text-primary" /><select aria-label="Energy level" value={energy} onChange={(event) => { setEnergy(event.target.value as typeof energy); setRecommendation(null); }} className="min-w-0 flex-1 bg-transparent text-sm font-bold text-foreground outline-none"><option value="low">Low energy</option><option value="medium">Medium energy</option><option value="high">High energy</option></select></label>
          <Button type="button" onClick={() => void recommendNext()} disabled={recommendationLoading} className="h-10 rounded-xl px-4">{recommendationLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Recommend next</Button>
          <span className="hidden text-xs text-muted-foreground lg:inline">Matches time, energy, urgency, and priority.</span>
        </div>
        {recommendation && <div className="mt-3 flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3 sm:flex-row sm:items-center"><button type="button" disabled={!recommendation.recommendation} onClick={() => recommendation.recommendation && setSelectedId(recommendation.recommendation.id)} className="min-w-0 flex-1 text-left disabled:cursor-default"><p className="text-sm font-black text-primary">{recommendation.recommendation?.title ?? "No task fits right now"}</p><p className="mt-0.5 text-xs text-muted-foreground">{recommendation.reason}</p></button><Button variant="ghost" size="sm" onClick={() => void recommendNext()}>Refresh</Button></div>}
      </section>

      {workspaceMode === "school" ? (
        <div className="grid grid-flow-dense items-start gap-5 xl:grid-cols-2">{taskColumn("Tests & quizzes", "Assessments, exams, and study checkpoints", tests, FileCheck2, "tests")}{taskColumn("Assignments & tasks", "Homework, projects, and everyday school work", assignments, ClipboardList, "assignments")}</div>
      ) : (
        <div className="grid grid-flow-dense">{taskColumn("Personal tasks", "Home, errands, routines, and everything outside school", visible, House, "personal")}</div>
      )}
      {selectedId !== null && <TaskDetailsModal taskId={selectedId} open onOpenChange={(open) => !open && setSelectedId(null)} />}
    </div>
  );
}
