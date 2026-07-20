import React, { lazy, Suspense, useEffect, useState } from "react";
import { TopNav } from "./TopNav";

const VelocityAssistantCard = lazy(() =>
  import("@/components/VelocityAssistantCard").then((module) => ({
    default: module.VelocityAssistantCard,
  })),
);

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [assistantReady, setAssistantReady] = useState(false);
  useEffect(() => {
    const requestIdle =
      window.requestIdleCallback ??
      ((callback: IdleRequestCallback) => window.setTimeout(callback, 900));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
    const id = requestIdle(() => setAssistantReady(true));
    return () => cancelIdle(id);
  }, []);
  return (
    <div className="tech-shell flex flex-col h-[100dvh] w-full overflow-hidden bg-background">
      <TopNav />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-7xl">
          {children}
        </div>
      </main>
      {assistantReady && (
        <Suspense fallback={null}>
          <VelocityAssistantCard />
        </Suspense>
      )}
    </div>
  );
}
