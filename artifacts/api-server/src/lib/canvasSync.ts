import crypto from "node:crypto";
import ical from "node-ical";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  externalCalendarEventsTable,
  externalCoursesTable,
  externalIntegrationsTable,
  externalSyncIgnoresTable,
  integrationSyncRunsTable,
  projectSuggestionsTable,
  subjectsTable,
  tasksTable,
} from "@workspace/db";
import { canvasPaginated } from "./canvasClient";
import { completeTaskAndAward } from "./completeTask";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  redactIntegrationError,
} from "./integrationCrypto";
import {
  canvasCategoryTaskKind,
  canvasEventCategory,
  icalOccurrenceId,
  isMeaningfulProjectCandidate,
  normalizeCanvasChainTitle,
  shouldCreateCanvasTask,
} from "./canvasRules";

type Integration = typeof externalIntegrationsTable.$inferSelect;
type CanvasCourse = {
  id: number;
  name: string;
  course_code?: string;
  workflow_state?: string;
};
type CanvasSubmission = {
  workflow_state?: string;
  submitted_at?: string | null;
  graded_at?: string | null;
};
type CanvasAssignment = {
  id: number;
  name: string;
  description?: string | null;
  due_at?: string | null;
  html_url?: string | null;
  points_possible?: number | null;
  published?: boolean;
  submission?: CanvasSubmission;
  is_quiz_assignment?: boolean;
  quiz_id?: number | null;
  assignment_group_id?: number | null;
};
type CanvasGroup = {
  id: number;
  name: string;
  assignments?: CanvasAssignment[];
};
type CanvasModuleItem = { type?: string; content_id?: number; title?: string };
type CanvasModule = { id: number; name: string; items?: CanvasModuleItem[] };
type CanvasEvent = {
  id: number | string;
  title: string;
  description?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  all_day?: boolean;
  location_name?: string | null;
  html_url?: string | null;
  context_code?: string | null;
  workflow_state?: string;
};

export type SyncSummary = {
  newTasks: number;
  updatedTasks: number;
  completedTasks: number;
  archivedItems: number;
  calendarEvents: number;
  projectSuggestions: number;
  errors: number;
};
const emptySummary = (): SyncSummary => ({
  newTasks: 0,
  updatedTasks: 0,
  completedTasks: 0,
  archivedItems: 0,
  calendarEvents: 0,
  projectSuggestions: 0,
  errors: 0,
});

function hash(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}
function cleanSubjectName(course: CanvasCourse) {
  return (course.name || course.course_code || `Course ${course.id}`)
    .trim()
    .slice(0, 40);
}
function completedSubmission(assignment: CanvasAssignment) {
  return ["submitted", "graded", "pending_review"].includes(
    assignment.submission?.workflow_state ?? "",
  );
}

async function ensureSubject(
  userId: string,
  course: typeof externalCoursesTable.$inferSelect,
) {
  if (course.subjectId) {
    const [mapped] = await db
      .select()
      .from(subjectsTable)
      .where(
        and(
          eq(subjectsTable.id, course.subjectId),
          eq(subjectsTable.userId, userId),
        ),
      );
    if (mapped) return mapped;
  }
  const baseName =
    course.name.trim().slice(0, 40) || `Canvas ${course.externalCourseId}`;
  const existing = await db
    .select()
    .from(subjectsTable)
    .where(eq(subjectsTable.userId, userId));
  const siblingMappings = await db
    .select()
    .from(externalCoursesTable)
    .where(eq(externalCoursesTable.integrationId, course.integrationId));
  const exact = existing.find(
    (subject) =>
      subject.name.toLowerCase() === baseName.toLowerCase() &&
      !siblingMappings.some(
        (sibling) =>
          sibling.id !== course.id && sibling.subjectId === subject.id,
      ),
  );
  let subject = exact;
  if (!subject) {
    let name = baseName;
    if (existing.some((item) => item.name.toLowerCase() === name.toLowerCase()))
      name =
        `${baseName} ${course.courseCode ?? course.externalCourseId}`.slice(
          0,
          40,
        );
    [subject] = await db
      .insert(subjectsTable)
      .values({ userId, name, color: "#0f6cbf" })
      .returning();
  }
  await db
    .update(externalCoursesTable)
    .set({ subjectId: subject.id, updatedAt: new Date() })
    .where(eq(externalCoursesTable.id, course.id));
  return subject;
}

