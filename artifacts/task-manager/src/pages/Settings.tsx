import React, { useEffect, useState } from "react";
import { BellRing, Check, FlaskConical, Gift, KeyRound, Mail, Plus, Settings2, ShieldCheck, Sparkles, Users, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { useExperience } from "@/experience";
import { playCompletionSound, primeCompletionSound } from "@/lib/completionSound";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";

type AdminState = {
  isAdmin: boolean;
  adminModeEnabled: boolean;
  adminChestCount: number;
};

export default function Settings() {
  const { preferences, updatePreferences } = useExperience();
  const queryClient = useQueryClient();
  const { user, setPassword, resetPassword, hasPassword } = useAuth();
  const [saving, setSaving] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [reminderEmail, setReminderEmail] = useState("");
  const [admin, setAdmin] = useState<AdminState | null>(null);
  const reminderDeliveryAvailable = import.meta.env.VITE_EMAIL_REMINDERS_AVAILABLE === "true";

  useEffect(() => {
    fetch("/api/admin", { credentials: "include" })
      .then(async (response) => response.ok ? response.json() as Promise<AdminState> : null)
      .then(setAdmin)
      .catch(() => undefined);
  }, []);

  async function toggleAdmin(enabled: boolean) {
    setSaving("admin");
    try {
      const response = await fetch("/api/admin/mode", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Admin sandbox could not be updated");
      setAdmin(body);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rewards"] }),
        queryClient.invalidateQueries(),
      ]);
      toast.success(enabled ? "Admin sandbox on" : "Regular progress restored", {
        description: enabled
          ? "Balances and unlocks are now temporary."
          : "Your real balances and equipped items were never changed.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Admin sandbox could not be updated");
    } finally {
      setSaving(null);
    }
  }

  async function createTestChest() {
    setSaving("chest");
    try {
      const response = await fetch("/api/admin/chests", {
        method: "POST",
        credentials: "include",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Test chest could not be generated");
      setAdmin((current) => current ? { ...current, adminChestCount: body.adminChestCount } : current);
      await queryClient.invalidateQueries({ queryKey: ["rewards"] });
      toast.success("Test chest ready", { description: "Open it from your Profile." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test chest could not be generated");
    } finally {
      setSaving(null);
    }
  }

  async function toggle(key: "advancedFeaturesEnabled" | "socialEnabled" | "completionSoundEnabled", value: boolean) {
    setSaving(key);
    try {
      await updatePreferences(key === "socialEnabled" && value ? { socialEnabled: true, advancedFeaturesEnabled: true } : { [key]: value });
      toast.success(key === "socialEnabled" ? (value ? "Social is now available" : "Social is turned off") : key === "completionSoundEnabled" ? (value ? "Completion sounds enabled" : "Completion sounds muted") : (value ? "Advanced workspace enabled" : "Workspace simplified"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Setting could not be saved");
    } finally {
      setSaving(null);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setSaving("password");
    try {
      await setPassword(newPassword);
      setNewPassword("");
      toast.success("Nimbus password ready", { description: "You can now use email and password on your school computer." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Password could not be created");
    } finally {
      setSaving(null);
    }
  }

  async function saveReminderEmails(emails: string[], enabled = preferences.emailRemindersEnabled) {
    setSaving("reminderEmails");
    try {
      await updatePreferences({ reminderEmails: emails, emailRemindersEnabled: enabled && emails.length > 0 });
      toast.success("Reminder recipients saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reminder recipients could not be saved");
    } finally {
      setSaving(null);
    }
  }

  function addReminderEmail(event: React.FormEvent) {
    event.preventDefault();
    const email = reminderEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Enter a valid email address"); return; }
    if (preferences.reminderEmails.includes(email)) { toast.error("That email is already included"); return; }
    if (preferences.reminderEmails.length >= 5) { toast.error("Nimbus supports up to five reminder emails"); return; }
    setReminderEmail("");
    void saveReminderEmails([...preferences.reminderEmails, email]);
  }

  return (
    <div className="page-stack mx-auto max-w-4xl space-y-5">
      <header className="border-b pb-4">
        <p className="text-xs font-black uppercase text-primary">Preferences</p>
        <h1 className="mt-1 text-2xl font-black sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Choose which parts of Nimbus are part of your workspace.</p>
      </header>
      {admin?.isAdmin && (
        <section className="overflow-hidden rounded-2xl border border-violet-400/30 bg-[linear-gradient(135deg,rgba(139,124,246,.16),rgba(255,255,255,.03))] shadow-[0_20px_50px_rgba(68,48,160,.12)]">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500 text-white">
                <FlaskConical className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-black">Admin sandbox</h2>
                <p className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">
                  Test unlimited Nimbus Points, Breeze Points, every cosmetic, and reward chests without changing your real balance or loadout.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={admin.adminModeEnabled}
              aria-label="Toggle Admin sandbox"
              disabled={saving === "admin"}
              onClick={() => void toggleAdmin(!admin.adminModeEnabled)}
              className={`h-7 w-12 shrink-0 rounded-full p-1 transition-colors disabled:opacity-50 ${admin.adminModeEnabled ? "bg-violet-500" : "bg-muted-foreground/30"}`}
            >
              <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${admin.adminModeEnabled ? "translate-x-5" : ""}`} />
            </button>
          </div>
          {admin.adminModeEnabled && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-violet-400/20 px-5 py-3">
              <p className="text-xs font-bold text-violet-500">Sandbox changes disappear when this mode is turned off.</p>
              <button
                type="button"
                disabled={saving === "chest" || admin.adminChestCount > 0}
                onClick={() => void createTestChest()}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-3 py-2 text-xs font-black text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Gift className="h-3.5 w-3.5" />
                {admin.adminChestCount > 0 ? "Chest waiting in Profile" : "Generate test chest"}
              </button>
            </div>
          )}
        </section>
      )}
      <section className="bento-card divide-y">
        <SettingRow icon={Users} title="Social" detail="Friends, private messages, challenges, and friend activity. Your account is hidden from Social search while this is off." enabled={preferences.socialEnabled} disabled={saving === "socialEnabled"} onChange={(value) => void toggle("socialEnabled", value)} />
        <SettingRow icon={Sparkles} title="Advanced workspace" detail="Projects, Calendar, Insights, and other planning tools." enabled={preferences.advancedFeaturesEnabled} disabled={saving === "advancedFeaturesEnabled"} onChange={(value) => void toggle("advancedFeaturesEnabled", value)} />
        <SettingRow icon={Volume2} title="Completion sounds" detail="Play a short confirmation sound when a task is completed." enabled={preferences.completionSoundEnabled} disabled={saving === "completionSoundEnabled"} onChange={(value) => void toggle("completionSoundEnabled", value)} />
      </section>
      <section className="bento-card p-5">
        <div className="flex items-start gap-3"><KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-black">Nimbus password</h2><span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${hasPassword ? "bg-emerald-500/12 text-emerald-600" : "bg-amber-500/12 text-amber-600"}`}>{hasPassword ? "Password login ready" : "Google login only"}</span></div><p className="mt-1 text-sm leading-5 text-muted-foreground">Passwords are encrypted and can never be displayed. {hasPassword ? "You can replace yours or request a secure reset email." : "Create one for this same account so you can sign in where Google is blocked."}</p></div></div>
        <form onSubmit={savePassword} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={6} autoComplete="new-password" placeholder="New password (6+ characters)" className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary" required />
          <button type="submit" disabled={saving === "password" || newPassword.length < 6} className="h-11 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground disabled:opacity-50">{saving === "password" ? "Saving…" : "Create or change password"}</button>
        </form>
        {hasPassword && user?.email && <button type="button" disabled={saving === "passwordReset"} onClick={() => { setSaving("passwordReset"); void resetPassword(user.email!).then(() => toast.success("Password reset email sent", { description: `Check ${user.email} and its spam folder.` })).catch((error) => toast.error(error instanceof Error ? error.message : "Reset email could not be sent")).finally(() => setSaving(null)); }} className="mt-3 inline-flex items-center gap-2 text-xs font-black text-primary hover:underline disabled:opacity-50"><Mail className="h-3.5 w-3.5" />Send a password reset email</button>}
      </section>
      <section className="bento-card overflow-hidden">
        <div className="flex items-start gap-3 p-5">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1"><h2 className="font-black">Due-date email reminders</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">Send one concise digest when unfinished tasks are two days away. Add up to five recipients.</p></div>
          <button type="button" role="switch" aria-checked={preferences.emailRemindersEnabled} aria-label="Toggle due-date email reminders" disabled={!reminderDeliveryAvailable || saving === "reminderEmails" || preferences.reminderEmails.length === 0} onClick={() => void saveReminderEmails(preferences.reminderEmails, !preferences.emailRemindersEnabled)} className={`h-6 w-11 shrink-0 rounded-full p-1 transition-colors disabled:opacity-40 ${preferences.emailRemindersEnabled ? "bg-primary" : "bg-muted-foreground/30"}`}><span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${preferences.emailRemindersEnabled ? "translate-x-5" : ""}`} /></button>
        </div>
        <div className="border-t bg-muted/20 p-5">
          <div className="mb-3 flex flex-wrap gap-2">{preferences.reminderEmails.map((email) => <span key={email} className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background py-1.5 pl-3 pr-1.5 text-xs font-bold"><span className="truncate">{email}</span><button type="button" aria-label={`Remove ${email}`} onClick={() => void saveReminderEmails(preferences.reminderEmails.filter((item) => item !== email))} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="h-3.5 w-3.5" /></button></span>)}</div>
          <form onSubmit={addReminderEmail} className="flex flex-col gap-2 sm:flex-row"><label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-background px-3 focus-within:border-primary"><Mail className="h-4 w-4 text-muted-foreground" /><input type="email" value={reminderEmail} onChange={(event) => setReminderEmail(event.target.value)} placeholder="Add a reminder email" autoComplete="email" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><button type="submit" disabled={!reminderEmail.trim() || saving === "reminderEmails" || preferences.reminderEmails.length >= 5} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black transition-colors hover:bg-muted disabled:opacity-40"><Plus className="h-4 w-4" />Add email</button></form>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{!reminderDeliveryAvailable ? "Recipients can be saved now, but delivery stays off until Nimbus's one-time mail service setup is complete." : preferences.emailRemindersEnabled ? "Reminders are enabled." : preferences.reminderEmails.length ? "Recipients saved. Turn the switch on to start reminders." : `Start with ${user?.email ?? "your account email"}, or add another inbox.`}</p>
          {!preferences.reminderEmails.length && user?.email && <button type="button" onClick={() => void saveReminderEmails([user.email!], reminderDeliveryAvailable)} className="mt-2 text-xs font-black text-primary hover:underline">Use my account email</button>}
        </div>
      </section>
      {preferences.completionSoundEnabled && (
        <button
          type="button"
          onClick={() => void playCompletionSound(primeCompletionSound())}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-black text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Volume2 className="h-4 w-4" /> Preview completion sound
        </button>
      )}
      <section data-tour="settings-tutorial" className="bento-card p-5">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-black">Privacy by default</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Turning Social off keeps existing friendships and messages stored, but blocks Social access and removes your profile from search until you turn it on again.</p></div></div>
      </section>
      <section className="bento-card p-5">
        <div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary" /><h2 className="font-black">Tutorial</h2></div>
        <p className="mt-1 text-sm text-muted-foreground">Replay the workspace tour, including where to find these settings.</p>
        <button type="button" onClick={() => { sessionStorage.removeItem("nimbus-tutorial-minimized"); void updatePreferences({ tutorialCompleted: false, tutorialStep: 0 }); }} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground"><Check className="h-3.5 w-3.5" /> Replay tutorial</button>
      </section>
    </div>
  );
}

function SettingRow({ icon: Icon, title, detail, enabled, disabled, onChange }: { icon: typeof Users; title: string; detail: string; enabled: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-start gap-3 p-5"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><h2 className="font-black">{title}</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">{detail}</p></div><button type="button" role="switch" aria-checked={enabled} aria-label={`Turn ${title} ${enabled ? "off" : "on"}`} disabled={disabled} onClick={() => onChange(!enabled)} className={`h-6 w-11 shrink-0 rounded-full p-1 transition-colors disabled:opacity-50 ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}><span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-5" : ""}`} /></button></div>;
}
