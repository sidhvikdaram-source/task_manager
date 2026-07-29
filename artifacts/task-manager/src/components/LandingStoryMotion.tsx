import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
} from "framer-motion";
import {
  ArrowRight,
  Check,
  CircleCheck,
  Clock3,
  GraduationCap,
  Sparkles,
  TimerReset,
  Wind,
} from "lucide-react";

const threeViews = [
  {
    title: "Pick what fits now.",
    description: "Nimbus weighs your available minutes, current energy, priority, and the work implied by each task.",
    proof: "10 min + medium energy",
    accent: "#13c7ea",
  },
  {
    title: "Keep school in one orbit.",
    description: "Canvas sync, subject views, assignments, projects, and focus history stay together without becoming a spreadsheet.",
    proof: "Canvas + subjects + projects",
    accent: "#7c68ef",
    image: "/brand/landing/nimbus-academics.webp",
    imageAlt: "Nimbus Academics organizing Canvas coursework by subject",
  },
  {
    title: "Turn intention into focus.",
    description: "Start a session against a real task, choose a duration and sound, then let the rest of the interface get quiet.",
    proof: "25 min on one real task",
    accent: "#ff7a24",
    image: "/brand/landing/nimbus-focus.webp",
    imageAlt: "Nimbus Focus timer with task, duration, and ambient sound controls",
  },
];

const workflowStages = [
  {
    title: "Choose",
    detail: "Nimbus matches a task to the time and energy you actually have.",
    icon: Sparkles,
  },
  {
    title: "Focus",
    detail: "The chosen task follows you into a quiet, task-linked session.",
    icon: TimerReset,
  },
  {
    title: "Finish",
    detail: "Completion closes the loop and updates progress immediately.",
    icon: CircleCheck,
  },
  {
    title: "Return",
    detail: "Momentum and forecast rewards give tomorrow a reason to feel fresh.",
    icon: Wind,
  },
];

