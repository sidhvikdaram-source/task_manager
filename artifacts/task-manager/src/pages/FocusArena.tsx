import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, differenceInSeconds, parseISO } from "date-fns";
import {
  useCreateFocusSession,
  useCompleteFocusSession,
  useListFocusSessions,
  getListFocusSessionsQueryKey,
  getGetUserStatsQueryKey,
  getGetDashboardOverviewQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  ListTodo,
  Play,
  Square,
  Timer as TimerIcon,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface FocusTask {
  id: number;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  subject?: string | null;
  status?: string;
}

type FocusSound = "none" | "rain" | "library" | "cafe" | "white-noise" | "forest" | "library-after-hours" | "deep-rain-pack";

export default function FocusArena() {
  const queryClient = useQueryClient();
  const [selectedDuration, setSelectedDuration] = useState(25);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [focusTask, setFocusTask] = useState<FocusTask | null>(null);
  const [availableTasks, setAvailableTasks] = useState<FocusTask[]>([]);
  const [focusSubject, setFocusSubject] = useState<string | null>(null);
  const [sound, setSound] = useState<FocusSound>("none");
  const soundContextRef = useRef<AudioContext | null>(null);
  const soundNodesRef = useRef<AudioNode[]>([]);

  const createSession = useCreateFocusSession();
  const completeSession = useCompleteFocusSession();
  const { data: sessions, isLoading } = useListFocusSessions();
  const { data: rewardSettings } = useQuery({
    queryKey: ["rewards"],
    queryFn: async () => {
      const response = await fetch("/api/rewards", { credentials: "include" });
      if (!response.ok) return null;
      return response.json() as Promise<{ owned: string[]; equipped: { focus_sound?: string } }>;
    },
    staleTime: 60_000,
  });

  const timerRef = useRef<number | null>(null);

  // Clean up interval on unmount
  useEffect(() => {
    const storedSubject = window.localStorage.getItem("velocity_focus_subject");
    if (storedSubject) {
      setFocusSubject(storedSubject);
      window.localStorage.removeItem("velocity_focus_subject");
    }
    void fetch("/api/tasks?sortBy=priority", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : []))
      .then((items: FocusTask[]) =>
        setAvailableTasks(items.filter((item) => item.status !== "completed")),
      )
      .catch(() => setAvailableTasks([]));
    const stored = window.localStorage.getItem("velocity_focus_task");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as FocusTask;
        setFocusTask(parsed);
        if (parsed.estimatedMinutes && parsed.estimatedMinutes > 0) {
          setSelectedDuration(
            Math.min(90, Math.max(5, parsed.estimatedMinutes)),
          );
        }
      } catch {
        window.localStorage.removeItem("velocity_focus_task");
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopFocusSound();
    };
  }, []);

  useEffect(() => {
    const equipped = rewardSettings?.equipped.focus_sound;
    if (sound === "none" && (equipped === "library-after-hours" || equipped === "deep-rain-pack")) {
      setSound(equipped);
    }
  }, [rewardSettings?.equipped.focus_sound]);

  const stopFocusSound = () => {
    soundNodesRef.current.forEach((node) => {
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    });
    soundNodesRef.current = [];
    if (soundContextRef.current) void soundContextRef.current.close();
    soundContextRef.current = null;
  };

  const startFocusSound = () => {
    stopFocusSound();
    if (sound === "none") return;
    const AudioCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return;
    const context = new AudioCtor();
    const gain = context.createGain();
    gain.gain.value = sound === "white-noise" ? 0.025 : sound === "deep-rain-pack" ? 0.022 : 0.018;
    gain.connect(context.destination);
    soundContextRef.current = context;
    const buffer = context.createBuffer(
      1,
      context.sampleRate * 2,
      context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1)
      data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type =
      sound === "cafe" || sound === "library" || sound === "library-after-hours" ? "bandpass" : "lowpass";
    filter.frequency.value =
      sound === "forest"
        ? 950
        : sound === "rain" || sound === "deep-rain-pack"
          ? 1800
          : sound === "cafe"
            ? 550
            : 1200;
    source.connect(filter);
    filter.connect(gain);
    source.start();
    soundNodesRef.current = [source, filter, gain];
  };

  const startSession = () => {
    createSession.mutate(
      { data: { durationMinutes: selectedDuration } },
      {
        onSuccess: (session) => {
          setActiveSessionId(session.id);
          setTimeLeft(selectedDuration * 60);
          setIsActive(true);
          startFocusSound();

          timerRef.current = window.setInterval(() => {
            setTimeLeft((prev) => {
              if (prev <= 1) {
                if (timerRef.current) clearInterval(timerRef.current);
                handleComplete(session.id);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        },
      },
    );
  };

  const handleComplete = (id: number) => {
    completeSession.mutate(
      { id },
      {
        onSuccess: async (session) => {
          stopFocusSound();
          setIsActive(false);
          setActiveSessionId(null);
          toast.success(`Focus session complete! +${session.vpAwarded} VP`);
          queryClient.invalidateQueries({
            queryKey: getListFocusSessionsQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetUserStatsQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardOverviewQueryKey(),
          });
          if (focusTask) {
            const taskResponse = await fetch(`/api/tasks/${focusTask.id}`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                actualMinutes:
                  (focusTask.actualMinutes ?? 0) + selectedDuration,
              }),
            });
            if (!taskResponse.ok) {
              toast.warning(
                "Session saved, but task focus minutes could not be updated.",
              );
            }
          }
        },
      },
    );
  };

  const handleAbandon = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsActive(false);
    setActiveSessionId(null);
    setTimeLeft(0);
    stopFocusSound();
    // Ideally we would have an abandon API, but completing it prematurely acts as abandon or we can just drop it if API doesn't support abandon.
    // We will just let it be or mark it if possible. The spec says Complete API, but status can be abandoned.
    // Given the hooks, we only have completeFocusSession. Let's just reset UI.
    toast("Session abandoned", { description: "No VP awarded." });
    queryClient.invalidateQueries({ queryKey: getListFocusSessionsQueryKey() });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const progress = isActive
    ? ((selectedDuration * 60 - timeLeft) / (selectedDuration * 60)) * 100
    : 0;
  const estimatedVp =
    selectedDuration +
    (selectedDuration >= 90 ? 20 : selectedDuration >= 50 ? 10 : 0);
  const selectableTasks = focusSubject
    ? availableTasks.filter((task) => task.subject === focusSubject)
    : availableTasks;

  return (
    <div
      className={`page-stack space-y-8 transition-colors duration-700 ${isActive ? "brightness-90" : ""}`}
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {focusTask ? "Focus Space" : "Focus Arena"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {focusTask
              ? "One task, no competing backlog."
              : "Deep work. Earn VP."}
          </p>
        </div>
        {focusTask && (
          <Button
            variant="outline"
            onClick={() => {
              window.localStorage.removeItem("velocity_focus_task");
              setFocusTask(null);
            }}
          >
            Show all focus
          </Button>
        )}
      </div>

      {focusTask && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-primary/30 bg-primary/10 p-4 shadow-[0_0_28px_hsl(var(--primary)/0.12)]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge
                variant="outline"
                className="mb-2 border-primary/30 text-primary"
              >
                Isolated task
              </Badge>
              <h2 className="text-xl font-bold text-foreground">
                {focusTask.title}
              </h2>
              {focusTask.description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {focusTask.description}
                </p>
              )}
            </div>
            {focusTask.dueDate && (
              <div className="rounded-xl border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                Due {format(parseISO(focusTask.dueDate), "MMM d")}
              </div>
            )}
          </div>
        </motion.div>
      )}

      <div className="grid md:grid-cols-[1fr_300px] gap-8">
        <div className="bg-card border shadow-sm rounded-2xl p-8 flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden">
          {/* Animated Background when active */}
          {isActive && (
            <motion.div
              className="absolute inset-0 bg-primary/5"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
          )}

          <div className="relative z-10 w-64 h-64 flex flex-col items-center justify-center">
            {/* SVG Ring */}
            <svg
              className="absolute inset-0 w-full h-full -rotate-90 transform"
              viewBox="0 0 100 100"
            >
              <circle
                className="text-muted stroke-current"
                strokeWidth="4"
                cx="50"
                cy="50"
                r="48"
                fill="transparent"
              />
              <motion.circle
                className="text-primary stroke-current"
                strokeWidth="4"
                strokeLinecap="round"
                cx="50"
                cy="50"
                r="48"
                fill="transparent"
                initial={{ strokeDasharray: "0 300" }}
                animate={{
                  strokeDasharray: `${(progress / 100) * 301.59} 301.59`,
                }}
                transition={{ duration: 1, ease: "linear" }}
              />
            </svg>

            <div className="text-5xl font-mono font-bold text-foreground">
              {isActive
                ? formatTime(timeLeft)
                : formatTime(selectedDuration * 60)}
            </div>

            {isActive && (
              <div className="mt-2 text-sm text-primary font-medium animate-pulse">
                Focusing...
              </div>
            )}
          </div>

          <div className="mt-12 relative z-10 w-full max-w-sm">
            <AnimatePresence mode="wait">
              {!isActive ? (
                <motion.div
                  key="setup"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <label className="block text-left">
                    <span className="mb-2 flex items-center gap-2 text-xs font-bold text-muted-foreground">
                      <ListTodo className="h-4 w-4" /> Task to work on
                      {focusSubject && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                          {focusSubject}
                        </span>
                      )}
                    </span>
                    <select
                      value={focusTask?.id ?? ""}
                      onChange={(event) => {
                        const next =
                          availableTasks.find(
                            (task) => task.id === Number(event.target.value),
                          ) ?? null;
                        setFocusTask(next);
                        if (next)
                          window.localStorage.setItem(
                            "velocity_focus_task",
                            JSON.stringify(next),
                          );
                        else
                          window.localStorage.removeItem("velocity_focus_task");
                      }}
                      className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
                    >
                      <option value="">General focus session</option>
                      {selectableTasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                          {task.subject ? ` · ${task.subject}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex justify-center gap-3">
                    {[25, 50, 90].map((dur) => (
                      <Button
                        key={dur}
                        variant={
                          selectedDuration === dur ? "default" : "outline"
                        }
                        onClick={() => setSelectedDuration(dur)}
                        className="w-20"
                      >
                        {dur} min
                      </Button>
                    ))}
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs font-bold text-muted-foreground">
                      <span>Focus sound</span>
                      {sound === "none" ? (
                        <VolumeX className="h-3.5 w-3.5" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5 text-primary" />
                      )}
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {([
                          "none",
                          "rain",
                          "library",
                          "cafe",
                          "white-noise",
                          "forest",
                          ...(rewardSettings?.owned.includes("library-after-hours") ? ["library-after-hours" as const] : []),
                          ...(rewardSettings?.owned.includes("deep-rain-pack") ? ["deep-rain-pack" as const] : []),
                        ] as FocusSound[]).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setSound(option)}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${sound === option ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                        >
                          {option === "white-noise"
                            ? "White noise"
                            : option === "library-after-hours"
                              ? "Library after hours"
                              : option === "deep-rain-pack"
                                ? "Deep rain"
                            : option === "none"
                              ? "Off"
                              : option[0].toUpperCase() + option.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button
                    size="lg"
                    className="w-full h-14 text-lg"
                    onClick={startSession}
                    disabled={createSession.isPending}
                  >
                    <Play className="w-5 h-5 mr-2" fill="currentColor" />
                    Start Session
                  </Button>
                  <p className="text-center text-xs font-black text-primary">
                    Estimated reward: +{estimatedVp} VP
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="active"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <Button
                    size="lg"
                    variant="destructive"
                    className="w-full h-14 text-lg"
                    onClick={handleAbandon}
                  >
                    <Square className="w-5 h-5 mr-2" fill="currentColor" />
                    Abandon Session
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {!focusTask && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <TimerIcon className="w-5 h-5 text-muted-foreground" />
              <h2 className="font-semibold text-lg">Recent Sessions</h2>
            </div>

            <div className="space-y-3">
              {isLoading
                ? [1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-xl" />
                  ))
                : sessions?.slice(0, 10).map((session, i) => (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      key={session.id}
                      className="p-4 bg-card border rounded-xl shadow-sm text-sm"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium">
                          {session.durationMinutes} min
                        </span>
                        <Badge
                          variant={
                            session.status === "completed"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {session.status}
                        </Badge>
                      </div>
                      <div className="flex justify-between text-muted-foreground text-xs">
                        <span>
                          {session.createdAt &&
                            format(
                              parseISO(session.createdAt),
                              "MMM d, h:mm a",
                            )}
                        </span>
                        {session.vpAwarded && (
                          <span className="text-primary font-bold">
                            +{session.vpAwarded} VP
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}

              {sessions?.length === 0 && (
                <div className="text-center p-6 text-muted-foreground border border-dashed rounded-xl">
                  No focus sessions yet.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
