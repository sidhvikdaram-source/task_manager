import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Send,
  Square,
  Trash2,
  MessageSquare,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useAuth, firebaseAuth } from "@workspace/replit-auth-web";
import { toast } from "sonner";
import { CopyableAnswer } from "@/components/CopyableAnswer";
import { aiEndpoint, aiRequest, readGeneralStream } from "@/lib/aiTransport";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  incomplete?: boolean;
};
type Chat = {
  id: string;
  title: string;
  assignmentPrompt: string;
  rubric: string;
  messages: Message[];
  updatedAt: string;
};
const emptyChat = (): Chat => ({
  id: crypto.randomUUID(),
  title: "New chat",
  assignmentPrompt: "",
  rubric: "",
  messages: [],
  updatedAt: new Date().toISOString(),
});
async function chatApi(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/ai/chats${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not save chat.");
  return data;
}
export default function GeneralAI({
  embedded = false,
  visible = true,
  onMinimize,
  onTaskMode,
}: {
  embedded?: boolean;
  visible?: boolean;
  onMinimize?: () => void;
  onTaskMode?: () => void;
} = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ["general-ai-chats", user?.id];
  const {
    data: chats = [],
    isLoading,
    error,
  } = useQuery<Chat[]>({
    queryKey: key,
    queryFn: () => chatApi(""),
    enabled: !!user,
  });
  const [expanded, setExpanded] = useState(false);
  const [chat, setChat] = useState<Chat>(emptyChat);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  const saveQueue = useRef(Promise.resolve());
  const owner = useRef(user?.id);
  owner.current = user?.id;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    controller.current?.abort();
    setChat(emptyChat());
    setInput("");
    setRequestError("");
  }, [user?.id]);
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [chat.messages]);
  async function save(next: Chat) {
    const expectedOwner = user?.id;
    setSaving(true);
    const operation = saveQueue.current
      .catch(() => undefined)
      .then(async () => {
        if (
          !expectedOwner ||
          owner.current !== expectedOwner ||
          firebaseAuth.currentUser?.uid !== expectedOwner
        )
          throw new Error("Your account changed. Please reopen the chat.");
        const saved = await chatApi(`/${next.id}`, "PUT", next);
        queryClient.setQueryData<Chat[]>(key, (old) =>
          [saved, ...(old || []).filter((c) => c.id !== next.id)].sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt),
          ),
        );
      });
    saveQueue.current = operation;
    try {
      await operation;
    } finally {
      if (saveQueue.current === operation) setSaving(false);
    }
  }
  async function saveContext() {
    if (chat.messages.length && !busy)
      try {
        await save({ ...chat, updatedAt: new Date().toISOString() });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save context.");
      }
  }
  async function remove(id: string) {
    try {
      await chatApi(`/${id}`, "DELETE");
      queryClient.setQueryData<Chat[]>(key, (old) =>
        (old || []).filter((c) => c.id !== id),
      );
      if (chat.id === id) setChat(emptyChat());
      setDeleteId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete chat.");
    }
  }
  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busyRef.current || saving) return;
    if (chat.messages.length >= 39) {
      setRequestError(
        "Start a new chat to keep conversations within the free limits.",
      );
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setRequestError("");
    setInput("");
    const previous = chat.messages.at(-1);
    const baseMessages =
      previous?.role === "user" && previous.content === text
        ? chat.messages.slice(0, -1)
        : chat.messages;
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const assistantId = crypto.randomUUID();
    let next: Chat = {
      ...chat,
      title: chat.messages.length ? chat.title : text.slice(0, 65),
      updatedAt: new Date().toISOString(),
      messages: [...baseMessages, userMessage],
    };
    const history = baseMessages
      .filter((m) => !m.incomplete)
      .slice(-8)
      .map(({ role, content }) => ({ role, content }));
    setChat(next);
    let answer = "";
    let answerComplete = false;
    const abort = new AbortController();
    controller.current = abort;
    const timer = window.setTimeout(() => abort.abort(), 120000);
    try {
      await save(next);
      const response = await aiRequest(
        "general",
        {
          message: text,
          history,
          assignmentPrompt: chat.assignmentPrompt,
          rubric: chat.rubric,
        },
        abort.signal,
      );
      setChat({
        ...next,
        messages: [
          ...next.messages,
          { id: assistantId, role: "assistant", content: "" },
        ],
      });
      await readGeneralStream(response, (value) => {
        answer = value;
        setChat({
          ...next,
          messages: [
            ...next.messages,
            { id: assistantId, role: "assistant", content: value },
          ],
        });
      });
      answerComplete = true;
      next = {
        ...next,
        updatedAt: new Date().toISOString(),
        messages: [
          ...next.messages,
          { id: assistantId, role: "assistant", content: answer },
        ],
      };
      setChat(next);
      await save(next);
    } catch (e) {
      const message = abort.signal.aborted
        ? "Response stopped. You can send another message."
        : e instanceof Error
          ? e.message
          : "AI could not finish.";
      setRequestError(message);
      if (answer) {
        next = {
          ...next,
          messages: [
            ...next.messages.filter((message) => message.id !== assistantId),
            {
              id: assistantId,
              role: "assistant",
              content: answer,
              incomplete: !answerComplete,
            },
          ],
        };
        setChat(next);
        try {
          await save(next);
        } catch {
          setRequestError(`${message} The partial answer could not be saved.`);
        }
      } else setInput(text);
    } finally {
      window.clearTimeout(timer);
      busyRef.current = false;
      setBusy(false);
      controller.current = null;
    }
  }
  const content = (
    <div
      className={cn(
        "mx-auto flex min-w-0 w-full max-w-6xl flex-col gap-3 md:gap-5",
        embedded || expanded ? "h-full min-h-0" : "min-h-[calc(100dvh-12rem)]",
      )}
    >
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">General AI</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Write, revise, and debug. Honest feedback, separate from your tasks.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {embedded && (
            <button
              type="button"
              onClick={onTaskMode}
              className="min-h-11 rounded-xl border border-border bg-background/60 px-3 text-sm font-semibold backdrop-blur-xl hover:bg-muted"
            >
              Task AI
            </button>
          )}
          <button
            type="button"
            onClick={() => (embedded ? onMinimize?.() : setExpanded((v) => !v))}
            aria-label={
              embedded
                ? "Minimize Nimbus"
                : expanded
                  ? "Exit fullscreen"
                  : "Expand General AI"
            }
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background/60 backdrop-blur-xl hover:bg-muted"
          >
            {embedded || expanded ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
          <span className="text-xs text-muted-foreground" role="status">
            {saving
              ? "Saving…"
              : busy
                ? "Writing…"
                : "Chats save to your account"}
          </span>
        </div>
      </header>
      <div className="grid min-h-0 min-w-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] flex-1 gap-3 md:grid-cols-[230px_minmax(0,1fr)] md:grid-rows-1 md:gap-4">
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card p-3">
          <button
            disabled={busy || saving}
            onClick={() => {
              setChat(emptyChat());
              setInput("");
              setRequestError("");
            }}
            className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            New chat
          </button>
          <div
            className="mt-2 max-h-16 min-h-0 space-y-1 overflow-y-auto md:mt-3 md:max-h-none md:flex-1"
            aria-label="Saved chats"
          >
            {isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">
                Loading chats…
              </p>
            ) : error ? (
              <p className="p-3 text-sm text-destructive">
                Chats could not load.{" "}
                <button
                  onClick={() =>
                    queryClient.invalidateQueries({ queryKey: key })
                  }
                  className="underline"
                >
                  Retry
                </button>
              </p>
            ) : chats.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                Your conversations will appear here.
              </p>
            ) : (
              chats.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center rounded-xl",
                    chat.id === c.id ? "bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  <button
                    disabled={busy || saving}
                    onClick={() => {
                      setChat(c);
                      setInput("");
                      setRequestError("");
                    }}
                    className="min-w-0 flex-1 truncate px-3 py-3 text-left text-sm disabled:opacity-50"
                  >
                    {c.title}
                  </button>
                  <button
                    disabled={busy || saving}
                    onClick={() => setDeleteId(c.id)}
                    aria-label={`Delete ${c.title}`}
                    className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
          <div className="max-h-[35%] shrink-0 overflow-y-auto border-b border-border p-3 md:p-4">
            <button
              onClick={() => setContextOpen((v) => !v)}
              aria-expanded={contextOpen}
              className="text-sm font-semibold"
            >
              Assignment prompt & rubric{" "}
              <span className="ml-2 font-normal text-muted-foreground">
                {contextOpen ? "Hide" : "Optional"}
              </span>
            </button>
            {contextOpen && (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <label className="text-xs font-semibold">
                  Assignment prompt
                  <textarea
                    disabled={busy}
                    maxLength={8000}
                    value={chat.assignmentPrompt}
                    onBlur={saveContext}
                    onChange={(e) =>
                      setChat({ ...chat, assignmentPrompt: e.target.value })
                    }
                    className="mt-2 min-h-28 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm font-normal outline-none focus:border-primary"
                    placeholder="Paste what the essay must answer…"
                  />
                </label>
                <label className="text-xs font-semibold">
                  Rubric
                  <textarea
                    disabled={busy}
                    maxLength={8000}
                    value={chat.rubric}
                    onBlur={saveContext}
                    onChange={(e) =>
                      setChat({ ...chat, rubric: e.target.value })
                    }
                    className="mt-2 min-h-28 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm font-normal outline-none focus:border-primary"
                    placeholder="Paste the grading criteria…"
                  />
                </label>
              </div>
            )}
          </div>
          <div
            ref={scroll}
            className="min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-contain p-4 md:p-7"
            aria-label="General conversation"
            aria-busy={busy}
          >
            {!chat.messages.length ? (
              <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center">
                <MessageSquare className="mb-5 h-6 w-6 text-primary" />
                <h2 className="text-2xl font-semibold tracking-tight">
                  What are you working on?
                </h2>
                <p className="mt-3 leading-7 text-muted-foreground">
                  Paste a draft for precise criticism, ask for an essay, or
                  bring a piece of code that needs fixing.
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  General AI cannot create or change tasks.
                </p>
              </div>
            ) : (
              chat.messages.map((m, i) => (
                <article
                  key={m.id}
                  className={cn(
                    "min-w-0",
                    m.role === "user" &&
                      "ml-auto max-w-[92%] rounded-xl bg-muted/60 p-4",
                  )}
                >
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    {m.role === "user" ? "You" : "General AI"}
                  </p>
                  {m.role === "assistant" ? (
                    m.content ? (
                      <CopyableAnswer
                        content={m.content}
                        streaming={busy && i === chat.messages.length - 1}
                      />
                    ) : (
                      <span
                        role="status"
                        className="text-sm text-muted-foreground"
                      >
                        Thinking…
                      </span>
                    )
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm leading-7">
                      {m.content}
                    </p>
                  )}
                  {m.incomplete && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      This answer is incomplete.
                    </p>
                  )}
                </article>
              ))
            )}
          </div>
          <form
            onSubmit={send}
            className="shrink-0 border-t border-border p-3 md:p-4"
          >
            {!aiEndpoint() && (
              <p className="mb-3 text-sm text-muted-foreground">
                The private AI connection is awaiting setup. Chats can still be
                saved.
              </p>
            )}
            {requestError && (
              <p role="alert" className="mb-3 text-sm text-destructive">
                {requestError}
              </p>
            )}
            <div className="flex items-end gap-3 rounded-xl border border-border bg-background p-3 focus-within:border-primary">
              <textarea
                value={input}
                maxLength={16000}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
                aria-label="Message General AI"
                placeholder="Ask, write, or paste your draft…"
                className="max-h-32 min-h-12 min-w-0 flex-1 resize-none bg-transparent text-base outline-none"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => controller.current?.abort()}
                  aria-label="Stop response"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted"
                >
                  <Square className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || saving}
                  aria-label="Send to General AI"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Enter to send · Shift + Enter for a new line. Check important
              facts and generated code.
            </p>
          </form>
        </section>
      </div>
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <AlertDialogContent className="z-[100]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              The conversation will be removed from your account. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) void remove(deleteId);
              }}
            >
              Delete chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
  return embedded || expanded ? (
    <Dialog
      open={embedded ? visible : expanded}
      onOpenChange={(open) => {
        if (embedded) {
          if (!open) onMinimize?.();
        } else setExpanded(open);
      }}
    >
      <DialogContent
        fullscreen
        className="general-ai-fullscreen"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">General AI fullscreen</DialogTitle>
        {content}
      </DialogContent>
    </Dialog>
  ) : (
    content
  );
}
