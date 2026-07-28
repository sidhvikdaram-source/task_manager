import React, { useEffect, useState } from "react";
import { Check, FlaskConical, Gift, Settings2, ShieldCheck, Sparkles, Users, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useExperience } from "@/experience";
import { playCompletionSound, primeCompletionSound } from "@/lib/completionSound";
import { useQueryClient } from "@tanstack/react-query";

type AdminState = {
  isAdmin: boolean;
  adminModeEnabled: boolean;
  adminChestCount: number;
};

export default function Settings() {
  const { preferences, updatePreferences } = useExperience();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [admin, setAdmin] = useState<AdminState | null>(null);

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
