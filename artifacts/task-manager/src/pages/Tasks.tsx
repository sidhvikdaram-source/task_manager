import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  ListTodo,
  Loader2,
  Plus,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import {
  getListTasksQueryKey,
  useListTasks,
} from "@workspace/api-client-react";
import { CreateTaskModal } from "@/components/CreateTaskModal";
import { TaskDetailsModal } from "@/components/TaskDetailsModal";
import { TaskInlineNotes } from "@/components/TaskInlineNotes";
import { Button } from "@/components/ui/button";
import { useReliableTaskCompletion } from "@/hooks/useReliableTaskCompletion";
import { subjectColor, useSubjects } from "@/hooks/useSubjects";

export default function Tasks() {
  const [status, setStatus] = useState<"active" | "completed">("active");
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
      tasks.filter((task) =>
        status === "completed"
          ? task.status === "completed"
          : task.status !== "completed",
      ),
    [status, tasks],
  );

  return (
    <div className="page-stack space-y-5">
      <section className="bento-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase text-primary">
              <ListTodo className="h-4 w-4" /> Task workspace
            </div>
            <h1 className="tech-title mt-2 text-3xl sm:text-4xl">
              Every task, one calm list.
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Review details, keep working notes, and manage tasks beyond today
              without crowding My Day.
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

      <section className="bento-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-3">
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
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4" /> {visible.length} tasks
          </div>
        </div>

        <div className="divide-y divide-border/70">
          {visible.map((task, index) => {
            const color = subjectColor(task.subject, subjects);
            return (
              <motion.article
                key={task.id}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.18,
                  delay: Math.min(index * 0.02, 0.12),
                }}
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
                        style={{
                          color: status === "active" ? color : undefined,
                        }}
                      >
                        {task.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {task.dueDate
                            ? `Due ${new Date(`${task.dueDate}T12:00:00`).toLocaleDateString()}`
                            : "No deadline"}
                        </span>
                        {task.subject && (
                          <span style={{ color }}>{task.subject}</span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Zap className="h-3 w-3 fill-current" />{" "}
                          {task.vpValue} NP
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
          })}
          {visible.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">
              {status === "active"
                ? "Your task workspace is clear."
                : "Completed tasks will appear here."}
            </p>
          )}
        </div>
      </section>

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
