import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target } from 'lucide-react';

const SHUFFLED_TASKS = [
  { id: 3, label: 'Write documentation', priority: 'low',      dot: 'bg-slate-400',  barW: '68%' },
  { id: 1, label: 'Fix critical login bug', priority: 'critical', dot: 'bg-rose-500', barW: '82%' },
  { id: 5, label: 'Refactor API layer',   priority: 'medium',  dot: 'bg-zinc-400',   barW: '55%' },
  { id: 2, label: 'Deploy to production', priority: 'high',    dot: 'bg-amber-500',  barW: '74%' },
  { id: 4, label: 'Code review backlog',  priority: 'low',     dot: 'bg-slate-400',  barW: '45%' },
];

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const sorted = [...SHUFFLED_TASKS].sort(
  (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
);

interface Props {
  onComplete: () => void;
}

export function IntroAnimation({ onComplete }: Props) {
  const [tasks, setTasks] = useState(SHUFFLED_TASKS);
  const [phase, setPhase] = useState<'entering' | 'sorting' | 'done'>('entering');
  const [show, setShow] = useState(true);

  useEffect(() => {
    const t1 = setTimeout(() => {
      setPhase('sorting');
      setTasks(sorted);
    }, 950);

    const t2 = setTimeout(() => {
      setPhase('done');
    }, 1700);

    const t3 = setTimeout(() => {
      setShow(false);
    }, 1950);

    const t4 = setTimeout(() => {
      onComplete();
    }, 2300);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="intro"
          initial={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -32, filter: 'blur(4px)' }}
          transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 bg-background z-50 flex items-center justify-center"
        >
          <div className="w-full max-w-md px-6">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="flex items-center gap-2.5 mb-7"
            >
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
                <Target className="w-4 h-4" />
              </div>
              <motion.span
                key={phase}
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                className="text-base font-semibold tracking-tight text-foreground"
              >
                {phase === 'entering' ? 'Loading your tasks…' : phase === 'sorting' ? 'Sorting by priority…' : 'Ready!'}
              </motion.span>
            </motion.div>

            <div className="space-y-2">
              {tasks.map((task, i) => (
                <motion.div
                  key={task.id}
                  layout
                  layoutId={`intro-task-${task.id}`}
                  initial={{ opacity: 0, x: -28, scale: 0.97 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{
                    layout: { type: 'spring', stiffness: 380, damping: 30 },
                    opacity: { delay: i * 0.09, duration: 0.28 },
                    x: { delay: i * 0.09, duration: 0.28, ease: 'easeOut' },
                    scale: { delay: i * 0.09, duration: 0.28 },
                  }}
                  className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3"
                >
                  <motion.div
                    className={`w-2 h-2 rounded-full shrink-0 ${task.dot}`}
                    animate={phase === 'sorting' ? { scale: [1, 1.4, 1] } : {}}
                    transition={{ duration: 0.35, delay: i * 0.05 }}
                  />
                  <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className="h-full bg-foreground/10 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: task.barW }}
                      transition={{ delay: i * 0.09 + 0.15, duration: 0.4, ease: 'easeOut' }}
                    />
                  </div>
                  <motion.span
                    className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ml-1 w-14 text-right"
                    animate={phase === 'sorting' && task.priority === 'critical' ? { color: ['#71717a', '#f43f5e', '#71717a'] } : {}}
                    transition={{ duration: 0.6 }}
                  >
                    {task.priority}
                  </motion.span>
                </motion.div>
              ))}
            </div>

            <motion.div
              className="mt-5 flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: phase === 'sorting' || phase === 'done' ? 1 : 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">
                {phase === 'done' ? '✓ All set' : 'Organising…'}
              </span>
              <div className="flex-1 h-px bg-border" />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