async function upsertAssignment(
  integration: Integration,
  course: typeof externalCoursesTable.$inferSelect,
  assignment: CanvasAssignment,
  ignored: Set<string>,
  summary: SyncSummary,
) {
  const externalId = String(assignment.id);
  if (ignored.has(`assignment:${externalId}`)) return;
  const subject = await ensureSubject(integration.userId, course);
  const now = new Date();
  const dueAt = assignment.due_at ? new Date(assignment.due_at) : null;
  const dueDate = assignment.due_at?.slice(0, 10) ?? null;
  const category =
    assignment.is_quiz_assignment || assignment.quiz_id
      ? "Quiz/Test"
      : canvasEventCategory(assignment.name);
  const taskKind = canvasCategoryTaskKind(category);
  const externalState =
    assignment.submission?.workflow_state ??
    (assignment.published === false ? "unpublished" : "unsubmitted");
  const sourceHash = hash({
    name: assignment.name,
    due: assignment.due_at,
    url: assignment.html_url,
    state: externalState,
    course: course.externalCourseId,
  });
  const [existing] = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.userId, integration.userId),
        eq(tasksTable.externalSource, "canvas"),
        eq(tasksTable.externalId, externalId),
      ),
    );
  const values = {
    userId: integration.userId,
    title: assignment.name.trim().slice(0, 300),
    description: assignment.description ?? null,
    subject: subject.name,
    taskKind,
    dueDate,
    calendarDate: dueDate,
    dueAt,
    organized: true,
    externalIntegrationId: integration.id,
    externalSource: "canvas",
    externalId,
    externalCourseId: course.externalCourseId,
    externalUrl: assignment.html_url ?? null,
    externalState,
    externalPayloadHash: sourceHash,
    externalLastSeenAt: now,
    archived: false,
  } as const;
  let taskId: number;
  if (!existing) {
    const [created] = await db
      .insert(tasksTable)
      .values({
        ...values,
        status: "todo",
        priority: "medium",
        vpValue: category === "Quiz/Test" ? 15 : 10,
      })
      .returning();
    taskId = created.id;
    summary.newTasks += 1;
  } else {
    taskId = existing.id;
    if (existing.externalPayloadHash !== sourceHash || existing.archived)
      summary.updatedTasks += 1;
    await db
      .update(tasksTable)
      .set(values)
      .where(eq(tasksTable.id, existing.id));
  }
  if (completedSubmission(assignment)) {
    const result = await completeTaskAndAward(integration.userId, taskId);
    if (result.vpAwarded > 0 || existing?.status !== "completed")
      summary.completedTasks += 1;
  } else if (
    existing?.status === "completed" &&
    existing.externalState &&
    completedSubmission({
      ...assignment,
      submission: { workflow_state: existing.externalState },
    })
  ) {
    await db
      .update(tasksTable)
      .set({ status: "todo", completedAt: null })
      .where(eq(tasksTable.id, taskId));
  }
}

