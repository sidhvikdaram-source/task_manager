import * as oidc from "openid-client";
import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  getSession,
  updateSession,
  type SessionData,
} from "../lib/auth";
import { isAdminEmail } from "../lib/adminAccess";
import { verifyFirebaseIdToken, type FirebaseTokenClaims } from "../lib/firebaseIdToken";

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
    }

    interface Request {
      isAuthenticated(): this is AuthedRequest;
      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

async function refreshIfExpired(
  sid: string,
  session: SessionData,
): Promise<SessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;

  if (!session.refresh_token) return null;

  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(
      config,
      session.refresh_token,
    );
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn()
      ? now + tokens.expiresIn()!
      : session.expires_at;
    await updateSession(sid, session);
    return session;
  } catch {
    return null;
  }
}

function claim(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function resolveFirebaseUser(claims: FirebaseTokenClaims & { sub: string }) {
  const email = claim(claims.email)?.toLowerCase() ?? null;
  const emailVerified = claims.email_verified === true;
  const [byId] = await db.select().from(usersTable).where(eq(usersTable.id, claims.sub));
  const [byEmail] = email ? await db.select().from(usersTable).where(eq(usersTable.email, email)) : [];
  if (byEmail && byEmail.id !== claims.sub && !emailVerified) {
    throw new Error("A verified email is required to connect this Firebase identity");
  }

  const existing = byEmail ?? byId;
  const displayName = claim(claims.name);
  const firstName = displayName?.split(/\s+/, 1)[0] ?? null;
  const values = {
    email,
    firstName: firstName ?? existing?.firstName ?? null,
    lastName: existing?.lastName ?? null,
    profileImageUrl: claim(claims.picture) ?? existing?.profileImageUrl ?? null,
    isAdmin: isAdminEmail(email),
    updatedAt: new Date(),
  };

  if (existing) {
    const [user] = await db.update(usersTable).set(values).where(eq(usersTable.id, existing.id)).returning();
    return user;
  }

  const [user] = await db.insert(usersTable).values({ id: claims.sub, ...values }).returning();
  return user;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  // Demo auth is opt-in so production always shows the real login portal.
  if (process.env.ENABLE_DEMO_AUTH === "true") {
    req.user = {
      id: "demo-user",
      email: "demo@velocity.app",
      firstName: "Nimbus",
      lastName: "User",
      profileImageUrl: null,
    };
    next();
    return;
  }

  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  if (bearer?.split(".").length === 3) {
    try {
      const claims = await verifyFirebaseIdToken(bearer);
      const user = await resolveFirebaseUser(claims);
      req.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      };
    } catch (error) {
      req.log?.warn({ err: error }, "Firebase authentication failed");
    }
    next();
    return;
  }

  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }

  const refreshed = await refreshIfExpired(sid, session);
  if (!refreshed) {
    await clearSession(res, sid);
    next();
    return;
  }

  req.user = refreshed.user;
  next();
}
