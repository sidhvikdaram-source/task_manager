import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Sparkles, Zap } from 'lucide-react';
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
}

interface AssistantResponse {
  reply: string;
  taskCreated: boolean;
  task?: Task | null;
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
      circular && '!rounded-full',
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
  const [isSending, setIsSending] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canSend = input.trim().length > 0 && !isSending;
  const placeholder = useMemo(() => isSending ? 'Velocity Assistant is thinking...' : 'Type a command or ask for a plan...', [isSending]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function animateAssistantMessage(id: string, content: string) {
    for (let i = 1; i <= content.length; i += 2) {
      const partial = content.slice(0, i);
      setMessages((current) => current.map((message) => (
        message.id === id ? { ...message, content: partial, typing: i < content.length } : message
      )));
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    setMessages((current) => current.map((message) => (
      message.id === id ? { ...message, content, typing: false } : message
    )));
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
        body: JSON.stringify({ message: text }),
      });

      const data = await response.json() as AssistantResponse;
      if (!response.ok) throw new Error(data.error || 'Assistant request failed');

      if (data.taskCreated && data.task) {
        seedCreatedTask(queryClient, data.task);
        queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
        queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
      }

      await animateAssistantMessage(assistantId, data.reply);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Velocity Assistant hit a snag. Please try again.';
      await animateAssistantMessage(assistantId, message);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 14, filter: 'blur(3px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay: 0.16, duration: 0.38, ease: 'easeOut' }}
      className={cn(
        'bento-card relative overflow-hidden p-4 sm:p-5 transition-all',
        isFocused && 'ring-2 ring-primary/35 shadow-[0_0_42px_hsl(var(--primary)/0.18)]',
      )}
    >
      <div className="absolute right-8 top-0 h-24 w-24 rounded-full bg-primary/20 blur-3xl" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <AssistantLogo className="h-10 w-10" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="tech-title text-lg">Velocity Assistant</h2>
              <Sparkles className="h-4 w-4 text-secondary" />
            </div>
            <p className="text-xs text-muted-foreground">Plan, capture, and create tasks from natural language.</p>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="relative mt-4 max-h-72 min-h-44 space-y-3 overflow-y-auto pr-1"
        aria-live="polite"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'flex gap-2.5',
              message.role === 'user' && 'justify-end',
            )}
          >
            {message.role === 'assistant' && <AssistantLogo circular className="mt-0.5 h-6 w-6 [&_svg]:h-3 [&_svg]:w-3" />}
            <div
              className={cn(
                'max-w-[82%] rounded-2xl border px-3 py-2 text-sm leading-relaxed',
                message.role === 'assistant'
                  ? 'border-primary/25 bg-primary/8 text-foreground'
                  : 'border-secondary/30 bg-secondary/15 text-foreground',
              )}
            >
              {message.content ? <MarkdownMessage content={message.content} /> : (message.typing ? '...' : '')}
              {message.typing && <span className="ml-0.5 animate-pulse text-primary">|</span>}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={sendMessage} className="relative mt-4 flex items-center gap-2 rounded-2xl border border-primary/25 bg-black/20 p-2 focus-within:border-primary/60">
        <span className="px-2 font-mono text-xs font-bold text-primary">$</span>
        <input
          value={input}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onChange={(event) => setInput(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <motion.button
          type="submit"
          disabled={!canSend}
          whileHover={canSend ? { scale: 1.04 } : undefined}
          whileTap={canSend ? { scale: 0.96 } : undefined}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
          aria-label="Send assistant command"
        >
          <Send className="h-4 w-4" />
        </motion.button>
      </form>
    </motion.section>
  );
}
