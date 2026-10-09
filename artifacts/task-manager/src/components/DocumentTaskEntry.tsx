import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { firebaseAuth } from "@workspace/replit-auth-web";
import type { Task } from "@workspace/api-client-react";
import { Loader2, NotebookPen } from "lucide-react";
import { toast } from "sonner";

type Preview = {
  title?: string;
  dueDate?: string | null;
  subject?: string | null;
  priority?: string;
  estimatedMinutes?: number | null;
};

/** The blank page is the input. Each entry uses the existing parser, including multiline checklists. */
export function DocumentTaskEntry({
  lane,
  workspaceMode,
  onCreated,
  noteValue,
  onNoteChange,
  onNoteSave,
  noteSaving,
}: {
  lane: "assignments" | "tests" | "personal";
  workspaceMode: "school" | "personal";
  onCreated: () => void;
  noteValue: string;
  onNoteChange: (value: string) => void;
  onNoteSave: () => void;
  noteSaving: boolean;
}) {
  const draftKey = `nimbus-document-draft:${firebaseAuth.currentUser?.uid ?? "account"}:${workspaceMode}:${lane}`;
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(draftKey) ?? "";
    } catch {
      return "";
    }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notesOpen, setNotesOpen] = useState(Boolean(noteValue));
  const [preview, setPreview] = useState<Preview | null>(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const textRef = useRef(text);
  textRef.current = text;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const kind =
    lane === "tests" ? "test" : lane === "personal" ? "task" : "assignment";
  const label =
    lane === "tests"
      ? "Tests"
      : lane === "personal"
        ? "Personal tasks"
        : "Assignments";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Keep the submitted draft until the request finishes, including across navigation.
    if (!savingRef.current) {
      try {
        if (text) localStorage.setItem(draftKey, text);
        else localStorage.removeItem(draftKey);
      } catch {
        /* The editor also works without local storage. */
      }
    }
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.max(240, inputRef.current.scrollHeight)}px`;
    }
  }, [draftKey, text, saving]);

  useEffect(() => {
    setPreview(null);
    if (!text.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/quick-capture/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            contextTaskKind: kind,
            contextWorkspace: workspaceMode,
          }),
          signal: controller.signal,
        });
        if (response.ok) {
          const next = await response.json();
          if (!controller.signal.aborted) setPreview(next);
        }
      } catch {
        /* Enter still creates tasks when the preview is unavailable. */
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [kind, text, workspaceMode]);

  async function create() {
    if (!text.trim() || savingRef.current) return;
    const source = text.trim();
    try {
      localStorage.setItem(draftKey, text);
    } catch {
      /* Storage is optional. */
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    setText("");
    let created = false;
    try {
      const response = await fetch("/api/quick-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: source,
          contextTaskKind: kind,
          contextWorkspace: workspaceMode,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.task)
        throw new Error(
          data?.error ?? "Task could not be created. Press Enter to retry.",
        );
      created = true;
      queryClient.setQueriesData<Task[]>(
        { queryKey: ["/api/tasks"] },
        (current) =>
          current && !current.some((task) => task.id === data.task.id)
            ? [...current, data.task]
            : current,
      );
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Task could not be created. Press Enter to retry.";
      setText((current) => [source, current].filter(Boolean).join("\n"));
      setError(message);
      toast.error(message);
    } finally {
      if (created) onCreated();
      if (!mountedRef.current) {
        const pending = [created ? "" : source, textRef.current]
          .filter(Boolean)
          .join("\n");
        try {
          if (pending) localStorage.setItem(draftKey, pending);
          else localStorage.removeItem(draftKey);
        } catch {
          /* Storage is optional. */
        }
      }
      savingRef.current = false;
      setSaving(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex flex-1 flex-col px-5 pb-4 sm:px-6">
      <textarea
        ref={inputRef}
        aria-label={`Write ${label.toLowerCase()}`}
        aria-describedby={`document-help-${lane}`}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError("");
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            void create();
          }
        }}
        placeholder={
          lane === "tests"
            ? "Write a test or quiz…"
            : lane === "personal"
              ? "Write what you need to do…"
              : "Write an assignment…"
        }
        className="min-h-60 w-full flex-1 resize-none overflow-hidden bg-transparent py-4 text-base leading-8 text-foreground outline-none placeholder:text-muted-foreground"
      />
      {error && (
        <p role="alert" className="pb-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="min-h-7 text-xs text-muted-foreground" aria-live="polite">
        {saving ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Adding your task…
          </span>
        ) : preview?.title ? (
          <span>
            {preview.title}
            {preview.subject ? ` · ${preview.subject}` : ""}
            {preview.dueDate ? ` · ${preview.dueDate}` : ""}
            {preview.priority && preview.priority !== "medium"
              ? ` · ${preview.priority}`
              : ""}
            {preview.estimatedMinutes
              ? ` · ${preview.estimatedMinutes} min`
              : ""}
          </span>
        ) : null}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 pt-3 text-xs text-muted-foreground">
        <span id={`document-help-${lane}`}>
          Enter to add. Shift + Enter for checklist steps.
        </span>
        <button
          type="button"
          aria-expanded={notesOpen}
          onClick={() => setNotesOpen((open) => !open)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 hover:bg-muted focus-visible:outline focus-visible:outline-primary"
        >
          <NotebookPen className="h-3.5 w-3.5" />
          Notes
        </button>
      </footer>
      {notesOpen && (
        <div className="mt-3 border-t pt-3">
          <label className="text-xs font-semibold" htmlFor={`notes-${lane}`}>
            Notes {noteSaving ? "(saving…)" : ""}
          </label>
          <textarea
            id={`notes-${lane}`}
            value={noteValue}
            onChange={(event) => onNoteChange(event.target.value)}
            onBlur={onNoteSave}
            rows={3}
            placeholder="Write freely. Notes stay as notes."
            className="mt-2 w-full resize-y bg-transparent text-sm leading-7 outline-none placeholder:text-muted-foreground"
          />
        </div>
      )}
    </div>
  );
}
