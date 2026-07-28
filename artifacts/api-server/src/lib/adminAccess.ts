const ADMIN_EMAILS = new Set([
  "sidhvik.daram@gmail.com",
  "sidhvik.daram@k12.friscoisd.org",
]);

export function normalizeAccountEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

export function isAdminEmail(email: string | null | undefined) {
  return ADMIN_EMAILS.has(normalizeAccountEmail(email));
}

