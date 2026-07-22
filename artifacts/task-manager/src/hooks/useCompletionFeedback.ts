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
      if (preferences.completionSoundEnabled) {
        void playCompletionTick(soundReady).catch(() => undefined);
      }
      return {
        origin: completionOrigin(element),
        soundReady,
      };
    },
    celebrate(prepared: { origin: { x: number; y: number }; soundReady: Promise<void> }) {
      if (preferences.completionSoundEnabled) {
        void playCompletionSound(prepared.soundReady).catch(() => undefined);
      }
      playCompletionEffect(
        data?.equipped?.completion_effect ?? "clean-confetti",
        prepared.origin,
      );
    },
  };
}
