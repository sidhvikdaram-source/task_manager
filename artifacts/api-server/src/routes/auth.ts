import * as oidc from "openid-client";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCurrentAuthUserResponse,
  ExchangeMobileAuthorizationCodeBody,
  ExchangeMobileAuthorizationCodeResponse,
  LogoutMobileSessionResponse,
} from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
} from "../lib/auth";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;
const scryptAsync = promisify(crypto.scrypt);

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  // x-forwarded-proto can be a string like "https" or an array like ["https", "http"]
  const safeProto = Array.isArray(proto) ? proto[0] : String(proto);
  return `${safeProto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizePassword(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, storedHash: string | null) {
  if (!storedHash) return false;
  const [method, salt, expected] = storedHash.split(":");
  if (method !== "scrypt" || !salt || !expected) return false;

  const derived = await scryptAsync(password, salt, 64) as Buffer;
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === derived.length && crypto.timingSafeEqual(derived, expectedBuffer);
}

async function createLocalSession(res: Response, user: typeof usersTable.$inferSelect) {
  const sessionData: SessionData = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    },
    access_token: "local",
    expires_at: Math.floor((Date.now() + SESSION_TTL) / 1000),
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  return sessionData.user;
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function getClaim<T>(claims: Record<string, unknown>, ...keys: string[]): T | null {
  for (const key of keys) {
    const val = claims[key];
    if (val !== undefined && val !== null) return val as T;
  }
  return null;
}

async function upsertUser(claims: Record<string, unknown>) {
  const userData = {
    id: claims.sub as string,
    email: getClaim<string>(claims, "email") || null,
    firstName: getClaim<string>(claims, "first_name", "given_name") || null,
    lastName: getClaim<string>(claims, "last_name", "family_name") || null,
    profileImageUrl: getClaim<string>(claims, "profile_image_url", "picture") as
      | string
      | null,
  };

  const [user] = await db
    .insert(usersTable)
    .values(userData)
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl,
        updatedAt: new Date(),
      },
    })
    .returning();
  return user;
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.post("/auth/register", async (req: Request, res: Response): Promise<void> => {
  const email = normalizeEmail(req.body?.email);
  const password = normalizePassword(req.body?.password);
  const firstName = typeof req.body?.firstName === "string" ? req.body.firstName.trim() : "";

  if (!email || !email.includes("@") || password.length < 6) {
    res.status(400).json({ error: "Enter a valid email and a password with at least 6 characters." });
    return;
  }

  try {
    const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    const passwordHash = await hashPassword(password);
    const [user] = existingUser
      ? await db
        .update(usersTable)
        .set({
          passwordHash,
          firstName: firstName || existingUser.firstName,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, existingUser.id))
        .returning()
      : await db
        .insert(usersTable)
        .values({ id: crypto.randomUUID(), email, passwordHash, firstName: firstName || null })
        .returning();

    const sessionUser = await createLocalSession(res, user);
    res.json({ user: sessionUser });
  } catch (err) {
    req.log?.error({ err }, "Local registration failed");
    res.status(500).json({ error: "Could not create that account. Please try again." });
  }
});

router.post("/auth/login", async (req: Request, res: Response): Promise<void> => {
  const email = normalizeEmail(req.body?.email);
  const password = normalizePassword(req.body?.password);

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const sessionUser = await createLocalSession(res, user);
    res.json({ user: sessionUser });
  } catch (err) {
    req.log?.error({ err }, "Local login failed");
    res.status(500).json({ error: "Could not sign in. Please try again." });
  }
});

router.get("/login", async (req: Request, res: Response) => {
  try {
    const config = await getOidcConfig();
    const callbackUrl = `${getOrigin(req)}/api/callback`;

    const returnTo = getSafeReturnTo(req.query.returnTo);

    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

    const redirectTo = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope: "openid email profile",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "select_account",
      state,
      nonce,
    });

    setOidcCookie(res, "code_verifier", codeVerifier);
    setOidcCookie(res, "nonce", nonce);
    setOidcCookie(res, "state", state);
    setOidcCookie(res, "return_to", returnTo);

    res.redirect(redirectTo.href);
  } catch (err) {
    req.log?.error({ err }, "Google OIDC login initialization failed");
    res.redirect("/?authError=google_unavailable");
  }
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get("/callback", async (req: Request, res: Response) => {
  let config: oidc.Configuration;
  try {
    config = await getOidcConfig();
  } catch (err) {
    req.log?.error({ err }, "Google OIDC callback configuration failed");
    res.redirect("/?authError=google_unavailable");
    return;
  }
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    req.log.warn("Missing codeVerifier or expectedState cookies — redirecting to login");
    res.redirect("/?authError=google_unavailable");
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch (err) {
    req.log.error({ err }, "OIDC token exchange failed — redirecting to login");
    res.redirect("/?authError=google_unavailable");
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/?authError=google_unavailable");
    return;
  }

  const dbUser = await upsertUser(
    claims as unknown as Record<string, unknown>,
  );

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

router.get("/logout", async (req: Request, res: Response) => {
  const origin = getOrigin(req);

  const sid = getSessionId(req);
  await clearSession(res, sid);

  const clientId = process.env.OIDC_CLIENT_ID ?? process.env.REPL_ID;
  if (!clientId) {
    res.redirect("/");
    return;
  }

  try {
    const config = await getOidcConfig();

    const endSessionUrl = oidc.buildEndSessionUrl(config, {
      client_id: clientId,
      post_logout_redirect_uri: origin,
    });

    res.redirect(endSessionUrl.href);
  } catch (err) {
    req.log?.warn({ err }, "OIDC logout failed; local session was cleared");
    res.redirect("/");
  }
});

async function handleSessionLogout(req: Request, res: Response) {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ ok: true });
}

router.post("/session-logout", handleSessionLogout);
router.post("/auth/session-logout", handleSessionLogout);

router.post(
  "/mobile-auth/token-exchange",
  async (req: Request, res: Response) => {
    const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      callbackUrl.searchParams.set("iss", ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: "No claims in ID token" });
        return;
      }

      const dbUser = await upsertUser(
        claims as unknown as Record<string, unknown>,
      );

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          profileImageUrl: dbUser.profileImageUrl,
        },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
      };

      const sid = await createSession(sessionData);
      res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
    } catch (err) {
      req.log.error({ err }, "Mobile token exchange error");
      res.status(500).json({ error: "Token exchange failed" });
    }
  },
);

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;
