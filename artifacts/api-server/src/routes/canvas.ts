import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db, externalCalendarEventsTable, externalCoursesTable, externalIntegrationsTable,
  externalSyncIgnoresTable, integrationSyncRunsTable, projectSuggestionsTable,
  projectsTable, subjectsTable, tasksTable,
} from "@workspace/db";
import { getSession, getSessionId, updateSession } from "../lib/auth";
import { validateCanvasUrl, validateOAuthState } from "../lib/canvasClient";
import { discoverCanvasCourses, runCanvasSync } from "../lib/canvasSync";
import { encryptIntegrationSecret, redactIntegrationError } from "../lib/integrationCrypto";

const router: IRouter = Router();
const allowedCategories = new Set(["Quiz/Test", "Meeting", "Class Event", "Deadline", "Other"]);
const activeRuns = new Set<number>();

function configuredBaseUrl() { return validateCanvasUrl(process.env.CANVAS_BASE_URL ?? "https://fisd.instructure.com", "base"); }
function callbackUrl(req: Parameters<Parameters<typeof router.get>[1]>[0]) { return process.env.CANVAS_REDIRECT_URI ?? `${req.protocol}://${req.get("host")}/api/canvas/oauth/callback`; }
async function integrationFor(userId: string) { return (await db.select().from(externalIntegrationsTable).where(and(eq(externalIntegrationsTable.userId, userId), eq(externalIntegrationsTable.provider, "canvas"))))[0]; }
function requireUser(req: Parameters<Parameters<typeof router.get>[1]>[0], res: Parameters<Parameters<typeof router.get>[1]>[1]) {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return null; }
  return req.user.id;
}

router.get("/canvas/status", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return;
  const integration = await integrationFor(userId);
  if (!integration) { res.json({ connected: false, oauthAvailable: Boolean(process.env.CANVAS_CLIENT_ID && process.env.CANVAS_CLIENT_SECRET), defaultBaseUrl: configuredBaseUrl() }); return; }
  const [courses, latestRun, suggestions, ignored] = await Promise.all([
    db.select({ id: externalCoursesTable.id, externalCourseId: externalCoursesTable.externalCourseId, name: externalCoursesTable.name, courseCode: externalCoursesTable.courseCode, subjectId: externalCoursesTable.subjectId, enabled: externalCoursesTable.enabled }).from(externalCoursesTable).where(eq(externalCoursesTable.integrationId, integration.id)),
    db.select().from(integrationSyncRunsTable).where(eq(integrationSyncRunsTable.integrationId, integration.id)).orderBy(desc(integrationSyncRunsTable.createdAt)).limit(1).then((rows) => rows[0] ?? null),
    db.select().from(projectSuggestionsTable).where(and(eq(projectSuggestionsTable.integrationId, integration.id), eq(projectSuggestionsTable.status, "pending"))),
    db.select().from(externalSyncIgnoresTable).where(eq(externalSyncIgnoresTable.integrationId, integration.id)),
  ]);
  res.json({ connected: true, integration: { id: integration.id, mode: integration.mode, baseUrl: integration.baseUrl, status: integration.status, lastSyncedAt: integration.lastSyncedAt, lastError: integration.lastError }, courses, latestRun, suggestionCount: suggestions.length, ignoredCount: ignored.length, needsCourseSelection: integration.mode === "oauth" && courses.some((course) => !course.subjectId) });
});

router.get("/canvas/oauth/start", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return;
  const clientId = process.env.CANVAS_CLIENT_ID;
  if (!clientId || !process.env.CANVAS_CLIENT_SECRET) { res.status(503).json({ error: "Canvas OAuth is not configured yet. Use the calendar feed fallback." }); return; }
  const sid = getSessionId(req); if (!sid) { res.status(401).json({ error: "Session required" }); return; }
  const session = await getSession(sid); if (!session) { res.status(401).json({ error: "Session expired" }); return; }
  const state = crypto.randomBytes(32).toString("base64url"); const baseUrl = configuredBaseUrl();
  await updateSession(sid, { ...session, canvas_oauth_state: state, canvas_oauth_base_url: baseUrl });
  const url = new URL("/login/oauth2/auth", baseUrl); url.searchParams.set("client_id", clientId); url.searchParams.set("response_type", "code"); url.searchParams.set("redirect_uri", callbackUrl(req)); url.searchParams.set("state", state);
  res.redirect(url.toString());
});

