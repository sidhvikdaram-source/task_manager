import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useListDailyHabits,
  useCreateDailyHabit,
  useToggleDailyHabit,
  useDeleteDailyHabit,
  getListDailyHabitsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Plus, Trash2, Repeat } from 'lucide-react';
import { toast } from 'sonner';

export function DailyChecklist() {
  const qc = useQueryClient();
  const { data: habits = [], isLoading } = useListDailyHabits();
  const createHabit = useCreateDailyHabit();
  const toggleHabit = useToggleDailyHabit();
  const deleteHabit = useDeleteDailyHabit();

  const [newTitle, setNewTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListDailyHabitsQueryKey() });

  const completedCount = habits.filter(h => h.completedToday).length;
  const total = habits.length;

  const handleAdd = () => {
    const title = newTitle.trim();
    if (!title) return;
    createHabit.mutate({ data: { title } }, {
      onSuccess: () => {
        invalidate();
        setNewTitle('');
        setIsAdding(false);
        toast.success('Habit added');
      },
    });
  };

  const handleToggle = (id: number) => {
    setTogglingId(id);
    toggleHabit.mutate({ habitId: id }, {
      onSuccess: (result) => {
        invalidate();
        if (result.completedToday) toast.success('Habit completed ✓');
      },
      onSettled: () => setTogglingId(null),
    });
  };

  const handleDelete = (id: number) => {
    deleteHabit.mutate({ habitId: id }, {
      onSuccess: () => { invalidate(); toast.success('Habit removed'); },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') { setIsAdding(false); setNewTitle(''); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, filter: 'blur(3px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay: 0.42, duration: 0.38, ease: 'easeOut' }}
      className="bg-card border rounded-xl shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Repeat className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-semibold text-sm">Daily Habits</span>
          {total > 0 && (
            <motion.span
              key={`${completedCount}/${total}`}
              initial={{ scale: 1.15 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                completedCount === total && total > 0
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {completedCount}/{total}
            </motion.span>
          )}
        </div>
        <motion.button
          onClick={() => setIsAdding(true)}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Add habit
        </motion.button>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="h-0.5 bg-muted">
          <motion.div
            className="h-full bg-foreground rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${total > 0 ? (completedCount / total) * 100 : 0}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      )}

      {/* Habit list */}
      <div className="divide-y divide-border/50">
        <AnimatePresence initial={false}>
          {isLoading ? (
            <div className="py-6 text-center text-muted-foreground text-sm">Loading…</div>
          ) : habits.length === 0 && !isAdding ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-8 text-center"
            >
              <Repeat className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No daily habits yet.</p>
              <button
                onClick={() => setIsAdding(true)}
                className="mt-2 text-xs font-medium text-foreground underline underline-offset-2"
              >
                Add your first habit
              </button>
            </motion.div>
          ) : (
            habits.map((habit, i) => (
              <motion.div
                key={habit.id}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12, height: 0 }}
                transition={{ delay: i * 0.04, duration: 0.24, ease: 'easeOut' }}
                className="flex items-center gap-3 px-4 py-3 group"
              >
                {/* Toggle button */}
                <motion.button
                  onClick={() => handleToggle(habit.id)}
                  disabled={togglingId === habit.id}
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.88 }}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <AnimatePresence mode="wait">
                    {togglingId === habit.id ? (
                      <motion.div
                        key="spinner"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
                        className="w-4.5 h-4.5 border-2 border-foreground border-t-transparent rounded-full"
                        style={{ width: 18, height: 18 }}
                      />
                    ) : habit.completedToday ? (
                      <motion.div
                        key="checked"
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.6, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                      >
                        <CheckCircle2 className="w-[18px] h-[18px] text-foreground fill-foreground" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="unchecked"
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.6, opacity: 0 }}
                      >
                        <Circle className="w-[18px] h-[18px]" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>

                {/* Title */}
                <motion.span
                  animate={{
                    opacity: habit.completedToday ? 0.4 : 1,
                    textDecoration: habit.completedToday ? 'line-through' : 'none',
                  }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 text-sm font-medium text-foreground select-none"
                >
                  {habit.title}
                </motion.span>

                {/* Delete */}
                <motion.button
                  onClick={() => handleDelete(habit.id)}
                  className="shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground hover:text-foreground transition-colors"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  title="Remove habit"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </motion.button>
              </motion.div>
            ))
          )}
        </AnimatePresence>

        {/* Add input row */}
        <AnimatePresence>
          {isAdding && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 px-4 py-3">
                <Plus className="w-[18px] h-[18px] text-muted-foreground shrink-0" />
                <input
                  autoFocus
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. Practice Python, Do math…"
                  className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50 text-foreground"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <motion.button
                    onClick={handleAdd}
                    disabled={!newTitle.trim() || createHabit.isPending}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    className="text-xs font-semibold text-primary-foreground bg-primary px-2.5 py-1 rounded-md disabled:opacity-40 transition-opacity"
                  >
                    Add
                  </motion.button>
                  <button
                    onClick={() => { setIsAdding(false); setNewTitle(''); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* All-done banner */}
      <AnimatePresence>
        {completedCount === total && total > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="px-4 py-2.5 border-t bg-foreground/4 flex items-center gap-2"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-foreground" />
            <span className="text-xs font-semibold text-foreground">All habits done for today 🎉</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
