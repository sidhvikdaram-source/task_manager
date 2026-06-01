import React from 'react';
import { TopNav } from './TopNav';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-background">
      <TopNav />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-6 py-8 max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
