import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, checklistItemsTable, userStatsTable } from "@workspace/db";
import {
  CreateChecklistItemParams,
  CreateChecklistItemBody,
  ListChecklistItemsParams,
  UpdateChecklistItemParams,
  UpdateChecklistItemBody,
  DeleteChecklistItemParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/tasks/:id/checklist", async (req, res): Promise<void> => {
  const params = ListChecklistItemsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const items = await db
    .select()
    .from(checklistItemsTable)
    .where(eq(checklistItemsTable.taskId, params.data.id))
    .orderBy(checklistItemsTable.createdAt);

  res.json(items);
});

router.post("/tasks/:id/checklist", async (req, res): Promise<void> => {
  const params = CreateChecklistItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateChecklistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db.insert(checklistItemsTable).values({
    taskId: params.data.id,
    title: parsed.data.title,
  }).returning();

  res.status(201).json(item);
});

router.patch("/checklist/:itemId", async (req, res): Promise<void> => {
  const params = UpdateChecklistItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateChecklistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(checklistItemsTable).where(eq(checklistItemsTable.id, params.data.itemId));
  if (!existing) {
    res.status(404).json({ error: "Checklist item not found" });
    return;
  }

  // Award 2 VP when completing a checklist item
  if (parsed.data.completed === true && !existing.completed) {
    const [stats] = await db.select().from(userStatsTable).limit(1);
    if (stats) {
      const vpAwarded = Math.round(2 * (stats.multiplier ?? 1.0));
      const newTotal = stats.totalVp + vpAwarded;
      const newTierProgress = stats.tierProgress + vpAwarded;
      const tierUps = Math.floor(newTierProgress / 100);
      await db.update(userStatsTable).set({
        totalVp: newTotal,
        tier: stats.tier + tierUps,
        tierProgress: newTierProgress % 100,
        updatedAt: new Date(),
      }).where(eq(userStatsTable.id, stats.id));
    }
  }

  const [item] = await db
    .update(checklistItemsTable)
    .set(parsed.data)
    .where(eq(checklistItemsTable.id, params.data.itemId))
    .returning();

  res.json(item);
});

router.delete("/checklist/:itemId", async (req, res): Promise<void> => {
  const params = DeleteChecklistItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [item] = await db
    .delete(checklistItemsTable)
    .where(eq(checklistItemsTable.id, params.data.itemId))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Checklist item not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
