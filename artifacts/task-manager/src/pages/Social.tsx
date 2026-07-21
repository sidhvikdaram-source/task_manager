import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Ban,
  Check,
  Flag,
  MessageCircle,
  MoreHorizontal,
  Search,
  Send,
  Share2,
  Trash2,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@workspace/replit-auth-web";
import { ProfileAvatar } from "@/components/ProfileCosmetics";

type Profile = {
  id: string;
  displayName: string | null;
  username: string | null;
  profileImageUrl: string | null;
  avatarStyle: string;
  equippedCosmetic: string;
  equippedFrame: string;
  level: number;
  streakDays: number;
  online: boolean;
};
type SearchResult = Profile & {
  friendshipStatus: "none" | "pending" | "accepted";
  requestDirection: "incoming" | "outgoing" | null;
  friendshipId: number | null;
};
type Friend = Profile & { friendshipId: number };
type Request = Profile & { friendshipId: number };
type Conversation = {
  friendshipId: number;
  friend: Profile;
  lastMessage: { body: string; createdAt: string; mine: boolean } | null;
  unreadCount: number;
};
type Message = {
  id: number;
  body: string;
  createdAt: string;
  readAt: string | null;
  mine: boolean;
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: options?.body
      ? { "Content-Type": "application/json", ...options.headers }
      : options?.headers,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function ProfileMark({ person }: { person: Profile }) {
  return (
    <div className="relative h-10 w-10 shrink-0">
      <ProfileAvatar avatarId={person.equippedCosmetic} frameId={person.equippedFrame} profileImageUrl={person.profileImageUrl} name={person.displayName ?? person.username ?? "Velocity member"} className="w-10" />
      {person.online && (
        <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-400" />
      )}
    </div>
  );
}

export default function Social() {
  const { user } = useAuth();
  const [section, setSection] = useState<"friends" | "messages" | "activity">(
    "friends",
  );
  const [query, setQuery] = useState(
    () => new URLSearchParams(window.location.search).get("q") ?? "",
  );
  const [conversationQuery, setConversationQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshPeople = async () => {
    const [friendData, requestData, conversationData] = await Promise.all([
      api<Friend[]>("/api/social/friends"),
      api<Request[]>("/api/social/requests"),
      api<Conversation[]>("/api/social/conversations"),
    ]);
    setFriends(friendData);
    setRequests(requestData);
    setConversations(conversationData);
  };
  useEffect(() => {
    void refreshPeople().catch(() => undefined);
  }, []);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        setResults(
          await api<SearchResult[]>(
            `/api/social/search?q=${encodeURIComponent(term)}`,
          ),
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Search failed");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (!selected) return;
    const load = async () => {
      try {
        setMessages(
          await api<Message[]>(`/api/social/messages/${selected.id}`),
        );
        void refreshPeople();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not load conversation",
        );
      }
    };
    void load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [selected?.id]);
  useEffect(
    () => endRef.current?.scrollIntoView({ behavior: "smooth" }),
    [messages],
  );

  const addFriend = async (person: SearchResult) => {
    try {
      await api("/api/social/friends/request", {
        method: "POST",
        body: JSON.stringify({ userId: person.id }),
      });
      setResults((current) =>
        current.map((item) =>
          item.id === person.id
            ? {
                ...item,
                friendshipStatus: "pending",
                requestDirection: "outgoing",
              }
            : item,
        ),
      );
      toast.success("Friend request sent");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send request",
      );
    }
  };
  const handleRequest = async (
    request: Request,
    action: "accept" | "decline",
  ) => {
    try {
      await api(`/api/social/requests/${request.friendshipId}/${action}`, {
        method: "POST",
      });
      await refreshPeople();
      toast.success(action === "accept" ? "Friend added" : "Request declined");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update request",
      );
    }
  };
  const removeFriend = async (friendshipId: number) => {
    if (!window.confirm("Remove this friend? Messaging will be disabled."))
      return;
    await api(`/api/social/friends/${friendshipId}`, { method: "DELETE" });
    setSelected(null);
    await refreshPeople();
  };
  const blockUser = async (person: Profile) => {
    if (
      !window.confirm(
        `Block ${person.displayName ?? "this user"}? This also removes the friendship.`,
      )
    )
      return;
    await api(`/api/social/users/${person.id}/block`, { method: "POST" });
    setSelected(null);
    await refreshPeople();
    toast.success("User blocked");
  };
  const reportUser = async (person: Profile) => {
    const reason = window.prompt("Briefly describe the issue.");
    if (!reason?.trim()) return;
    await api(`/api/social/users/${person.id}/report`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    toast.success("Report submitted");
  };
  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    try {
      const sent = await api<Message>(`/api/social/messages/${selected.id}`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setMessages((current) => [...current, sent]);
      await refreshPeople();
    } catch (error) {
      setDraft(body);
      toast.error(error instanceof Error ? error.message : "Message failed");
    }
  };
  const deleteMessage = async (id: number) => {
    await api(`/api/social/messages/${id}`, { method: "DELETE" });
    setMessages((current) => current.filter((message) => message.id !== id));
  };
  const filteredConversations = useMemo(
    () =>
      conversations.filter((conversation) =>
        `${conversation.friend.displayName ?? ""} ${conversation.friend.username ?? ""}`
          .toLowerCase()
          .includes(conversationQuery.toLowerCase()),
      ),
    [conversationQuery, conversations],
  );
  const shareProfile = async () => {
    const displayName = user?.firstName ?? "";
    const link = `${window.location.origin}/social${displayName ? `?q=${encodeURIComponent(displayName)}` : ""}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Profile search link copied");
    } catch {
      window.prompt("Share this Velocity link", link);
    }
  };
  const streakLeaders = [...friends]
    .sort((a, b) => b.streakDays - a.streakDays || b.level - a.level)
    .slice(0, 5);

  return (
    <div className="space-y-5">
      <section className="bento-card p-5 sm:p-6">
        <div className="flex items-center gap-2 text-xs font-black uppercase text-primary">
          <Users className="h-4 w-4" /> Social
        </div>
        <h1 className="tech-title mt-2 text-3xl sm:text-5xl">Your circle</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Private connections and one-to-one conversations. Your tasks stay
          private.
        </p>
      </section>
      <section className="bento-card overflow-hidden">
        <div className="flex gap-2 overflow-x-auto border-b border-border p-3">
          {(
            [
              { id: "friends", label: "Friends", icon: Users },
              { id: "messages", label: "Messages", icon: MessageCircle },
              { id: "activity", label: "Activity", icon: Activity },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${section === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.id === "messages" &&
                conversations.some(
                  (conversation) => conversation.unreadCount > 0,
                ) && <span className="h-2 w-2 rounded-full bg-secondary" />}
            </button>
          ))}
        </div>
        {section === "friends" && (
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="p-5">
              <label className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by display name or username"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              <div className="mt-4 space-y-2">
                {loading && (
                  <p className="p-4 text-center text-sm text-muted-foreground">
                    Searching profiles...
                  </p>
                )}
                {results.map((person) => (
                  <div
                    key={person.id}
                    className="flex items-center gap-3 rounded-xl border border-border p-3"
                  >
                    <ProfileMark person={person} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">
                        {person.displayName ?? "Velocity member"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {person.username
                          ? `@${person.username}`
                          : "Velocity member"}{" "}
                        · Level {person.level} · {person.streakDays} momentum days
                      </p>
                    </div>
                    {person.friendshipStatus === "none" ? (
                      <button
                        onClick={() => addFriend(person)}
                        className="rounded-lg border border-primary/40 px-3 py-2 text-xs font-black text-primary"
                      >
                        <UserPlus className="mr-1 inline h-3.5 w-3.5" />
                        Add
                      </button>
                    ) : (
                      <span className="rounded-lg bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">
                        {person.friendshipStatus === "accepted"
                          ? "Friends"
                          : person.requestDirection === "incoming"
                            ? "Requested you"
                            : "Sent"}
                      </span>
                    )}
                  </div>
                ))}
                {query.trim().length >= 2 &&
                  !loading &&
                  results.length === 0 && (
                    <p className="p-6 text-center text-sm text-muted-foreground">
                      No public profiles matched that search.
                    </p>
                  )}
                {query.length < 2 && (
                  <>
                    <h2 className="mt-6 text-xs font-black uppercase text-muted-foreground">
                      Friends
                    </h2>
                    {friends.map((friend) => (
                      <div
                        key={friend.id}
                        className="mt-2 flex items-center gap-3 rounded-xl border border-border p-3"
                      >
                        <ProfileMark person={friend} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold">
                            {friend.displayName ?? "Velocity member"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Level {friend.level} · {friend.streakDays} momentum days
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setSelected(friend);
                            setSection("messages");
                          }}
                          className="rounded-lg bg-primary p-2 text-primary-foreground"
                          title="Message"
                          aria-label={`Message ${friend.displayName ?? "friend"}`}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {friends.length === 0 && (
                      <div className="mt-2 rounded-xl border border-dashed p-6 text-center">
                        <p className="text-sm font-bold">
                          Start your study circle
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Search by name or share a direct profile-search link.
                        </p>
                        <button
                          onClick={() => void shareProfile()}
                          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground"
                        >
                          <Share2 className="h-3.5 w-3.5" /> Share profile link
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <aside className="border-t border-border p-5 lg:border-l lg:border-t-0">
              <h2 className="text-xs font-black uppercase text-muted-foreground">
                Requests {requests.length > 0 && `(${requests.length})`}
              </h2>
              <div className="mt-3 space-y-2">
                {requests.map((request) => (
                  <div
                    key={request.friendshipId}
                    className="rounded-xl border p-3"
                  >
                    <div className="flex items-center gap-2">
                      <ProfileMark person={request} />
                      <p className="min-w-0 flex-1 truncate text-sm font-bold">
                        {request.displayName ?? "Velocity member"}
                      </p>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleRequest(request, "accept")}
                        className="rounded-lg bg-primary px-2 py-2 text-xs font-black text-primary-foreground"
                      >
                        <Check className="mr-1 inline h-3.5 w-3.5" />
                        Accept
                      </button>
                      <button
                        onClick={() => handleRequest(request, "decline")}
                        className="rounded-lg border px-2 py-2 text-xs font-black"
                      >
                        <X className="mr-1 inline h-3.5 w-3.5" />
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
                {requests.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No pending requests.
                  </p>
                )}
              </div>
            </aside>
          </div>
        )}
        {section === "messages" && (
          <div className="grid min-h-[560px] md:grid-cols-[300px_minmax(0,1fr)]">
            <aside
              className={`${selected ? "hidden md:block" : ""} border-r border-border`}
            >
              <div className="p-3">
                <label className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={conversationQuery}
                    onChange={(event) =>
                      setConversationQuery(event.target.value)
                    }
                    placeholder="Search conversations"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                </label>
              </div>
              <div>
                {filteredConversations.map((conversation) => (
                  <button
                    key={conversation.friend.id}
                    onClick={() => setSelected(conversation.friend)}
                    className={`flex w-full items-center gap-3 border-t border-border/70 p-3 text-left hover:bg-muted/40 ${selected?.id === conversation.friend.id ? "bg-primary/10" : ""}`}
                  >
                    <ProfileMark person={conversation.friend} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-sm font-bold">
                          {conversation.friend.displayName ?? "Velocity member"}
                        </p>
                        {conversation.unreadCount > 0 && (
                          <span className="rounded-full bg-primary px-1.5 text-[10px] font-black text-primary-foreground">
                            {conversation.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {conversation.lastMessage?.body ??
                          "Start a conversation"}
                      </p>
                    </div>
                  </button>
                ))}
                {filteredConversations.length === 0 && (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    Accepted friends appear here.
                  </p>
                )}
              </div>
            </aside>
            <div
              className={`${!selected ? "hidden md:flex" : "flex"} min-w-0 flex-col`}
            >
              {selected ? (
                <>
                  <header className="flex items-center gap-3 border-b border-border p-3">
                    <button
                      aria-label="Back to conversations"
                      onClick={() => setSelected(null)}
                      className="md:hidden"
                    >
                      <X className="h-5 w-5" />
                    </button>
                    <ProfileMark person={selected} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">
                        {selected.displayName ?? "Velocity member"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Accepted friend
                      </p>
                    </div>
                    <button
                      onClick={() => reportUser(selected)}
                      title="Report"
                      className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                    >
                      <Flag className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => blockUser(selected)}
                      title="Block"
                      className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                    >
                      <Ban className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        const conversation = conversations.find(
                          (item) => item.friend.id === selected.id,
                        );
                        if (conversation)
                          void removeFriend(conversation.friendshipId);
                      }}
                      title="Remove friend"
                      className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </header>
                  <div className="flex-1 space-y-3 overflow-y-auto p-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`group flex ${message.mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[78%] rounded-2xl px-3 py-2 ${message.mine ? "bg-primary text-primary-foreground" : "border bg-muted/50"}`}
                        >
                          <p className="whitespace-pre-wrap text-sm">
                            {message.body}
                          </p>
                          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-65">
                            <span>
                              {new Date(message.createdAt).toLocaleTimeString(
                                [],
                                { hour: "numeric", minute: "2-digit" },
                              )}
                            </span>
                            {message.mine && message.readAt && (
                              <Check className="h-3 w-3" />
                            )}
                            {message.mine && (
                              <button
                                aria-label="Delete message"
                                onClick={() => deleteMessage(message.id)}
                                className="ml-1 opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {messages.length === 0 && (
                      <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                        No messages yet.
                        <br />
                        Say hello when you are ready.
                      </div>
                    )}
                    <div ref={endRef} />
                  </div>
                  <form
                    onSubmit={sendMessage}
                    className="flex gap-2 border-t border-border p-3"
                  >
                    <input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="Message your friend"
                      className="min-w-0 flex-1 rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <button
                      aria-label="Send message"
                      disabled={!draft.trim()}
                      className="rounded-xl bg-primary p-2.5 text-primary-foreground disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                </>
              ) : (
                <div className="m-auto text-center text-sm text-muted-foreground">
                  <MessageCircle className="mx-auto mb-3 h-8 w-8 text-primary" />
                  Choose an accepted friend to start messaging.
                </div>
              )}
            </div>
          </div>
        )}
        {section === "activity" && (
          <div className="grid gap-5 p-5 lg:grid-cols-2">
            <div className="rounded-xl border p-5">
              <Activity className="h-6 w-6 text-primary" />
              <p className="mt-3 font-bold">Friends-only activity</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Milestones and challenge updates stay private to accepted
                friends.
              </p>
              {friends.length === 0 && (
                <button
                  onClick={() => setSection("friends")}
                  className="mt-4 rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground"
                >
                  Find friends
                </button>
              )}
            </div>
            <div className="rounded-xl border p-5">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-secondary" />
                <h2 className="font-black">Momentum comparison</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Based only on stored active-day and level data.
              </p>
              <div className="mt-4 space-y-2">
                {streakLeaders.map((friend, index) => (
                  <div
                    key={friend.id}
                    className="flex items-center gap-3 rounded-lg bg-muted/40 p-2.5"
                  >
                    <span className="w-5 text-xs font-black text-muted-foreground">
                      {index + 1}
                    </span>
                    <ProfileMark person={friend} />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">
                      {friend.displayName ?? "Velocity member"}
                    </span>
                    <span className="text-xs font-black text-primary">
                      {friend.streakDays} days
                    </span>
                  </div>
                ))}
                {streakLeaders.length === 0 && (
                  <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Accepted friends will appear here.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
