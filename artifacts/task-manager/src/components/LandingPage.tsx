import { useMemo, useRef, useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  Brain,
  CalendarCheck,
  Check,
  Clock3,
  Lock,
  Mail,
  MousePointer2,
  Sparkles,
  User,
  Wind,
} from "lucide-react";
import { NimbusMascot } from "@/components/NimbusMascot";

type AuthMode = "login" | "register";

const momentumWords = [
  "Plan with your actual energy",
  "Find the task that fits now",
  "Build momentum without guilt",
  "Make progress visible",
];

const accordions = [
  {
    title: "Know what deserves your attention",
    copy: "Nimbus weighs priority, available time, estimated effort, and your current energy before it recommends the next move.",
    icon: Brain,
    color: "from-[#7c68ef] to-[#aa9cff]",
  },
  {
    title: "Turn a crowded week into a clear route",
    copy: "Projects, classes, deadlines, recurring habits, and focus sessions stay connected without turning your day into a spreadsheet.",
    icon: CalendarCheck,
    color: "from-[#f0a35f] to-[#ffc58f]",
  },
  {
    title: "Make consistency feel worth returning to",
    copy: "Momentum, expressive completion effects, reward chests, and thoughtful progress views give finished work a satisfying second beat.",
    icon: Wind,
    color: "from-[#49bfae] to-[#8ce0ca]",
  },
];

