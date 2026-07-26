import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  Brain,
  CalendarDays,
  Check,
  Clock3,
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

const productStories = [
  {
    number: "01",
    title: "Pick what fits now.",
    description: "Tell Nimbus how much time and energy you have. Recommend next weighs both against priority and the work implied by each task.",
    image: "/brand/product/my-day.png",
    alt: "Nimbus My Day showing time, energy, and Recommend next controls",
    accent: "#13c7ea",
  },
  {
    number: "02",
    title: "Keep school in one orbit.",
    description: "Canvas sync, subject views, assignments, projects, and focus history live together—without turning your planner into a spreadsheet.",
    image: "/brand/product/academics.png",
    alt: "Nimbus Academics workspace organized by school subject",
    accent: "#7c68ef",
  },
  {
    number: "03",
    title: "Turn intention into focus.",
    description: "Start a session against a real task, choose a duration and sound, then let the rest of the interface get quiet.",
    image: "/brand/product/focus.png",
    alt: "Nimbus Focus timer with task selection and session lengths",
    accent: "#ff7a24",
  },
  {
    number: "04",
    title: "See time before it disappears.",
    description: "Month, week, day, and agenda views combine tasks with school events. Sync deliberately, filter quickly, and restore changes safely.",
    image: "/brand/product/calendar.png",
    alt: "Nimbus Calendar month view and selected day panel",
    accent: "#37b89f",
  },
  {
    number: "05",
    title: "Finish the long work.",
    description: "Projects connect milestones, rubrics, due dates, and related tasks so a big assignment becomes a sequence you can actually complete.",
    image: "/brand/product/projects.png",
    alt: "Nimbus Projects workspace with progress and related tasks",
    accent: "#2f6df6",
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
    items: ["Momentum without streak guilt", "Nimbus Points and tiers", "Breeze Points shop", "Reward chests", "Daily Drift return rewards"],
  },
];

