import { and, asc, desc, eq, ilike, isNull, ne, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, directMessagesTable, friendshipsTable, userBlocksTable, userReportsTable, userStatsTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

async function publicProfile(userId: string) {
  const [user] = await db.select({ id: usersTable.id, displayName: usersTable.firstName, username: usersTable.username, profileImageUrl: usersTable.profileImageUrl, avatarStyle: usersTable.avatarStyle, equippedCosmetic: usersTable.equippedCosmetic, equippedFrame: usersTable.equippedFrame }).from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return null;
  const [stats] = await db.select({ tier: userStatsTable.tier, streakDays: userStatsTable.streakDays }).from(userStatsTable).where(eq(userStatsTable.userId, user.id));
  return { ...user, level: stats?.tier ?? 1, streakDays: stats?.streakDays ?? 0, online: false };
}

async function relationship(userId: string, otherId: string) {
  const [friendship] = await db.select().from(friendshipsTable).where(or(and(eq(friendshipsTable.requesterId, userId), eq(friendshipsTable.recipientId, otherId)), and(eq(friendshipsTable.requesterId, otherId), eq(friendshipsTable.recipientId, userId))));
  return friendship;
}

async function isBlocked(userId: string, otherId: string) {
  const [blocked] = await db.select().from(userBlocksTable).where(or(and(eq(userBlocksTable.blockerId, userId), eq(userBlocksTable.blockedId, otherId)), and(eq(userBlocksTable.blockerId, otherId), eq(userBlocksTable.blockedId, userId))));
  return Boolean(blocked);
}

router.get("/social/search", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 48) : "";
  if (query.length < 2) { res.json([]); return; }
  const pattern = `%${query.replace(/[%_\\]/g, "\\$&")}%`;
  const matches = await db.select({ id: usersTable.id }).from(usersTable).where(and(ne(usersTable.id, req.user.id), or(ilike(usersTable.firstName, pattern), ilike(usersTable.username, pattern)))).limit(12);
  const results = await Promise.all(matches.map(async ({ id }) => {
    if (await isBlocked(req.user.id, id)) return null;
    const profile = await publicProfile(id);
    const friendship = await relationship(req.user.id, id);
    return profile && { ...profile, friendshipStatus: friendship?.status ?? "none", requestDirection: friendship ? (friendship.requesterId === req.user.id ? "outgoing" : "incoming") : null, friendshipId: friendship?.id ?? null };
  }));
  res.json(results.filter(Boolean));
});

router.get("/social/friends", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select().from(friendshipsTable).where(and(eq(friendshipsTable.status, "accepted"), or(eq(friendshipsTable.requesterId, req.user.id), eq(friendshipsTable.recipientId, req.user.id)))).orderBy(desc(friendshipsTable.updatedAt));
  const friends = await Promise.all(rows.map(async (row) => ({ friendshipId: row.id, ...(await publicProfile(row.requesterId === req.user.id ? row.recipientId : row.requesterId)) })));
  res.json(friends);
});

router.get("/social/requests", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select().from(friendshipsTable).where(and(eq(friendshipsTable.recipientId, req.user.id), eq(friendshipsTable.status, "pending"))).orderBy(desc(friendshipsTable.createdAt));
  res.json(await Promise.all(rows.map(async (row) => ({ friendshipId: row.id, ...(await publicProfile(row.requesterId)) }))));
});

router.post("/social/friends/request", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const recipientId = typeof req.body?.userId === "string" ? req.body.userId : "";
  if (!recipientId || recipientId === req.user.id) { res.status(400).json({ error: "Invalid friend request." }); return; }
  if (await isBlocked(req.user.id, recipientId)) { res.status(403).json({ error: "This connection is unavailable." }); return; }
  const existing = await relationship(req.user.id, recipientId);
  if (existing) { res.status(409).json({ error: existing.status === "accepted" ? "You are already friends." : "A request already exists." }); return; }
  const [request] = await db.insert(friendshipsTable).values({ requesterId: req.user.id, recipientId }).returning();
  res.status(201).json(request);
});

router.post("/social/requests/:id/:action", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id); const action = req.params.action;
  const [request] = await db.select().from(friendshipsTable).where(and(eq(friendshipsTable.id, id), eq(friendshipsTable.recipientId, req.user.id), eq(friendshipsTable.status, "pending")));
  if (!request) { res.status(404).json({ error: "Request not found." }); return; }
  if (action === "accept") { const [updated] = await db.update(friendshipsTable).set({ status: "accepted", updatedAt: new Date() }).where(eq(friendshipsTable.id, id)).returning(); res.json(updated); return; }
  if (action === "decline") { await db.delete(friendshipsTable).where(eq(friendshipsTable.id, id)); res.json({ ok: true }); return; }
  res.status(400).json({ error: "Unknown action." });
});