export function LandingPage() {
  const { login, loginWithPassword, registerWithPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>("register");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const authRef = useRef<HTMLElement>(null);
  const storyRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: storyRef,
    offset: ["start end", "end start"],
  });
  const mascotX = useTransform(scrollYProgress, [0, 0.5, 1], [-70, 20, 150]);
  const mascotRotate = useTransform(scrollYProgress, [0, 1], [-5, 6]);
  const isEmbedded = window.self !== window.top;
  const appUrl = window.location.origin + (import.meta.env.BASE_URL ?? "/");

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
    <main className="w-full max-w-full overflow-x-hidden bg-[#f7f5ff] font-sans text-[#171522] selection:bg-[#8b7cf6]/25">
      <nav className="fixed inset-x-0 top-0 z-50 px-3 py-3 sm:px-5 sm:py-4">
        <div className="mx-auto flex max-w-[92rem] items-center justify-between gap-4">
          <a href="#top" className="group flex shrink-0 items-center gap-2.5 rounded-2xl bg-white/88 p-1.5 shadow-[0_8px_28px_rgba(55,43,110,.09)] ring-1 ring-white/80 backdrop-blur-xl min-[430px]:pl-2 min-[430px]:pr-4" aria-label="Nimbus home">
            <NimbusMascot variant="mark" className="h-11 w-13 sm:h-12 sm:w-14" />
            <span className="hidden text-base font-black tracking-[-0.045em] text-[#211d36] min-[430px]:inline sm:text-lg">nimbus</span>
          </a>
          <div className="flex items-center gap-1 rounded-2xl bg-white/88 p-1.5 shadow-[0_8px_28px_rgba(55,43,110,.09)] ring-1 ring-white/80 backdrop-blur-xl sm:gap-1.5">
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

      <section id="top" className="relative min-h-[94svh] overflow-hidden px-5 pb-28 pt-36 sm:px-8 sm:pt-44 lg:pb-36">
        <motion.div
          aria-hidden="true"
          className="absolute -left-40 top-10 h-[34rem] w-[34rem] rounded-full bg-[#b8aeff]/35 blur-[100px]"
          animate={reduceMotion ? undefined : { x: [0, 50, 0], y: [0, 30, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute -right-32 bottom-0 h-[30rem] w-[30rem] rounded-full bg-[#ffd4a8]/45 blur-[110px]"
          animate={reduceMotion ? undefined : { x: [0, -35, 0], y: [0, -25, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative mx-auto grid max-w-[92rem] items-center gap-16 lg:grid-cols-[1.08fr_.92fr]">
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}>
            <h1 className="max-w-6xl text-[clamp(2.4rem,7.2vw,7.6rem)] font-black leading-[.88] tracking-[-0.075em] text-[#171522]">
              Find the right task. Catch your momentum.
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-[#655f77] sm:text-xl">
              Nimbus turns deadlines, energy, time, and priority into a plan you can actually follow, then makes every finished task feel worth it.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => moveToAuth("register")} className="group inline-flex h-13 items-center justify-center gap-3 rounded-2xl bg-[#7c68ef] px-6 text-sm font-black text-white shadow-[0_18px_40px_rgba(124,104,239,.3)] transition-transform hover:-translate-y-1">
                Start building momentum
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <button type="button" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" })} className="inline-flex h-13 items-center justify-center rounded-2xl border border-[#d8d2ef] bg-white px-6 text-sm font-black text-[#211d36] transition-colors hover:border-[#a99df5] hover:bg-[#f0edff]">
                See Nimbus in motion
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, x: 50, scale: 0.88 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto w-full max-w-2xl"
          >
            <div className="absolute inset-x-[12%] bottom-[5%] h-[22%] rounded-full bg-[#7c68ef]/25 blur-3xl" />
            <NimbusMascot state="momentum" className="relative z-10 mx-auto aspect-[1.25] w-[88%] drop-shadow-[0_34px_44px_rgba(76,56,160,.22)]" />
            <motion.div
              className="absolute left-0 top-[12%] z-20 w-[min(15rem,52%)] rounded-2xl border border-white bg-white/90 p-4 shadow-[0_18px_45px_rgba(55,43,110,.14)] backdrop-blur"
              animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="flex items-center gap-2 text-xs font-black text-[#7c68ef]"><Clock3 className="h-4 w-4" /> You have 12 minutes</div>
              <p className="mt-2 text-sm font-black text-[#211d36]">Best next: Review chemistry cards</p>
              <p className="mt-1 text-xs text-[#777085]">Medium energy · high priority · 10 min</p>
            </motion.div>
            <motion.div
              className="absolute bottom-[6%] right-0 z-20 rounded-2xl bg-[#171522] p-4 text-white shadow-[0_20px_45px_rgba(23,21,34,.24)]"
              animate={reduceMotion ? undefined : { y: [0, 7, 0], rotate: [0, 1, 0] }}
              transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="flex items-center gap-2 text-xs font-bold text-[#b8aeff]"><Check className="h-4 w-4" /> Momentum moved</div>
              <p className="mt-1 text-2xl font-black">14 active days</p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <div className="border-y border-[#ddd7f1] bg-white py-4">
        <motion.div
          className="flex w-max gap-10 whitespace-nowrap text-sm font-black text-[#655f77]"
          animate={reduceMotion ? undefined : { x: ["0%", "-50%"] }}
          transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
        >
          {[...momentumWords, ...momentumWords].map((word, index) => (
            <span key={`${word}-${index}`} className="inline-flex items-center gap-10">
              {word}<span className="h-1.5 w-1.5 rounded-full bg-[#8b7cf6]" />
            </span>
          ))}
        </motion.div>
      </div>

      <section id="how-it-works" className="px-5 py-32 sm:px-8 md:py-48">
        <div className="mx-auto max-w-[92rem]">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }} className="max-w-5xl">
            <h2 className="text-[clamp(2.7rem,5.6vw,6rem)] font-black leading-[.94] tracking-[-0.065em]">
              Your day is not a list. It is a set of changing conditions.
            </h2>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#655f77]">
              Nimbus responds to those conditions, so the plan stays useful when your time, energy, or priorities change.
            </p>
          </motion.div>

          <div className="mt-20 grid grid-flow-dense gap-4 lg:grid-cols-12">
            <motion.article whileInView={{ opacity: 1, scale: 1 }} initial={{ opacity: 0, scale: 0.86 }} viewport={{ once: true, amount: 0.25 }} className="group min-h-[21rem] overflow-hidden rounded-[2rem] bg-[#171522] p-7 text-white lg:col-span-7 sm:p-9">
              <div className="flex h-full flex-col justify-between">
                <div className="flex items-start justify-between gap-6">
                  <h3 className="max-w-xl text-3xl font-black tracking-[-.04em] sm:text-4xl">Recommendations that respect the clock</h3>
                  <MousePointer2 className="h-7 w-7 text-[#b8aeff] transition-transform duration-700 group-hover:translate-x-2 group-hover:-translate-y-2" />
                </div>
                <div className="mt-10 grid gap-3 sm:grid-cols-3">
                  {["Energy: medium", "Time: 10 min", "Priority: high"].map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-white/7 p-4 text-sm font-bold text-white/75">{item}</div>)}
                </div>
              </div>
            </motion.article>
            <motion.article whileInView={{ opacity: 1, scale: 1 }} initial={{ opacity: 0, scale: 0.86 }} viewport={{ once: true, amount: 0.25 }} className="group min-h-[21rem] overflow-hidden rounded-[2rem] bg-[#dcd5ff] p-7 lg:col-span-5 sm:p-9">
              <Brain className="h-8 w-8 text-[#6f5bd7] transition-transform duration-700 group-hover:scale-110" />
              <h3 className="mt-14 text-3xl font-black tracking-[-.04em]">Nimbo plans with you, not over you.</h3>
              <p className="mt-4 leading-7 text-[#5e5674]">Draft tasks, organize projects, and preview every change before the assistant touches your workspace.</p>
            </motion.article>
            <motion.article whileInView={{ opacity: 1, scale: 1 }} initial={{ opacity: 0, scale: 0.86 }} viewport={{ once: true, amount: 0.25 }} className="group min-h-[21rem] overflow-hidden rounded-[2rem] bg-[#ffd8b5] p-7 lg:col-span-5 sm:p-9">
              <Sparkles className="h-8 w-8 text-[#aa5a1d] transition-transform duration-700 group-hover:rotate-12 group-hover:scale-110" />
              <h3 className="mt-14 text-3xl font-black tracking-[-.04em]">Progress that has a pulse</h3>
              <p className="mt-4 leading-7 text-[#755137]">Distinct completion effects, momentum milestones, focus rewards, and profile customization make progress tangible.</p>
            </motion.article>
            <motion.article whileInView={{ opacity: 1, scale: 1 }} initial={{ opacity: 0, scale: 0.86 }} viewport={{ once: true, amount: 0.25 }} className="group min-h-[21rem] overflow-hidden rounded-[2rem] bg-[#bfe8de] p-7 lg:col-span-7 sm:p-9">
              <div className="grid h-full items-end gap-8 sm:grid-cols-[1fr_auto]">
                <div>
                  <Wind className="h-8 w-8 text-[#267d6d]" />
                  <h3 className="mt-10 max-w-lg text-3xl font-black tracking-[-.04em] sm:text-4xl">Momentum counts active days. It never punishes a reset.</h3>
                </div>
                <NimbusMascot state="momentum" className="w-44 transition-transform duration-700 group-hover:translate-x-4 sm:w-56" />
              </div>
            </motion.article>
          </div>
        </div>
      </section>

      <section ref={storyRef} className="relative bg-[#171522] px-5 py-32 text-white sm:px-8 md:py-48">
        <motion.div aria-hidden="true" style={reduceMotion ? undefined : { x: mascotX, rotate: mascotRotate }} className="pointer-events-none absolute right-[5%] top-12 opacity-20">
          <NimbusMascot animated={false} className="w-64 sm:w-96" />
        </motion.div>
        <div className="relative mx-auto max-w-[92rem]">
          <h2 className="max-w-5xl text-[clamp(2.8rem,6vw,6.4rem)] font-black leading-[.92] tracking-[-.065em]">
            When the plan fits the moment, starting gets lighter.
          </h2>
          <div className="mt-20 flex min-h-[30rem] gap-2 max-lg:flex-col lg:h-[34rem]">
            {accordions.map((item, index) => {
              const Icon = item.icon;
              const active = activeFeature === index;
              return (
                <motion.button
                  key={item.title}
                  type="button"
                  onMouseEnter={() => setActiveFeature(index)}
                  onFocus={() => setActiveFeature(index)}
                  onClick={() => setActiveFeature(index)}
                  animate={{ flex: active ? 3.4 : 1 }}
                  transition={{ type: "spring", stiffness: 180, damping: 24 }}
                  className={`group relative min-h-40 overflow-hidden rounded-[1.75rem] bg-gradient-to-br ${item.color} p-6 text-left text-[#171522] sm:p-8`}
                >
                  <Icon className="h-7 w-7" />
                  <div className="absolute inset-x-6 bottom-6 sm:inset-x-8 sm:bottom-8">
                    <h3 className="max-w-lg text-2xl font-black tracking-[-.035em] sm:text-3xl">{item.title}</h3>
                    <AnimatePresence initial={false}>
                      {active && (
                        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 max-w-xl leading-7 text-[#352f48]/75">
                          {item.copy}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </section>

      <section ref={authRef} className="px-5 py-32 sm:px-8 md:py-48">
        <div className="mx-auto grid max-w-[92rem] overflow-hidden rounded-[2.5rem] bg-[#ebe7ff] shadow-[0_35px_100px_rgba(74,57,150,.16)] lg:grid-cols-[1.05fr_.95fr]">
          <div className="relative overflow-hidden p-7 sm:p-12 lg:p-16">
            <h2 className="max-w-3xl text-[clamp(2.6rem,5vw,5.5rem)] font-black leading-[.92] tracking-[-.065em]">Make room for the work that matters.</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#655f77]">Create your Nimbus workspace, tell it what today feels like, and get a next step that fits.</p>
            <NimbusMascot state="assistant" className="mt-10 w-full max-w-md" />
          </div>
          <div className="bg-white p-6 sm:p-10 lg:p-14">
            {isEmbedded ? (
              <div className="flex h-full min-h-96 flex-col items-start justify-center">
                <h3 className="text-3xl font-black">Open Nimbus securely</h3>
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
          <div className="flex items-center gap-2"><NimbusMascot variant="mark" animated={false} interactive={false} className="h-9 w-11" /><span className="font-black text-[#211d36]">nimbus</span></div>
          <p>Plan what fits. Finish what matters.</p>
        </div>
      </footer>
    </main>
  );
}