router.get("/canvas/oauth/callback", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return;
  const sid = getSessionId(req); const session = sid ? await getSession(sid) : null;
  if (!sid || !session || !validateOAuthState(session.canvas_oauth_state, req.query.state) || typeof req.query.code !== "string") { res.status(400).send("Invalid or expired Canvas OAuth state."); return; }
  const baseUrl = validateCanvasUrl(session.canvas_oauth_base_url ?? configuredBaseUrl(), "base");
  try {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try { response = await fetch(new URL("/login/oauth2/token", baseUrl), { method: "POST", signal: controller.signal, redirect: "error", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: process.env.CANVAS_CLIENT_ID!, client_secret: process.env.CANVAS_CLIENT_SECRET!, redirect_uri: callbackUrl(req), code: req.query.code }) }); }
    finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error(`Canvas token exchange failed (${response.status})`);
    const token = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number; user?: { id?: number } };
    if (!token.access_token) throw new Error("Canvas did not return an access token");
    const now = new Date();
    const [integration] = await db.insert(externalIntegrationsTable).values({ userId, provider: "canvas", mode: "oauth", baseUrl, accessTokenEncrypted: encryptIntegrationSecret(token.access_token), refreshTokenEncrypted: token.refresh_token ? encryptIntegrationSecret(token.refresh_token) : null, tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null, externalUserId: token.user?.id ? String(token.user.id) : null, status: "connected", updatedAt: now })
      .onConflictDoUpdate({ target: [externalIntegrationsTable.userId, externalIntegrationsTable.provider], set: { mode: "oauth", baseUrl, accessTokenEncrypted: encryptIntegrationSecret(token.access_token), refreshTokenEncrypted: token.refresh_token ? encryptIntegrationSecret(token.refresh_token) : null, tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null, externalUserId: token.user?.id ? String(token.user.id) : null, status: "connected", lastError: null, updatedAt: now } }).returning();
    await updateSession(sid, { ...session, canvas_oauth_state: undefined, canvas_oauth_base_url: undefined });
    await discoverCanvasCourses(integration);
    res.redirect("/school?canvas=connected");
  } catch (error) { res.status(502).send(`Canvas connection failed: ${redactIntegrationError(error)}`); }
});

router.post("/canvas/feed/connect", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return;
  try {
    const feedUrl = validateCanvasUrl(String(req.body?.feedUrl ?? ""), "feed"); const now = new Date();
    const [integration] = await db.insert(externalIntegrationsTable).values({ userId, provider: "canvas", mode: "ical", baseUrl: new URL(feedUrl).origin, feedUrlEncrypted: encryptIntegrationSecret(feedUrl), status: "connected", updatedAt: now })
      .onConflictDoUpdate({ target: [externalIntegrationsTable.userId, externalIntegrationsTable.provider], set: { mode: "ical", baseUrl: new URL(feedUrl).origin, feedUrlEncrypted: encryptIntegrationSecret(feedUrl), accessTokenEncrypted: null, refreshTokenEncrypted: null, status: "connected", lastError: null, updatedAt: now } }).returning();
    res.status(201).json({ connected: true, mode: integration.mode });
  } catch (error) { res.status(400).json({ error: redactIntegrationError(error) }); }
});

