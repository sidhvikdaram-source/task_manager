import React from 'react';
import { TopNav } from './TopNav';
import { VelocityAssistantCard } from '@/components/VelocityAssistantCard';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="tech-shell flex flex-col h-[100dvh] w-full overflow-hidden bg-background">
      <TopNav />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-7xl">
          {children}
        </div>
      </main>
      <VelocityAssistantCard />
    </div>
  );
}
