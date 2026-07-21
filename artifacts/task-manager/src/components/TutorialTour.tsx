import { useEffect, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { useExperience } from "@/experience";

const steps = [
  {
    target: "[data-tour='quick-capture']",
    title: "Capture naturally",
    detail:
      "Type a task with a date, subject, or priority. Velocity organizes it while you type.",
  },
  {
    target: "[data-tour='today-list']",
    title: "Work from Today",
    detail:
      "Your due, overdue, and unscheduled tasks stay together in one calm list.",
  },
  {
    target: "[data-tour='primary-navigation'], [data-tour='mobile-navigation']",
    title: "Your workspace lives here",
    detail:
      "Use the sidebar for My Day, Academics, and Focus. The Need more panel turns on advanced tools whenever you are ready.",
  },
];

export function TutorialTour() {
  const { preferences, updatePreferences } = useExperience();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (preferences.tutorialCompleted) return;
    const target = Array.from(
      document.querySelectorAll<HTMLElement>(steps[step].target),
    ).find((element) => element.offsetParent !== null);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.classList.add("velocity-tour-target");
    return () => target?.classList.remove("velocity-tour-target");
  }, [step, preferences.tutorialCompleted]);

  if (preferences.tutorialCompleted) return null;

  async function close() {
    await updatePreferences({ tutorialCompleted: true });
  }

  return (
    <aside className="fixed bottom-4 right-4 z-[80] w-[calc(100%-2rem)] max-w-sm rounded-lg border bg-popover p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">
          {step + 1}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-black">{steps[step].title}</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {steps[step].detail}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void close()}
          aria-label="Close tutorial"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground">
          {step + 1} of {steps.length}
        </span>
        {step < steps.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((value) => value + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground"
          >
            Next <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void close()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground"
          >
            Done <Check className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </aside>
  );
}