async function upsertCalendarTask(input: {
  integration: Integration;
  externalId: string;
  title: string;
  description: string | null;
  startsAt: Date;
  externalCourseId: string | null;
  externalUrl: string | null;
  externalState: string | null;
  subjectName: string | null;
  archived: boolean;
  summary: SyncSummary;
}) {
  const category = canvasEventCategory(input.title);
  const sourceHash = hash({
    title: input.title,
    description: input.description,
    startsAt: input.startsAt,
    category,
    state: input.externalState,
  });
  const [existing] = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.userId, input.integration.userId),
        eq(tasksTable.externalSource, "canvas_event"),
        eq(tasksTable.externalId, input.externalId),
      ),
    );
  const now = new Date();
  const dueDate = input.startsAt.toISOString().slice(0, 10);
  const subject = input.subjectName ?? existing?.subject ?? null;
  const values = {
    userId: input.integration.userId,
    title: input.title.trim().slice(0, 300),
    description: input.description,
    subject,
    taskKind: canvasCategoryTaskKind(category),
    dueDate,
    calendarDate: dueDate,
    dueAt: input.startsAt,
    organized: Boolean(subject),
    externalIntegrationId: input.integration.id,
    externalSource: "canvas_event",
    externalId: input.externalId,
    externalCourseId: input.externalCourseId,
    externalUrl: input.externalUrl,
    externalState: input.externalState,
    externalPayloadHash: sourceHash,
    externalLastSeenAt: now,
    archived: input.archived,
  } as const;
  if (!existing) {
    await db
      .insert(tasksTable)
      .values({
        ...values,
        status: "todo",
        priority: category === "Quiz/Test" ? "high" : "medium",
        vpValue: category === "Quiz/Test" ? 15 : 5,
      })
      .returning();
    input.summary.newTasks += 1;
  } else {
    if (
      existing.externalPayloadHash !== sourceHash ||
      existing.archived !== input.archived
    )
      input.summary.updatedTasks += 1;
    await db
      .update(tasksTable)
      .set(values)
      .where(eq(tasksTable.id, existing.id));
  }
}

async function saveSuggestions(
  integration: Integration,
  courseId: string,
  candidates: Array<{ name: string; ids: string[] }>,
  summary: SyncSummary,
) {
  for (const candidate of candidates) {
    if (candidate.ids.length < 3) continue;
    const linked = await db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.userId, integration.userId),
          eq(tasksTable.externalCourseId, courseId),
          inArray(tasksTable.externalId, candidate.ids),
        ),
      );
    if (linked.filter((task) => task.status !== "completed").length < 2)
      continue;
    if (
      !isMeaningfulProjectCandidate(
        candidate.name,
        linked.length,
        linked.filter((task) => task.status !== "completed").length,
      )
    )
      continue;
    const fingerprint = hash({
      courseId,
      name: normalizeCanvasChainTitle(candidate.name),
      ids: [...candidate.ids].sort(),
    });
    const [created] = await db
      .insert(projectSuggestionsTable)
      .values({
        integrationId: integration.id,
        externalCourseId: courseId,
        fingerprint,
        name: candidate.name.trim().slice(0, 100),
        externalTaskIds: candidate.ids,
      })
      .onConflictDoNothing()
      .returning();
    if (created) summary.projectSuggestions += 1;
  }
}