router.put("/canvas/courses", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return; const integration = await integrationFor(userId);
  if (!integration || integration.mode !== "oauth") { res.status(404).json({ error: "Canvas OAuth connection not found" }); return; }
  const selections = Array.isArray(req.body?.courses) ? req.body.courses as Array<{ id: number; enabled?: boolean; subjectId?: number | null }> : [];
  const courses = await db.select().from(externalCoursesTable).where(eq(externalCoursesTable.integrationId, integration.id));
  const claimedSubjectIds = new Set<number>();
  for (const course of courses) {
    const selection = selections.find((item) => Number(item.id) === course.id); if (!selection) continue;
    let subjectId = selection.subjectId ?? course.subjectId;
    if (selection.enabled !== false && !subjectId) {
      const current = await db.select().from(subjectsTable).where(eq(subjectsTable.userId, userId));
      let subject = current.find((item) => item.name.toLowerCase() === course.name.toLowerCase() && !claimedSubjectIds.has(item.id));
      if (!subject) {
        const base = course.name.slice(0, 32); const suffix = course.courseCode ?? course.externalCourseId;
        [subject] = await db.insert(subjectsTable).values({ userId, name: `${base} ${suffix}`.slice(0, 40), color: "#0f6cbf" }).returning();
      }
      subjectId = subject.id;
    }
    if (subjectId) claimedSubjectIds.add(subjectId);
    await db.update(externalCoursesTable).set({ enabled: selection.enabled !== false, subjectId, updatedAt: new Date() }).where(eq(externalCoursesTable.id, course.id));
    if (selection.enabled === false) await db.update(tasksTable).set({ archived: true }).where(and(eq(tasksTable.userId, userId), eq(tasksTable.externalIntegrationId, integration.id), eq(tasksTable.externalCourseId, course.externalCourseId)));
  }
  res.json({ updated: selections.length });
});

router.post("/canvas/sync", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return; const integration = await integrationFor(userId);
  if (!integration) { res.status(404).json({ error: "Connect Canvas first" }); return; }
  const [running] = await db.select().from(integrationSyncRunsTable).where(and(eq(integrationSyncRunsTable.integrationId, integration.id), inArray(integrationSyncRunsTable.status, ["queued", "running"]))).orderBy(desc(integrationSyncRunsTable.createdAt)).limit(1);
  if (running) {
    if (!activeRuns.has(integration.id)) { activeRuns.add(integration.id); void runCanvasSync(running.id, integration.id).catch(() => undefined).finally(() => activeRuns.delete(integration.id)); }
    res.status(202).json(running); return;
  }
  const [run] = await db.insert(integrationSyncRunsTable).values({ integrationId: integration.id, status: "queued" }).returning();
  if (!activeRuns.has(integration.id)) { activeRuns.add(integration.id); void runCanvasSync(run.id, integration.id).catch(() => undefined).finally(() => activeRuns.delete(integration.id)); }
  res.status(202).json(run);
});

router.get("/canvas/sync/:id", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return; const integration = await integrationFor(userId);
  if (!integration) { res.status(404).json({ error: "Canvas connection not found" }); return; }
  const [run] = await db.select().from(integrationSyncRunsTable).where(and(eq(integrationSyncRunsTable.id, Number(req.params.id)), eq(integrationSyncRunsTable.integrationId, integration.id)));
  if (!run) { res.status(404).json({ error: "Sync run not found" }); return; } res.json(run);
});

router.get("/canvas/events", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return;
  const events = await db.select().from(externalCalendarEventsTable).where(and(eq(externalCalendarEventsTable.userId, userId), eq(externalCalendarEventsTable.archived, false)));
  const categories = typeof req.query.categories === "string" ? new Set(req.query.categories.split(",").filter((value) => allowedCategories.has(value))) : null;
  res.json(categories?.size ? events.filter((event) => categories.has(event.category)) : events);
});

router.get("/canvas/ignored", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return; const integration = await integrationFor(userId);
  if (!integration) { res.json([]); return; }
  const items = await db.select().from(externalSyncIgnoresTable).where(eq(externalSyncIgnoresTable.integrationId, integration.id)).orderBy(desc(externalSyncIgnoresTable.createdAt));
  const query = String(req.query.q ?? "").toLowerCase(); res.json(query ? items.filter((item) => item.title?.toLowerCase().includes(query) || item.externalId.includes(query)) : items);
});

