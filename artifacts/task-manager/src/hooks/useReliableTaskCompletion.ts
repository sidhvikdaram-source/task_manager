import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  completeTask as requestTaskCompletion,
  getGetDashboardOverviewQueryKey,
  getGetUserStatsQueryKey,
  type Task,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { useCompletionFeedback } from "@/hooks/useCompletionFeedback";

type CompletableTask = Pick<Task, "id" | "title" | "status" | "externalSource">;
type CompletionResult = Awaited<ReturnType<typeof requestTaskCompletion>> & {
  firstCompletionToday?: boolean;
  streakDays?: number | null;
  bpAwarded?: number;
  momentumRewards?: Array<{ days: number; bp: number }>;
};
type CompletionHandlers = {
  onOptimistic?: () => void;
  onSuccess?: (result: CompletionResult) => void | Promise<void>;
  onError?: () => void;
};

function completionError(error: unknown) {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object" && "error" in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return "This task could not be completed. Your list has been restored.";
}

export function useReliableTaskCompletion() {
  const queryClient = useQueryClient();
  const feedback = useCompletionFeedback();
  const inFlight = useRef(new Set<number>());
  const [pendingIds, setPendingIds] = useState<Set<number>>(() => new Set());

  const complete = useCallback(async (
    task: CompletableTask,
    target?: HTMLElement | null,
    handlers: CompletionHandlers = {},
  ) => {
    if (task.status === "completed" || inFlight.current.has(task.id)) return null;
    if (task.externalSource?.startsWith("canvas")) {
      toast("Canvas will mark this complete after submission or grading.");
      return null;
    }

    inFlight.current.add(task.id);
    setPendingIds((current) => new Set(current).add(task.id));
    const preparedFeedback = feedback.prepare(target);
    await queryClient.cancelQueries({ queryKey: ["/api/tasks"] });
    const snapshots = queryClient.getQueriesData<Task[]>({ queryKey: ["/api/tasks"] });
    const completedAt = new Date().toISOString();
    queryClient.setQueriesData<Task[]>({ queryKey: ["/api/tasks"] }, (current) =>
      current?.map((item) =>
        item.id === task.id
          ? { ...item, status: "completed", completedAt }
          : item,
      ),
    );
    handlers.onOptimistic?.();

    let result: CompletionResult;
    try {
      result = await requestTaskCompletion(task.id) as CompletionResult;
    } catch (error) {
      snapshots.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data));
      handlers.onError?.();
      toast.error(completionError(error));
      inFlight.current.delete(task.id);
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
      return null;
    }

    try {
      queryClient.setQueriesData<Task[]>({ queryKey: ["/api/tasks"] }, (current) =>
        current?.map((item) =>
          item.id === task.id ? { ...item, ...result.task } : item,
        ),
      );
      feedback.celebrate(preparedFeedback);
      toast.success(result.vpAwarded ? `Done - +${result.vpAwarded} VP` : "Task complete");
      if (result.bpAwarded) {
        const milestone = result.momentumRewards?.at(-1);
        toast.success(`+${result.bpAwarded} BP earned`, {
          description: milestone
            ? `${milestone.days} Momentum days reached. Momentum never resets.`
            : "Added to your store balance.",
        });
      }
      try {
        await handlers.onSuccess?.(result);
      } catch {
        // The server completion is authoritative even if a follow-up refresh fails.
      }
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
        queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: ["rewards"] }),
      ]);
      return result;
    } finally {
      inFlight.current.delete(task.id);
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  }, [feedback, queryClient]);

  return {
    complete,
    isPending: (taskId: number) => pendingIds.has(taskId),
  };
}
