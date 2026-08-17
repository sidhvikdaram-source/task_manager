import { useRef, useState } from "react";
import {
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronUp,
  FileUp,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithPopup,
} from "firebase/auth";
import { firebaseAuth } from "@workspace/replit-auth-web";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateCanvasData, useCanvasSync } from "@/hooks/useCanvasSync";

type Subject = { id: number; name: string; color: string };
type GoogleCalendar = {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
  accessRole?: string;
};

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Google Calendar sign-in timed out. Allow pop-ups for Nimbus, then try again.")), milliseconds);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function responseJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function requestCalendarToken() {
  const current = firebaseAuth.currentUser;
  if (!current) throw new Error("Sign in to Nimbus first.");
  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/calendar.readonly");
  provider.setCustomParameters({ prompt: "consent", include_granted_scopes: "true" });
  const hasGoogle = current.providerData.some((entry) => entry.providerId === "google.com");
  const credential = await withTimeout(
    hasGoogle ? reauthenticateWithPopup(current, provider) : linkWithPopup(current, provider),
    90_000,
  );
  const oauth = GoogleAuthProvider.credentialFromResult(credential);
  if (!oauth?.accessToken) throw new Error("Google did not return Calendar access.");
  return oauth.accessToken;
}

export function CanvasSyncPanel({
  onChanged,
}: {
  subjects: Subject[];
  onChanged: () => Promise<void>;
}) {
  const { status, statusQuery, sync, running } = useCanvasSync(false);
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [token, setToken] = useState<string | null>(null);

  async function beginGoogleConnection() {
    setWorking("google");
    try {
      const accessToken = await requestCalendarToken();
      const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json() as { items?: GoogleCalendar[]; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message || "Google Calendar could not be loaded.");
      const available = (data.items ?? []).filter((calendar) => calendar.accessRole !== "freeBusyReader");
      setToken(accessToken);
      setCalendars(available);
      setExpanded(true);
      if (!available.length) toast("No Google calendars were found", { description: "Add the Canvas calendar feed to Google Calendar, then try again." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google Calendar could not be connected.");
    } finally {
      setWorking(null);
    }
  }

  async function selectCalendar(calendar: GoogleCalendar) {
    if (!token) return;
    setWorking(calendar.id);
    try {
      await responseJson("/api/canvas/google/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token, calendarId: calendar.id, calendarName: calendar.summary }),
      });
      await responseJson("/api/canvas/sync", { method: "POST" });
      await statusQuery.refetch();
      await Promise.all([onChanged(), invalidateCanvasData(queryClient)]);
      setCalendars([]);
      toast.success(`${calendar.summary} connected`, { description: "Nimbus will refresh it whenever you open the app." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That calendar could not be connected.");
    } finally {
      setWorking(null);
    }
  }

  async function importFile(file: File) {
    setWorking("file");
    try {
      const text = await file.text();
      const result = await responseJson<{ newTasks: number; updatedTasks: number }>("/api/canvas/ics/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, calendarName: "Canvas" }),
      });
      await Promise.all([statusQuery.refetch(), onChanged(), invalidateCanvasData(queryClient)]);
      toast.success("Canvas calendar imported", { description: `${result.newTasks} new and ${result.updatedTasks} updated items.` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That calendar file could not be imported.");
    } finally {
      setWorking(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function refresh() {
    setWorking("refresh");
    try {
      await sync();
      await Promise.all([statusQuery.refetch(), onChanged(), invalidateCanvasData(queryClient)]);
    } finally {
      setWorking(null);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect this calendar and remove its imported items from Nimbus? Your Google and Canvas calendars will not be changed.")) return;
    setWorking("disconnect");
    try {
      await responseJson("/api/canvas", { method: "DELETE" });
      await Promise.all([statusQuery.refetch(), onChanged(), invalidateCanvasData(queryClient)]);
      toast.success("Calendar disconnected");
    } finally {
      setWorking(null);
    }
  }

  if (statusQuery.isLoading) return <section className="bento-card h-28 animate-pulse" />;
  const connected = Boolean(status?.connected);
  const calendarName = status?.integration?.baseUrl === "https://calendar.google.com" ? "Google Calendar" : "Canvas calendar file";

  return (
    <section className="bento-card overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <CalendarCheck className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black">Canvas calendar</h2>
              {connected && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500"><Check className="h-3.5 w-3.5" /> Connected</span>}
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {connected
                ? `${calendarName} keeps assignments visible in Nimbus without relying on a blocked backend.`
                : "Subscribe to Canvas through Google Calendar once, then Nimbus can refresh it from school without another server."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {connected ? (
            <>
              <button type="button" disabled={running || working !== null} onClick={() => void refresh()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground disabled:opacity-50">
                {running || working === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
              </button>
              <button type="button" onClick={() => setExpanded((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-xl border" aria-label="Show calendar options">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </>
          ) : (
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <button type="button" disabled={working !== null} onClick={() => void beginGoogleConnection()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-primary-foreground disabled:opacity-50">
                {working === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Connect Google Calendar
              </button>
              <p className="max-w-xs text-left text-[11px] leading-4 text-muted-foreground sm:text-right">
                Optional, read-only access. <a href="/privacy" className="font-bold text-primary underline-offset-2 hover:underline">How Nimbus uses Calendar data</a>
              </p>
            </div>
          )}
        </div>
      </div>

      {(expanded || calendars.length > 0) && (
        <div className="border-t bg-muted/20 p-5 sm:p-6">
          {calendars.length > 0 ? (
            <div>
              <h3 className="font-black">Choose the calendar subscribed to Canvas</h3>
              <p className="mt-1 text-sm text-muted-foreground">Nimbus receives read-only access. It cannot edit Google Calendar or Canvas.</p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {calendars.map((calendar) => (
                  <button key={calendar.id} type="button" disabled={working !== null} onClick={() => void selectCalendar(calendar)} className="group flex min-h-16 items-center gap-3 rounded-2xl border bg-background p-3 text-left transition-colors hover:border-primary/45 hover:bg-primary/5 disabled:opacity-50">
                    <span className="h-9 w-1.5 rounded-full" style={{ backgroundColor: calendar.backgroundColor || "#6d5dfc" }} />
                    <span className="min-w-0"><b className="block truncate text-sm">{calendar.summary}</b><small className="text-muted-foreground">{calendar.primary ? "Primary calendar" : "Subscribed calendar"}</small></span>
                    {working === calendar.id && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p className="text-sm leading-6 text-muted-foreground">Google handles the ongoing Canvas feed refresh. If your school account blocks Calendar permission, download the Canvas <code>.ics</code> file and import it here instead.</p>
              </div>
              <div className="flex gap-2">
                <input ref={fileInput} type="file" accept=".ics,text/calendar" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} />
                <button type="button" disabled={working !== null} onClick={() => fileInput.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-bold disabled:opacity-50">
                  {working === "file" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Import .ics
                </button>
                {connected && <button type="button" disabled={working !== null} onClick={() => void disconnect()} className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-bold text-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" /> Disconnect</button>}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
