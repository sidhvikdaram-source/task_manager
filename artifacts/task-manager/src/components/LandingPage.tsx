import { useMemo, useRef, useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  Brain,
  CalendarCheck,
  Lock,
  Mail,
  MousePointer2,
  Sparkles,
  User,
  Wind,
} from "lucide-react";
import { NimbusMascot } from "@/components/NimbusMascot";
import { NimbusProductPreview } from "@/components/NimbusProductPreview";

gsap.registerPlugin(ScrollTrigger);

type AuthMode = "login" | "register";

const momentumWords = [
  "Plan with your actual energy",
  "Find the task that fits now",
  "Build momentum without guilt",
  "Make progress visible",
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

  useGSAP(() => {
    if (reduceMotion) return;

    gsap.utils.toArray<HTMLElement>("[data-product-shot]").forEach((shot) => {
      gsap.fromTo(
        shot,
        { scale: 0.86, opacity: 0.22, y: 72 },
        {
          scale: 1,
          opacity: 1,
          y: 0,
          ease: "none",
          scrollTrigger: {
            trigger: shot,
            start: "top 92%",
            end: "top 36%",
            scrub: 0.8,
          },
        },
      );
    });

    gsap.utils.toArray<HTMLElement>("[data-story-card]").forEach((card, index) => {
      gsap.to(card, {
        scale: 1 - index * 0.02,
        y: index * 12,
        ease: "none",
        scrollTrigger: {
          trigger: card,
          start: "top 18%",
          end: "bottom 18%",
          scrub: true,
        },
      });
    });
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
      if (mode === "register") {
        await registerWithPassword(email, password, firstName);
      } else {
        await loginWithPassword(email, password);
      }
      await offerCredentialSave();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main ref={pageRef} className="nimbus-marketing w-full max-w-full overflow-x-hidden bg-[#f7f5ff] text-[#171522] selection:bg-[#8b7cf6]/25">
      <nav className="fixed inset-x-0 top-0 z-50 px-3 py-3 sm:px-5 sm:py-4">
        <div className="mx-auto flex max-w-[92rem] items-center justify-between gap-4">
          <a href="#top" className="group flex shrink-0 items-center gap-2.5 rounded-2xl bg-white/90 p-1.5 shadow-[0_8px_28px_rgba(55,43,110,.09)] ring-1 ring-white/80 backdrop-blur-xl min-[430px]:pl-2 min-[430px]:pr-4" aria-label="Nimbus home">
            <NimbusMascot variant="mark" className="h-11 w-13 sm:h-12 sm:w-14" />
            <span className="nimbus-wordmark hidden text-lg text-[#211d36] min-[430px]:inline sm:text-xl">nimbus</span>
          </a>
          <div className="flex items-center gap-1 rounded-2xl bg-white/90 p-1.5 shadow-[0_8px_28px_rgba(55,43,110,.09)] ring-1 ring-white/80 backdrop-blur-xl sm:gap-1.5">
            <button type="button" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" })} className="hidden rounded-xl px-3 py-2 text-sm font-bold text-[#655f77] transition-colors hover:bg-[#eeeaff] hover:text-[#211d36] sm:block">
              How it works
            </button>
            <button type="button" onClick={() => moveToAuth("login")} className="rounded-xl px-2.5 py-2 text-xs font-black text-[#211d36] transition-colors hover:bg-[#eeeaff] sm:px-3 sm:text-sm">
              Log in
            </button>
            <button type="button" onClick={() => moveToAuth("register")} className="rounded-xl bg-[#171522] px-3 py-2 text-xs font-black text-white shadow-sm transition-transform hover:-translate-y-0.5 sm:px-4 sm:text-sm">
              Register
            </button>
          </div>
        </div>
      </nav>

      <section id="top" className="px-3 pb-20 pt-24 sm:px-5 sm:pb-28 sm:pt-28">
        <div className="relative mx-auto min-h-[88svh] max-w-[92rem] overflow-hidden rounded-[2rem] bg-[#171522] px-5 pb-8 pt-20 text-white sm:rounded-[3rem] sm:px-10 sm:pb-12 sm:pt-24 lg:px-16">
          <motion.div aria-hidden="true" className="absolute -left-40 -top-24 h-[38rem] w-[38rem] rounded-full bg-[#7565e8]/35 blur-[120px]" animate={reduceMotion ? undefined : { x: [0, 55, 0], y: [0, 28, 0] }} transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }} />
          <motion.div aria-hidden="true" className="absolute -right-32 top-10 h-[32rem] w-[32rem] rounded-full bg-[#55bda7]/20 blur-[110px]" animate={reduceMotion ? undefined : { x: [0, -35, 0], y: [0, 32, 0] }} transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }} />
          <div aria-hidden="true" className="absolute inset-0 opacity-[.11] [background-image:linear-gradient(rgba(255,255,255,.15)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.15)_1px,transparent_1px)] [background-size:72px_72px]" />

          <motion.div className="absolute -right-4 top-24 z-10 w-32 opacity-25 sm:right-[3%] sm:top-24 sm:w-[19rem] sm:opacity-85 lg:right-[8%] lg:w-[24rem]" initial={reduceMotion ? false : { x: 70, rotate: 8 }} animate={{ x: 0, rotate: 0 }} transition={{ delay: 0.25, duration: 1, ease: [0.22, 1, 0.36, 1] }}>
            <NimbusMascot state="momentum" className="w-full drop-shadow-[0_35px_55px_rgba(0,0,0,.28)]" />
          </motion.div>

          <motion.div className="relative z-20 max-w-6xl" initial={reduceMotion ? false : { opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
            <p className="text-sm font-semibold text-[#b8aeff] sm:text-base">A task manager that understands the moment.</p>
            <h1 className="mt-5 max-w-6xl text-[clamp(3rem,6.4vw,7.25rem)] font-[620] leading-[.89] tracking-[-0.065em]">
              Your day changes. Your plan should too.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-7 text-white/62 sm:text-xl sm:leading-8">
              Nimbus weighs time, energy, priority, and effort to find the task that actually fits—then turns progress into momentum you can feel.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => moveToAuth("register")} className="group inline-flex h-13 items-center justify-center gap-3 rounded-2xl bg-[#8f80f2] px-6 text-sm font-black text-white shadow-[0_18px_45px_rgba(117,101,232,.32)] transition-transform duration-300 hover:-translate-y-1">
                Start building momentum
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <button type="button" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" })} className="inline-flex h-13 items-center justify-center rounded-2xl border border-white/18 bg-white/8 px-6 text-sm font-black text-white transition-colors hover:bg-white/14">
                See the product
              </button>
            </div>
          </motion.div>

          <motion.div className="relative z-20 mx-auto mt-20 max-w-6xl origin-bottom lg:mt-24" initial={reduceMotion ? false : { opacity: 0, y: 55, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.38, duration: 1, ease: [0.22, 1, 0.36, 1] }}>
            <NimbusProductPreview scene="today" />
          </motion.div>
        </div>
      </section>

      <div className="border-y border-[#ddd7f1] bg-white py-4">
        <motion.div className="flex w-max gap-10 whitespace-nowrap text-sm font-black text-[#655f77]" animate={reduceMotion ? undefined : { x: ["0%", "-50%"] }} transition={{ duration: 28, repeat: Infinity, ease: "linear" }}>
          {[...momentumWords, ...momentumWords].map((word, index) => (
            <span key={`${word}-${index}`} className="inline-flex items-center gap-10">
              {word}<span className="h-1.5 w-1.5 rounded-full bg-[#8b7cf6]" />
            </span>
          ))}
        </motion.div>
      </div>

      <section id="how-it-works" className="px-5 py-32 sm:px-8 md:py-48">
        <div className="mx-auto max-w-[92rem]">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }} className="max-w-6xl">
            <h2 className="text-[clamp(2.8rem,5.8vw,6.3rem)] font-[620] leading-[.93] tracking-[-0.065em]">
              Not another list. A decision engine for real life.
            </h2>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#655f77]">
              The product does more than hold tasks. It reads the conditions around them, gives you a realistic next move, and helps you stay with it.
            </p>
          </motion.div>

          <div data-product-shot className="mx-auto mt-20 max-w-7xl origin-center">
            <NimbusProductPreview scene="today" />
          </div>

          <div className="mt-24 grid grid-flow-dense gap-4 lg:grid-cols-12">
            <article className="group min-h-[22rem] overflow-hidden rounded-[2rem] bg-[#171522] p-7 text-white lg:col-span-7 sm:p-9">
              <div className="flex h-full flex-col justify-between">
                <div className="flex items-start justify-between gap-6">
                  <h3 className="max-w-xl text-3xl font-[620] tracking-[-.045em] sm:text-4xl">Recommendations that respect the clock</h3>
                  <MousePointer2 className="h-7 w-7 text-[#b8aeff] transition-transform duration-700 group-hover:translate-x-2 group-hover:-translate-y-2" />
                </div>
                <div className="mt-10 grid gap-3 sm:grid-cols-3">
                  {["Energy: medium", "Time: 10 min", "Priority: high"].map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-white/7 p-4 text-sm font-bold text-white/75">{item}</div>)}
                </div>
              </div>
            </article>
            <article className="group min-h-[22rem] overflow-hidden rounded-[2rem] bg-[#dcd5ff] p-7 lg:col-span-5 sm:p-9">
              <Brain className="h-8 w-8 text-[#6f5bd7] transition-transform duration-700 group-hover:scale-110" />
              <h3 className="mt-14 text-3xl font-[620] tracking-[-.045em]">Nimbo plans with you, not over you.</h3>
              <p className="mt-4 leading-7 text-[#5e5674]">Draft tasks, organize projects, and preview every change before the assistant touches your workspace.</p>
            </article>
            <article className="group min-h-[22rem] overflow-hidden rounded-[2rem] bg-[#ffd8b5] p-7 lg:col-span-5 sm:p-9">
              <Sparkles className="h-8 w-8 text-[#aa5a1d] transition-transform duration-700 group-hover:rotate-12 group-hover:scale-110" />
              <h3 className="mt-14 text-3xl font-[620] tracking-[-.045em]">Progress that has a pulse</h3>
              <p className="mt-4 leading-7 text-[#755137]">Completion effects, momentum milestones, focus rewards, and profile customization make progress tangible.</p>
            </article>
            <article className="group min-h-[22rem] overflow-hidden rounded-[2rem] bg-[#bfe8de] p-7 lg:col-span-7 sm:p-9">
              <div className="grid h-full items-end gap-8 sm:grid-cols-[1fr_auto]">
                <div>
                  <Wind className="h-8 w-8 text-[#267d6d]" />
                  <h3 className="mt-10 max-w-lg text-3xl font-[620] tracking-[-.045em] sm:text-4xl">Momentum counts active days. It never punishes a reset.</h3>
                </div>
                <NimbusMascot state="momentum" className="w-44 transition-transform duration-700 group-hover:translate-x-4 sm:w-56" />
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="relative bg-[#171522] px-5 py-32 text-white sm:px-8 md:py-48">
        <motion.div aria-hidden="true" className="absolute right-[4%] top-16 w-52 opacity-15 sm:w-80" animate={reduceMotion ? undefined : { x: [0, 35, 0], rotate: [-2, 3, -2] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}>
          <NimbusMascot state="momentum" className="w-full" />
        </motion.div>
        <div className="relative mx-auto max-w-[92rem]">
          <h2 className="max-w-6xl text-[clamp(2.8rem,6vw,6.5rem)] font-[620] leading-[.92] tracking-[-.065em]">
            Starting is easier when the plan fits the moment.
          </h2>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/55">Nimbus carries the same logic from deciding, to focusing, to understanding what actually helps you finish.</p>

          <div className="mt-24 space-y-24">
            <article data-story-card className="sticky top-20 overflow-hidden rounded-[2rem] bg-[#ebe7ff] p-5 text-[#171522] shadow-[0_40px_100px_rgba(0,0,0,.28)] sm:p-8">
              <div className="grid items-center gap-10 lg:grid-cols-[.34fr_.66fr]">
                <div className="p-2 sm:p-5">
                  <CalendarCheck className="h-8 w-8 text-[#7565e8]" />
                  <h3 className="mt-8 text-3xl font-[620] tracking-[-.045em] sm:text-4xl">Protect the focus you finally found.</h3>
                  <p className="mt-5 leading-7 text-[#655f77]">Move from a recommendation into a calm focus space without rebuilding context or juggling another timer.</p>
                </div>
                <NimbusProductPreview scene="focus" />
              </div>
            </article>

            <article data-story-card className="sticky top-24 overflow-hidden rounded-[2rem] bg-[#cceee5] p-5 text-[#171522] shadow-[0_40px_100px_rgba(0,0,0,.28)] sm:p-8">
              <div className="grid items-center gap-10 lg:grid-cols-[.34fr_.66fr]">
                <div className="p-2 sm:p-5">
                  <Wind className="h-8 w-8 text-[#267d6d]" />
                  <h3 className="mt-8 text-3xl font-[620] tracking-[-.045em] sm:text-4xl">See momentum, not guilt.</h3>
                  <p className="mt-5 leading-7 text-[#506b65]">Real progress patterns replace punishing streaks, so your history teaches you how to plan the next day better.</p>
                </div>
                <NimbusProductPreview scene="analytics" />
              </div>
            </article>

            <article data-story-card className="sticky top-28 overflow-hidden rounded-[2rem] bg-[#7565e8] p-8 text-white shadow-[0_40px_100px_rgba(0,0,0,.3)] sm:p-12">
              <div className="grid items-center gap-10 lg:grid-cols-[1fr_.7fr]">
                <div>
                  <Sparkles className="h-8 w-8 text-[#b9ffea]" />
                  <h3 className="mt-8 max-w-3xl text-[clamp(2.5rem,4.8vw,5rem)] font-[620] leading-[.94] tracking-[-.06em]">Nimbo handles the planning friction. You stay in control.</h3>
                  <p className="mt-6 max-w-xl text-lg leading-8 text-white/65">Ask for a project, a priority pass, or a realistic day plan. Nothing changes until you confirm it.</p>
                </div>
                <NimbusMascot state="assistant" className="mx-auto w-full max-w-md" />
              </div>
            </article>
          </div>
        </div>
      </section>

      <section ref={authRef} className="px-5 py-32 sm:px-8 md:py-48">
        <div className="mx-auto grid max-w-[92rem] overflow-hidden rounded-[2.5rem] bg-[#ebe7ff] shadow-[0_35px_100px_rgba(74,57,150,.16)] lg:grid-cols-[1.05fr_.95fr]">
          <div className="relative overflow-hidden p-7 sm:p-12 lg:p-16">
            <h2 className="max-w-3xl text-[clamp(2.6rem,5vw,5.5rem)] font-[620] leading-[.92] tracking-[-.065em]">Make room for the work that matters.</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#655f77]">Create your Nimbus workspace, tell it what today feels like, and get a next step that fits.</p>
            <NimbusMascot state="assistant" className="mt-10 w-full max-w-md" />
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
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#171522] text-[10px] text-white">G</span>
                  Continue with Google
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-[#ddd7f1] px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-[92rem] flex-col gap-4 text-sm text-[#655f77] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><NimbusMascot variant="mark" animated={false} interactive={false} className="h-9 w-11" /><span className="nimbus-wordmark text-lg text-[#211d36]">nimbus</span></div>
          <p>Plan what fits. Finish what matters.</p>
        </div>
      </footer>
    </main>
  );
}
