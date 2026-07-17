import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, FolderKanban, Loader2, Send, Sparkles, X, Zap } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetDashboardOverviewQueryKey,
  getListTasksQueryKey,
  type ListTasksParams,
  type Task,
} from '@workspace/api-client-react';
import { cn } from '@/lib/utils';

type ChatRole = 'assistant' | 'user';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  typing?: boolean;
  taskPreview?: TaskPreview[];
  previewConfirmed?: boolean;
  actionPreview?: { type: string; count: number; label: string };
  planPreview?: ActionPlan;
}

type TaskPreview = { title: string; date?: string; time?: string; scheduleLabel?: string; taskType: string; priority: Task['priority']; keywords: string[] };
type ActionPlan = { summary: string; project: { name: string; subject: string | null; description: string | null; dueDate: string | null } | null; tasks: Array<{ title: string; description: string | null; subject: string | null; dueDate: string | null; priority: Task['priority']; estimatedMinutes: number | null; taskKind: string }> };

function planCommandLabel(plan: ActionPlan) {
  if (plan.project && plan.tasks.length > 0) return `Create project + ${plan.tasks.length} tasks`;
  if (plan.project) return 'Create project';
  return `Create ${plan.tasks.length} tasks`;
}

interface AssistantResponse {
  reply: string;
  taskCreated: boolean;
  task?: Task | null;
  tasks?: Task[];
  taskPreview?: TaskPreview[];
  actionPreview?: { type: string; count: number; label: string } | null;
  planPreview?: ActionPlan | null;
  error?: string;
}

