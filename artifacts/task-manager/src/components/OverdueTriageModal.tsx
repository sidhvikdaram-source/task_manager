import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useBulkReschedule, useUpdateTask, getListTasksQueryKey, getGetDashboardOverviewQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Calendar, Trash2 } from 'lucide-react';
import { addLocalDays, localDateKey } from '@/lib/localDate';

interface OverdueTask {
  id: number;
  title: string;
  priority: string;
  dueDate?: string | null;
}

interface OverdueTriageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overdueTasks: OverdueTask[];
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'text-rose-600',
  high: 'text-amber-600',
  medium: 'text-zinc-600',
  low: 'text-slate-500',
};

export function OverdueTriageModal({ open, onOpenChange, overdueTasks }: OverdueTriageModalProps) {
  const qc = useQueryClient();
  const bulkReschedule = useBulkReschedule();
  const updateTask = useUpdateTask();

  const today = localDateKey();
  const tomorrow = localDateKey(addLocalDays(new Date(), 1));

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(overdueTasks.map((t) => t.id)));
  const [newDate, setNewDate] = useState(tomorrow);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === overdueTasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(overdueTasks.map((t) => t.id)));
    }
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListTasksQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
  };

  const handleReschedule = () => {
    if (selectedIds.size === 0) return;
    bulkReschedule.mutate(
      { data: { taskIds: Array.from(selectedIds), newDate } },
      {
        onSuccess: (result) => {
          toast.success(`${result.updated} task${result.updated !== 1 ? 's' : ''} rescheduled`);
          invalidate();
          onOpenChange(false);
        },
        onError: () => toast.error('Failed to reschedule tasks'),
      }
    );
  };

  const handleMarkToday = () => {
    if (selectedIds.size === 0) return;
    bulkReschedule.mutate(
      { data: { taskIds: Array.from(selectedIds), newDate: today } },
      {
        onSuccess: (result) => {
          toast.success(`${result.updated} task${result.updated !== 1 ? 's' : ''} set to today`);
          invalidate();
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            Overdue Tasks ({overdueTasks.length})
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-1">
          You have tasks past their due date. Select which ones to reschedule.
        </p>

        <div className="space-y-1 max-h-56 overflow-y-auto">
          <div className="flex items-center gap-2 px-1 py-1 border-b mb-1">
            <Checkbox
              checked={selectedIds.size === overdueTasks.length}
              onCheckedChange={toggleAll}
            />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {selectedIds.size === overdueTasks.length ? 'Deselect all' : 'Select all'}
            </span>
          </div>
          {overdueTasks.map((task) => (
            <motion.div
              key={task.id}
              layout
              className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                checked={selectedIds.has(task.id)}
                onCheckedChange={() => toggleSelect(task.id)}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{task.title}</p>
                {task.dueDate && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Was due {new Date(task.dueDate + 'T00:00:00').toLocaleDateString()}
                  </p>
                )}
              </div>
              <span className={`text-xs font-semibold uppercase ${PRIORITY_COLORS[task.priority] ?? 'text-zinc-600'}`}>
                {task.priority}
              </span>
            </motion.div>
          ))}
        </div>

        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium shrink-0">Reschedule to:</label>
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="flex-1" />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">
            Dismiss
          </Button>
          <Button
            variant="secondary"
            onClick={handleMarkToday}
            disabled={selectedIds.size === 0 || bulkReschedule.isPending}
            size="sm"
          >
            Do today
          </Button>
          <Button
            onClick={handleReschedule}
            disabled={selectedIds.size === 0 || !newDate || bulkReschedule.isPending}
            size="sm"
          >
            <Calendar className="w-4 h-4 mr-1.5" />
            Reschedule {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
