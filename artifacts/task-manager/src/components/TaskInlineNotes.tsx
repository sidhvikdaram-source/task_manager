import { useEffect, useState } from "react";
import { Check, Loader2, NotebookPen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetTaskQueryKey,
  getListTasksQueryKey,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TaskInlineNotesProps = {
  taskId: number;
  taskTitle: string;
  notes: string | null | undefined;
  compact?: boolean;
};

export function TaskInlineNotes({
  taskId,
  taskTitle,
  notes,
  compact = false,
}: TaskInlineNotesProps) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(notes ?? "");
  const [savedValue, setSavedValue] = useState(notes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    const next = notes ?? "";
    setValue(next);
    setSavedValue(next);
  }, [notes, taskId]);

  async function save() {
    const normalized = value.trimEnd();
    if (normalized === savedValue) return;
    setStatus("saving");
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: normalized || null }),
      });
      if (!response.ok) throw new Error("Notes could not be saved");
      setValue(normalized);
      setSavedValue(normalized);
      setStatus("saved");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(taskId) }),
      ]);
      window.dispatchEvent(new Event("nimbus:workspace-changed"));
      window.setTimeout(() => setStatus("idle"), 1400);
    } catch (error) {
      setStatus("idle");
      toast.error(
        error instanceof Error ? error.message : "Notes could not be saved",
      );
    }
  }

  return (
    <div
      className={cn(
        "group/note mt-2 flex items-start gap-2 rounded-lg border border-transparent bg-muted/35 px-2.5 transition-colors focus-within:border-border focus-within:bg-background",
        compact ? "py-1.5" : "py-2",
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <NotebookPen className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/75" />
      <textarea
        aria-label={`Notes for ${taskTitle}`}
        value={value}
        rows={compact ? 1 : 2}
        placeholder="Add a note…"
        onChange={(event) => {
          setValue(event.target.value);
          setStatus("idle");
        }}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className="min-h-6 flex-1 resize-none bg-transparent text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground/70"
      />
      <span
        className="mt-1 flex h-4 min-w-4 items-center justify-end text-[10px] font-bold text-muted-foreground"
        aria-live="polite"
      >
        {status === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
        {status === "saved" && <Check className="h-3 w-3 text-primary" />}
      </span>
    </div>
  );
}
