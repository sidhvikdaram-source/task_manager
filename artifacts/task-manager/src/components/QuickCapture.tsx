import React, { useEffect, useState } from "react";
import {
  CalendarDays,
  ArrowUp,
  FolderKanban,
  ListChecks,
  Loader2,
  Tag,
} from "lucide-react";
import { toast } from "sonner";

type Preview = {
  title: string;
  checklist: string[];
  dueDate: string | null;
  time: string | null;
  priority: string;
  projectName: string | null;
  subject: string | null;
  estimatedMinutes: number | null;
  warnings: string[];
};

export function QuickCapture({
  onCreated,
  contextSubject,
  placeholder = "Call mom Sunday afternoon #Personal p1",
}: {
  onCreated?: () => void;
  contextSubject?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!text.trim()) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/quick-capture/preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, contextSubject }),
          signal: controller.signal,
        });
        if (response.ok) setPreview(await response.json());
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setPreview(null);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, contextSubject]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/quick-capture", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, contextSubject }),
      });
      const data = (await response.json()) as {
        task?: { title: string };
        error?: string;
      };
      if (!response.ok || !data.task)
        throw new Error(data.error || "Task could not be created.");
      toast.success(`Created ${data.task.title}`);
      setText("");
      setPreview(null);
      onCreated?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Task could not be created.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={create} className="mt-3 w-full text-left">
      <div className="flex items-end gap-2 rounded-xl border bg-background p-2 shadow-sm focus-within:border-primary/50">
        <textarea
          aria-label="Quick capture task"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          placeholder={placeholder}
          className="min-h-12 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none"
        />
        <button
          type="submit"
          aria-label="Create parsed task"
          disabled={!preview?.title || saving}
          title="Create parsed task"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <button
          type="button"
          onClick={() => setText((value) => `${value.trimEnd()} #`)}
          className="rounded-md border px-2 py-1 hover:bg-muted"
        >
          #Subject
        </button>
        <button
          type="button"
          onClick={() => setText((value) => `${value.trimEnd()} p1`)}
          className="rounded-md border px-2 py-1 hover:bg-muted"
        >
          Priority
        </button>
        <button
          type="button"
          onClick={() => setText((value) => `${value.trimEnd()} tomorrow 4 PM`)}
          className="rounded-md border px-2 py-1 hover:bg-muted"
        >
          Due date
        </button>
      </div>
      {preview?.title && (
        <div className="mt-3 border-t border-border/70 pt-3">
          <p className="text-sm font-bold">{preview.title}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            {preview.dueDate && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                <CalendarDays className="h-3 w-3" />
                {preview.dueDate}
                {preview.time ? ` · ${preview.time}` : ""}
              </span>
            )}
            {preview.projectName && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                <FolderKanban className="h-3 w-3" />
                {preview.projectName}
              </span>
            )}
            {preview.subject && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                <Tag className="h-3 w-3" />
                {preview.subject}
              </span>
            )}
            <span className="rounded-md bg-muted px-2 py-1 capitalize">
              {preview.priority}
            </span>
            {preview.estimatedMinutes && (
              <span className="rounded-md bg-muted px-2 py-1">
                {preview.estimatedMinutes} min
              </span>
            )}
            {preview.checklist.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                <ListChecks className="h-3 w-3" />
                {preview.checklist.length} steps
              </span>
            )}
          </div>
          {preview.warnings.map((warning) => (
            <p key={warning} className="mt-2 text-xs text-secondary">
              {warning}
            </p>
          ))}
        </div>
      )}
    </form>
  );
}
