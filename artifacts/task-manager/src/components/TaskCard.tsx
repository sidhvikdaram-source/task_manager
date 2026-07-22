import React, { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, Clock, Loader2, Maximize2, Timer } from "lucide-react";
import { Task } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { format, isPast, parseISO } from "date-fns";
import { TaskDetailsModal } from "@/components/TaskDetailsModal";
import { useLocation } from "wouter";
import { useReliableTaskCompletion } from "@/hooks/useReliableTaskCompletion";

interface TaskCardProps {
  task: Task;
  layoutId?: string;
}

const priorityColors = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  medium: "bg-primary/10 text-primary border-primary/20",
  low: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

function parseVelocityType(notes?: string | null) {
  if (!notes) return null;
  const match = notes.match(/^Velocity Type:\s*(\[[^\]]+\])\s*(.+)$/m);
  if (!match?.[1] || !match?.[2]) return null;
  return { symbol: match[1], label: match[2] };
}

export function TaskCard({ task, layoutId }: TaskCardProps) {
  const [, setLocation] = useLocation();
  const taskCompletion = useReliableTaskCompletion();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [completionPop, setCompletionPop] = useState(false);
  const isCompleted = task.status === "completed";
  const velocityType = parseVelocityType(task.notes);

  const handleComplete = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isCompleted) return;
    void taskCompletion.complete(task, event.currentTarget, {
      onSuccess: () => {
        setCompletionPop(true);
        window.setTimeout(() => setCompletionPop(false), 1300);
      },
    });
  };

  const startFocusSpace = (event: React.MouseEvent) => {
    event.stopPropagation();
    window.localStorage.setItem(
      "velocity_focus_task",
      JSON.stringify({
        id: task.id,
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        estimatedMinutes: task.estimatedMinutes,
      }),
    );
    setLocation("/focus");
  };

  const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && !isCompleted;
  const pending = taskCompletion.isPending(task.id);

  return (
    <>
      <motion.div
        layoutId={layoutId}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        whileHover={{ scale: 1.008 }}
        onClick={() => setDetailsOpen(true)}
        className={`group relative cursor-pointer rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md ${isCompleted ? "opacity-60 grayscale-[0.5]" : ""}`}
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

        <div className="absolute right-2 top-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startFocusSpace} title="Focus Space">
            <Timer className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button
            aria-label="Open task details"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(event) => {
              event.stopPropagation();
              setDetailsOpen(true);
            }}
          >
            <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>

        <div className="flex items-start gap-2">
          <button
            type="button"
            aria-label={isCompleted ? "Task completed" : "Mark task complete"}
            aria-busy={pending}
            onClick={handleComplete}
            disabled={pending || isCompleted}
            className={`-ml-2 -mt-1 flex h-11 w-11 flex-shrink-0 touch-manipulation items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-70 ${isCompleted ? "text-primary" : ""}`}
          >
            {pending ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : isCompleted ? (
              <CheckCircle2 className="h-6 w-6" />
            ) : (
              <Circle className="h-6 w-6" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="mr-16 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {velocityType && !isCompleted && (
                    <Badge variant="outline" className="h-5 shrink-0 border-primary/25 bg-primary/10 px-1.5 font-mono text-[10px] text-primary" title={velocityType.label}>
                      {velocityType.symbol}
                    </Badge>
                  )}
                  <h3 className={`text-sm font-medium leading-tight ${isCompleted ? "text-muted-foreground line-through" : "text-card-foreground"}`}>
                    {task.title}
                  </h3>
                </div>
              </div>
              <Badge variant="outline" className={`${priorityColors[task.priority]} h-5 whitespace-nowrap py-0 text-xs`}>
                {task.priority}
              </Badge>
            </div>

            {task.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>}
            <div className="mt-3 flex items-center gap-3 text-xs">
              <Badge variant="secondary" className="font-mono font-medium">+{task.vpValue} VP</Badge>
              {task.dueDate && (
                <div className={`flex items-center gap-1.5 ${isOverdue ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                  <Clock className="h-3.5 w-3.5" />
                  {format(parseISO(task.dueDate), "MMM d")}
                </div>
              )}
            </div>

            {(task.checklistCount ?? 0) > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
                  <span>Action steps</span>
                  <span>{task.checklistCompleted}/{task.checklistCount}</span>
                </div>
                <Progress aria-label="Checklist progress" value={((task.checklistCompleted ?? 0) / (task.checklistCount ?? 1)) * 100} className="h-1.5" />
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <TaskDetailsModal taskId={task.id} open={detailsOpen} onOpenChange={setDetailsOpen} />
    </>
  );
}
