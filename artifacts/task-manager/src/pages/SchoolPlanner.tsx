import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  FolderKanban,
  Pencil,
  Settings2,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Link } from "wouter";
import { TaskDetailsModal } from "@/components/TaskDetailsModal";
import { CanvasSyncPanel } from "@/components/CanvasSyncPanel";
import { QuickCapture } from "@/components/QuickCapture";
import { useExperience } from "@/experience";

type Subject = { id: number; name: string; color: string };
type SchoolTask = {
  id: number;
  title: string;
  subject: string | null;
  taskKind: string;
  dueDate: string | null;
  status: string;
  notes: string | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  createdAt: string;
  completedAt: string | null;
};
type SchoolProject = {
  id: number;
  name: string;
  subject: string | null;
  dueDate: string | null;
  progress: number;
  status: string;
};

export default function SchoolPlanner() {
  const { preferences } = useExperience();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tasks, setTasks] = useState<SchoolTask[]>([]);
  const [projects, setProjects] = useState<SchoolProject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("Math");
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const load = async () => {
    const [s, t, p] = await Promise.all([
      fetch("/api/subjects", { credentials: "include" }),
      fetch("/api/tasks?sortBy=dueDate", { credentials: "include" }),
      fetch("/api/projects", { credentials: "include" }),
    ]);
    if (s.ok) setSubjects(await s.json());
    if (t.ok) setTasks(await t.json());
    if (p.ok) setProjects(await p.json());
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (
      subjects.length &&
      !subjects.some((subject) => subject.name === selectedSubject)
    )
      setSelectedSubject(subjects[0].name);
  }, [subjects]);
  const subjectTasks = useMemo(
    () => tasks.filter((task) => task.subject === selectedSubject),
    [tasks, selectedSubject],
  );
  const active = subjectTasks.filter((task) => task.status !== "completed");
  const completed = subjectTasks.filter((task) => task.status === "completed");
  const totalFocus = subjectTasks.reduce(
    (sum, task) => sum + (task.actualMinutes ?? 0),
    0,
  );
  const addSubject = async () => {
    if (!newSubject.trim()) return;
    const response = await fetch("/api/subjects", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSubject }),
    });
    if (response.ok) {
      setNewSubject("");
      setAddingSubject(false);
      await load();
    } else toast.error("That subject could not be added");
  };
  const renameSubject = async (subject: Subject) => {
    const name = window.prompt("Rename subject", subject.name)?.trim();
    if (!name || name === subject.name) return;
    const response = await fetch(`/api/subjects/${subject.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      if (selectedSubject === subject.name) setSelectedSubject(name);
      await load();
      toast.success("Subject renamed");
    } else toast.error("Subject could not be renamed");
  };
  const removeSubject = async (subject: Subject) => {
    if (!window.confirm(`Remove ${subject.name}? Its work will move to Other.`))
      return;
    const response = await fetch(`/api/subjects/${subject.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (response.ok) {
      await load();
      toast.success("Subject removed");
    } else toast.error("Subject could not be removed");
  };
  const subjectProjects = projects.filter(
    (project) =>
      project.subject === selectedSubject &&
      !["completed"].includes(project.status),
  );
  return (
    <div className="page-stack space-y-5">
      <section data-tour="academics" className="bento-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-primary">
              School planner
            </p>
            <h1 className="tech-title mt-1 text-3xl">Coursework by subject</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Assignments, assessments, projects, notes, deadlines, and focus
              history.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {preferences.advancedFeaturesEnabled && (
              <Link href="/projects" className="flex min-h-11 touch-manipulation items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold">
                <FolderKanban className="h-4 w-4" /> Projects
              </Link>
            )}
            <button
              onClick={() => setAddingSubject(true)}
              className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold"
            >
              <Settings2 className="h-4 w-4" />
              Customize subjects
            </button>
          </div>
        </div>
      </section>
      <CanvasSyncPanel subjects={subjects} onChanged={load} />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {subjects.map((subject) => (
          <button
            key={subject.id}
            onClick={() => setSelectedSubject(subject.name)}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${selectedSubject === subject.name ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: subject.color }}
            />
            {subject.name}
            <span className="text-xs opacity-60">
              {
                tasks.filter(
                  (task) =>
                    task.subject === subject.name &&
                    task.status !== "completed",
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="bento-card overflow-hidden">
          <header className="flex items-center justify-between border-b p-4">
            <div>
              <h2 className="text-xl font-black">{selectedSubject}</h2>
              <p className="text-xs text-muted-foreground">
                {active.length} active · {completed.length} recently completed
              </p>
            </div>
            <BookOpen className="h-5 w-5 text-primary" />
          </header>
          <div className="border-b bg-muted/20 px-3 pb-3">
            <QuickCapture
              contextSubject={selectedSubject}
              placeholder={`Add ${selectedSubject} work tomorrow high priority`}
              onCreated={() => void load()}
            />
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {active.map((task, index) => (
              <motion.button
                key={task.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.025 }}
                onClick={() => setSelectedTask(task.id)}
                className="rounded-xl border p-4 text-left hover:border-primary/50 hover:bg-primary/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-black uppercase text-primary">
                      {task.taskKind}
                    </span>
                    <h3 className="mt-1 font-black">{task.title}</h3>
                  </div>
                  {task.taskKind === "test" || task.taskKind === "quiz" ? (
                    <CalendarDays className="h-4 w-4 text-secondary" />
                  ) : task.taskKind === "project" ? (
                    <FolderKanban className="h-4 w-4 text-primary" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {task.dueDate && (
                    <span>
                      Due{" "}
                      {new Date(
                        `${task.dueDate}T12:00:00`,
                      ).toLocaleDateString()}
                    </span>
                  )}
                  <span>{task.estimatedMinutes ?? 30} min</span>
                  {task.notes && <span>Has notes</span>}
                </div>
              </motion.button>
            ))}
            {active.length === 0 && (
              <div className="col-span-full p-10 text-center text-sm text-muted-foreground">
                No active {selectedSubject} work.
              </div>
            )}
          </div>
        </section>
        <aside className="space-y-4">
          <button
            type="button"
            onClick={() => {
              window.localStorage.setItem(
                "velocity_focus_subject",
                selectedSubject,
              );
              window.location.href = `${(import.meta.env.BASE_URL ?? "/").replace(/\/$/, "")}/focus`;
            }}
            className="bento-card w-full p-4 text-left transition-transform hover:-translate-y-0.5"
          >
            <Clock3 className="h-5 w-5 text-primary" />
            <p className="mt-3 text-3xl font-black">{totalFocus}</p>
            <p className="text-xs font-bold uppercase text-muted-foreground">
              Recorded focus minutes
            </p>
            <p className="mt-2 text-xs font-bold text-primary">
              Start {selectedSubject} focus
            </p>
          </button>
          <div className="bento-card p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <h3 className="font-black">Recent activity</h3>
            </div>
            <div className="mt-3 space-y-2">
              {completed.slice(0, 6).map((task) => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTask(task.id)}
                  className="block w-full rounded-lg bg-muted/40 p-2 text-left"
                >
                  <p className="truncate text-sm font-bold">{task.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Completed{" "}
                    {task.completedAt
                      ? new Date(task.completedAt).toLocaleDateString()
                      : "recently"}
                  </p>
                </button>
              ))}
              {completed.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Completed work will appear here.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
      {subjectProjects.length > 0 && (
        <section className="bento-card p-4">
          <div className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5 text-primary" />
            <h2 className="font-black">{selectedSubject} projects</h2>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subjectProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => {
                  window.location.href = `${(import.meta.env.BASE_URL ?? "/").replace(/\/$/, "")}/projects`;
                }}
                className="rounded-xl border p-3 text-left hover:border-primary/50"
              >
                <p className="font-bold">{project.name}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {project.progress}% complete
                  {project.dueDate
                    ? ` · due ${new Date(`${project.dueDate}T12:00:00`).toLocaleDateString()}`
                    : ""}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}
      {addingSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-lg rounded-xl border bg-popover p-5 shadow-2xl">
            <h2 className="font-black">Customize subjects</h2>
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {subjects.map((subject) => (
                <div
                  key={subject.id}
                  className="flex items-center gap-3 rounded-xl border p-3"
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: subject.color }}
                  />
                  <span className="flex-1 font-bold">{subject.name}</span>
                  <button
                    title="Rename subject"
                    onClick={() => void renameSubject(subject)}
                    className="rounded-lg p-2 hover:bg-muted"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    title="Remove subject"
                    onClick={() => void removeSubject(subject)}
                    disabled={subject.name === "Other"}
                    className="rounded-lg p-2 text-destructive hover:bg-destructive/10 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <input
                autoFocus
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void addSubject()}
                placeholder="New subject"
                className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 outline-none"
              />
              <button
                onClick={addSubject}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-black text-primary-foreground"
              >
                Add
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setAddingSubject(false)}
                className="px-3 py-2 text-sm font-bold text-muted-foreground"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedTask !== null && (
        <TaskDetailsModal
          taskId={selectedTask}
          open
          onOpenChange={(open) => !open && setSelectedTask(null)}
        />
      )}
    </div>
  );
}
