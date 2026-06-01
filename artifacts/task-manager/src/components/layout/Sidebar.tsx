import React from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { LayoutDashboard, CalendarDays, Timer, LineChart, Target } from 'lucide-react';
import { useGetUserStats } from '@workspace/api-client-react';
import { Progress } from '@/components/ui/progress';

export function Sidebar() {
  const [location] = useLocation();
  const { data: stats } = useGetUserStats();

  const links = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/calendar', label: 'Calendar', icon: CalendarDays },
    { href: '/focus', label: 'Focus Arena', icon: Timer },
    { href: '/analytics', label: 'Analytics', icon: LineChart },
  ];

  return (
    <div className="w-64 border-r bg-sidebar flex flex-col h-full shrink-0">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
          <Target className="w-5 h-5" />
        </div>
        <span className="font-bold text-xl tracking-tight text-sidebar-foreground">Velocity</span>
      </div>

      <div className="px-4 pb-6 border-b border-sidebar-border">
        {stats && (
          <div className="bg-card rounded-xl p-4 shadow-sm border relative overflow-hidden group">
            {/* Multiplier glow */}
            {stats.multiplier > 1.0 && (
              <div className="absolute inset-0 bg-secondary/10 opacity-50 pointer-events-none" />
            )}
            
            <div className="flex items-center gap-3 mb-3 relative z-10">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg font-bold">
                  {stats.tier}
                </div>
                {stats.multiplier > 1.0 && (
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-1 border-2 border-secondary border-dashed rounded-full pointer-events-none"
                  />
                )}
              </div>
              <div>
                <div className="text-sm font-semibold">Tier {stats.tier}</div>
                <div className="text-xs text-muted-foreground">{stats.totalVp} VP</div>
              </div>
              
              {stats.multiplier > 1.0 && (
                <div className="ml-auto bg-secondary/20 text-secondary-foreground text-xs font-bold px-2 py-1 rounded-md">
                  {stats.multiplier}x VP
                </div>
              )}
            </div>
            
            <div className="space-y-1.5 relative z-10">
              <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                <span>Progress to Tier {stats.tier + 1}</span>
                <span>{stats.tierProgress}%</span>
              </div>
              <Progress value={stats.tierProgress} className="h-1.5" />
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => {
          const isActive = location === link.href;
          return (
            <Link key={link.href} href={link.href}>
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                <link.icon className="w-5 h-5" />
                {link.label}
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