async function syncOAuth(integration: Integration, summary: SyncSummary) {
  if (!integration.baseUrl || !integration.accessTokenEncrypted)
    throw new Error("Canvas OAuth connection is incomplete");
  let token = decryptIntegrationSecret(integration.accessTokenEncrypted);
  if (
    integration.tokenExpiresAt &&
    integration.tokenExpiresAt.getTime() <= Date.now() + 5 * 60_000
  ) {
    if (
      !integration.refreshTokenEncrypted ||
      !process.env.CANVAS_CLIENT_ID ||
      !process.env.CANVAS_CLIENT_SECRET
    )
      throw new Error("Canvas access expired; reconnect Canvas");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await fetch(
        new URL("/login/oauth2/token", integration.baseUrl),
        {
          method: "POST",
          signal: controller.signal,
          redirect: "error",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: process.env.CANVAS_CLIENT_ID,
            client_secret: process.env.CANVAS_CLIENT_SECRET,
            refresh_token: decryptIntegrationSecret(
              integration.refreshTokenEncrypted,
            ),
          }),
        },
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok)
      throw new Error(`Canvas token refresh failed (${response.status})`);
    const refreshed = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!refreshed.access_token)
      throw new Error("Canvas token refresh returned no access token");
    token = refreshed.access_token;
    await db
      .update(externalIntegrationsTable)
      .set({
        accessTokenEncrypted: encryptIntegrationSecret(token),
        refreshTokenEncrypted: refreshed.refresh_token
          ? encryptIntegrationSecret(refreshed.refresh_token)
          : integration.refreshTokenEncrypted,
        tokenExpiresAt: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000)
          : null,
        updatedAt: new Date(),
      })
      .where(eq(externalIntegrationsTable.id, integration.id));
  }
  const ignoredRows = await db
    .select()
    .from(externalSyncIgnoresTable)
    .where(eq(externalSyncIgnoresTable.integrationId, integration.id));
  const ignored = new Set(
    ignoredRows.map((item) => `${item.externalType}:${item.externalId}`),
  );
  const courses = await db
    .select()
    .from(externalCoursesTable)
    .where(
      and(
        eq(externalCoursesTable.integrationId, integration.id),
        eq(externalCoursesTable.enabled, true),
      ),
    );
  for (const course of courses) {
    try {
      const assignmentsUrl = new URL(
        `/api/v1/courses/${encodeURIComponent(course.externalCourseId)}/assignments`,
        integration.baseUrl,
      );
      assignmentsUrl.searchParams.set("per_page", "100");
      assignmentsUrl.searchParams.append("include[]", "submission");
      assignmentsUrl.searchParams.set("override_assignment_dates", "true");
      const assignments = await canvasPaginated<CanvasAssignment>(
        assignmentsUrl.toString(),
        token,
      );
      const seen = new Set<string>();
      for (const assignment of assignments) {
        seen.add(String(assignment.id));
        await upsertAssignment(
          integration,
          course,
          assignment,
          ignored,
          summary,
        );
      }

      const imported = await db
        .select()
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.userId, integration.userId),
            eq(tasksTable.externalSource, "canvas"),
            eq(tasksTable.externalCourseId, course.externalCourseId),
            eq(tasksTable.archived, false),
          ),
        );
      for (const task of imported) {
        if (task.externalId && !seen.has(task.externalId)) {
          await db
            .update(tasksTable)
            .set({ archived: true })
            .where(eq(tasksTable.id, task.id));
          summary.archivedItems += 1;
        }
      }

      const groupUrl = new URL(
        `/api/v1/courses/${encodeURIComponent(course.externalCourseId)}/assignment_groups`,
        integration.baseUrl,
      );
      groupUrl.searchParams.set("per_page", "100");
      groupUrl.searchParams.append("include[]", "assignments");
      const groups = await canvasPaginated<CanvasGroup>(
        groupUrl.toString(),
        token,
      );
      const candidates = groups.map((group) => ({
        name: group.name,
        ids: (group.assignments ?? []).map((item) => String(item.id)),
      }));
      const moduleUrl = new URL(
        `/api/v1/courses/${encodeURIComponent(course.externalCourseId)}/modules`,
        integration.baseUrl,
      );
      moduleUrl.searchParams.set("per_page", "100");
      moduleUrl.searchParams.append("include[]", "items");
      const modules = await canvasPaginated<CanvasModule>(
        moduleUrl.toString(),
        token,
      );
      candidates.push(
        ...modules.map((module) => ({
          name: module.name,
          ids: (module.items ?? [])
            .filter(
              (item) =>
                ["Assignment", "Quiz"].includes(item.type ?? "") &&
                item.content_id,
            )
            .map((item) => String(item.content_id)),
        })),
      );
      const stems = new Map<string, string[]>();
      for (const assignment of assignments) {
        const stem = normalizeCanvasChainTitle(assignment.name);
        if (stem.length >= 4)
          stems.set(stem, [...(stems.get(stem) ?? []), String(assignment.id)]);
      }
      candidates.push(
        ...[...stems]
          .filter(([, ids]) => ids.length >= 3)
          .map(([name, ids]) => ({
            name: name.replace(/\b\w/g, (value) => value.toUpperCase()),
            ids,
          })),
      );
      await saveSuggestions(
        integration,
        course.externalCourseId,
        candidates,
        summary,
      );

      await db
        .update(externalCoursesTable)
        .set({ lastSeenAt: new Date(), updatedAt: new Date() })
        .where(eq(externalCoursesTable.id, course.id));
    } catch {
      summary.errors += 1;
    }
  }

  const start = new Date();
  start.setMonth(start.getMonth() - 3);
  const end = new Date();
  end.setFullYear(end.getFullYear() + 1);
  const eventUrl = new URL("/api/v1/calendar_events", integration.baseUrl);
  eventUrl.searchParams.set("type", "event");
  eventUrl.searchParams.set("start_date", start.toISOString());
  eventUrl.searchParams.set("end_date", end.toISOString());
  eventUrl.searchParams.set("per_page", "100");
  for (const course of courses)
    eventUrl.searchParams.append(
      "context_codes[]",
      `course_${course.externalCourseId}`,
    );
  const events = courses.length
    ? await canvasPaginated<CanvasEvent>(eventUrl.toString(), token)
    : [];
  const mappedSubjects = await db
    .select()
    .from(subjectsTable)
    .where(eq(subjectsTable.userId, integration.userId));
  const subjectNameByCourse = new Map(
    courses.map((course) => [
      course.externalCourseId,
      mappedSubjects.find((subject) => subject.id === course.subjectId)?.name ??
        null,
    ]),
  );
  const seenEvents = new Set<string>();
  const seenTaskEvents = new Set<string>();
  for (const event of events) {
    const externalId = String(event.id);
    if (ignored.has(`event:${externalId}`)) continue;
    seenEvents.add(externalId);
    const payloadHash = hash(event);
    const now = new Date();
    await db
      .insert(externalCalendarEventsTable)
      .values({
        userId: integration.userId,
        integrationId: integration.id,
        externalEventId: externalId,
        externalCourseId: event.context_code?.replace(/^course_/, "") ?? null,
        title: event.title,
        description: event.description ?? null,
        category: canvasEventCategory(event.title),
        startsAt: event.start_at ? new Date(event.start_at) : null,
        endsAt: event.end_at ? new Date(event.end_at) : null,
        allDay: Boolean(event.all_day),
        location: event.location_name ?? null,
        externalUrl: event.html_url ?? null,
        sourceHash: payloadHash,
        lastSeenAt: now,
        archived: event.workflow_state === "deleted",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          externalCalendarEventsTable.integrationId,
          externalCalendarEventsTable.externalEventId,
        ],
        set: {
          title: event.title,
          description: event.description ?? null,
          category: canvasEventCategory(event.title),
          startsAt: event.start_at ? new Date(event.start_at) : null,
          endsAt: event.end_at ? new Date(event.end_at) : null,
          allDay: Boolean(event.all_day),
          location: event.location_name ?? null,
          externalUrl: event.html_url ?? null,
          sourceHash: payloadHash,
          lastSeenAt: now,
          archived: event.workflow_state === "deleted",
          updatedAt: now,
        },
      });
    const externalCourseId =
      event.context_code?.replace(/^course_/, "") ?? null;
    if (event.start_at && shouldCreateCanvasTask(event.title)) {
      seenTaskEvents.add(externalId);
      await upsertCalendarTask({
        integration,
        externalId,
        title: event.title,
        description: event.description ?? null,
        startsAt: new Date(event.start_at),
        externalCourseId,
        externalUrl: event.html_url ?? null,
        externalState: event.workflow_state ?? null,
        subjectName: externalCourseId
          ? (subjectNameByCourse.get(externalCourseId) ?? null)
          : null,
        archived: event.workflow_state === "deleted",
        summary,
      });
    }
    summary.calendarEvents += 1;
  }
  const importedEvents = await db
    .select()
    .from(externalCalendarEventsTable)
    .where(
      and(
        eq(externalCalendarEventsTable.integrationId, integration.id),
        eq(externalCalendarEventsTable.archived, false),
      ),
    );
  for (const event of importedEvents) {
    if (!seenEvents.has(event.externalEventId)) {
      await db
        .update(externalCalendarEventsTable)
        .set({ archived: true, updatedAt: new Date() })
        .where(eq(externalCalendarEventsTable.id, event.id));
      summary.archivedItems += 1;
    }
  }
  const importedEventTasks = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.externalIntegrationId, integration.id),
        eq(tasksTable.externalSource, "canvas_event"),
        eq(tasksTable.archived, false),
      ),
    );
  for (const task of importedEventTasks) {
    if (task.externalId && !seenTaskEvents.has(task.externalId)) {
      await db
        .update(tasksTable)
        .set({ archived: true })
        .where(eq(tasksTable.id, task.id));
      summary.archivedItems += 1;
    }
  }
}