router.post("/canvas/ignore", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return; const integration = await integrationFor(userId);
  if (!integration) { res.status(404).json({ error: "Canvas connection not found" }); return; }
  const externalType = req.body?.externalType === "event" ? "event" : "assignment";
  let ids = Array.isArray(req.body?.externalIds) ? req.body.externalIds.map(String).slice(0, 500) : [String(req.body?.externalId ?? "")];
  if (externalType === "event" && allowedCategories.has(req.body?.category)) {
    ids = (await db.select({ id: externalCalendarEventsTable.externalEventId }).from(externalCalendarEventsTable).where(and(eq(externalCalendarEventsTable.integrationId, integration.id), eq(externalCalendarEventsTable.category, req.body.category)))).map((item) => item.id);
  }
  if (externalType === "assignment" && typeof req.body?.externalCourseId === "string") {
    ids = (await db.select({ id: tasksTable.externalId }).from(tasksTable).where(and(eq(tasksTable.externalIntegrationId, integration.id), eq(tasksTable.externalCourseId, req.body.externalCourseId)))).flatMap((item) => item.id ? [item.id] : []);
    await db.update(externalCoursesTable).set({ enabled: false, updatedAt: new Date() }).where(and(eq(externalCoursesTable.integrationId, integration.id), eq(externalCoursesTable.externalCourseId, req.body.externalCourseId)));
  }
  for (const externalId of ids.filter(Boolean)) {
    let title: string | null = null;
    if (externalType === "assignment") { const [task] = await db.select().from(tasksTable).where(and(eq(tasksTable.userId, userId), eq(tasksTable.externalIntegrationId, integration.id), eq(tasksTable.externalId, externalId))); title = task?.title ?? null; await db.update(tasksTable).set({ archived: true }).where(and(eq(tasksTable.userId, userId), eq(tasksTable.externalIntegrationId, integration.id), eq(tasksTable.externalId, externalId))); }
    else { const [event] = await db.select().from(externalCalendarEventsTable).where(and(eq(externalCalendarEventsTable.userId, userId), eq(externalCalendarEventsTable.integrationId, integration.id), eq(externalCalendarEventsTable.externalEventId, externalId))); title = event?.title ?? null; await db.update(externalCalendarEventsTable).set({ archived: true }).where(and(eq(externalCalendarEventsTable.userId, userId), eq(externalCalendarEventsTable.integrationId, integration.id), eq(externalCalendarEventsTable.externalEventId, externalId))); }
    await db.insert(externalSyncIgnoresTable).values({ integrationId: integration.id, externalType, externalId, title, reason: typeof req.body?.reason === "string" ? req.body.reason.slice(0, 200) : "Removed from Velocity" }).onConflictDoNothing();
  }
  res.status(201).json({ ignored: ids.filter(Boolean).length });
});

router.post("/canvas/ignored/:id/restore", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return; const integration = await integrationFor(userId);
  if (!integration) { res.status(404).json({ error: "Canvas connection not found" }); return; }
  const [item] = await db.delete(externalSyncIgnoresTable).where(and(eq(externalSyncIgnoresTable.id, Number(req.params.id)), eq(externalSyncIgnoresTable.integrationId, integration.id))).returning();
  if (!item) { res.status(404).json({ error: "Ignored item not found" }); return; }
  if (item.externalType === "assignment") await db.update(tasksTable).set({ archived: false }).where(and(eq(tasksTable.userId, userId), eq(tasksTable.externalIntegrationId, integration.id), eq(tasksTable.externalId, item.externalId)));
  else await db.update(externalCalendarEventsTable).set({ archived: false }).where(and(eq(externalCalendarEventsTable.userId, userId), eq(externalCalendarEventsTable.integrationId, integration.id), eq(externalCalendarEventsTable.externalEventId, item.externalId)));
  res.json({ restored: true, syncRequired: true });
});

