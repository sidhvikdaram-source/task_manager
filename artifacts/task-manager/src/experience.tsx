import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@workspace/replit-auth-web";

export type MainGoal = "school" | "habits" | "projects";

export type ExperiencePreferences = {
  mainGoal: MainGoal | null;
  onboardingCompleted: boolean;
  advancedFeaturesEnabled: boolean;
  tutorialCompleted: boolean;
  tutorialStep: number;
  socialEnabled: boolean;
  timezone: string;
  calendarView: "month" | "week" | "day" | "agenda";
  completionSoundEnabled: boolean;
};

const defaults: ExperiencePreferences = {
  mainGoal: null,
  onboardingCompleted: false,
  advancedFeaturesEnabled: false,
  tutorialCompleted: false,
  tutorialStep: 0,
  socialEnabled: false,
  timezone: "UTC",
  calendarView: "month",
  completionSoundEnabled: true,
};

function preferencesCacheKey(email?: string | null) {
  return `velocity-preferences:${email?.trim().toLowerCase() || "account"}`;
}

function readCachedPreferences(key: string) {
  try {
    const cached = window.localStorage.getItem(key);
    if (!cached) return null;
    return {
      ...defaults,
      ...(JSON.parse(cached) as Partial<ExperiencePreferences>),
    } satisfies ExperiencePreferences;
  } catch {
    return null;
  }
}

function cachePreferences(key: string, value: ExperiencePreferences) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Safari private browsing may reject storage; server preferences still work.
  }
}

type ExperienceContextValue = {
  preferences: ExperiencePreferences;
  loading: boolean;
  updatePreferences: (
    update: Partial<ExperiencePreferences>,
  ) => Promise<ExperiencePreferences>;
};

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

export function ExperienceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const cacheKey = useMemo(
    () => preferencesCacheKey(user?.email),
    [user?.email],
  );
  const [cachedPreferences] = useState(() => readCachedPreferences(cacheKey));
  const [preferences, setPreferences] = useState(
    cachedPreferences ?? defaults,
  );
  const [loading, setLoading] = useState(!cachedPreferences);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    fetch("/api/user/preferences", {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Preferences could not be loaded");
        return (await response.json()) as ExperiencePreferences;
      })
      .then((value) => {
        if (!active) return;
        const resolved = {
          ...defaults,
          ...value,
          completionSoundEnabled: value.completionSoundEnabled ?? true,
        };
        setPreferences(resolved);
        cachePreferences(cacheKey, resolved);
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (timezone && timezone !== resolved.timezone) {
          void fetch("/api/user/preferences", {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ timezone }),
          }).then(async (response) => {
            if (response.ok && active) {
              const updated = await response.json() as ExperiencePreferences;
              setPreferences(updated);
              cachePreferences(cacheKey, updated);
            }
          });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [cacheKey]);

  const updatePreferences = useCallback(
    async (update: Partial<ExperiencePreferences>) => {
      const response = await fetch("/api/user/preferences", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || "Preferences could not be saved");
      const updated = body as ExperiencePreferences;
      setPreferences(updated);
      cachePreferences(cacheKey, updated);
      return updated;
    },
    [cacheKey],
  );

  const value = useMemo(
    () => ({ preferences, loading, updatePreferences }),
    [preferences, loading, updatePreferences],
  );
  return (
    <ExperienceContext.Provider value={value}>
      {children}
    </ExperienceContext.Provider>
  );
}

export function useExperience() {
  const context = useContext(ExperienceContext);
  if (!context)
    throw new Error("useExperience must be used inside ExperienceProvider");
  return context;
}
