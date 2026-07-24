import React, { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileCheck2,
  FolderKanban,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

type Requirement = {
  id: number;
  title: string;
  completed: boolean;
  kind: "requirement" | "milestone";
  dueDate: string | null;
};
type Project = {
  id: number;
  name: string;
  color: string;
  description: string | null;
  subject: string | null;
  dueDate: string | null;
  status: string;
  priority: string;
  notes: string | null;
  rubric: string | null;
  submissionLink: string | null;
  gradeWeight: number | null;
  archived: boolean;
  taskCount: number;
  completedTaskCount: number;
  progress: number;
  requirements: Requirement[];
};

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [requirement, setRequirement] = useState("");
  const [milestone, setMilestone] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [preview, setPreview] = useState<string[]>([]);
  const [gradeWeightDraft, setGradeWeightDraft] = useState("");
  const load = async () => {
    const response = await fetch("/api/projects", { credentials: "include" });
    if (response.ok) {
      const data = await response.json();
      setProjects(data);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const selected =
    projects.find((project) => project.id === selectedId) ?? null;
  useEffect(() => {
    setGradeWeightDraft(
      selected?.gradeWeight === null || selected?.gradeWeight === undefined
        ? ""
        : String(selected.gradeWeight),
    );
  }, [selectedId, selected?.gradeWeight]);
  const create = async () => {
    if (!name.trim()) return;
    const response = await fetch("/api/projects", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        subject,
        dueDate,
        description,
        color: "#2563eb",
      }),
    });
    if (response.ok) {
      const project = await response.json();
      setCreating(false);
      setName("");
      setDescription("");
      await load();
      setSelectedId(project.id);
    }
  };
  const update = async (values: Record<string, unknown>) => {
    if (!selected) return;
    const response = await fetch(`/api/projects/${selected.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (response.ok) await load();
  };
  const addRequirement = async () => {
    if (!selected || !requirement.trim()) return;
    await fetch(`/api/projects/${selected.id}/requirements`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: requirement }),
    });
    setRequirement("");
    await load();
  };
  const addMilestone = async () => {
    if (!selected || !milestone.trim()) return;
    await fetch(`/api/projects/${selected.id}/requirements`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: milestone,
        kind: "milestone",
        dueDate: milestoneDate || null,
      }),
    });
    setMilestone("");
    setMilestoneDate("");
    await load();
  };
  const toggleRequirement = async (item: Requirement) => {
    if (!selected) return;
    await fetch(`/api/projects/${selected.id}/requirements/${item.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !item.completed }),
    });
    await load();
  };
  const buildPreview = () => {
    if (!selected?.rubric) return;
    const lines = selected.rubric
      .split(/\r?\n|[.;]\s+/)
      .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
      .filter((line) => line.length > 5)
      .slice(0, 10);
    setPreview(
      lines.map((line) =>
        /^(create|write|research|complete|submit|review|design|build|include|prepare)/i.test(
          line,
        )
          ? line
          : `Complete: ${line}`,
      ),
    );
  };
  const confirmPreview = async () => {
    if (!selected) return;
    await Promise.all(
      preview.map((title) =>
        fetch("/api/tasks", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            priority: selected.priority,
            projectId: selected.id,
            subject: selected.subject,
            dueDate: selected.dueDate,
            taskKind: "project",
            difficulty: 3,
            organized: true,
          }),
        }),
      ),
    );
    setPreview([]);
    await load();
    toast.success("Rubric tasks created");
  };
  const remove = async () => {
    if (
      !selected ||
      !window.confirm(
        `Delete ${selected.name}? Related tasks will be moved out of the project.`,
      )
    )
      return;
    await fetch(`/api/projects/${selected.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setSelectedId(null);
    await load();
  };
  return (
    <div className="page-stack space-y-5">
      <section className="bento-card p-5 sm:p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-primary">
              Projects and rubrics
            </p>
            <h1 className="tech-title mt-1 text-3xl">Long-form work</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Requirements, milestones, related tasks, progress, and submission
              details.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-black text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            New project
          </button>
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="bento-card self-start overflow-hidden">
          <div className="border-b p-3 text-xs font-black uppercase text-muted-foreground">
            Active projects
          </div>
          {projects
            .filter((project) => !project.archived)
            .map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedId(project.id)}
                className={`w-full border-b p-3 text-left hover:bg-muted/40 ${selectedId === project.id ? "bg-primary/10" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded"
                    style={{ backgroundColor: project.color }}
                  />
                  <p className="min-w-0 flex-1 truncate text-sm font-black">
                    {project.name}
                  </p>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {project.progress}% · {project.taskCount} related tasks
                </p>
              </button>
            ))}
          {projects.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Create a project for larger school work.
            </p>
          )}
        </aside>
        {selected ? (
          <section className="space-y-5">
            <div className="bento-card p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Project overview
                  </button>
                  <div className="flex items-center gap-2">
                    <FolderKanban className="h-5 w-5 text-primary" />
                    <h2 className="text-2xl font-black">{selected.name}</h2>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selected.description ||
                      "Add a description to clarify the outcome."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-lg bg-primary/10 px-2 py-1 font-bold text-primary">
                      {selected.subject || "No subject"}
                    </span>
                    <span className="rounded-lg bg-muted px-2 py-1 font-bold">
                      {selected.priority}
                    </span>
                    {selected.dueDate && (
                      <span className="rounded-lg bg-muted px-2 py-1">
                        Due{" "}
                        {new Date(
                          `${selected.dueDate}T12:00:00`,
                        ).toLocaleDateString()}
                      </span>
                    )}
                    {selected.gradeWeight !== null && (
                      <span
                        className={`rounded-lg px-2 py-1 font-bold ${selected.gradeWeight >= 0 && selected.gradeWeight <= 100 ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}
                      >
                        Grade weight: {selected.gradeWeight}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => void update({ archived: true })}
                    title="Archive"
                    className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                  <button
                    onClick={remove}
                    title="Delete"
                    className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-5">
                <div className="flex justify-between text-xs font-bold">
                  <span>Progress</span>
                  <span>{selected.progress}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${selected.progress}%` }}
                    className="h-full bg-primary"
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="space-y-5">
                <div className="bento-card p-5">
                  <h3 className="font-black">Requirements checklist</h3>
                  <div className="mt-3 space-y-2">
                    {selected.requirements
                      .filter((item) => item.kind !== "milestone")
                      .map((item) => (
                        <button
                          key={item.id}
                          onClick={() => toggleRequirement(item)}
                          className="flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm"
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded border ${item.completed ? "bg-primary text-primary-foreground" : ""}`}
                          >
                            {item.completed && <Check className="h-3 w-3" />}
                          </span>
                          <span
                            className={
                              item.completed ? "line-through opacity-60" : ""
                            }
                          >
                            {item.title}
                          </span>
                        </button>
                      ))}
                    <div className="flex gap-2">
                      <input
                        value={requirement}
                        onChange={(e) => setRequirement(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && void addRequirement()
                        }
                        placeholder="Add requirement"
                        className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-2 text-sm"
                      />
                      <button
                        aria-label="Add project requirement"
                        onClick={addRequirement}
                        className="rounded-lg bg-primary p-2 text-primary-foreground"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="bento-card p-5">
                  <h3 className="font-black">Milestones</h3>
                  <div className="mt-3 space-y-2">
                    {selected.requirements
                      .filter((item) => item.kind === "milestone")
                      .map((item) => (
                        <button
                          key={item.id}
                          onClick={() => toggleRequirement(item)}
                          className="flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm"
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded border ${item.completed ? "bg-primary text-primary-foreground" : ""}`}
                          >
                            {item.completed && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={
                                item.completed ? "line-through opacity-60" : ""
                              }
                            >
                              {item.title}
                            </span>
                            {item.dueDate && (
                              <span className="block text-[10px] text-muted-foreground">
                                {new Date(
                                  `${item.dueDate}T12:00:00`,
                                ).toLocaleDateString()}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    <div className="grid grid-cols-[1fr_130px_auto] gap-2">
                      <input
                        value={milestone}
                        onChange={(e) => setMilestone(e.target.value)}
                        placeholder="Milestone"
                        className="min-w-0 rounded-lg border bg-background px-2 py-2 text-sm"
                      />
                      <input
                        type="date"
                        value={milestoneDate}
                        onChange={(e) => setMilestoneDate(e.target.value)}
                        className="rounded-lg border bg-background px-2 text-xs"
                      />
                      <button
                        aria-label="Add project milestone"
                        onClick={addMilestone}
                        className="rounded-lg bg-primary p-2 text-primary-foreground"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bento-card p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-black">Rubric</h3>
                  {selected.rubric && (
                    <button
                      onClick={buildPreview}
                      className="flex items-center gap-1 text-xs font-black text-primary"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Break into tasks
                    </button>
                  )}
                </div>
                <textarea
                  defaultValue={selected.rubric ?? ""}
                  onBlur={(e) => void update({ rubric: e.target.value })}
                  placeholder="Paste rubric text here..."
                  className="mt-3 min-h-36 w-full resize-y rounded-xl border bg-background p-3 text-sm outline-none focus:border-primary"
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <input
                    defaultValue={selected.submissionLink ?? ""}
                    onBlur={(e) =>
                      void update({ submissionLink: e.target.value })
                    }
                    placeholder="Submission link"
                    className="rounded-lg border bg-background px-2 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={gradeWeightDraft}
                    onChange={(event) =>
                      setGradeWeightDraft(event.target.value)
                    }
                    onBlur={(e) =>
                      void update({
                        gradeWeight: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    placeholder="Grade weight %"
                    className="rounded-lg border bg-background px-2 py-2 text-sm"
                  />
                </div>
                {gradeWeightDraft && (
                  <p
                    className={`mt-2 text-xs font-bold ${Number(gradeWeightDraft) >= 0 && Number(gradeWeightDraft) <= 100 ? "text-emerald-600" : "text-destructive"}`}
                  >
                    {Number(gradeWeightDraft) >= 0 &&
                    Number(gradeWeightDraft) <= 100
                      ? `Valid grade weight: ${gradeWeightDraft}%`
                      : "Grade weight must be between 0% and 100%."}
                  </p>
                )}
                {selected.submissionLink && (
                  <a
                    href={selected.submissionLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex items-center gap-1 text-xs font-bold text-primary"
                  >
                    Open submission page <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="grid content-start gap-4 sm:grid-cols-2">
            {projects
              .filter((project) => !project.archived)
              .map((project) => (
                <button
                  key={project.id}
                  onClick={() => setSelectedId(project.id)}
                  className="bento-card p-5 text-left transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black">
                        {project.name}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">
                        {project.subject || "No subject"} · {project.priority}{" "}
                        priority
                      </p>
                    </div>
                    <span
                      className="h-3 w-3 shrink-0 rounded"
                      style={{ backgroundColor: project.color }}
                    />
                  </div>
                  <div className="mt-5 flex items-center justify-between text-xs font-bold">
                    <span>Progress</span>
                    <span>{project.progress}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {project.completedTaskCount}/{project.taskCount} tasks
                    </span>
                    <span>
                      {project.dueDate
                        ? `Due ${new Date(`${project.dueDate}T12:00:00`).toLocaleDateString()}`
                        : "No due date"}
                    </span>
                  </div>
                </button>
              ))}
            {projects.filter((project) => !project.archived).length === 0 && (
              <div className="bento-card col-span-full flex min-h-64 flex-col items-center justify-center p-8 text-center">
                <FolderKanban className="h-8 w-8 text-primary" />
                <p className="mt-3 font-black">No active projects</p>
                <button
                  onClick={() => setCreating(true)}
                  className="mt-4 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
                >
                  Create project
                </button>
              </div>
            )}
          </section>
        )}
      </div>
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-lg rounded-xl border bg-popover p-5">
            <h2 className="text-lg font-black">New project</h2>
            <div className="mt-4 grid gap-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name"
                className="rounded-xl border bg-background px-3 py-2"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="rounded-xl border bg-background px-3 py-2"
                />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="rounded-xl border bg-background px-3 py-2"
                />
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description"
                className="rounded-xl border bg-background p-3"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setCreating(false)}
                className="px-3 py-2 text-sm font-bold text-muted-foreground"
              >
                Cancel
              </button>
              <button
                onClick={create}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-black text-primary-foreground"
              >
                Create project
              </button>
            </div>
          </div>
        </div>
      )}
      {preview.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-lg rounded-xl border bg-popover p-5">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-primary" />
              <h2 className="font-black">Review rubric tasks</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing is created until you confirm.
            </p>
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {preview.map((item, index) => (
                <div key={index} className="rounded-lg border p-2 text-sm">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPreview([])}
                className="px-3 py-2 text-sm font-bold text-muted-foreground"
              >
                Cancel
              </button>
              <button
                onClick={confirmPreview}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-black text-primary-foreground"
              >
                Create {preview.length} tasks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
