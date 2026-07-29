import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  Brain,
  Check,
  GraduationCap,
  Lock,
  Mail,
  Sparkles,
  Target,
  TimerReset,
  User,
  Wind,
} from "lucide-react";
import { NimbusMascot } from "@/components/NimbusMascot";

gsap.registerPlugin(ScrollTrigger);

type AuthMode = "login" | "register";

type ProductStory = {
  title: string;
  description: string;
  accent: string;
  proof: string;
  image?: string;
  imageAlt?: string;
};

const productStories: ProductStory[] = [
  {
    title: "Pick what fits now.",
    description: "Tell Nimbus how much time and energy you have. Recommend next weighs both against priority and the work implied by each task.",
    accent: "#13c7ea",
    proof: "10 min + medium energy",
  },
  {
    title: "Keep school in one orbit.",
    description: "Canvas sync, subject views, assignments, projects, and focus history live together without turning your planner into a spreadsheet.",
    accent: "#7c68ef",
    proof: "Canvas + subjects + projects",
    image: "/brand/landing/nimbus-academics.webp",
    imageAlt: "Nimbus Academics organizing Canvas coursework by subject",
  },
  {
    title: "Turn intention into focus.",
    description: "Start a session against a real task, choose a duration and sound, then let the rest of the interface get quiet.",
    accent: "#ff7a24",
    proof: "25 min on one real task",
    image: "/brand/landing/nimbus-focus.webp",
    imageAlt: "Nimbus Focus timer with task, duration, and ambient sound controls",
  },
];

const featureGroups = [
  {
    title: "Plan",
    items: ["Natural-language quick capture", "Energy + time recommendations", "My Day views", "Priority and effort scoring", "Daily habits"],
  },
  {
    title: "School",
    items: ["Canvas calendar sync", "Subject workspaces", "Assessments and assignments", "Project rubrics", "School focus history"],
  },
  {
    title: "Focus",
    items: ["Task-linked focus timer", "25, 50, and 90 minute sessions", "Ambient focus sounds", "Recent session history", "Focus insights"],
  },
  {
    title: "Organize",
    items: ["Month, week, day, and agenda", "Calendar filters", "Project milestones", "Related task progress", "Weekly reviews"],
  },
  {
    title: "Understand",
    items: ["Nimbo planning assistant", "Preview-before-apply actions", "Energy patterns", "Completion analytics", "Momentum history"],
  },
  {
    title: "Stay motivated",
    items: ["Momentum without streak guilt", "Nimbus Points and tiers", "Daily weather forecasts", "Forecast rerolls and early peeks", "Reward chests"],
  },
];

const accordionFeatures = [
  { title: "Choose", detail: "A next task matched to your energy and available minutes.", color: "#13c7ea" },
  { title: "Learn", detail: "Canvas work sorted into subjects instead of one endless feed.", color: "#8b7cf6" },
  { title: "Focus", detail: "A calm timer tied to the work you chose.", color: "#ff7a24" },
  { title: "Return", detail: "A new mascot forecast changes how progress pays out each day.", color: "#72d6c5" },
];

