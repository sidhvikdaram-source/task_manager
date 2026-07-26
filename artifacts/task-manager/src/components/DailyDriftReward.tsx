import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Wind } from "lucide-react";
import { NimbusMascot } from "@/components/NimbusMascot";

type DailyDriftResponse = {
  awarded: boolean;
  amount: number;
  rewardName: string | null;
  rewardDate: string;
  balance: number;
};

let dailyDriftClaim: Promise<DailyDriftResponse | null> | null = null;

function claimDailyDrift() {
  if (!dailyDriftClaim) {
    dailyDriftClaim = fetch("/api/rewards/daily-drift", {
      method: "POST",
      credentials: "include",
    })
      .then(async (response) => response.ok ? await response.json() as DailyDriftResponse : null)
      .finally(() => {
        dailyDriftClaim = null;
      });
  }
  return dailyDriftClaim;
}

export function DailyDriftReward() {
  const [reward, setReward] = useState<DailyDriftResponse | null>(null);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let active = true;
    async function claim() {
      try {
        const result = await claimDailyDrift();
        if (!active || !result?.awarded) return;
        setReward(result);
        setOpen(true);
        void queryClient.invalidateQueries({ queryKey: ["rewards"] });
      } catch (error) {
        console.warn("Daily Drift could not be claimed", error);
      }
    }
    void claim();
    return () => {
      active = false;
    };
  }, [queryClient]);

  return (
    <AnimatePresence>
      {open && reward ? (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#08070e]/72 p-4 backdrop-blur-md"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="daily-drift-title"
        >
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 34, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/12 bg-[#201b31] p-7 text-white shadow-[0_36px_110px_rgba(0,0,0,.48)] sm:p-10"
          >
            <motion.div
              aria-hidden="true"
              className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#7c68ef]/45 blur-3xl"
              animate={reduceMotion ? undefined : { x: [0, -25, 0], y: [0, 20, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative grid items-center gap-5 sm:grid-cols-[1fr_10rem]">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-[#b9adff]"><Wind className="h-4 w-4" />Daily Drift</div>
                <h2 id="daily-drift-title" className="mt-5 text-4xl font-black leading-[.95] tracking-[-.045em]">A little tailwind for coming back.</h2>
                <p className="mt-4 text-sm leading-6 text-white/60">{reward.rewardName} landed in your regular balance.</p>
              </div>
              <NimbusMascot state="momentum" className="mx-auto w-40" />
            </div>
            <div className="relative mt-7 flex items-center justify-between rounded-2xl bg-[#7765e3] p-5">
              <div><p className="text-xs font-bold text-white/65">Breeze Points</p><p className="mt-1 text-4xl font-black">+{reward.amount} BP</p></div>
              <button type="button" onClick={() => setOpen(false)} className="group inline-flex h-12 items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-[#211d36] transition-transform hover:-translate-y-0.5">
                Carry it into today <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