const accordionFeatures = [
  { title: "Choose", detail: "A next task matched to your energy and available minutes.", image: "/brand/product/my-day.png", position: "50% 35%" },
  { title: "Learn", detail: "Canvas work sorted into subjects instead of one endless feed.", image: "/brand/product/academics.png", position: "50% 48%" },
  { title: "Focus", detail: "A calm timer tied to the work you chose.", image: "/brand/product/focus.png", position: "50% 40%" },
  { title: "Finish", detail: "Projects and deadlines that stay visible all the way through.", image: "/brand/product/projects.png", position: "50% 42%" },
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
    const media = gsap.matchMedia();
    media.add("(min-width: 1024px)", () => {
      ScrollTrigger.create({
        trigger: "[data-story]",
        start: "top 10%",
        end: "bottom bottom",
        pin: "[data-story-copy]",
        pinSpacing: false,
      });
    });
    gsap.utils.toArray<HTMLElement>("[data-product-shot]").forEach((shot) => {
      gsap.fromTo(shot, { scale: 0.91, opacity: 0.35, y: 70 }, {
        scale: 1,
        opacity: 1,
        y: 0,
        ease: "none",
        scrollTrigger: { trigger: shot, start: "top 92%", end: "top 36%", scrub: 0.7 },
      });
    });
    gsap.utils.toArray<HTMLElement>("[data-stack-card]").forEach((card, index) => {
      gsap.to(card, {
        scale: 1 - index * 0.018,
        y: index * 11,
        ease: "none",
        scrollTrigger: { trigger: card, start: "top 18%", end: "bottom 18%", scrub: true },
      });
    });
    return () => media.revert();
  }, { scope: pageRef, dependencies: [reduceMotion] });

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
        <div className="relative mx-auto max-w-[92rem] pt-12 text-center sm:pt-20">
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-6xl">
            <h1 className="text-[clamp(3.7rem,8.3vw,9rem)] font-[640] leading-[.84] tracking-[-.075em]">
              Do the task that<br />fits the moment.
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-base leading-7 text-[#686177] sm:text-xl sm:leading-8">
              Nimbus turns your time, energy, priorities, and schoolwork into one clear next move—then helps you stay with it.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button type="button" onClick={() => moveToAuth("register")} className="group inline-flex h-13 items-center justify-center gap-3 rounded-2xl bg-[#7c68ef] px-7 text-sm font-black text-white shadow-[0_18px_45px_rgba(124,104,239,.28)] transition-transform hover:-translate-y-1">
                Start for free <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <a href="#product" className="inline-flex h-13 items-center justify-center rounded-2xl border border-[#d5cfeb] bg-white/65 px-7 text-sm font-black text-[#211d36] hover:bg-white">See Nimbus in action</a>
            </div>
          </motion.div>

          <motion.div className="pointer-events-none absolute -right-1 top-20 hidden w-40 sm:block lg:right-[5%] lg:w-52" initial={reduceMotion ? false : { x: 50, rotate: 7, opacity: 0 }} animate={{ x: 0, rotate: 0, opacity: 1 }} transition={{ delay: 0.3, duration: 0.9 }}>
            <NimbusMascot state="momentum" className="w-full drop-shadow-[0_24px_40px_rgba(77,59,160,.18)]" />
          </motion.div>

          <motion.div data-product-shot className="relative mx-auto mt-16 max-w-[82rem] overflow-hidden rounded-[1.5rem] border-[7px] border-[#171522] bg-[#171522] shadow-[0_42px_100px_rgba(35,26,73,.24)] sm:mt-20 sm:rounded-[2rem] sm:border-[10px]" initial={reduceMotion ? false : { opacity: 0, y: 45 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.9 }}>
            <div className="flex h-8 items-center gap-1.5 border-b border-white/10 px-4"><span className="h-2 w-2 rounded-full bg-[#ff7a67]" /><span className="h-2 w-2 rounded-full bg-[#ffd166]" /><span className="h-2 w-2 rounded-full bg-[#63d29f]" /></div>
            <img src="/brand/product/my-day.png" alt="The real Nimbus My Day dashboard" className="block h-auto w-full" fetchPriority="high" />
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

      <section id="product" data-story className="px-5 py-28 sm:px-8 sm:py-40">
        <div className="mx-auto grid max-w-[92rem] gap-16 lg:grid-cols-12 lg:gap-10">
          <div data-story-copy className="self-start lg:col-span-5 lg:pt-8">
            <h2 className="max-w-xl text-[clamp(3rem,5.5vw,6.5rem)] font-[630] leading-[.89] tracking-[-.065em]">One day.<br />Five clear views.</h2>
            <p className="mt-7 max-w-md text-lg leading-8 text-[#686177]">Nimbus does not hide the product behind promises. These are the actual workspaces you use to decide, learn, focus, schedule, and finish.</p>
            <div className="mt-9 flex items-center gap-3 text-sm font-black text-[#50486a]"><Wind className="h-5 w-5 text-[#7c68ef]" />Scroll through a real Nimbus day</div>
          </div>
          <div className="space-y-24 lg:col-span-7 lg:space-y-32">
            {productStories.map((story) => (
              <article key={story.number} data-product-shot className="overflow-hidden rounded-[2rem] border border-[#d8d2e9] bg-white shadow-[0_28px_75px_rgba(51,39,100,.12)]">
                <div className="grid gap-5 p-6 sm:grid-cols-[auto_1fr] sm:p-8">
                  <span className="text-sm font-black" style={{ color: story.accent }}>{story.number}</span>
                  <div>
                    <h3 className="text-3xl font-[620] tracking-[-.045em] sm:text-4xl">{story.title}</h3>
                    <p className="mt-3 max-w-xl leading-7 text-[#6c657d]">{story.description}</p>
                  </div>
                </div>
                <div className="border-t border-[#e7e2f0] bg-[#0a0d14] p-2 sm:p-3">
                  <img src={story.image} alt={story.alt} loading="lazy" className="h-auto w-full rounded-xl" />
                </div>
              </article>
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
                <div className="mt-auto overflow-hidden rounded-2xl border border-white/10 bg-[#090c13]">
                  <img src="/brand/product/my-day.png" alt="Recommend next controls in the real Nimbus app" loading="lazy" className="h-64 w-full object-cover object-[55%_45%] sm:h-80" />
                </div>
              </div>
            </article>
            <article className="col-span-12 min-h-[32rem] bg-[#7462df] p-7 sm:p-10 lg:col-span-5">
              <div className="flex h-full flex-col">
                <GraduationCap className="h-7 w-7" />
                <h3 className="mt-8 text-4xl font-[620] leading-[.95] tracking-[-.05em] sm:text-5xl">Built for school, not adapted to it.</h3>
                <p className="mt-5 leading-7 text-white/72">Canvas, subjects, rubrics, assessments, and study focus belong in the same system as everything else.</p>
                <img src="/brand/product/academics.png" alt="Real Nimbus academics screen" loading="lazy" className="mt-auto h-60 w-full rounded-2xl object-cover object-[48%_53%] shadow-2xl" />
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
            <h2 className="text-[clamp(3rem,6vw,7rem)] font-[630] leading-[.88] tracking-[-.068em]">Come back to a tailwind.</h2>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-[#686177]">Daily Drift gives you a small, varied Breeze Point boost the first time you return each day. It celebrates the return—not endless app opening.</p>
          </div>
          <div className="relative mx-auto mt-20 max-w-4xl">
            <article data-stack-card className="sticky top-24 overflow-hidden rounded-[2rem] bg-[#201b31] p-7 text-white shadow-[0_35px_90px_rgba(42,32,86,.22)] sm:p-12">
              <div className="grid items-center gap-8 sm:grid-cols-2">
                <div><Wind className="h-8 w-8 text-[#9c8cff]" /><h3 className="mt-7 text-5xl font-[620] leading-[.9] tracking-[-.055em]">Daily Drift</h3><p className="mt-5 leading-7 text-white/60">One server-issued reward per local day. Refresh-safe, account-specific, and deliberately modest.</p></div>
                <div className="rounded-[1.75rem] bg-[#7765e3] p-8 text-center"><NimbusMascot state="momentum" className="mx-auto w-52" /><p className="mt-4 text-sm font-bold text-white/72">A little tailwind for coming back</p><p className="mt-2 text-4xl font-black">+12 BP</p></div>
              </div>
            </article>
            <article data-stack-card className="sticky top-28 mt-20 rounded-[2rem] border border-[#d9d3ea] bg-white p-7 shadow-[0_35px_90px_rgba(42,32,86,.16)] sm:p-12">
              <div className="flex flex-col justify-between gap-12 sm:flex-row sm:items-end"><div><Target className="h-8 w-8 text-[#ff7a24]" /><h3 className="mt-7 max-w-xl text-5xl font-[620] leading-[.9] tracking-[-.055em]">Spend it on a system that feels like yours.</h3></div><p className="max-w-sm leading-7 text-[#686177]">Completion effects, themes, profile frames, titles, and focus sounds make progress visible without changing your real data.</p></div>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-[#ded7ff] px-5 py-28 sm:px-8 sm:py-40">
        <div className="mx-auto max-w-[92rem]">
          <h2 className="max-w-5xl text-[clamp(3rem,5.6vw,6.4rem)] font-[630] leading-[.89] tracking-[-.065em]">From “what now?” to done.</h2>
          <div className="mt-16 flex min-h-[34rem] flex-col gap-2 lg:flex-row">
            {accordionFeatures.map((feature, index) => (
              <motion.article key={feature.title} className="group relative min-h-72 flex-1 overflow-hidden rounded-[1.5rem] bg-[#171522] text-white lg:min-w-24" whileHover={reduceMotion ? undefined : { flexGrow: 3 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                <img src={feature.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-45 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-72" style={{ objectPosition: feature.position }} />
                <div className="absolute inset-0 bg-gradient-to-t from-[#171522] via-[#171522]/25 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-7">
                  <span className="text-sm font-black text-[#b9adff]">0{index + 1}</span>
                  <h3 className="mt-2 text-4xl font-[620] tracking-[-.05em]">{feature.title}</h3>
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
