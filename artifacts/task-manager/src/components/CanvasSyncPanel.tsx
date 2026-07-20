import { useEffect, useState } from "react";
import {
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Link2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { useCanvasSync } from "@/hooks/useCanvasSync";

type Subject = { id: number; name: string; color: string };
type Suggestion = { id: number; name: string; externalTaskIds: string[] };
type Ignored = {
  id: number;
  externalType: string;
  externalId: string;
  title: string | null;
  createdAt: string;
};
type OrganizationSuggestion = {
  taskId: number;
  title: string;
  category: string;
  suggestion: {
    subjectId: number;
    subjectName: string;
    reason: string;
    confidence: "high" | "medium" | "low";
  } | null;
  selectedSubjectId: number | null;
};
export function CanvasSyncPanel({
  subjects,
  onChanged,
}: {
  subjects: Subject[];
  onChanged: () => Promise<void>;
}) {
  const { status, statusQuery, sync, running, json } = useCanvasSync(false);
  const [expanded, setExpanded] = useState(false);
  const [feed, setFeed] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [ignored, setIgnored] = useState<Ignored[]>([]);
  const [organization, setOrganization] = useState<OrganizationSuggestion[]>(
    [],
  );
  const [search, setSearch] = useState("");
  const [courseDraft, setCourseDraft] = useState<
    Record<number, { enabled: boolean; subjectId: number | null }>
  >({});
  useEffect(() => {
    if (!status?.courses) return;
    setCourseDraft(
      Object.fromEntries(
        status.courses.map((course) => [
          course.id,
          { enabled: course.enabled, subjectId: course.subjectId },
        ]),
      ),
    );
  }, [status?.courses]);
  const loadDetails = async () => {
    if (!status?.connected) return;
    const [s, i, o] = await Promise.all([
      json<Suggestion[]>("/api/canvas/suggestions"),
      json<Ignored[]>(`/api/canvas/ignored?q=${encodeURIComponent(search)}`),
      json<Array<Omit<OrganizationSuggestion, "selectedSubjectId">>>(
        "/api/canvas/organization-suggestions",
      ),
    ]);
    setSuggestions(s);
    setIgnored(i);
    setOrganization(
      o.map((item) => ({
        ...item,
        selectedSubjectId: item.suggestion?.subjectId ?? null,
      })),
    );
  };
  useEffect(() => {
    if (expanded) void loadDetails();
  }, [expanded, status?.suggestionCount, status?.ignoredCount]);
  const connectFeed = async () => {
    try {
      await json("/api/canvas/feed/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl: feed }),
      });
      setFeed("");
      await statusQuery.refetch();
      toast.success("Canvas calendar connected");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not connect feed",
      );
    }
  };
  const saveCourses = async () => {
    try {
      await json("/api/canvas/courses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courses: Object.entries(courseDraft).map(([id, value]) => ({
            id: Number(id),
            ...value,
          })),
        }),
      });
      await Promise.all([statusQuery.refetch(), onChanged()]);
      toast.success("Canvas courses organized");
      void sync();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save courses",
      );
    }
  };
  const suggestionAction = async (id: number, action: "accept" | "dismiss") => {
    await json(`/api/canvas/suggestions/${id}/${action}`, { method: "POST" });
    await Promise.all([loadDetails(), onChanged()]);
    toast.success(
      action === "accept"
        ? "Project created and tasks linked"
        : "Suggestion dismissed",
    );
  };
  const restore = async (id: number) => {
    await json(`/api/canvas/ignored/${id}/restore`, { method: "POST" });
    await loadDetails();
    toast.success("Restored. It will refresh on the next sync.");
  };
  const restoreAll = async () => {
    try {
      const result = await json<{ restored: number }>(
        "/api/canvas/ignored/restore-all",
        { method: "POST" },
      );
      await sync();
      await Promise.all([statusQuery.refetch(), loadDetails(), onChanged()]);
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
  const purge = async (id: number) => {
    if (
      !window.confirm(
        "Permanently delete this local Canvas history? Canvas itself will not change.",
      )
    )
      return;
    await fetch(`/api/canvas/ignored/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    await loadDetails();
  };
  const applyOrganization = async () => {
    const chosen = organization.filter((item) => item.selectedSubjectId);
    if (!chosen.length) return;
    const result = await json<{ updated: number }>(
      "/api/canvas/organization-suggestions/apply",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestions: chosen.map((item) => ({
            taskId: item.taskId,
            subjectId: item.selectedSubjectId,
          })),
        }),
      },
    );
    await Promise.all([loadDetails(), onChanged()]);
    toast.success(
      `Organized ${result.updated} Canvas item${result.updated === 1 ? "" : "s"}`,
    );
  };
  const removeAll = async () => {
    if (
      !window.confirm(
        "Remove every imported Canvas task and event from Velocity? Canvas itself will not change. You can restore items later from Ignored Canvas items.",
      )
    )
      return;
    const result = await json<{ removedTasks: number; removedEvents: number }>(
      "/api/canvas/items",
      { method: "DELETE" },
    );
    await Promise.all([statusQuery.refetch(), loadDetails(), onChanged()]);
    toast.success(
      `Removed ${result.removedTasks} Canvas task${result.removedTasks === 1 ? "" : "s"} from Velocity`,
    );
  };
  const disconnect = async () => {
    if (
      !window.confirm(
        "Disconnect Canvas? Imported items will be archived, but Canvas will not change.",
      )
    )
      return;
    await fetch("/api/canvas", { method: "DELETE", credentials: "include" });
    await Promise.all([statusQuery.refetch(), onChanged()]);
    toast.success("Canvas disconnected");
  };
  if (statusQuery.isLoading)
    return <section className="bento-card h-20 animate-pulse" />;
  return (
    <section className="bento-card overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded(!expanded);
          }
        }}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f6cbf] text-white">
          <BookOpenCheck className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-black">Canvas sync</span>
          <span className="block truncate text-xs text-muted-foreground">
            {status?.connected
              ? `${status.integration?.mode === "oauth" ? "Full course sync" : "Calendar feed"} · ${status.integration?.lastSyncedAt ? `updated ${new Date(status.integration.lastSyncedAt).toLocaleString()}` : "not synced yet"}`
              : "Bring courses and due dates into Velocity"}
          </span>
        </span>
        {status?.connected && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void sync();
            }}
            disabled={running || status.needsCourseSelection}
            className="rounded-lg border p-2"
            title="Sync changes"
          >
            <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
          </button>
        )}
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </div>
      {expanded && (
        <div className="space-y-5 border-t p-4">
          {!status?.connected ? (
            <>
              <div className="rounded-lg border bg-muted/25 p-4">
                <h3 className="font-bold">Full Canvas connection</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  OAuth imports courses, assignments, quizzes, submission
                  status, and project relationships.
                </p>
                <a
                  href="/api/canvas/oauth/start"
                  className={`mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground ${!status?.oauthAvailable ? "pointer-events-none opacity-45" : ""}`}
                >
                  <Link2 className="h-4 w-4" />
                  Connect Canvas
                </a>
                {!status?.oauthAvailable && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    OAuth needs a Canvas developer key. Calendar feed remains
                    available below.
                  </p>
                )}
              </div>
              <div className="rounded-lg border p-4">
                <h3 className="font-bold">Calendar feed fallback</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Imports dated Canvas items into Home, Workspace, and Calendar.
                  Accurate course mapping, submissions, and project suggestions
                  require OAuth.
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    type="url"
                    value={feed}
                    onChange={(e) => setFeed(e.target.value)}
                    placeholder="Canvas calendar feed URL"
                    className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => void connectFeed()}
                    disabled={!feed}
                    className="rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
                  >
                    Connect
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {status.integration?.lastError && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/8 p-3 text-sm text-destructive">
                  {status.integration.lastError}
                </div>
              )}
              {status.integration?.mode === "oauth" && status.courses && (
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h3 className="font-bold">Courses and subjects</h3>
                      <p className="text-xs text-muted-foreground">
                        Canvas keeps the mapping even after you rename a
                        subject.
                      </p>
                    </div>
                    <button
                      onClick={() => void saveCourses()}
                      className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
                    >
                      <Check className="mr-1 inline h-3.5 w-3.5" />
                      Save mapping
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {status.courses.map((course) => (
                      <div
                        key={course.id}
                        className="flex items-center gap-2 rounded-lg border p-3"
                      >
                        <input
                          type="checkbox"
                          checked={
                            courseDraft[course.id]?.enabled ?? course.enabled
                          }
                          onChange={(e) =>
                            setCourseDraft((draft) => ({
                              ...draft,
                              [course.id]: {
                                enabled: e.target.checked,
                                subjectId:
                                  draft[course.id]?.subjectId ??
                                  course.subjectId,
                              },
                            }))
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">
                            {course.name}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {course.courseCode}
                          </p>
                        </div>
                        <select
                          disabled={
                            !(courseDraft[course.id]?.enabled ?? course.enabled)
                          }
                          value={courseDraft[course.id]?.subjectId ?? ""}
                          onChange={(e) =>
                            setCourseDraft((draft) => ({
                              ...draft,
                              [course.id]: {
                                enabled:
                                  draft[course.id]?.enabled ?? course.enabled,
                                subjectId: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              },
                            }))
                          }
                          className="max-w-36 rounded-md border bg-background px-2 py-1 text-xs"
                        >
                          <option value="">Auto-create</option>
                          {subjects.map((subject) => (
                            <option key={subject.id} value={subject.id}>
                              {subject.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h3 className="font-bold">Project suggestions</h3>
                <div className="mt-2 space-y-2">
                  {suggestions.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">
                          Create “{item.name}” project
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Link {item.externalTaskIds.length} existing Canvas
                          tasks
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          void suggestionAction(item.id, "dismiss")
                        }
                        className="px-2 py-1 text-xs font-bold text-muted-foreground"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => void suggestionAction(item.id, "accept")}
                        className="rounded-md bg-primary px-2 py-1 text-xs font-bold text-primary-foreground"
                      >
                        Create
                      </button>
                    </div>
                  ))}
                  {!suggestions.length && (
                    <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      No meaningful assignment chains need a project right now.
                    </p>
                  )}
                </div>
              </div>
              {organization.length > 0 && (
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 font-bold">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Subject suggestions
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Review name-based suggestions before organizing feed
                        items.
                      </p>
                    </div>
                    <button
                      onClick={() => void applyOrganization()}
                      className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
                    >
                      Apply selected
                    </button>
                  </div>
                  <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                    {organization.map((item) => (
                      <div
                        key={item.taskId}
                        className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-center"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold">{item.title}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {item.suggestion?.reason ?? "Choose a subject"} ·{" "}
                            {item.category.replace("_", " ")}
                          </p>
                        </div>
                        <select
                          value={item.selectedSubjectId ?? ""}
                          onChange={(event) =>
                            setOrganization((items) =>
                              items.map((current) =>
                                current.taskId === item.taskId
                                  ? {
                                      ...current,
                                      selectedSubjectId: event.target.value
                                        ? Number(event.target.value)
                                        : null,
                                    }
                                  : current,
                              ),
                            )
                          }
                          className="rounded-md border bg-background px-2 py-1.5 text-xs"
                        >
                          <option value="">Leave in Inbox</option>
                          {subjects.map((subject) => (
                            <option key={subject.id} value={subject.id}>
                              {subject.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">Ignored Canvas items</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {ignored.length} hidden
                    </span>
                    {ignored.length > 0 && (
                      <button
                        onClick={() => void restoreAll()}
                        className="text-xs font-bold text-primary"
                      >
                        Restore all
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void loadDetails()}
                    placeholder="Search ignored items"
                    className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => void loadDetails()}
                    className="rounded-lg border px-3 text-xs font-bold"
                  >
                    Search
                  </button>
                </div>
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {ignored.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 rounded-lg bg-muted/30 p-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {item.title || item.externalId}
                      </span>
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {item.externalType}
                      </span>
                      <button
                        title="Restore"
                        onClick={() => void restore(item.id)}
                        className="rounded-md p-1.5 hover:bg-muted"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Delete local history"
                        onClick={() => void purge(item.id)}
                        className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <a
                  href={status.integration?.baseUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary"
                >
                  Open Canvas <ExternalLink className="h-3 w-3" />
                </a>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => void removeAll()}
                    className="inline-flex items-center gap-1 text-xs font-bold text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove all items
                  </button>
                  <button
                    onClick={() => void disconnect()}
                    className="inline-flex items-center gap-1 text-xs font-bold text-destructive"
                  >
                    <Unplug className="h-3.5 w-3.5" />
                    Disconnect
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
