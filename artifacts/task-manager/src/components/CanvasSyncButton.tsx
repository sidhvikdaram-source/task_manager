import { RefreshCw, Undo2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateCanvasData, useCanvasSync } from "@/hooks/useCanvasSync";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function CanvasSyncButton({ className }: { className?: string }) {
  const { status, statusQuery, sync, running, json } = useCanvasSync(false);
  const queryClient = useQueryClient();
  if (!status?.connected) return null;
  const restoreAll = async () => {
    if (
      !window.confirm(
        "Restore every hidden Canvas assignment and calendar item to Velocity? Canvas itself will not change.",
      )
    )
      return;
    const reopenCompleted = window.confirm(
      "Would you like to restore tasks marked as complete as well? Choose OK to return them to your active task lists.",
    );
    try {
      const result = await json<{
        restoredTasks: number;
        restoredEvents: number;
        reopenedCompletedTasks: number;
      }>("/api/canvas/ignored/restore-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reopenCompleted }),
      });
      await Promise.all([
        statusQuery.refetch(),
        invalidateCanvasData(queryClient),
      ]);
      toast.success(
        `Restored ${result.restoredTasks} tasks and ${result.restoredEvents} calendar items${result.reopenedCompletedTasks ? `; reopened ${result.reopenedCompletedTasks} completed` : ""}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Canvas items could not be restored",
      );
    }
  };
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={() => void sync()}
        disabled={running || status.needsCourseSelection}
        title={
          status.integration?.lastSyncedAt
            ? `Last synced ${new Date(status.integration.lastSyncedAt).toLocaleString()}`
            : "Sync Canvas"
        }
        className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-bold disabled:opacity-50"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", running && "animate-spin")} />
        {running ? "Syncing" : "Sync changes"}
      </button>
      <button
        type="button"
        onClick={() => void restoreAll()}
        disabled={running}
        className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-xs font-bold disabled:opacity-50"
      >
        <Undo2 className="h-3.5 w-3.5" /> Restore all
      </button>
    </div>
  );
}