export function LandingPage() {
  const { login, loginWithPassword, registerWithPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>("register");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const authRef = useRef<HTMLElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const heroPointerX = useMotionValue(0);
  const heroPointerY = useMotionValue(0);
  const heroRotateX = useSpring(useTransform(heroPointerY, [-0.5, 0.5], [2.6, -2.6]), { stiffness: 110, damping: 22 });
  const heroRotateY = useSpring(useTransform(heroPointerX, [-0.5, 0.5], [-3.4, 3.4]), { stiffness: 110, damping: 22 });
  const isEmbedded = window.self !== window.top;
  const appUrl = window.location.origin + (import.meta.env.BASE_URL ?? "/");

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("authError") !== "google_unavailable") return;
    setMode("login");
    setAuthError("Google sign-in is temporarily unavailable. You can still sign in with email and password.");
    url.searchParams.delete("authError");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useGSAP(() => {
    if (reduceMotion) return;
    gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((element) => {
      gsap.from(element, {
        opacity: 0,
        y: 36,
        duration: 0.85,
        ease: "power3.out",
        scrollTrigger: { trigger: element, start: "top 84%", once: true },
      });
    });
  }, { scope: pageRef, dependencies: [reduceMotion] });

  function trackHeroPointer(event: React.PointerEvent<HTMLElement>) {
    if (reduceMotion) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    heroPointerX.set((event.clientX - bounds.left) / bounds.width - 0.5);
    heroPointerY.set((event.clientY - bounds.top) / bounds.height - 0.5);
  }

  function resetHeroPointer() {
    heroPointerX.set(0);
    heroPointerY.set(0);
  }

  const submitLabel = useMemo(
    () => isSubmitting ? "Working..." : mode === "register" ? "Create my account" : "Log in to Nimbus",
    [isSubmitting, mode],
  );

  function moveToAuth(nextMode: AuthMode) {
    setMode(nextMode);
    setAuthError("");
    window.requestAnimationFrame(() => authRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" }));
  }

  async function offerCredentialSave() {
    type PasswordCredentialConstructor = new (data: { id: string; password: string; name?: string }) => Credential;
    const PasswordCredentialApi = (window as typeof window & { PasswordCredential?: PasswordCredentialConstructor }).PasswordCredential;
    if (!PasswordCredentialApi || !navigator.credentials?.store) return;
    try {
      await navigator.credentials.store(new PasswordCredentialApi({ id: email, password, name: firstName || email }));
    } catch {
      // Password managers can decline without affecting a successful sign-in.
    }
  }

  async function submitLocalAuth(event: React.FormEvent) {
    event.preventDefault();
    setAuthError("");
    setIsSubmitting(true);
    try {
      if (mode === "register") await registerWithPassword(email, password, firstName);
      else await loginWithPassword(email, password);
      await offerCredentialSave();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main ref={pageRef} className="nimbus-marketing w-full max-w-full overflow-x-hidden bg-[#f4f1ff] text-[#171522] selection:bg-[#8b7cf6]/25">
      <nav className="fixed inset-x-0 top-0 z-50 px-3 py-3 sm:px-5 sm:py-4">
        <div className="mx-auto flex max-w-[92rem] items-center justify-between rounded-[1.35rem] border border-white/70 bg-white/88 px-2.5 py-2 shadow-[0_12px_42px_rgba(54,42,110,.11)] backdrop-blur-xl sm:px-3">
          <a href="#top" className="flex items-center gap-2.5 px-1" aria-label="Nimbus home">
            <NimbusMascot variant="mark" className="h-10 w-12 sm:h-11 sm:w-14" />
            <span className="nimbus-wordmark text-lg text-[#211d36] sm:text-xl">nimbus</span>
          </a>
          <div className="hidden items-center gap-1 lg:flex">
            <a href="#product" className="rounded-xl px-4 py-2 text-sm font-bold text-[#6a647c] hover:bg-[#f0edfb] hover:text-[#211d36]">Product</a>
            <a href="#different" className="rounded-xl px-4 py-2 text-sm font-bold text-[#6a647c] hover:bg-[#f0edfb] hover:text-[#211d36]">Why Nimbus</a>
            <a href="#features" className="rounded-xl px-4 py-2 text-sm font-bold text-[#6a647c] hover:bg-[#f0edfb] hover:text-[#211d36]">Features</a>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => moveToAuth("login")} className="rounded-xl px-3 py-2 text-xs font-black text-[#211d36] hover:bg-[#eeeaff] sm:text-sm">Log in</button>
            <button type="button" onClick={() => moveToAuth("register")} className="rounded-xl bg-[#171522] px-3.5 py-2 text-xs font-black text-white transition-transform hover:-translate-y-0.5 sm:px-4 sm:text-sm">Register</button>
          </div>
        </div>
      </nav>

      <section id="top" className="relative px-3 pb-24 pt-24 sm:px-5 sm:pt-28">
        <div className="absolute left-[7%] top-44 h-72 w-72 rounded-full bg-[#a998ff]/22 blur-[100px]" />
        <div className="absolute right-[5%] top-72 h-80 w-80 rounded-full bg-[#67d5c5]/15 blur-[110px]" />
        <div className="relative mx-auto max-w-[92rem] pt-10 text-center sm:pt-12">
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-6xl">
            <h1 className="text-[clamp(3.7rem,8.3vw,9rem)] font-[640] leading-[.84] tracking-[-.075em]">
              Do the task that<br />fits the moment.
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-base leading-7 text-[#686177] sm:text-xl sm:leading-8">
              Nimbus turns your time, energy, priorities, and schoolwork into one clear next move, then helps you stay with it.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button type="button" onClick={() => moveToAuth("register")} className="group inline-flex h-13 items-center justify-center gap-3 rounded-2xl bg-[#7c68ef] px-7 text-sm font-black text-white shadow-[0_18px_45px_rgba(124,104,239,.28)] transition-transform hover:-translate-y-1">
                Build my first clear day <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <a href="#product" className="inline-flex h-13 items-center justify-center rounded-2xl border border-[#d5cfeb] bg-white/65 px-7 text-sm font-black text-[#211d36] hover:bg-white">See Nimbus in action</a>
            </div>
          </motion.div>

          <motion.div className="pointer-events-none absolute -right-1 top-20 hidden w-40 sm:block lg:right-[5%] lg:w-52" initial={reduceMotion ? false : { x: 50, rotate: 7, opacity: 0 }} animate={{ x: 0, rotate: 0, opacity: 1 }} transition={{ delay: 0.3, duration: 0.9 }}>
            <NimbusMascot state="momentum" className="w-full drop-shadow-[0_24px_40px_rgba(77,59,160,.18)]" />
          </motion.div>

          <motion.div
            data-product-shot
            className="relative mx-auto mt-12 max-w-[82rem] overflow-hidden rounded-[1.5rem] border border-white/80 bg-white shadow-[0_42px_100px_rgba(35,26,73,.24)] sm:mt-14 sm:rounded-[2rem]"
            initial={reduceMotion ? false : { opacity: 0, y: 45 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.9 }}
            onPointerMove={trackHeroPointer}
            onPointerLeave={resetHeroPointer}
            style={{ rotateX: reduceMotion ? 0 : heroRotateX, rotateY: reduceMotion ? 0 : heroRotateY, transformPerspective: 1400 }}
          >
            <img src="/brand/landing/nimbus-clear-day.webp" alt="Nimbus choosing a realistic next task using available time and energy" className="block h-auto w-full" fetchPriority="high" />
          </motion.div>
        </div>
      </section>

      <div className="overflow-hidden border-y border-[#ddd7f1] bg-white py-5">
        <motion.div className="flex w-max items-center gap-10 whitespace-nowrap text-lg font-[620] tracking-[-.025em] text-[#3c3650]" animate={reduceMotion ? undefined : { x: ["0%", "-50%"] }} transition={{ duration: 24, ease: "linear", repeat: Infinity }}>
          {[0, 1].map((copy) => (
            <div key={copy} className="flex items-center gap-10">
              {["Choose by energy", "Sync Canvas", "Focus on one thing", "Build real momentum", "Ask Nimbo", "Finish long projects"].map((item) => (
                <span key={item} className="flex items-center gap-10">{item}<Sparkles className="h-4 w-4 text-[#8b7cf6]" /></span>
              ))}
            </div>
          ))}
        </motion.div>
      </div>

      <section id="product" className="px-5 py-28 sm:px-8 sm:py-40">
        <div className="mx-auto grid max-w-[92rem] gap-16 lg:grid-cols-12 lg:gap-10">
          <div data-reveal className="self-start lg:col-span-5 lg:pt-8">
            <h2 className="max-w-xl text-[clamp(3rem,5.5vw,6.5rem)] font-[630] leading-[.89] tracking-[-.065em]">One day.<br />Three clear views.</h2>
            <p className="mt-7 max-w-md text-lg leading-8 text-[#686177]">Decide what fits, bring schoolwork into view, and protect enough quiet to finish.</p>
            <div className="mt-9 flex items-center gap-3 text-sm font-black text-[#50486a]"><Wind className="h-5 w-5 text-[#7c68ef]" />Three parts of the same focused day</div>
          </div>
          <div className="space-y-12 lg:col-span-7 lg:space-y-16">
            {productStories.map((story) => (
              <motion.article
                key={story.title}
                data-reveal
                whileHover={reduceMotion ? undefined : { x: 8 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="group relative overflow-hidden rounded-[2rem] border border-[#d8d2e9] bg-white shadow-[0_28px_75px_rgba(51,39,100,.1)]"
              >
                <motion.div className="absolute -right-14 -top-14 h-40 w-40 rounded-full opacity-15 blur-3xl" style={{ backgroundColor: story.accent }} animate={reduceMotion ? undefined : { scale: [1, 1.2, 1], x: [0, -8, 0] }} transition={{ duration: 4.5, repeat: Infinity }} />
                <div className="relative p-7 sm:p-9">
                  <div className="mb-12 h-1.5 w-16 rounded-full transition-[width] duration-500 group-hover:w-28" style={{ backgroundColor: story.accent }} />
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
                      whileHover={reduceMotion ? undefined : { scale: 1.018 }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                )}
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section id="different" className="bg-[#171522] px-5 py-28 text-white sm:px-8 sm:py-40">
        <div className="mx-auto max-w-[92rem]">
          <h2 className="max-w-6xl text-[clamp(3rem,6vw,7rem)] font-[630] leading-[.88] tracking-[-.068em]">
            A planner that notices<br className="hidden sm:block" /> what today feels like.
          </h2>
          <div className="mt-20 grid grid-cols-12 gap-0 overflow-hidden rounded-[2rem] border border-white/12">
            <article className="col-span-12 min-h-[32rem] bg-[#242032] p-7 sm:p-10 lg:col-span-7">
              <div className="flex h-full flex-col">
                <Brain className="h-7 w-7 text-[#9c8cff]" />
                <h3 className="mt-8 max-w-xl text-4xl font-[620] leading-[.95] tracking-[-.05em] sm:text-6xl">Recommendations that respect reality.</h3>
                <p className="mt-5 max-w-xl text-lg leading-8 text-white/58">Ten free minutes should not produce a two-hour deep-work task. Nimbus estimates from the task name, effort, priority, time, and your current energy.</p>
                <div className="mt-auto grid gap-3 rounded-2xl border border-white/10 bg-[#090c13] p-5">
                  <div className="flex flex-wrap gap-2 text-xs font-black"><span className="rounded-xl bg-white/8 px-3 py-2">10 min</span><span className="rounded-xl bg-white/8 px-3 py-2">Medium energy</span></div>
                  <motion.div className="rounded-xl bg-[#13c7ea] p-4 text-[#071018]" animate={reduceMotion ? undefined : { y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
                    <p className="text-xs font-black uppercase tracking-[.12em]">Recommended now</p><p className="mt-1 text-lg font-black">Play ping pong</p><p className="mt-1 text-xs opacity-70">Fits your time. Same priority. Lower effort.</p>
                  </motion.div>
                </div>
              </div>
            </article>
            <article className="col-span-12 min-h-[32rem] bg-[#7462df] p-7 sm:p-10 lg:col-span-5">
              <div className="flex h-full flex-col">
                <GraduationCap className="h-7 w-7" />
                <h3 className="mt-8 text-4xl font-[620] leading-[.95] tracking-[-.05em] sm:text-5xl">Built for school, not adapted to it.</h3>
                <p className="mt-5 leading-7 text-white/72">Canvas, subjects, rubrics, assessments, and study focus belong in the same system as everything else.</p>
                <div className="mt-auto grid grid-cols-2 gap-3 pt-10 text-sm font-black"><span className="rounded-2xl bg-white/12 p-4">Math work</span><span className="rounded-2xl bg-white/12 p-4">Canvas sync</span><span className="rounded-2xl bg-white/12 p-4">Rubrics</span><span className="rounded-2xl bg-white/12 p-4">Focus history</span></div>
              </div>
            </article>
            <article className="col-span-12 min-h-[25rem] bg-[#f5f1ff] p-7 text-[#171522] sm:p-10 lg:col-span-5">
              <NimbusMascot state="assistant" className="w-44" />
              <h3 className="mt-8 text-4xl font-[620] leading-[.95] tracking-[-.05em] sm:text-5xl">Nimbo helps without taking over.</h3>
              <p className="mt-5 leading-7 text-[#6b647c]">Plan, break down, and clarify work with an assistant that previews meaningful changes before applying them.</p>
            </article>
            <article className="col-span-12 min-h-[25rem] bg-[#ff7a24] p-7 text-[#171522] sm:p-10 lg:col-span-7">
              <div className="flex h-full flex-col justify-between">
                <div>
                  <TimerReset className="h-7 w-7" />
                  <h3 className="mt-8 max-w-2xl text-4xl font-[620] leading-[.95] tracking-[-.05em] sm:text-5xl">Momentum, without punishment.</h3>
                  <p className="mt-5 max-w-xl leading-7 text-[#4d2916]">Nimbus rewards returning and making progress. A missed day is context, not a reason to erase everything you built.</p>
                </div>
                <div className="mt-10 flex items-center gap-3 rounded-2xl bg-[#171522] p-4 text-white"><Wind className="h-5 w-5 text-[#b9adff]" /><span className="font-black">8 Momentum days · Tier 12 · 64/100 NP</span></div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="px-5 py-28 sm:px-8 sm:py-44">
        <div className="mx-auto max-w-[92rem]">
          <div className="mx-auto max-w-5xl text-center">
            <h2 className="text-[clamp(3rem,6vw,7rem)] font-[630] leading-[.88] tracking-[-.068em]">Every day has weather.</h2>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-[#686177]">Once Nimbus knows you understand the basics, Nimbo delivers a daily forecast in your Profile. Each forecast changes how progress can pay out.</p>
          </div>
          <div data-reveal className="mt-20 grid grid-flow-dense gap-5 lg:grid-cols-12">
            <article className="overflow-hidden rounded-[2rem] border border-[#d9d3ea] bg-white shadow-[0_35px_90px_rgba(42,32,86,.13)] lg:col-span-7">
              <img src="/brand/landing/nimbus-storm-reward.webp" alt="Nimbus confirming a storm forecast reward after a charged task is completed" loading="lazy" decoding="async" className="h-full min-h-[28rem] w-full object-cover" />
            </article>
            <article className="relative overflow-hidden rounded-[2rem] bg-[#201b31] p-7 text-white lg:col-span-5 sm:p-10">
              <motion.div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-[#8b7cf6]/30 blur-3xl" animate={reduceMotion ? undefined : { scale: [1, 1.25, 1], opacity: [.2, .42, .2] }} transition={{ duration: 3.2, repeat: Infinity }} />
              <div className="relative flex h-full flex-col">
                <Wind className="h-8 w-8 text-[#9c8cff]" />
                <h3 className="mt-7 text-4xl font-[620] leading-[.92] tracking-[-.055em] sm:text-5xl">Forecasts that reward momentum</h3>
                <p className="mt-5 leading-7 text-white/60">Sunny multiplies NP. Stormy highlights one doable bonus. Fog hides the result. Wind scatters BP. A rare rainbow unlocks something free.</p>
                <div className="mt-auto pt-12"><NimbusMascot state="stormy" className="w-36" /></div>
              </div>
            </article>
            <article className="rounded-[2rem] border border-[#d9d3ea] bg-white p-7 lg:col-span-12 sm:p-10">
              <div className="flex flex-col justify-between gap-10 sm:flex-row sm:items-end"><div><Target className="h-8 w-8 text-[#ff7a24]" /><h3 className="mt-7 max-w-2xl text-4xl font-[620] leading-[.92] tracking-[-.055em] sm:text-5xl">Spend BP on agency, not only decoration.</h3></div><p className="max-w-sm leading-7 text-[#686177]">Reroll today, peek at tomorrow, or add a temporary NP Tailwind. Cosmetics still matter, but weather tools let you steer the system.</p></div>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-[#ded7ff] px-5 py-28 sm:px-8 sm:py-40">
        <div className="mx-auto max-w-[92rem]">
          <h2 className="max-w-5xl text-[clamp(3rem,5.6vw,6.4rem)] font-[630] leading-[.89] tracking-[-.065em]">From "what now?" to done.</h2>
          <div className="mt-16 flex min-h-[34rem] flex-col gap-2 lg:flex-row">
            {accordionFeatures.map((feature) => (
              <motion.article key={feature.title} className="group relative min-h-72 flex-1 overflow-hidden rounded-[1.5rem] bg-[#171522] text-white lg:min-w-24" whileHover={reduceMotion ? undefined : { flexGrow: 3 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                <motion.div className="absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-30 blur-3xl" style={{ backgroundColor: feature.color }} animate={reduceMotion ? undefined : { x: [0, -20, 0], y: [0, 18, 0], scale: [1, 1.18, 1] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} />
                <div className="absolute inset-x-0 bottom-0 p-7">
                  <div className="mb-5 h-1 w-10 rounded-full" style={{ backgroundColor: feature.color }} />
                  <h3 className="text-4xl font-[620] tracking-[-.05em]">{feature.title}</h3>
                  <p className="mt-3 max-w-md text-sm leading-6 text-white/68 opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">{feature.detail}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="bg-white px-5 py-28 sm:px-8 sm:py-40">
        <div className="mx-auto max-w-[92rem]">
          <div className="grid gap-8 lg:grid-cols-12">
            <h2 className="text-[clamp(3rem,5vw,6rem)] font-[630] leading-[.9] tracking-[-.065em] lg:col-span-7">Everything you need.<br />Nothing pretending to be productive.</h2>
            <p className="max-w-md self-end text-lg leading-8 text-[#686177] lg:col-span-5">One connected toolkit for deciding, doing, learning, and staying motivated.</p>
          </div>
          <div className="mt-20 grid border-l border-t border-[#ddd7e9] sm:grid-cols-2 lg:grid-cols-3">
            {featureGroups.map((group) => (
              <article key={group.title} className="border-b border-r border-[#ddd7e9] p-7 sm:p-9">
                <h3 className="text-2xl font-[620] tracking-[-.035em]">{group.title}</h3>
                <ul className="mt-7 space-y-3">
                  {group.items.map((item) => <li key={item} className="flex gap-3 text-sm text-[#655f77]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#7c68ef]" />{item}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section ref={authRef} className="bg-[#171522] px-5 py-24 text-white sm:px-8 sm:py-36">
        <div className="mx-auto grid max-w-[82rem] overflow-hidden rounded-[2rem] bg-[#f4f1ff] text-[#171522] shadow-[0_35px_100px_rgba(0,0,0,.22)] lg:grid-cols-[1.08fr_.92fr]">
          <div className="relative overflow-hidden p-8 sm:p-12 lg:p-16">
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#a998ff]/32 blur-3xl" />
            <h2 className="relative max-w-3xl text-[clamp(3rem,5vw,5.5rem)] font-[630] leading-[.9] tracking-[-.065em]">Make room for the work that matters.</h2>
            <p className="relative mt-6 max-w-xl text-lg leading-8 text-[#655f77]">Create your Nimbus workspace, tell it what today feels like, and get a next step that fits.</p>
            <NimbusMascot state="assistant" className="relative mt-10 w-full max-w-md" />
          </div>
          <div className="bg-white p-6 sm:p-10 lg:p-14">
            {isEmbedded ? (
              <div className="flex h-full min-h-96 flex-col items-start justify-center">
                <h3 className="text-3xl font-[620]">Open Nimbus securely</h3>
                <p className="mt-3 text-sm leading-6 text-[#655f77]">Authentication opens in the full browser, then this view updates automatically.</p>
                <button type="button" onClick={() => window.open(appUrl, "_blank", "noopener,noreferrer")} className="mt-7 rounded-2xl bg-[#7c68ef] px-5 py-3 text-sm font-black text-white">Open Nimbus</button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#f1eff8] p-1">
                  <button type="button" onClick={() => { setMode("login"); setAuthError(""); }} className={`rounded-xl px-3 py-2.5 text-sm font-black ${mode === "login" ? "bg-[#171522] text-white" : "text-[#655f77]"}`}>Log in</button>
                  <button type="button" onClick={() => { setMode("register"); setAuthError(""); }} className={`rounded-xl px-3 py-2.5 text-sm font-black ${mode === "register" ? "bg-[#7c68ef] text-white" : "text-[#655f77]"}`}>Register</button>
                </div>
                <form onSubmit={submitLocalAuth} autoComplete="on" className="mt-7 space-y-3">
                  <AnimatePresence initial={false}>
                    {mode === "register" && (
                      <motion.label initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 overflow-hidden rounded-2xl border border-[#ddd9e9] px-4 py-3">
                        <User className="h-4 w-4 text-[#817a91]" />
                        <input name="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="First name" autoComplete="given-name" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9b95aa]" />
                      </motion.label>
                    )}
                  </AnimatePresence>
                  <label className="flex items-center gap-3 rounded-2xl border border-[#ddd9e9] px-4 py-3 focus-within:border-[#8b7cf6]">
                    <Mail className="h-4 w-4 text-[#817a91]" />
                    <input name="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} required className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9b95aa]" />
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-[#ddd9e9] px-4 py-3 focus-within:border-[#8b7cf6]">
                    <Lock className="h-4 w-4 text-[#817a91]" />
                    <input name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "register" ? "Password (6+ characters)" : "Password"} autoComplete={mode === "login" ? "current-password" : "new-password"} required className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9b95aa]" />
                  </label>
                  {authError && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{authError}</p>}
                  <button type="submit" disabled={isSubmitting} className="group flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#7c68ef] text-sm font-black text-white shadow-[0_15px_35px_rgba(124,104,239,.22)] transition-transform hover:-translate-y-0.5 disabled:opacity-60">
                    {submitLabel}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </button>
                </form>
                <div className="my-5 flex items-center gap-3"><div className="h-px flex-1 bg-[#e5e1ec]" /><span className="text-xs font-bold text-[#9a94a6]">or</span><div className="h-px flex-1 bg-[#e5e1ec]" /></div>
                <button type="button" onClick={login} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#d8d3e5] text-sm font-black text-[#211d36] transition-colors hover:bg-[#f5f2ff]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#171522] text-[10px] text-white">G</span>Continue with Google
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-[#ddd7f1] bg-[#171522] px-5 py-8 text-white sm:px-8">
        <div className="mx-auto flex max-w-[92rem] flex-col gap-4 text-sm text-white/52 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><NimbusMascot variant="mark" animated={false} interactive={false} className="h-9 w-11" /><span className="nimbus-wordmark text-lg text-white">nimbus</span></div>
          <p>Plan what fits. Finish what matters.</p>
        </div>
      </footer>
    </main>
  );
}
