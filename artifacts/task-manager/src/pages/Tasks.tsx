import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  ClipboardList,
  FileCheck2,
  ListTodo,
  Loader2,
  Plus,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import {
  getListTasksQueryKey,
  useListTasks,
  type Task,
} from "@workspace/api-client-react";
import { CreateTaskModal } from "@/components/CreateTaskModal";
import { TaskDetailsModal } from "@/components/TaskDetailsModal";
import { TaskInlineNotes } from "@/components/TaskInlineNotes";
import { Button } from "@/components/ui/button";
import { useReliableTaskCompletion } from "@/hooks/useReliableTaskCompletion";
import { subjectColor, useSubjects } from "@/hooks/useSubjects";

type SortMode = "dueDate" | "importance";

const priorityRank: Record<Task["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function isTestTask(task: Task) {
  return (
    ["test", "quiz", "exam", "assessment"].includes(
      String(task.taskKind ?? "").toLowerCase(),
    ) || /\b(test|quiz|exam|midterm|final|assessment)\b/i.test(task.title)
  );
}

function sortTasks(tasks: Task[], mode: SortMode) {
  return [...tasks].sort((a, b) => {
    const dueA = a.dueDate ?? a.calendarDate ?? "9999-12-31";
    const dueB = b.dueDate ?? b.calendarDate ?? "9999-12-31";
    if (mode === "importance") {
      const priorityDifference =
        priorityRank[a.priority] - priorityRank[b.priority];
      if (priorityDifference !== 0) return priorityDifference;
    }
    const dueDifference = dueA.localeCompare(dueB);
    if (dueDifference !== 0) return dueDifference;
    return priorityRank[a.priority] - priorityRank[b.priority];
  });
}

export default function Tasks() {
  const [status, setStatus] = useState<"active" | "completed">("active");
  const [sortMode, setSortMode] = useState<SortMode>("dueDate");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();
  const { data: tasks = [] } = useListTasks(
    { sortBy: "priority" },
    { query: { queryKey: getListTasksQueryKey({ sortBy: "priority" }) } },
  );
  const { data: subjects = [] } = useSubjects();
  const taskCompletion = useReliableTaskCompletion();
  const visible = useMemo(
    () =>
      sortTasks(
        tasks.filter((task) =>
          status === "completed"
            ? task.status === "completed"
            : task.status !== "completed",
        ),
        sortMode,
      ),
    [sortMode, status, tasks],
  );
  const tests = visible.filter(isTestTask);
  const assignments = visible.filter((task) => !isTestTask(task));

  function renderTask(task: Task, index: number) {
    const color = subjectColor(task.subject, subjects);
    const date = task.dueDate ?? task.calendarDate;
    return (
      <motion.article
        layout
        key={task.id}
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, delay: Math.min(index * 0.02, 0.1) }}
        className="px-4 py-3.5 transition-colors hover:bg-muted/30"
      >
        <div className="flex items-start gap-3">
          {status === "active" ? (
            <button
              type="button"
              aria-label={`Complete ${task.title}`}
              disabled={taskCompletion.isPending(task.id)}
              className="-ml-2 flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-70"
              onClick={(event) =>
                void taskCompletion.complete(task, event.currentTarget)
              }
            >
              {taskCompletion.isPending(task.id) ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                <Circle className="h-6 w-6" />
              )}
            </button>
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setSelectedId(task.id)}
              className="block w-full text-left"
            >
              <p
                className="truncate font-bold"
                style={{ color: status === "active" ? color : undefined }}
              >
                {task.title}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {date
                    ? new Date(`${date}T12:00:00`).toLocaleDateString()
                    : "No deadline"}
                </span>
                {task.subject && <span style={{ color }}>{task.subject}</span>}
                {task.priority !== "medium" && (
                  <span className="capitalize">{task.priority}</span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Zap className="h-3 w-3 fill-current" /> {task.vpValue} NP
                </span>
              </div>
            </button>
            <TaskInlineNotes
              taskId={task.id}
              taskTitle={task.title}
              notes={task.notes}
              compact
            />
          </div>
        </div>
      </motion.article>
    );
  }

  function taskColumn(
    title: string,
    description: string,
    columnTasks: Task[],
    icon: typeof FileCheck2,
  ) {
    const Icon = icon;
    return (
      <section className="bento-card min-w-0 overflow-hidden">
        <header className="flex items-center gap-3 border-b px-4 py-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-black">{title}</h2>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">
                {columnTasks.length}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {description}
            </p>
          </div>
        </header>
        <div className="divide-y divide-border/70">
          {columnTasks.map(renderTask)}
          {columnTasks.length === 0 && (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              No {status === "active" ? "active" : "completed"}{" "}
              {title.toLowerCase()}.
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="page-stack space-y-5 overflow-x-hidden">
      <section className="bento-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-black uppercase text-primary">
              <ListTodo className="h-4 w-4" /> Task workspace
            </div>
            <h1 className="tech-title mt-2 text-3xl sm:text-4xl">
              Plan by deadline. Act by importance.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tests stay separate from everyday assignments so both kinds of
              work remain easy to scan.
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-secondary text-secondary-foreground"
          >
            <Plus className="mr-2 h-4 w-4" /> New task
          </Button>
        </div>
      </section>

      <section className="bento-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-lg bg-muted p-1">
          {(["active", "completed"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStatus(item)}
              className={`rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${status === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              {item === "active" ? "Active" : "Completed"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
          <SlidersHorizontal className="h-4 w-4" />
          Organize by
          <select
            aria-label="Organize tasks by"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="h-9 rounded-lg border bg-background px-3 text-sm font-bold text-foreground outline-none focus:border-primary"
          >
            <option value="dueDate">Due date</option>
            <option value="importance">Importance</option>
          </select>
        </label>
      </section>

      <div className="grid grid-flow-dense items-start gap-5 xl:grid-cols-2">
        {taskColumn(
          "Tests & quizzes",
          "Assessments, exams, and study checkpoints",
          tests,
          FileCheck2,
        )}
        {taskColumn(
          "Assignments & tasks",
          "Homework, projects, errands, and everyday work",
          assignments,
          ClipboardList,
        )}
      </div>

      <CreateTaskModal open={createOpen} onOpenChange={setCreateOpen} />
      {selectedId !== null && (
        <TaskDetailsModal
          taskId={selectedId}
          open
          onOpenChange={(open) => !open && setSelectedId(null)}
        />
      )}
    </div>
  );
}
