import { useCallback, useEffect, useState } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";

export type CanvasSummary = {
  newTasks?: number;
  updatedTasks?: number;
  completedTasks?: number;
  archivedItems?: number;
  calendarEvents?: number;
  projectSuggestions?: number;
  errors?: number;
};
export type CanvasStatus = {
  connected: boolean;
  oauthAvailable?: boolean;
  defaultBaseUrl?: string;
  needsCourseSelection?: boolean;
  integration?: {
    id: number;
    mode: "oauth" | "ical";
    baseUrl: string | null;
    status: string;
    lastSyncedAt: string | null;
    lastError: string | null;
  };
  courses?: Array<{
    id: number;
    externalCourseId: string;
    name: string;
    courseCode: string | null;
    subjectId: number | null;
    enabled: boolean;
  }>;
  latestRun?: {
    id: number;
    status: string;
    summary: CanvasSummary;
    error: string | null;
  } | null;
  suggestionCount?: number;
  ignoredCount?: number;
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.json();
}

const canvasAffectedQueryRoots = new Set([
  "/api/tasks",
  "/api/dashboard/overview",
  "/api/user/stats",
  "/api/projects",
  "/api/subjects",
  "canvas-events",
  "rewards",
]);
const handledCanvasRuns = new Map<number, number>();

export function isCanvasAffectedQuery(queryKey: QueryKey) {
  return canvasAffectedQueryRoots.has(String(queryKey[0] ?? ""));
}

export function invalidateCanvasData(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) => isCanvasAffectedQuery(query.queryKey),
    refetchType: "active",
  });
}

export function useCanvasSync(autoSync = false) {
  const queryClient = useQueryClient();
  const [statusEnabled, setStatusEnabled] = useState(!autoSync);

  useEffect(() => {
    if (!autoSync || statusEnabled) return;
    const requestIdle = window.requestIdleCallback ??
      ((callback: IdleRequestCallback) => window.setTimeout(callback, 1_200));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
    const id = requestIdle(() => setStatusEnabled(true), { timeout: 2_000 });
    return () => cancelIdle(id);
  }, [autoSync, statusEnabled]);

  const statusQuery = useQuery({
    queryKey: ["canvas-status"],
    queryFn: () => json<CanvasStatus>("/api/canvas/status"),
    enabled: statusEnabled,
    staleTime: 60_000,
    refetchInterval: (query) =>
      query.state.data?.latestRun &&
      ["queued", "running"].includes(query.state.data.latestRun.status)
        ? 1500
        : false,
  });
  const status = statusQuery.data;
  const running = Boolean(
    status?.latestRun &&
    ["queued", "running"].includes(status.latestRun.status),
  );
  const sync = useCallback(async () => {
    if (!status?.connected || running) return;
    try {
      await json("/api/canvas/sync", { method: "POST" });
      await statusQuery.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Canvas sync failed",
      );
    }
  }, [status?.connected, running, statusQuery.refetch]);
  useEffect(() => {
    const run = status?.latestRun;
    const integrationId = status?.integration?.id;
    if (
      !run ||
      !integrationId ||
      handledCanvasRuns.get(integrationId) === run.id ||
      !["completed", "failed"].includes(run.status)
    )
      return;
    handledCanvasRuns.set(integrationId, run.id);
    if (run.status === "failed") toast.error(run.error || "Canvas sync failed");
    else {
      const s = run.summary ?? {};
      toast.success(
        `Canvas synced: ${s.newTasks ?? 0} new, ${s.updatedTasks ?? 0} updated, ${s.completedTasks ?? 0} completed`,
      );
      void invalidateCanvasData(queryClient);
    }
  }, [status?.latestRun, queryClient]);
  useEffect(() => {
    if (!autoSync || !status?.connected || status.needsCourseSelection) return;
    const stale =
      !status.integration?.lastSyncedAt ||
      Date.now() - new Date(status.integration.lastSyncedAt).getTime() >
        15 * 60_000;
    if (stale) void sync();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, 15 * 60_000);
    return () => window.clearInterval(timer);
  }, [
    autoSync,
    status?.connected,
    status?.needsCourseSelection,
    status?.integration?.lastSyncedAt,
    sync,
  ]);
  return { status, statusQuery, sync, running, json };
}
