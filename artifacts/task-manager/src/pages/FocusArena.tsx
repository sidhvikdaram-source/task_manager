import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, differenceInSeconds, parseISO } from 'date-fns';
import { 
  useCreateFocusSession, 
  useCompleteFocusSession, 
  useListFocusSessions,
  getListFocusSessionsQueryKey,
  getGetUserStatsQueryKey,
  getGetDashboardOverviewQueryKey
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Play, Square, Timer as TimerIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

export default function FocusArena() {
  const queryClient = useQueryClient();
  const [selectedDuration, setSelectedDuration] = useState(25);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  
  const createSession = useCreateFocusSession();
  const completeSession = useCompleteFocusSession();
  const { data: sessions, isLoading } = useListFocusSessions();

  const timerRef = useRef<number | null>(null);
  
  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startSession = () => {
    createSession.mutate(
      { data: { durationMinutes: selectedDuration } },
      {
        onSuccess: (session) => {
          setActiveSessionId(session.id);
          setTimeLeft(selectedDuration * 60);
          setIsActive(true);
          
          timerRef.current = window.setInterval(() => {
            setTimeLeft((prev) => {
              if (prev <= 1) {
                if (timerRef.current) clearInterval(timerRef.current);
                handleComplete(session.id);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }
      }
    );
  };

  const handleComplete = (id: number) => {
    completeSession.mutate(
      { id },
      {
        onSuccess: (session) => {
          setIsActive(false);
          setActiveSessionId(null);
          toast.success(`Focus session complete! +${session.vpAwarded} VP`);
          queryClient.invalidateQueries({ queryKey: getListFocusSessionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
        }
      }
    );
  };

  const handleAbandon = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsActive(false);
    setActiveSessionId(null);
    setTimeLeft(0);
    // Ideally we would have an abandon API, but completing it prematurely acts as abandon or we can just drop it if API doesn't support abandon. 
    // We will just let it be or mark it if possible. The spec says Complete API, but status can be abandoned. 
    // Given the hooks, we only have completeFocusSession. Let's just reset UI.
    toast('Session abandoned', { description: 'No VP awarded.' });
    queryClient.invalidateQueries({ queryKey: getListFocusSessionsQueryKey() });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = isActive ? ((selectedDuration * 60 - timeLeft) / (selectedDuration * 60)) * 100 : 0;

  return (
    <div className={`space-y-8 transition-colors duration-700 ${isActive ? 'brightness-90' : ''}`}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Focus Arena</h1>
          <p className="text-muted-foreground mt-1">Deep work. Earn VP.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_300px] gap-8">
        <div className="bg-card border shadow-sm rounded-2xl p-8 flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden">
          {/* Animated Background when active */}
          {isActive && (
            <motion.div 
              className="absolute inset-0 bg-primary/5"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
          )}

          <div className="relative z-10 w-64 h-64 flex flex-col items-center justify-center">
            {/* SVG Ring */}
            <svg className="absolute inset-0 w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
              <circle
                className="text-muted stroke-current"
                strokeWidth="4"
                cx="50"
                cy="50"
                r="48"
                fill="transparent"
              />
              <motion.circle
                className="text-primary stroke-current"
                strokeWidth="4"
                strokeLinecap="round"
                cx="50"
                cy="50"
                r="48"
                fill="transparent"
                initial={{ strokeDasharray: "0 300" }}
                animate={{ strokeDasharray: `${(progress / 100) * 301.59} 301.59` }}
                transition={{ duration: 1, ease: "linear" }}
              />
            </svg>
            
            <div className="text-5xl font-mono font-bold text-foreground">
              {isActive ? formatTime(timeLeft) : formatTime(selectedDuration * 60)}
            </div>
            
            {isActive && (
              <div className="mt-2 text-sm text-primary font-medium animate-pulse">
                Focusing...
              </div>
            )}
          </div>

          <div className="mt-12 relative z-10 w-full max-w-sm">
            <AnimatePresence mode="wait">
              {!isActive ? (
                <motion.div
                  key="setup"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="flex justify-center gap-3">
                    {[25, 50, 90].map((dur) => (
                      <Button
                        key={dur}
                        variant={selectedDuration === dur ? "default" : "outline"}
                        onClick={() => setSelectedDuration(dur)}
                        className="w-20"
                      >
                        {dur} min
                      </Button>
                    ))}
                  </div>
                  <Button 
                    size="lg" 
                    className="w-full h-14 text-lg"
                    onClick={startSession}
                    disabled={createSession.isPending}
                  >
                    <Play className="w-5 h-5 mr-2" fill="currentColor" />
                    Start Session
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="active"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <Button 
                    size="lg" 
                    variant="destructive"
                    className="w-full h-14 text-lg"
                    onClick={handleAbandon}
                  >
                    <Square className="w-5 h-5 mr-2" fill="currentColor" />
                    Abandon Session
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <TimerIcon className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold text-lg">Recent Sessions</h2>
          </div>
          
          <div className="space-y-3">
            {isLoading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
            ) : (
              sessions?.slice(0, 10).map((session, i) => (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={session.id}
                  className="p-4 bg-card border rounded-xl shadow-sm text-sm"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium">{session.durationMinutes} min</span>
                    <Badge variant={session.status === 'completed' ? 'default' : 'secondary'}>
                      {session.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>{session.createdAt && format(parseISO(session.createdAt), 'MMM d, h:mm a')}</span>
                    {session.vpAwarded && (
                      <span className="text-primary font-bold">+{session.vpAwarded} VP</span>
                    )}
                  </div>
                </motion.div>
              ))
            )}
            
            {sessions?.length === 0 && (
              <div className="text-center p-6 text-muted-foreground border border-dashed rounded-xl">
                No focus sessions yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
