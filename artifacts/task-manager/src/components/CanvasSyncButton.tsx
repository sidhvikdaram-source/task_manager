import { RefreshCw, Undo2 } from "lucide-react";
import { useCanvasSync } from "@/hooks/useCanvasSync";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function CanvasSyncButton({ className }: { className?: string }) {
  const { status, statusQuery, sync, running, json } = useCanvasSync(false);
  if (!status?.connected) return null;
  const restoreAll = async () => {
    try {
      const result = await json<{ restored: number }>(
        "/api/canvas/ignored/restore-all",
        { method: "POST" },
      );
      await statusQuery.refetch();
      await sync();
      toast.success(
        `Restored ${result.restored} Canvas item${result.restored === 1 ? "" : "s"}`,
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
      {(status.ignoredCount ?? 0) > 0 && (
        <button
          type="button"
          onClick={() => void restoreAll()}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-xs font-bold disabled:opacity-50"
        >
          <Undo2 className="h-3.5 w-3.5" /> Restore all
        </button>
      )}
    </div>
  );
}