const priorityRank: Record<Task['priority'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function AssistantLogo({ className, circular = false }: { className?: string; circular?: boolean }) {
  return (
    <span className={cn(
      'logo-mark inline-flex h-8 w-8 shrink-0 items-center justify-center bg-primary text-primary-foreground',
      circular && '!rounded-full bg-[#141414] text-white shadow-[0_8px_18px_rgba(0,0,0,0.18)] [&_svg]:fill-white [&_svg]:text-white',
      className,
    )}>
      <Zap className="h-4 w-4 fill-primary-foreground" />
    </span>
  );
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
  });
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => {
        const bullet = line.match(/^\s*[-*]\s+(.+)$/);
        if (bullet?.[1]) {
          return (
            <div key={`${line}-${index}`} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>{renderInlineMarkdown(bullet[1])}</span>
            </div>
          );
        }
        return <p key={`${line}-${index}`}>{renderInlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

function taskMatchesParams(task: Task, params?: ListTasksParams) {
  if (!params) return true;
  if (params.status && task.status !== params.status) return false;
  if (params.priority && task.priority !== params.priority) return false;
  if (params.projectId && task.projectId !== params.projectId) return false;
  return true;
}

function sortTasksForParams(tasks: Task[], params?: ListTasksParams) {
  const sorted = [...tasks];
  if (params?.sortBy === 'dueDate') {
    return sorted.sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31'));
  }
  if (params?.sortBy === 'vpValue') {
    return sorted.sort((a, b) => b.vpValue - a.vpValue);
  }
  if (params?.sortBy === 'priority') {
    return sorted.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  }
  return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function seedCreatedTask(queryClient: ReturnType<typeof useQueryClient>, task: Task) {
  const taskQueries = queryClient.getQueryCache().findAll({ queryKey: ['/api/tasks'] });

  if (taskQueries.length === 0) {
    queryClient.setQueryData(getListTasksQueryKey(), [task]);
    return;
  }

  for (const query of taskQueries) {
    const params = Array.isArray(query.queryKey) ? query.queryKey[1] as ListTasksParams | undefined : undefined;

    queryClient.setQueryData<Task[]>(query.queryKey, (current) => {
      if (!Array.isArray(current)) return current;
      const withoutDuplicate = current.filter((existing) => existing.id !== task.id);
      if (!taskMatchesParams(task, params)) return withoutDuplicate;
      return sortTasksForParams([task, ...withoutDuplicate], params);
    });
  }
}

export function VelocityAssistantCard() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'How can I speed up your day? Try: "Remind me to study math next Tuesday at 4 PM."',
    },
  ]);
  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canSend = input.trim().length > 0 && !isSending;
  const placeholder = useMemo(() => isSending ? 'Velocity Assistant is thinking...' : 'Type a command or ask for a plan...', [isSending]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function animateAssistantMessage(id: string, content: string) {
    if (content.length > 1200) {
      setMessages((current) => current.map((message) => (
        message.id === id ? { ...message, content, typing: false } : message
      )));
      return;
    }

    for (let i = 1; i <= content.length; i += 8) {
      const partial = content.slice(0, i);
      setMessages((current) => current.map((message) => (
        message.id === id ? { ...message, content: partial, typing: i < content.length } : message
      )));
      await new Promise((resolve) => setTimeout(resolve, 4));
    }
    setMessages((current) => current.map((message) => (
      message.id === id ? { ...message, content, typing: false } : message
    )));
  }

  async function confirmTaskPreview(messageId: string, preview: TaskPreview[]) {
    setConfirmingId(messageId);
    try {
      const response = await fetch('/api/ai/tasks/confirm', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tasks: preview }) });
      const data = await response.json() as { tasks?: Task[]; error?: string };
      if (!response.ok || !data.tasks) throw new Error(data.error || 'Could not create tasks');
      data.tasks.forEach((task) => seedCreatedTask(queryClient, task));
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, previewConfirmed: true } : message));
    } catch (error) {
      setMessages((current) => [...current, { id: `assistant-error-${Date.now()}`, role: 'assistant', content: error instanceof Error ? error.message : 'Could not create those tasks.' }]);
    } finally { setConfirmingId(null); }
  }

  async function confirmAction(messageId: string, action: { type: string; count: number; label: string }) {
    setConfirmingId(messageId);
    try {
      const response = await fetch('/api/ai/actions/confirm', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: action.type }) });
      const data = await response.json() as { updated?: number; error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not complete action');
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, previewConfirmed: true, content: `${message.content}\n\n**Updated ${data.updated ?? 0} tasks.**` } : message));
    } catch (error) { setMessages((current) => [...current, { id: `assistant-error-${Date.now()}`, role: 'assistant', content: error instanceof Error ? error.message : 'Could not complete that action.' }]); }
    finally { setConfirmingId(null); }
  }

  async function confirmPlan(messageId: string, plan: ActionPlan) {
    setConfirmingId(messageId);
    try {
      const response = await fetch('/api/ai/plans/confirm', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
      const data = await response.json() as { project?: { name: string } | null; tasks?: Task[]; error?: string };
      if (!response.ok || !data.tasks) throw new Error(data.error || 'Could not create the plan');
      data.tasks.forEach((task) => seedCreatedTask(queryClient, task));
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['/api/tasks'] }), queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() })]);
      const confirmation = data.project && data.tasks.length > 0
        ? `${data.project.name} and ${data.tasks.length} tasks`
        : data.project?.name ?? `${data.tasks.length} tasks`;
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, previewConfirmed: true, content: `${message.content}\n\n**Created ${confirmation}.**` } : message));
    } catch (error) {
      setMessages((current) => [...current, { id: `assistant-error-${Date.now()}`, role: 'assistant', content: error instanceof Error ? error.message : 'Could not create that plan.' }]);
    } finally { setConfirmingId(null); }
  }

  async function sendMessage(event?: React.FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    const assistantId = `assistant-${Date.now()}`;
    const history = messages
      .filter((message) => message.id !== 'welcome' && !message.typing && message.content.trim())
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.content }));

    setInput('');
    setIsSending(true);
    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: 'assistant', content: '', typing: true },
    ]);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });

      const data = await response.json() as AssistantResponse;
      if (!response.ok) throw new Error(data.error || 'Assistant request failed');

      const createdTasks = data.tasks?.length ? data.tasks : data.task ? [data.task] : [];
      if (data.taskCreated && createdTasks.length > 0) {
        createdTasks.forEach((task) => seedCreatedTask(queryClient, task));
        queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
        queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
      }

      await animateAssistantMessage(assistantId, data.reply);
      if (data.taskPreview?.length) {
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, taskPreview: data.taskPreview } : message));
      }
      if (data.actionPreview) {
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, actionPreview: data.actionPreview ?? undefined } : message));
      }
      if (data.planPreview) {
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, planPreview: data.planPreview ?? undefined } : message));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Velocity Assistant hit a snag. Please try again.';
      await animateAssistantMessage(assistantId, message);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.section
          key="assistant-panel"
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className={cn(
            'bento-card fixed bottom-3 left-3 right-3 z-50 flex h-[min(38rem,calc(100dvh-6rem))] flex-col overflow-hidden p-4 shadow-2xl sm:bottom-5 sm:left-auto sm:right-5 sm:w-[28rem] sm:p-5',
            isFocused && 'ring-2 ring-primary/35 shadow-[0_0_42px_hsl(var(--primary)/0.18)]',
          )}
          aria-label="Velocity Assistant"
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-border/70 pb-3">
            <AssistantLogo circular className="h-9 w-9 [&_svg]:h-4 [&_svg]:w-4" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="tech-title truncate text-base">Velocity Assistant</h2>
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-secondary" />
              </div>
              <p className="text-[11px] text-muted-foreground">Nothing changes until you confirm.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close Velocity Assistant"
              title="Close assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={cn('flex gap-2.5', message.role === 'user' && 'justify-end')}>
                {message.role === 'assistant' && <AssistantLogo circular className="mt-0.5 h-6 w-6 [&_svg]:h-3 [&_svg]:w-3" />}
                <div className={cn('max-w-[84%] rounded-2xl border px-3 py-2 text-sm leading-relaxed', message.role === 'assistant' ? 'border-primary/25 bg-primary/8 text-foreground' : 'border-secondary/30 bg-secondary/15 text-foreground')}>
                  {message.content ? <MarkdownMessage content={message.content} /> : (message.typing ? <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-.2s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-.1s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" /></span> : '')}
                  {message.typing && message.content && <span className="ml-0.5 animate-pulse text-primary">|</span>}
                  {message.taskPreview && !message.typing && <button type="button" disabled={message.previewConfirmed || confirmingId === message.id} onClick={() => confirmTaskPreview(message.id, message.taskPreview!)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground disabled:opacity-60">{confirmingId === message.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Creating</> : message.previewConfirmed ? <><Check className="h-3.5 w-3.5" />Created</> : message.taskPreview.length === 1 ? 'Create task' : `Create ${message.taskPreview.length} tasks`}</button>}
                  {message.actionPreview && !message.typing && <button type="button" disabled={message.previewConfirmed || confirmingId === message.id} onClick={() => confirmAction(message.id, message.actionPreview!)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs font-black text-secondary-foreground disabled:opacity-60">{confirmingId === message.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Updating</> : message.previewConfirmed ? <><Check className="h-3.5 w-3.5" />Confirmed</> : `${message.actionPreview.label} (${message.actionPreview.count})`}</button>}
                  {message.planPreview && !message.typing && <div className="mt-3 rounded-xl border border-primary/25 bg-background/70 p-3"><div className="flex items-center gap-2 text-xs font-black"><FolderKanban className="h-3.5 w-3.5 text-primary"/>{message.planPreview.project?.name ?? 'Multi-step plan'}<span className="ml-auto text-muted-foreground">{message.planPreview.tasks.length > 0 ? `${message.planPreview.tasks.length} tasks` : 'Project'}</span></div><button type="button" disabled={message.previewConfirmed || confirmingId === message.id} onClick={() => confirmPlan(message.id, message.planPreview!)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground disabled:opacity-60">{confirmingId === message.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Creating plan</> : message.previewConfirmed ? <><Check className="h-3.5 w-3.5" />Plan created</> : planCommandLabel(message.planPreview)}</button></div>}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={sendMessage} className="mt-3 flex shrink-0 items-center gap-2 rounded-2xl border border-primary/25 bg-black/20 p-2 focus-within:border-primary/60">
            <span className="px-2 font-mono text-xs font-bold text-primary">$</span>
            <input value={input} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)} onChange={(event) => setInput(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            <motion.button type="submit" disabled={!canSend} whileHover={canSend ? { scale: 1.04 } : undefined} whileTap={canSend ? { scale: 0.96 } : undefined} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40" aria-label="Send assistant command">
              <Send className="h-4 w-4" />
            </motion.button>
          </form>
        </motion.section>
      ) : (
        <motion.button
          key="assistant-launcher"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-[#141414] text-white shadow-[0_12px_34px_rgba(0,0,0,0.34)]"
          aria-label="Open Velocity Assistant"
          title="Velocity Assistant"
        >
          <Zap className="h-6 w-6 fill-white text-white" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