async function syncFeed(integration: Integration, summary: SyncSummary) {
  if (!integration.feedUrlEncrypted)
    throw new Error("Canvas calendar feed is not configured");
  const feedUrl = decryptIntegrationSecret(integration.feedUrlEncrypted);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(feedUrl, {
      signal: controller.signal,
      redirect: "error",
      headers: { Accept: "text/calendar" },
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok)
    throw new Error(`Canvas calendar feed failed (${response.status})`);
  const parsed = ical.sync.parseICS(await response.text());
  const ignoredRows = await db
    .select()
    .from(externalSyncIgnoresTable)
    .where(eq(externalSyncIgnoresTable.integrationId, integration.id));
  const ignored = new Set(
    ignoredRows.map((item) => `${item.externalType}:${item.externalId}`),
  );
  const seen = new Set<string>();
  const seenTasks = new Set<string>();
  for (const value of Object.values(parsed)) {
    const event = value as
      | undefined
      | {
          type?: string;
          uid?: string;
          start?: Date & { dateOnly?: boolean };
          end?: Date;
          rrule?: {
            between(start: Date, end: Date, inclusive: boolean): Date[];
          };
          summary?: string;
          description?: string;
          location?: string;
          status?: string;
        };
    if (!event || event.type !== "VEVENT" || !event.uid) continue;
    const starts = event.start instanceof Date ? [event.start] : [];
    if (event.rrule)
      starts.push(
        ...event.rrule.between(
          new Date(Date.now() - 90 * 86_400_000),
          new Date(Date.now() + 365 * 86_400_000),
          true,
        ),
      );
    for (const start of new Map(
      starts.map((date) => [date.toISOString(), date]),
    ).values()) {
      const externalId = icalOccurrenceId(event.uid, start);
      if (
        ignored.has(`event:${externalId}`) ||
        ignored.has(`assignment:${externalId}`)
      )
        continue;
      seen.add(externalId);
      const duration =
        event.end instanceof Date && event.start instanceof Date
          ? event.end.getTime() - event.start.getTime()
          : 0;
      const end = duration > 0 ? new Date(start.getTime() + duration) : null;
      const title =
        typeof event.summary === "string" ? event.summary : "Canvas event";
      const now = new Date();
      await db
        .insert(externalCalendarEventsTable)
        .values({
          userId: integration.userId,
          integrationId: integration.id,
          externalEventId: externalId,
          title,
          description:
            typeof event.description === "string" ? event.description : null,
          category: canvasEventCategory(title),
          startsAt: start,
          endsAt: end,
          allDay: Boolean(event.start?.dateOnly),
          location: typeof event.location === "string" ? event.location : null,
          sourceHash: hash({ title, start, end }),
          lastSeenAt: now,
          archived: event.status === "CANCELLED",
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            externalCalendarEventsTable.integrationId,
            externalCalendarEventsTable.externalEventId,
          ],
          set: {
            title,
            description:
              typeof event.description === "string" ? event.description : null,
            category: canvasEventCategory(title),
            startsAt: start,
            endsAt: end,
            location:
              typeof event.location === "string" ? event.location : null,
            lastSeenAt: now,
            archived: event.status === "CANCELLED",
            updatedAt: now,
          },
        });
      if (shouldCreateCanvasTask(title)) {
        seenTasks.add(externalId);
        await upsertCalendarTask({
          integration,
          externalId,
          title,
          description:
            typeof event.description === "string" ? event.description : null,
          startsAt: start,
          externalCourseId: null,
          externalUrl: null,
          externalState: event.status ?? null,
          subjectName: null,
          archived: event.status === "CANCELLED",
          summary,
        });
      }
      summary.calendarEvents += 1;
    }
  }
  const imported = await db
    .select()
    .from(externalCalendarEventsTable)
    .where(
      and(
        eq(externalCalendarEventsTable.integrationId, integration.id),
        eq(externalCalendarEventsTable.archived, false),
      ),
    );
  for (const event of imported) {
    if (!seen.has(event.externalEventId)) {
      await db
        .update(externalCalendarEventsTable)
        .set({ archived: true, updatedAt: new Date() })
        .where(eq(externalCalendarEventsTable.id, event.id));
      summary.archivedItems += 1;
    }
  }
  const importedTasks = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.externalIntegrationId, integration.id),
        eq(tasksTable.externalSource, "canvas_event"),
        eq(tasksTable.archived, false),
      ),
    );
  for (const task of importedTasks) {
    if (task.externalId && !seenTasks.has(task.externalId)) {
      await db
        .update(tasksTable)
        .set({ archived: true })
        .where(eq(tasksTable.id, task.id));
      summary.archivedItems += 1;
    }
  }
}