export function LandingThreeViewStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 70%", "end 45%"],
  });
  const storyProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 24,
    mass: 0.45,
  });

  return (
    <section ref={sectionRef} id="product" className="px-5 py-28 sm:px-8 sm:py-40">
      <div className="mx-auto grid max-w-[92rem] gap-16 lg:grid-cols-12 lg:gap-10">
        <div className="self-start lg:sticky lg:top-32 lg:col-span-5 lg:pt-8">
          <h2 className="max-w-xl text-[clamp(3rem,5.5vw,6.5rem)] font-[630] leading-[.89] tracking-[-.065em]">
            <motion.span
              className="block"
              initial={reduceMotion ? false : { opacity: 0, x: -28 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.8 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            >
              One day.
            </motion.span>
            <motion.span
              className="block"
              initial={reduceMotion ? false : { opacity: 0, x: 34 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.8 }}
              transition={{ duration: 0.65, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              Three clear views.
            </motion.span>
          </h2>
          <p className="mt-7 max-w-md text-lg leading-8 text-[#686177]">
            Decide what fits, bring schoolwork into view, and protect enough quiet to finish.
          </p>

          <div className="mt-10 hidden grid-cols-[1.25rem_1fr] gap-4 lg:grid">
            <div className="relative flex justify-center">
              <div className="absolute inset-y-1 w-px bg-[#d5cfeb]" />
              <motion.div
                className="absolute inset-x-0 top-1 mx-auto h-[calc(100%-0.5rem)] w-[3px] origin-top rounded-full bg-[#7c68ef]"
                style={{ scaleY: reduceMotion ? 1 : storyProgress }}
              />
            </div>
            <div className="space-y-7 py-1">
              {["Decide", "Organize", "Focus"].map((label, index) => (
                <motion.div
                  key={label}
                  className="flex items-center gap-3 text-sm font-black text-[#50486a]"
                  initial={reduceMotion ? false : { opacity: 0.32, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: false, amount: 0.8 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                >
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-[#7c68ef] bg-[#f4f1ff]" />
                  {label}
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-12 lg:col-span-7 lg:space-y-16">
          {threeViews.map((story, index) => (
            <motion.article
              key={story.title}
              initial={reduceMotion ? false : { opacity: 0, x: index % 2 === 0 ? 38 : -38, scale: 0.965 }}
              whileInView={{ opacity: 1, x: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.24 }}
              transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
              className="group relative overflow-hidden rounded-[2rem] border border-[#d8d2e9] bg-white shadow-[0_28px_75px_rgba(51,39,100,.1)]"
            >
              <div className="relative p-7 sm:p-9">
                <motion.div
                  className="mb-12 h-1.5 w-16 origin-left rounded-full"
                  style={{ backgroundColor: story.accent }}
                  initial={reduceMotion ? false : { scaleX: 0.25 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true, amount: 0.8 }}
                  transition={{ duration: 0.75, delay: 0.15 }}
                />
                <h3 className="text-3xl font-[620] tracking-[-.045em] sm:text-4xl">{story.title}</h3>
                <p className="mt-3 max-w-xl leading-7 text-[#6c657d]">{story.description}</p>
                <p className="mt-8 text-sm font-black" style={{ color: story.accent }}>{story.proof}</p>
              </div>
              {story.image && (
                <div className="relative mx-3 mb-3 overflow-hidden rounded-[1.4rem] border border-[#d8d2e9] bg-[#080d17] sm:mx-4 sm:mb-4">
                  <motion.img
                    src={story.image}
                    alt={story.imageAlt ?? ""}
                    className="block h-auto w-full"
                    loading="lazy"
                    initial={reduceMotion ? false : { scale: 0.94, opacity: 0.65 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    whileHover={reduceMotion ? undefined : { scale: 1.018 }}
                    viewport={{ once: true, amount: 0.32 }}
                    transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              )}
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function WorkflowPreview({ activeStage }: { activeStage: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative min-h-[29rem] overflow-hidden rounded-[1.75rem] border border-white/12 bg-[#090c13] p-5 text-white sm:p-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeStage}
          className="flex min-h-[25rem] flex-col"
          initial={reduceMotion ? false : { opacity: 0, y: 22, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.985 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {activeStage === 0 && (
            <>
              <div className="flex flex-wrap gap-2 text-xs font-black text-white/70">
                <span className="rounded-xl border border-white/12 px-3 py-2">20 minutes</span>
                <span className="rounded-xl border border-white/12 px-3 py-2">Medium energy</span>
              </div>
              <div className="my-auto">
                <p className="text-sm font-black text-[#8b7cf6]">Recommended now</p>
                <div className="mt-4 flex items-center gap-4 rounded-2xl border border-[#13c7ea]/55 bg-[#101824] p-5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#13c7ea] text-[#071018]">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xl font-black">Review biology notes</p>
                    <p className="mt-1 text-sm text-white/52">Due today, medium priority, fits your time</p>
                  </div>
                  <ArrowRight className="ml-auto h-5 w-5 shrink-0 text-[#13c7ea]" />
                </div>
              </div>
              <p className="text-sm text-white/48">The two-hour practice test stays out of the way.</p>
            </>
          )}

          {activeStage === 1 && (
            <>
              <div className="flex items-center gap-2 text-sm font-black text-white/60">
                <TimerReset className="h-4 w-4 text-[#13c7ea]" />
                Review biology notes
              </div>
              <div className="my-auto grid place-items-center">
                <motion.div
                  className="grid h-52 w-52 place-items-center rounded-full border-[10px] border-[#1d2634] text-5xl font-black tracking-[-.06em]"
                  animate={reduceMotion ? undefined : { scale: [1, 1.025, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  18:42
                </motion.div>
              </div>
              <div className="flex justify-center gap-3 text-xs font-black text-white/55">
                <span className="rounded-xl border border-white/12 px-3 py-2">Rain sound</span>
                <span className="rounded-xl border border-[#13c7ea]/50 px-3 py-2 text-[#13c7ea]">In focus</span>
              </div>
            </>
          )}

          {activeStage === 2 && (
            <div className="my-auto">
              <motion.div
                className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-[#13c7ea] text-[#071018]"
                initial={reduceMotion ? false : { scale: 0.3, rotate: -16 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 20 }}
              >
                <Check className="h-11 w-11 stroke-[3]" />
              </motion.div>
              <h3 className="mt-8 text-center text-4xl font-[620] tracking-[-.05em]">Biology is done.</h3>
              <p className="mt-3 text-center text-white/54">The task clears, the project updates, and today gets lighter.</p>
              <div className="mx-auto mt-7 flex w-fit items-center gap-3 rounded-2xl border border-white/12 px-4 py-3 text-sm font-black">
                <CircleCheck className="h-5 w-5 text-[#13c7ea]" />
                +18 NP earned
              </div>
            </div>
          )}

          {activeStage === 3 && (
            <div className="my-auto">
              <motion.div
                className="mx-auto grid h-24 w-24 place-items-center rounded-[1.75rem] bg-[#7c68ef]"
                animate={reduceMotion ? undefined : { x: [0, 7, -5, 0], rotate: [0, 4, -3, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 1.4 }}
              >
                <Wind className="h-11 w-11" />
              </motion.div>
              <p className="mt-8 text-center text-sm font-black text-[#b9adff]">Wind forecast fulfilled</p>
              <h3 className="mt-2 text-center text-4xl font-[620] tracking-[-.05em]">A tailwind found you.</h3>
              <p className="mt-3 text-center text-white/54">Bonus Breeze Points landed on this completion.</p>
              <p className="mt-7 text-center text-2xl font-black text-[#13c7ea]">+3 BP</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function LandingWorkflowStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeStage, setActiveStage] = useState(0);
  const reduceMotion = useReducedMotion();
  const isInView = useInView(sectionRef, { amount: 0.4 });

  useEffect(() => {
    if (reduceMotion || !isInView) return;
    const interval = window.setInterval(() => {
      setActiveStage((current) => (current + 1) % workflowStages.length);
    }, 3200);
    return () => window.clearInterval(interval);
  }, [activeStage, isInView, reduceMotion]);

  return (
    <section ref={sectionRef} className="bg-[#ded7ff] px-5 py-28 sm:px-8 sm:py-40">
      <div className="mx-auto max-w-[92rem]">
        <h2 className="max-w-5xl text-[clamp(3rem,5.6vw,6.4rem)] font-[630] leading-[.89] tracking-[-.065em]">
          From "what now?" to done.
        </h2>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-[#5f5872]">
          Watch one task move through Nimbus. Every state connects to the next, so progress feels visible instead of abstract.
        </p>

        <div className="mt-16 grid gap-5 lg:grid-cols-12">
          <div className="grid gap-2 lg:col-span-5">
            {workflowStages.map((stage, index) => {
              const Icon = stage.icon;
              const active = activeStage === index;
              return (
                <button
                  key={stage.title}
                  type="button"
                  onClick={() => setActiveStage(index)}
                  aria-pressed={active}
                  className={`group grid min-h-28 grid-cols-[3rem_1fr] items-center gap-4 rounded-[1.5rem] border p-4 text-left transition-[background-color,border-color,transform] duration-300 active:scale-[0.99] sm:p-5 ${
                    active
                      ? "border-[#171522] bg-[#171522] text-white"
                      : "border-[#c8bee9] bg-white/48 text-[#171522] hover:border-[#8b7cf6] hover:bg-white/78"
                  }`}
                >
                  <span className={`grid h-12 w-12 place-items-center rounded-2xl ${active ? "bg-[#13c7ea] text-[#071018]" : "bg-white text-[#7c68ef]"}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-xl font-black">{stage.title}</span>
                    <span className={`mt-1 block text-sm leading-5 ${active ? "text-white/58" : "text-[#6c657d]"}`}>{stage.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <motion.div
            className="lg:col-span-7"
            initial={reduceMotion ? false : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            aria-live="polite"
          >
            <WorkflowPreview activeStage={activeStage} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
