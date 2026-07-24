import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  useGetVelocityChart,
  useGetAnalyticsSummary,
  useGetMilestones,
} from "@workspace/api-client-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Trophy,
  Zap,
  Clock,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import WeeklyReview from "@/pages/WeeklyReview";
import { MomentumIcon } from "@/components/MomentumIcon";

export default function Analytics() {
  const [view, setView] = useState<"analytics" | "review">("analytics");
  const [insights, setInsights] = useState<
    Array<{ type: string; text: string; sampleSize: number }>
  >([]);
  const { data: chartData, isLoading: isLoadingChart } = useGetVelocityChart();
  const { data: summary, isLoading: isLoadingSummary } =
    useGetAnalyticsSummary();
  const { data: milestones, isLoading: isLoadingMilestones } =
    useGetMilestones();

  const isLoading = isLoadingChart || isLoadingSummary || isLoadingMilestones;
  useEffect(() => {
    fetch("/api/analytics/insights", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : []))
      .then(setInsights)
      .catch(() => setInsights([]));
  }, []);

  const viewTabs = (
    <div className="inline-flex rounded-xl border bg-muted/35 p-1">
      <button
        onClick={() => setView("analytics")}
        className={`rounded-lg px-4 py-2 text-sm font-bold ${view === "analytics" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
      >
        Analytics
      </button>
      <button
        onClick={() => setView("review")}
        className={`rounded-lg px-4 py-2 text-sm font-bold ${view === "review" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
      >
        Weekly review
      </button>
    </div>
  );

  if (view === "review")
    return (
      <div className="page-stack space-y-5">
        {viewTabs}
        <WeeklyReview />
      </div>
    );

  if (isLoading) {
    return (
      <div className="page-stack space-y-6">
        {viewTabs}
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  if (!summary || !chartData) return null;

  return (
    <div className="page-stack space-y-8">
      {viewTabs}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Analytics
        </h1>
        <p className="text-muted-foreground mt-1">
          Review your performance and momentum.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-orange-500/10 to-rose-500/10 border-orange-500/20 border p-4 rounded-xl shadow-sm flex flex-col justify-center items-center text-center">
          <MomentumIcon className="mb-2 h-8 w-8 text-primary" />
          <div className="text-3xl font-black text-orange-600">
            {summary.streakDays}
          </div>
          <div className="text-xs font-semibold text-orange-600/80 uppercase tracking-wider mt-1">
            Momentum Days
          </div>
        </div>

        <div className="p-4 bg-card rounded-xl border shadow-sm flex flex-col justify-center">
          <div className="text-muted-foreground text-sm font-medium mb-1 flex items-center gap-2">
            <Trophy className="w-4 h-4" /> Total VP
          </div>
          <div className="text-2xl font-bold">{summary.totalVp}</div>
        </div>

        <div className="p-4 bg-card rounded-xl border shadow-sm flex flex-col justify-center">
          <div className="text-muted-foreground text-sm font-medium mb-1 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Avg Daily VP
          </div>
          <div className="text-2xl font-bold">{summary.avgDailyVp}</div>
        </div>

        <div className="p-4 bg-card rounded-xl border shadow-sm flex flex-col justify-center">
          <div className="text-muted-foreground text-sm font-medium mb-1 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Tasks Done
          </div>
          <div className="text-2xl font-bold">{summary.tasksCompleted}</div>
        </div>

        <div className="p-4 bg-card rounded-xl border shadow-sm flex flex-col justify-center">
          <div className="text-muted-foreground text-sm font-medium mb-1 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Focus Min
          </div>
          <div className="text-2xl font-bold">{summary.focusMinutes}</div>
        </div>
      </div>

      <section className="bento-card p-5">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Stored-data insights</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {insights.map((insight) => (
            <div
              key={insight.type}
              className="rounded-xl border bg-muted/25 p-4"
            >
              <p className="text-sm font-semibold leading-relaxed">
                {insight.text}
              </p>
              {insight.sampleSize > 1 && (
                <p className="mt-2 text-[10px] font-bold uppercase text-muted-foreground">
                  Based on {insight.sampleSize} completed tasks
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid md:grid-cols-[1fr_350px] gap-8 items-start">
        <div className="bg-card border rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-6">
            Velocity History (30 Days)
          </h2>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 8, bottom: 18 }}
              >
                <defs>
                  <linearGradient id="colorVp" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickFormatter={(val) => format(parseISO(val), "MMM d")}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                  interval="preserveStartEnd"
                  label={{
                    value: "Date",
                    position: "insideBottom",
                    offset: -14,
                  }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${val}`}
                  width={44}
                  label={{ value: "VP", angle: -90, position: "insideLeft" }}
                />
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderRadius: "8px",
                    border: "1px solid hsl(var(--border))",
                  }}
                  labelFormatter={(val) =>
                    format(parseISO(val as string), "MMMM d, yyyy")
                  }
                />
                <Area
                  type="monotone"
                  dataKey="vp"
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorVp)"
                  activeDot={{
                    r: 6,
                    strokeWidth: 0,
                    fill: "hsl(var(--primary))",
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-lg font-semibold">Milestones</h2>
          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
            {milestones?.map((milestone, i) => (
              <motion.div
                key={milestone.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-secondary text-secondary-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                  <Trophy className="w-4 h-4" />
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border bg-card shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-sm text-foreground">
                      {milestone.title}
                    </h3>
                    <time className="text-[10px] text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded-full">
                      {format(parseISO(milestone.achievedAt), "MMM d, yyyy")}
                    </time>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {milestone.description}
                  </p>
                </div>
              </motion.div>
            ))}

            {(!milestones || milestones.length === 0) && (
              <div className="text-center p-8 text-muted-foreground bg-card border rounded-xl shadow-sm text-sm">
                Complete tasks and earn VP to unlock milestones.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