router.delete("/canvas/ignored/:id", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return; const integration = await integrationFor(userId);
  if (!integration) { res.status(404).json({ error: "Canvas connection not found" }); return; }
  const [item] = await db.select().from(externalSyncIgnoresTable).where(and(eq(externalSyncIgnoresTable.id, Number(req.params.id)), eq(externalSyncIgnoresTable.integrationId, integration.id)));
  if (!item) { res.status(404).json({ error: "Ignored item not found" }); return; }
  if (item.externalType === "assignment") await db.delete(tasksTable).where(and(eq(tasksTable.userId, userId), eq(tasksTable.externalIntegrationId, integration.id), eq(tasksTable.externalId, item.externalId)));
  else await db.delete(externalCalendarEventsTable).where(and(eq(externalCalendarEventsTable.userId, userId), eq(externalCalendarEventsTable.integrationId, integration.id), eq(externalCalendarEventsTable.externalEventId, item.externalId)));
  res.sendStatus(204);
});

router.get("/canvas/suggestions", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return; const integration = await integrationFor(userId);
  if (!integration) { res.json([]); return; }
  res.json(await db.select().from(projectSuggestionsTable).where(and(eq(projectSuggestionsTable.integrationId, integration.id), eq(projectSuggestionsTable.status, "pending"))).orderBy(desc(projectSuggestionsTable.createdAt)));
});

router.post("/canvas/suggestions/:id/accept", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return; const integration = await integrationFor(userId);
  if (!integration) { res.status(404).json({ error: "Canvas connection not found" }); return; }
  const [suggestion] = await db.select().from(projectSuggestionsTable).where(and(eq(projectSuggestionsTable.id, Number(req.params.id)), eq(projectSuggestionsTable.integrationId, integration.id), eq(projectSuggestionsTable.status, "pending")));
  if (!suggestion) { res.status(404).json({ error: "Suggestion not found" }); return; }
  const tasks = await db.select().from(tasksTable).where(and(eq(tasksTable.userId, userId), eq(tasksTable.externalCourseId, suggestion.externalCourseId), inArray(tasksTable.externalId, suggestion.externalTaskIds)));
  if (!tasks.length) { res.status(409).json({ error: "The linked Canvas tasks are no longer available. Sync Canvas and try again." }); return; }
  const course = (await db.select().from(externalCoursesTable).where(and(eq(externalCoursesTable.integrationId, integration.id), eq(externalCoursesTable.externalCourseId, suggestion.externalCourseId))))[0];
  const subject = course?.subjectId ? (await db.select().from(subjectsTable).where(eq(subjectsTable.id, course.subjectId)))[0] : null;
  const dueDate = tasks.map((task) => task.dueDate).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  const project = await db.transaction(async (tx) => { const [created] = await tx.insert(projectsTable).values({ userId, name: suggestion.name, subject: subject?.name ?? tasks[0]?.subject ?? null, dueDate, priority: "medium", status: "active", color: subject?.color ?? "#0f6cbf" }).returning(); await tx.update(tasksTable).set({ projectId: created.id }).where(and(eq(tasksTable.userId, userId), inArray(tasksTable.id, tasks.map((task) => task.id)))); await tx.update(projectSuggestionsTable).set({ status: "accepted", projectId: created.id, updatedAt: new Date() }).where(eq(projectSuggestionsTable.id, suggestion.id)); return created; });
  res.status(201).json(project);
});

router.post("/canvas/suggestions/:id/dismiss", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return; const integration = await integrationFor(userId);
  if (!integration) { res.status(404).json({ error: "Canvas connection not found" }); return; }
  const [item] = await db.update(projectSuggestionsTable).set({ status: "dismissed", updatedAt: new Date() }).where(and(eq(projectSuggestionsTable.id, Number(req.params.id)), eq(projectSuggestionsTable.integrationId, integration.id))).returning();
  if (!item) { res.status(404).json({ error: "Suggestion not found" }); return; } res.json(item);
});

router.delete("/canvas", async (req, res): Promise<void> => {
  const userId = requireUser(req, res); if (!userId) return; const integration = await integrationFor(userId);
  if (!integration) { res.sendStatus(204); return; }
  await db.transaction(async (tx) => { await tx.update(tasksTable).set({ archived: true }).where(and(eq(tasksTable.userId, userId), eq(tasksTable.externalIntegrationId, integration.id))); await tx.delete(externalIntegrationsTable).where(eq(externalIntegrationsTable.id, integration.id)); });
  res.sendStatus(204);
});

export default router;
