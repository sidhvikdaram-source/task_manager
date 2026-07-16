import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, ListTodo, Plus, SlidersHorizontal, Zap } from 'lucide-react';
import { useCompleteTask, useListTasks, getListTasksQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { TaskDetailsModal } from '@/components/TaskDetailsModal';
import { Button } from '@/components/ui/button';

export default function Tasks() {
  const [status, setStatus] = useState<'active' | 'completed'>('active');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: tasks = [] } = useListTasks({ sortBy: 'priority' }, { query: { queryKey: getListTasksQueryKey({ sortBy: 'priority' }) } });
  const complete = useCompleteTask();
  const queryClient = useQueryClient();
  const visible = useMemo(() => tasks.filter((task) => status === 'completed' ? task.status === 'completed' : task.status !== 'completed'), [status, tasks]);

  return <div className="space-y-5">
    <section className="bento-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase text-primary"><ListTodo className="h-4 w-4" /> Command Queue</div>
          <h1 className="tech-title mt-2 text-3xl sm:text-5xl">Tasks</h1>
          <p className="mt-2 text-sm text-muted-foreground">A clear view of everything that needs your attention.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-secondary text-secondary-foreground"><Plus className="mr-2 h-4 w-4" />New task</Button>
      </div>
    </section>
    <section className="bento-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="flex rounded-xl bg-muted p-1">
          {(['active', 'completed'] as const).map((item) => <button key={item} onClick={() => setStatus(item)} className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${status === item ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>{item === 'active' ? 'Active' : 'Completed'}</button>)}
        </div>
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="divide-y divide-border/70">
        {visible.map((task, index) => <motion.div key={task.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .025 }} className="flex cursor-pointer items-center gap-3 p-4 hover:bg-muted/40" onClick={() => setSelectedId(task.id)}>
          {status === 'active' ? <button className="text-muted-foreground hover:text-primary" onClick={(event) => { event.stopPropagation(); complete.mutate({ id: task.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/tasks'] }) }); }}><Circle className="h-5 w-5" /></button> : <CheckCircle2 className="h-5 w-5 text-primary" />}
          <div className="min-w-0 flex-1"><p className="truncate font-bold">{task.title}</p><p className="mt-1 text-xs text-muted-foreground">{task.dueDate ? `Due ${new Date(`${task.dueDate}T12:00:00`).toLocaleDateString()}` : 'No deadline'}</p></div>
          <span className="rounded-lg bg-primary/10 px-2 py-1 text-xs font-black text-primary"><Zap className="mr-1 inline h-3 w-3 fill-primary" />{task.vpValue}</span>
        </motion.div>)}
        {visible.length === 0 && <p className="p-10 text-center text-sm text-muted-foreground">{status === 'active' ? 'Your queue is clear.' : 'Completed tasks will appear here.'}</p>}
      </div>
    </section>
    <CreateTaskModal open={createOpen} onOpenChange={setCreateOpen} />
    {selectedId !== null && <TaskDetailsModal taskId={selectedId} open onOpenChange={(open) => !open && setSelectedId(null)} />}
  </div>;
}