router.delete("/social/friends/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  await db.delete(friendshipsTable).where(and(eq(friendshipsTable.id, id), or(eq(friendshipsTable.requesterId, req.user.id), eq(friendshipsTable.recipientId, req.user.id))));
  res.json({ ok: true });
});

router.post("/social/users/:id/block", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const target = req.params.id;
  if (!target || target === req.user.id) { res.status(400).json({ error: "Invalid user." }); return; }
  await db.insert(userBlocksTable).values({ blockerId: req.user.id, blockedId: target }).onConflictDoNothing();
  const friend = await relationship(req.user.id, target); if (friend) await db.delete(friendshipsTable).where(eq(friendshipsTable.id, friend.id));
  res.json({ ok: true });
});

router.post("/social/users/:id/report", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 240) : "";
  if (!reason) { res.status(400).json({ error: "A report reason is required." }); return; }
  await db.insert(userReportsTable).values({ reporterId: req.user.id, reportedId: req.params.id, reason });
  res.status(201).json({ ok: true });
});

router.get("/social/conversations", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const friends = await db.select().from(friendshipsTable).where(and(eq(friendshipsTable.status, "accepted"), or(eq(friendshipsTable.requesterId, req.user.id), eq(friendshipsTable.recipientId, req.user.id))));
  const conversations = await Promise.all(friends.map(async (friend) => {
    const otherId = friend.requesterId === req.user.id ? friend.recipientId : friend.requesterId;
    const [last] = await db.select().from(directMessagesTable).where(and(isNull(directMessagesTable.deletedAt), or(and(eq(directMessagesTable.senderId, req.user.id), eq(directMessagesTable.recipientId, otherId)), and(eq(directMessagesTable.senderId, otherId), eq(directMessagesTable.recipientId, req.user.id))))).orderBy(desc(directMessagesTable.createdAt)).limit(1);
    const unread = await db.select({ id: directMessagesTable.id }).from(directMessagesTable).where(and(eq(directMessagesTable.senderId, otherId), eq(directMessagesTable.recipientId, req.user.id), isNull(directMessagesTable.readAt), isNull(directMessagesTable.deletedAt)));
    return { friendshipId: friend.id, friend: await publicProfile(otherId), lastMessage: last ? { body: last.body, createdAt: last.createdAt, mine: last.senderId === req.user.id } : null, unreadCount: unread.length };
  }));
  res.json(conversations.sort((a, b) => new Date(b.lastMessage?.createdAt ?? 0).getTime() - new Date(a.lastMessage?.createdAt ?? 0).getTime()));
});

router.get("/social/messages/:userId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const otherId = req.params.userId; const friend = await relationship(req.user.id, otherId);
  if (!friend || friend.status !== "accepted" || await isBlocked(req.user.id, otherId)) { res.status(403).json({ error: "Messaging is available only between accepted friends." }); return; }
  const messages = await db.select().from(directMessagesTable).where(and(isNull(directMessagesTable.deletedAt), or(and(eq(directMessagesTable.senderId, req.user.id), eq(directMessagesTable.recipientId, otherId)), and(eq(directMessagesTable.senderId, otherId), eq(directMessagesTable.recipientId, req.user.id))))).orderBy(asc(directMessagesTable.createdAt)).limit(200);
  await db.update(directMessagesTable).set({ readAt: new Date() }).where(and(eq(directMessagesTable.senderId, otherId), eq(directMessagesTable.recipientId, req.user.id), isNull(directMessagesTable.readAt)));
  res.json(messages.map((message) => ({ ...message, mine: message.senderId === req.user.id })));
});

router.post("/social/messages/:userId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const otherId = req.params.userId; const body = typeof req.body?.body === "string" ? req.body.body.trim().slice(0, 2000) : "";
  const friend = await relationship(req.user.id, otherId);
  if (!body) { res.status(400).json({ error: "Message cannot be empty." }); return; }
  if (!friend || friend.status !== "accepted" || await isBlocked(req.user.id, otherId)) { res.status(403).json({ error: "Messaging is available only between accepted friends." }); return; }
  const [message] = await db.insert(directMessagesTable).values({ senderId: req.user.id, recipientId: otherId, body }).returning();
  res.status(201).json({ ...message, mine: true });
});

router.delete("/social/messages/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [deleted] = await db.update(directMessagesTable).set({ deletedAt: new Date(), body: "" }).where(and(eq(directMessagesTable.id, Number(req.params.id)), eq(directMessagesTable.senderId, req.user.id))).returning();
  if (!deleted) { res.status(404).json({ error: "Message not found." }); return; }
  res.json({ ok: true });
});

export default router;
