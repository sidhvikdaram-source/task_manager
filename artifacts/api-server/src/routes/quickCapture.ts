import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  checklistItemsTable,
  db,
  projectsTable,
  subjectsTable,
  tasksTable,
  usersTable,
} from "@workspace/db";
import { parseQuickCapture } from "../lib/quickCapture";
import { localDateKey } from "../lib/localDate";

const router: IRouter = Router();

async function parseForUser(
  userId: string,
  text: string,
  contextSubject?: string,
) {
  const [projects, subjects, user] = await Promise.all([
    db
      .select({ id: projectsTable.id, name: projectsTable.name })
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.userId, userId),
          eq(projectsTable.archived, false),
        ),
      ),
    db
      .select({ id: subjectsTable.id, name: subjectsTable.name })
      .from(subjectsTable)
      .where(
        and(
          eq(subjectsTable.userId, userId),
          eq(subjectsTable.archived, false),
        ),
      ),
    db
      .select({ timezone: usersTable.timezone })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .then((rows) => rows[0]),
  ]);
  const parsed = parseQuickCapture(
    text,
    projects,
    subjects,
    localDateKey(new Date(), user?.timezone),
  );
  const contextualSubject = subjects.find(
    (subject) =>
      subject.name.toLowerCase() === contextSubject?.trim().toLowerCase(),
  );
  return {
    ...parsed,
    subject: parsed.subject ?? contextualSubject?.name ?? null,
  };
}

router.post("/quick-capture/preview", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const text =
    typeof req.body?.text === "string"
      ? req.body.text.trim().slice(0, 4000)
      : "";
  if (!text) {
    res.status(400).json({ error: "Enter a task to preview." });
    return;
  }
  res.json(await parseForUser(req.user.id, text, req.body?.contextSubject));
});

router.post("/quick-capture", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const text =
    typeof req.body?.text === "string"
      ? req.body.text.trim().slice(0, 4000)
      : "";
  if (!text) {
    res.status(400).json({ error: "Enter a task to create." });
    return;
  }
  const parsed = await parseForUser(
    req.user.id,
    text,
    req.body?.contextSubject,
  );
  if (!parsed.title) {
    res
      .status(400)
      .json({
        error: "The task needs a title after its date and organization tokens.",
      });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [task] = await tx
      .insert(tasksTable)
      .values({
        userId: req.user.id,
        title: parsed.title.slice(0, 160),
        priority: parsed.priority,
        vpValue:
          parsed.priority === "critical"
            ? 25
            : parsed.priority === "high"
              ? 15
              : parsed.priority === "low"
                ? 5
                : 10,
        dueDate: parsed.dueDate,
        calendarDate: parsed.dueDate,
        description: parsed.time ? `Time: ${parsed.time}` : null,
        notes: parsed.time ? `Time: ${parsed.time}` : null,
        projectId: parsed.projectId,
        subject: parsed.subject,
        estimatedMinutes: parsed.estimatedMinutes,
        organized: Boolean(parsed.projectId || parsed.subject),
      })
      .returning();
    const checklist = parsed.checklist.length
      ? await tx
          .insert(checklistItemsTable)
          .values(
            parsed.checklist.map((title) => ({
              taskId: task.id,
              title: title.slice(0, 200),
            })),
          )
          .returning()
      : [];
    return {
      task: {
        ...task,
        checklistCount: checklist.length,
        checklistCompleted: 0,
      },
      checklist,
      parsed,
    };
  });
  res.status(201).json(result);
});

export default router;
