import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarClock, Check, CheckCircle2, Circle, Clock3, FolderKanban, ListChecks, Loader2 } from "lucide-react";
import { getListTasksQueryKey, useListProjects, useListTasks, type Task } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { DailyChecklist } from "@/components/DailyChecklist";
import { QuickCapture } from "@/components/QuickCapture";
import { TaskInlineNotes } from "@/components/TaskInlineNotes";
import { useReliableTaskCompletion } from "@/hooks/useReliableTaskCompletion";
import { subjectColor, useSubjects } from "@/hooks/useSubjects";
import { localDateKey } from "@/lib/localDate";

const TaskDetailsModal = lazy(() => import("@/components/TaskDetailsModal").then((module) => ({ default: module.TaskDetailsModal })));
type View = "today" | "completed";

function taskDate(task: Task) { return task.dueDate || task.calendarDate; }

export default function Today() {
  const queryClient = useQueryClient();
  const taskCompletion = useReliableTaskCompletion();
  const reduceMotion = useReducedMotion();
  const { data: tasks = [], isLoading } = useListTasks({ sortBy: "dueDate" }, { query: { queryKey: getListTasksQueryKey({ sortBy: "dueDate" }) } });
  const { data: projects = [] } = useListProjects();
  const { data: subjects = [] } = useSubjects();
  const [view, setView] = useState<View>("today");
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<number | null>(() => {
    const value = sessionStorage.getItem("velocity-highlight-task");
    return value ? Number(value) : null;
  });
  const today = localDateKey(new Date());

  useEffect(() => {
    if (!highlighted) return;
    const timer = window.setTimeout(() => { sessionStorage.removeItem("velocity-highlight-task"); setHighlighted(null); }, 8000);
    return () => window.clearTimeout(timer);
  }, [highlighted]);

  async function refresh() { await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }); }
  const visibleTasks = useMemo(() => {
    if (view === "completed") return tasks.filter((task) => task.status === "completed");
    return tasks.filter((task) => {
      if (task.status === "completed") return false;
      if (task.id === highlighted) return true;
      const date = taskDate(task);
      return !date || date <= today;
    });
  }, [highlighted, tasks, today, view]);

  return (
    <div className="page-stack space-y-5 overflow-x-hidden">
      <section data-tour="quick-capture" className="bento-card p-4 sm:p-5">
        <h2 className="font-black">Quick capture</h2>
        <p className="text-xs text-muted-foreground">Add what matters now. Nimbus will organize the details.</p>
        <QuickCapture onCreated={() => void refresh()} />
      </section>

      <div className="grid grid-flow-dense items-start gap-5 lg:grid-cols-12">
        <section data-tour="today-list" className="bento-card overflow-hidden lg:col-span-8">
          <header className="border-b px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" /><h2 className="font-black">My Day</h2><span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">{visibleTasks.length}</span></div>
              <div className="flex rounded-lg bg-muted p-1">
                {(["today", "completed"] as const).map((item) => (
                  <motion.button key={item} type="button" onClick={() => setView(item)} whileTap={reduceMotion ? undefined : { scale: 0.97 }} className={`relative rounded-md px-3 py-1.5 text-xs font-bold ${view === item ? "text-foreground" : "text-muted-foreground"}`}>
                    {view === item && <motion.span layoutId="today-view-active" className="absolute inset-0 rounded-md bg-background shadow-sm" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                    <span className="relative">{item === "today" ? "Today" : "Completed"}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          </header>

          <div className="divide-y divide-border/60">
            <AnimatePresence initial={false}>
              {visibleTasks.map((task) => {
                const date = taskDate(task);
                const isComplete = task.status === "completed";
                const isHighlighted = highlighted === task.id;
                return (
                  <motion.div layout key={task.id} initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 10 }} onClick={() => setSelectedTask(task.id)} className={`cursor-pointer px-4 py-3.5 transition-colors hover:bg-muted/35 ${isHighlighted ? "bg-primary/10 ring-2 ring-inset ring-primary/45" : ""}`}>
                    <div className="flex items-start gap-3">
                      <button type="button" disabled={isComplete || taskCompletion.isPending(task.id)} onClick={(event) => { event.stopPropagation(); void taskCompletion.complete(task, event.currentTarget); }} aria-label={isComplete ? "Task completed" : "Complete task"} className="-ml-2 flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-70">
                        {taskCompletion.isPending(task.id) ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : isComplete ? <CheckCircle2 className="h-6 w-6 text-primary" /> : <Circle className="h-6 w-6" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-bold ${isComplete ? "text-muted-foreground line-through" : ""}`} style={{ color: isComplete ? undefined : subjectColor(task.subject, subjects) }}>{task.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                          {date ? <span className={`inline-flex items-center gap-1 ${date < today && !isComplete ? "text-destructive" : ""}`}><CalendarClock className="h-3 w-3" />{date < today && !isComplete ? "Overdue - " : date === today ? "Today - " : ""}{new Date(`${date}T12:00:00`).toLocaleDateString()}</span> : <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> No due date</span>}
                          {task.subject && <span style={{ color: subjectColor(task.subject, subjects) }}>{task.subject}</span>}
                          {task.priority !== "medium" && <span className="capitalize">{task.priority}</span>}
                        </div>
                        <TaskInlineNotes taskId={task.id} taskTitle={task.title} notes={task.notes} />
                      </div>
                      {isHighlighted && <span className="inline-flex items-center gap-1 text-xs font-black text-primary"><Check className="h-3.5 w-3.5" /> Added</span>}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {isLoading && [0, 1, 2].map((item) => <div key={item} className="flex items-center gap-3 px-4 py-3.5"><Skeleton className="h-7 w-7 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/5" /><Skeleton className="h-3 w-1/4" /></div></div>)}
            {!isLoading && visibleTasks.length === 0 && <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="px-5 py-12 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary"><CheckCircle2 className="h-5 w-5" /></div><p className="mt-3 font-black">{view === "completed" ? "Nothing completed yet" : "All clear"}</p><p className="mt-1 text-sm text-muted-foreground">{view === "today" ? "Capture something above or take a real break." : "Finished tasks will collect here."}</p></motion.div>}
          </div>
        </section>

        <aside className="space-y-5 self-start lg:col-span-4 lg:sticky lg:top-5" aria-label="Day overview">
          <section className="bento-card overflow-hidden">
            <header className="flex items-center justify-between border-b px-4 py-3"><div className="flex items-center gap-2"><FolderKanban className="h-4 w-4 text-primary" /><h2 className="font-black">Projects</h2></div><Link href="/projects" className="inline-flex items-center gap-1 text-xs font-bold text-primary">Open all <ArrowRight className="h-3.5 w-3.5" /></Link></header>
            <div className="divide-y divide-border/60">
              {projects.slice(0, 3).map((project) => <Link key={project.id} href="/projects" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/35"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} /><span className="min-w-0 flex-1 truncate text-sm font-bold">{project.name}</span><span className="text-xs font-semibold text-muted-foreground">{project.taskCount ?? 0} tasks</span></Link>)}
              {projects.length === 0 && <p className="px-4 py-5 text-sm text-muted-foreground">Projects give larger work a clear home.</p>}
            </div>
          </section>
          <DailyChecklist />
        </aside>
      </div>

      {selectedTask !== null && <Suspense fallback={null}><TaskDetailsModal taskId={selectedTask} open onOpenChange={(open) => !open && setSelectedTask(null)} /></Suspense>}
    </div>
  );
}
