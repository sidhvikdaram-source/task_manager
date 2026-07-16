import { and, eq, ilike, ne, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, userStatsTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/social/search", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 48) : "";
  if (query.length < 2) { res.json([]); return; }

  const pattern = `%${query.replace(/[%_\\]/g, "\\$&")}%`;
  const matches = await db
    .select({ id: usersTable.id, displayName: usersTable.firstName, username: usersTable.username, profileImageUrl: usersTable.profileImageUrl, avatarStyle: usersTable.avatarStyle })
    .from(usersTable)
    .where(and(ne(usersTable.id, req.user.id), or(ilike(usersTable.firstName, pattern), ilike(usersTable.username, pattern))))
    .limit(12);

  if (matches.length === 0) { res.json([]); return; }
  const result = await Promise.all(matches.map(async (user) => {
    const [stats] = await db.select({ tier: userStatsTable.tier, streakDays: userStatsTable.streakDays }).from(userStatsTable).where(eq(userStatsTable.userId, user.id));
    return { ...user, level: stats?.tier ?? 1, streakDays: stats?.streakDays ?? 0, online: false };
  }));
  res.json(result);
});

export default router;