export async function runCanvasSync(runId: number, integrationId: number) {
  const summary = emptySummary();
  await db
    .update(integrationSyncRunsTable)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(integrationSyncRunsTable.id, runId));
  const [integration] = await db
    .select()
    .from(externalIntegrationsTable)
    .where(eq(externalIntegrationsTable.id, integrationId));
  if (!integration) return;
  try {
    if (integration.mode === "oauth") await syncOAuth(integration, summary);
    else await syncFeed(integration, summary);
    const completedAt = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(integrationSyncRunsTable)
        .set({ status: "completed", summary, completedAt })
        .where(eq(integrationSyncRunsTable.id, runId));
      await tx
        .update(externalIntegrationsTable)
        .set({
          status: "connected",
          lastSyncedAt: completedAt,
          lastError: null,
          updatedAt: completedAt,
        })
        .where(eq(externalIntegrationsTable.id, integration.id));
    });
  } catch (error) {
    const message = redactIntegrationError(error);
    await db.transaction(async (tx) => {
      await tx
        .update(integrationSyncRunsTable)
        .set({
          status: "failed",
          summary,
          error: message,
          completedAt: new Date(),
        })
        .where(eq(integrationSyncRunsTable.id, runId));
      await tx
        .update(externalIntegrationsTable)
        .set({
          status: /revoked|expired/i.test(message) ? "reauthorize" : "error",
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(externalIntegrationsTable.id, integration.id));
    });
  }
}

