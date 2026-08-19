import { useQuery } from "@tanstack/react-query";
import { useExperience } from "@/experience";
import {
  completionOrigin,
  playCompletionEffect,
  playCompletionSound,
  playCompletionTick,
  primeCompletionSound,
} from "@/lib/completionSound";

type RewardSettings = {
  equipped?: { completion_effect?: string };
};

export function useCompletionFeedback() {
  const { preferences } = useExperience();
  const { data } = useQuery({
    queryKey: ["rewards"],
    queryFn: async () => {
      const response = await fetch("/api/rewards", { credentials: "include" });
      return response.ok ? response.json() as Promise<RewardSettings> : null;
    },
    staleTime: 60_000,
  });

  return {
    prepare(element?: HTMLElement | null) {
      const soundReady = preferences.completionSoundEnabled
        ? primeCompletionSound()
        : Promise.resolve();
      const origin = completionOrigin(element);
      if (preferences.completionSoundEnabled) {
        void playCompletionTick(soundReady).catch(() => undefined);
      }
      playCompletionEffect(
        data?.equipped?.completion_effect ?? "clean-confetti",
        origin,
      );
      return {
        soundReady,
      };
    },
    celebrate(prepared: { soundReady: Promise<void> }) {
      if (preferences.completionSoundEnabled) {
        void playCompletionSound(prepared.soundReady).catch(() => undefined);
      }
    },
  };
}
