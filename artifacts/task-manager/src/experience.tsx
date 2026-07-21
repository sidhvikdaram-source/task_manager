import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type MainGoal = "school" | "habits" | "projects";

export type ExperiencePreferences = {
  mainGoal: MainGoal | null;
  onboardingCompleted: boolean;
  advancedFeaturesEnabled: boolean;
  tutorialCompleted: boolean;
};

const defaults: ExperiencePreferences = {
  mainGoal: null,
  onboardingCompleted: false,
  advancedFeaturesEnabled: false,
  tutorialCompleted: false,
};

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
  const [preferences, setPreferences] = useState(defaults);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/user/preferences", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Preferences could not be loaded");
        return (await response.json()) as ExperiencePreferences;
      })
      .then((value) => active && setPreferences(value))
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

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
      setPreferences(body as ExperiencePreferences);
      return body as ExperiencePreferences;
    },
    [],
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
