import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUp,
  AlertCircle,
  CalendarDays,
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
  contextTaskKind,
  compact = false,
  placeholder = "Call mom Sunday afternoon #Personal p1",
}: {
  onCreated?: () => void;
  contextSubject?: string;
  contextTaskKind?: "test" | "quiz" | "assignment" | "task";
  compact?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(false);
  const [pageVisible, setPageVisible] = useState(
    () => document.visibilityState !== "hidden",
  );
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const syncVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  useEffect(() => {
    if (!text.trim()) {
      setPreview(null);
      setParsing(false);
      setParseError(false);
      return;
    }
    setPreview(null);
    setParsing(true);
    setParseError(false);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/quick-capture/preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, contextSubject, contextTaskKind }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Preview unavailable");
        setPreview(await response.json());
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setPreview(null);
          setParseError(true);
        }
      } finally {
        if (!controller.signal.aborted) setParsing(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, contextSubject, contextTaskKind]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/quick-capture", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, contextSubject, contextTaskKind }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        task?: { title: string };
        error?: string;
      };
      if (!response.ok || !data.task) {
        throw new Error(data.error || "Task could not be created.");
      }
      toast.success(`Created ${data.task.title}`);
      setText("");
      setPreview(null);
      onCreated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Task could not be created.");
    } finally {
      setSaving(false);
    }
  }

  const append = (value: string) => setText((current) => `${current.trimEnd()} ${value}`.trimStart());

  return (
    <motion.form
      onSubmit={create}
      className="mt-3 w-full text-left"
      initial={reduceMotion ? false : { opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className="quick-capture-shell" data-page-visible={pageVisible}>
        <div className="relative z-[1] flex items-end gap-2 rounded-[calc(0.9rem-1px)] bg-background p-2">
          <textarea
            aria-label="Quick capture task"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={compact ? 1 : 2}
            placeholder={placeholder}
            className={`${compact ? "min-h-9" : "min-h-12"} flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground/75`}
          />
          <motion.button
            type="submit"
            aria-label="Create parsed task"
            disabled={!text.trim() || saving}
            title="Create parsed task"
            whileHover={!reduceMotion && text.trim() ? { y: -1 } : undefined}
            whileTap={!reduceMotion && text.trim() ? { scale: 0.94 } : undefined}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </motion.button>
        </div>
      </div>

      {!compact && <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-muted-foreground">
        {[
          ["#Subject", "#"],
          ["Priority", "p1"],
          ["Due date", "tomorrow 4 PM"],
        ].map(([label, value]) => (
          <motion.button
            key={label}
            type="button"
            onClick={() => append(value)}
            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
            className="rounded-md border px-2 py-1 transition-colors hover:bg-muted"
          >
            {label}
          </motion.button>
        ))}
      </div>}

      <AnimatePresence mode="wait" initial={false}>
        {parsing && !preview?.title ? (
          <motion.div
            key="parsing"
            role="status"
            aria-label="Parsing task"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 flex items-center gap-2 border-t border-border/70 pt-3 text-xs font-semibold text-muted-foreground"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Parsing task details
          </motion.div>
        ) : preview?.title ? (
          <motion.div
            key="preview"
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.15 }}
            className="mt-3 border-t border-border/70 pt-3"
          >
            <p className="text-sm font-bold">{preview.title}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
              {preview.dueDate && <PreviewTag icon={<CalendarDays className="h-3 w-3" />} text={`${preview.dueDate}${preview.time ? ` at ${preview.time}` : ""}`} />}
              {preview.projectName && <PreviewTag icon={<FolderKanban className="h-3 w-3" />} text={preview.projectName} />}
              {preview.subject && <PreviewTag icon={<Tag className="h-3 w-3" />} text={preview.subject} />}
              <PreviewTag text={preview.priority} capitalize />
              {preview.estimatedMinutes && <PreviewTag text={`${preview.estimatedMinutes} min`} />}
              {preview.checklist.length > 0 && <PreviewTag icon={<ListChecks className="h-3 w-3" />} text={`${preview.checklist.length} steps`} />}
            </div>
            {preview.warnings.map((warning) => <p key={warning} className="mt-2 text-xs text-secondary">{warning}</p>)}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {parseError && text.trim() && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground" role="status">
          <AlertCircle className="h-3.5 w-3.5 text-secondary" />
          Preview is unavailable. You can still create this task.
        </p>
      )}
    </motion.form>
  );
}

function PreviewTag({ icon, text, capitalize = false }: { icon?: React.ReactNode; text: string; capitalize?: boolean }) {
  return <span className={`inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 ${capitalize ? "capitalize" : ""}`}>{icon}{text}</span>;
}
