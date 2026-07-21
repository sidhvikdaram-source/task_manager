import React, { lazy, Suspense, useEffect, useState } from "react";
import { TopNav } from "./TopNav";
import { Loader2 } from "lucide-react";
import { useExperience } from "@/experience";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { TutorialTour } from "@/components/TutorialTour";
import { Sidebar } from "./Sidebar";
import { MobileBottomNav } from "./MobileBottomNav";

const VelocityAssistantCard = lazy(() =>
  import("@/components/VelocityAssistantCard").then((module) => ({
    default: module.VelocityAssistantCard,
  })),
);

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { preferences, loading } = useExperience();
  const [assistantReady, setAssistantReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    const requestIdle =
      window.requestIdleCallback ??
      ((callback: IdleRequestCallback) => window.setTimeout(callback, 900));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
    const id = requestIdle(() => setAssistantReady(true));
    return () => cancelIdle(id);
  }, []);
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  return (
    <div className="tech-shell flex h-[100dvh] w-full overflow-hidden bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          <div className="container mx-auto max-w-[1440px] px-4 py-4 sm:px-6 sm:py-6">
            {children}
          </div>
        </main>
      </div>
      {preferences.onboardingCompleted && <MobileBottomNav />}
      {assistantReady && preferences.onboardingCompleted && (
        <Suspense fallback={null}>
          <VelocityAssistantCard />
        </Suspense>
      )}
      {!preferences.onboardingCompleted && <OnboardingFlow />}
      {preferences.onboardingCompleted && <TutorialTour />}
    </div>
  );
}