export async function discoverCanvasCourses(integration: Integration) {
  if (!integration.baseUrl || !integration.accessTokenEncrypted)
    throw new Error("Canvas OAuth connection is incomplete");
  const token = decryptIntegrationSecret(integration.accessTokenEncrypted);
  const url = new URL("/api/v1/courses", integration.baseUrl);
  url.searchParams.set("enrollment_state", "active");
  url.searchParams.set("enrollment_type", "student");
  url.searchParams.set("per_page", "100");
  const courses = await canvasPaginated<CanvasCourse>(url.toString(), token);
  const now = new Date();
  for (const course of courses) {
    await db
      .insert(externalCoursesTable)
      .values({
        integrationId: integration.id,
        externalCourseId: String(course.id),
        name: cleanSubjectName(course),
        courseCode: course.course_code ?? null,
        workflowState: course.workflow_state ?? null,
        enabled: true,
        lastSeenAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          externalCoursesTable.integrationId,
          externalCoursesTable.externalCourseId,
        ],
        set: {
          name: cleanSubjectName(course),
          courseCode: course.course_code ?? null,
          workflowState: course.workflow_state ?? null,
          lastSeenAt: now,
          updatedAt: now,
        },
      });
  }
  return db
    .select()
    .from(externalCoursesTable)
    .where(eq(externalCoursesTable.integrationId, integration.id));
}
