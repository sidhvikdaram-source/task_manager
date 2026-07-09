import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Clock, Maximize2, Timer } from 'lucide-react';
import { Task, useCompleteTask, getListTasksQueryKey, getGetDashboardOverviewQueryKey, getGetUserStatsQueryKey } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { format, isPast, parseISO } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TaskDetailsModal } from '@/components/TaskDetailsModal';
import { useLocation } from 'wouter';

interface TaskCardProps {
  task: Task;
  layoutId?: string;
}

const priorityColors = {
  critical: 'bg-destructive/10 text-destructive border-destructive/20',
  high: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  medium: 'bg-primary/10 text-primary border-primary/20',
  low: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
};

function parseVelocityType(notes?: string | null) {
  if (!notes) return null;
  const match = notes.match(/^Velocity Type:\s*(\[[^\]]+\])\s*(.+)$/m);
  if (!match?.[1] || !match?.[2]) return null;
  return { symbol: match[1], label: match[2] };
}

let completionAudioContext: AudioContext | null = null;

function getCompletionAudioContext() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  completionAudioContext ??= new AudioContextClass();
  return completionAudioContext;
}

function primeCompletionSound() {
  const ctx = getCompletionAudioContext();
  if (ctx?.state === 'suspended') {
    void ctx.resume();
  }
}

function playCompletionSound() {
  const ctx = getCompletionAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime + index * 0.07;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    oscillator.start(start);
    oscillator.stop(start + 0.2);
  });
}

export function TaskCard({ task, layoutId }: TaskCardProps) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const completeTask = useCompleteTask();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [completionPop, setCompletionPop] = useState(false);
  const isCompleted = task.status === 'completed';
  const velocityType = parseVelocityType(task.notes);

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCompleted) return;

    primeCompletionSound();
    completeTask.mutate(
      { id: task.id },
      {
        onSuccess: (result) => {
          playCompletionSound();
          setCompletionPop(true);
          window.setTimeout(() => setCompletionPop(false), 1300);
          toast.success(`Task complete. +${result.vpAwarded} VP`, {
            description: 'Nice execution. Momentum banked.',
          });
          if (result.tierUp) {
            toast('Tier Up!', {
              description: `You have reached Tier ${result.newTier}!`,
              icon: '🎉',
            });
          }
          
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetUserStatsQueryKey() });
        },
      }
    );
  };

  const startFocusSpace = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.localStorage.setItem('velocity_focus_task', JSON.stringify({
      id: task.id,
      title: task.title,
      description: task.description,
      dueDate: task.dueDate,
      estimatedMinutes: task.estimatedMinutes,
    }));
    setLocation('/focus');
  };

  const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && !isCompleted;
  
  return (
    <>
      <motion.div
        layoutId={layoutId}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        whileHover={{ scale: 1.02 }}
        onClick={() => setDetailsOpen(true)}
        className={`relative group bg-card p-4 rounded-xl border cursor-pointer ${isCompleted ? 'opacity-60 grayscale-[0.5]' : ''} shadow-sm hover:shadow-md transition-shadow`}
      >
        {completionPop && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="pointer-events-none absolute inset-x-4 top-3 z-10 rounded-xl border border-primary/30 bg-primary px-3 py-2 text-center text-xs font-black text-primary-foreground shadow-lg"
          >
            Complete +VP
          </motion.div>
        )}

        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startFocusSpace} title="Focus Space">
            <Timer className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setDetailsOpen(true); }}>
            <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>

        <div className="flex items-start gap-3">
          <button
            onClick={handleComplete}
            disabled={completeTask.isPending || isCompleted}
            className={`mt-1 flex-shrink-0 text-muted-foreground hover:text-primary transition-colors ${
              isCompleted ? 'text-primary' : ''
            }`}
          >
            {isCompleted ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <Circle className="w-5 h-5" />
            )}
          </button>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mr-6">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {velocityType && !isCompleted && (
                    <Badge variant="outline" className="h-5 shrink-0 border-primary/25 bg-primary/10 px-1.5 font-mono text-[10px] text-primary" title={velocityType.label}>
                      {velocityType.symbol}
                    </Badge>
                  )}
                  <h3 className={`font-medium text-sm leading-tight ${isCompleted ? 'line-through text-muted-foreground' : 'text-card-foreground'}`}>
                    {task.title}
                  </h3>
                </div>
              </div>
              <Badge variant="outline" className={`${priorityColors[task.priority]} whitespace-nowrap text-xs py-0 h-5`}>
                {task.priority}
              </Badge>
            </div>
            
            {task.description && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {task.description}
              </p>
            )}
            
            <div className="mt-3 flex items-center gap-3 text-xs">
              <Badge variant="secondary" className="font-mono font-medium">
                +{task.vpValue} VP
              </Badge>
              
              {task.dueDate && (
                <div className={`flex items-center gap-1.5 ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                  <Clock className="w-3.5 h-3.5" />
                  {format(parseISO(task.dueDate), 'MMM d')}
                </div>
              )}
            </div>
            
            {(task.checklistCount ?? 0) > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                  <span>Action steps</span>
                  <span>{task.checklistCompleted}/{task.checklistCount}</span>
                </div>
                <Progress value={((task.checklistCompleted ?? 0) / (task.checklistCount ?? 1)) * 100} className="h-1.5" />
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <TaskDetailsModal 
        taskId={task.id} 
        open={detailsOpen} 
        onOpenChange={setDetailsOpen} 
      />
    </>
  );
}
