import crypto from "node:crypto";

function encryptionKey() {
  const configured = process.env.CANVAS_INTEGRATION_ENCRYPTION_KEY;
  if (!configured) throw new Error("CANVAS_INTEGRATION_ENCRYPTION_KEY is not configured");
  if (configured.length < 32) throw new Error("CANVAS_INTEGRATION_ENCRYPTION_KEY must contain at least 32 characters");
  if (/^[0-9a-f]{64}$/i.test(configured)) return Buffer.from(configured, "hex");
  const decoded = Buffer.from(configured, "base64");
  return decoded.length === 32 ? decoded : crypto.createHash("sha256").update(configured).digest();
}

export function encryptIntegrationSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptIntegrationSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Unsupported encrypted integration value");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function redactIntegrationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(access_token|refresh_token|token|key)=?[^\s&]*/gi, "$1=[redacted]").slice(0, 500);
}
