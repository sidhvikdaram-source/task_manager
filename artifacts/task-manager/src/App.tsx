import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@workspace/replit-auth-web";
import { Loader as Loader2, Lock, Mail, User, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeProvider } from "@/theme";
import { useCanvasSync } from "@/hooks/useCanvasSync";
import { ExperienceProvider, useExperience } from "@/experience";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";

const Today = lazy(() => import("@/pages/Today"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const FocusArena = lazy(() => import("@/pages/FocusArena"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Social = lazy(() => import("@/pages/Social"));
const Profile = lazy(() => import("@/pages/Profile"));
const Workspace = lazy(() => import("@/pages/Workspace"));
const SchoolPlanner = lazy(() => import("@/pages/SchoolPlanner"));
const Projects = lazy(() => import("@/pages/Projects"));
const WeeklyReview = lazy(() => import("@/pages/WeeklyReview"));
const Settings = lazy(() => import("@/pages/Settings"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

function LoginScreen() {
  const { login, loginWithPassword, registerWithPassword } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEmbedded = window.self !== window.top;
  const appUrl = window.location.origin + (import.meta.env.BASE_URL ?? "/");

  async function offerCredentialSave() {
    type PasswordCredentialConstructor = new (data: { id: string; password: string; name?: string }) => Credential;
    const PasswordCredentialApi = (window as typeof window & { PasswordCredential?: PasswordCredentialConstructor }).PasswordCredential;
    if (!PasswordCredentialApi || !navigator.credentials?.store) return;
    try {
      await navigator.credentials.store(new PasswordCredentialApi({ id: email, password, name: firstName || email }));
    } catch {
      // Password managers may decline silently; the semantic form still offers native saving.
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
      setAuthError(
        error instanceof Error ? error.message : "Authentication failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="bento-card w-full max-w-md p-6 sm:p-7">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-[1.15rem] bg-[#141414] text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
            <Zap className="h-7 w-7 fill-white text-white" />
          </div>
          <span className="text-4xl font-black tracking-tight text-foreground">
            Velocity
          </span>
        </div>
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-foreground">
            Your gamified task manager
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete tasks, earn VP, and level up your productivity.
          </p>
        </div>
        {isEmbedded ? (
          <>
            <Button
              onClick={() =>
                window.open(appUrl, "_blank", "noopener,noreferrer")
              }
              size="lg"
              className="w-full"
            >
              Open Velocity
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Log in there, then come back here. The embed will update
              automatically.
            </p>
          </>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setAuthError("");
                }}
                className={`rounded-xl px-3 py-2 text-sm font-bold transition-colors ${mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setAuthError("");
                }}
                className={`rounded-xl px-3 py-2 text-sm font-bold transition-colors ${mode === "register" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Register
              </button>
            </div>

            <form onSubmit={submitLocalAuth} autoComplete="on" className="space-y-3">
              {mode === "register" && (
                <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-3 py-2.5">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <input
                    id="given-name"
                    name="given-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="First name"
                    autoComplete="given-name"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </label>
              )}
              <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-3 py-2.5">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <input
                  id="email"
                  name="username"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email"
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  required
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-3 py-2.5">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    mode === "register"
                      ? "Password (6+ characters)"
                      : "Password"
                  }
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  required
                />
              </label>
              {authError && (
                <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {authError}
                </p>
              )}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Working..."
                  : mode === "register"
                    ? "Create account"
                    : "Sign in"}
              </Button>
            </form>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-bold uppercase text-muted-foreground">
                or
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              onClick={login}
              size="lg"
              variant="outline"
              className="w-full gap-2"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-foreground text-[11px] font-black text-background">
                G
              </span>
              Sign in with Google
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

function SocialRoute() {
  const { preferences } = useExperience();
  if (preferences.socialEnabled) return <Social />;
  return (
    <div className="bento-card mx-auto max-w-xl p-6 text-center">
      <Users className="mx-auto h-7 w-7 text-primary" />
      <h1 className="mt-3 text-xl font-black">Social is optional</h1>
      <p className="mt-2 text-sm text-muted-foreground">Turn it on when you want friends, messages, and shared challenges.</p>
      <Link href="/settings"><button className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-black text-primary-foreground">Open settings</button></Link>
    </div>
  );
}

function PageLoadingSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading page">
      <div className="bento-card p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-52 max-w-full" />
        <Skeleton className="mt-3 h-3 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((item) => <div key={item} className="bento-card space-y-3 p-5"><Skeleton className="h-4 w-32" /><Skeleton className="h-16 rounded-lg" /><Skeleton className="h-16 rounded-lg" /></div>)}
      </div>
    </div>
  );
}

function AnimatedRoutes() {
  const [location] = useLocation();

  useEffect(() => {
    document.getElementById("main-content")?.scrollTo({ top: 0, left: 0 });
  }, [location]);

  return (
    <div className="app-page min-h-full">
        <PageErrorBoundary>
          <Suspense fallback={<PageLoadingSkeleton />}>
            <Switch>
              <Route path="/" component={Today} />
              <Route path="/calendar" component={Calendar} />
              <Route path="/workspace" component={Workspace} />
              <Route path="/school" component={SchoolPlanner} />
              <Route path="/projects" component={Projects} />
              <Route path="/review" component={WeeklyReview} />
              <Route path="/focus" component={FocusArena} />
              <Route path="/social" component={SocialRoute} />
              <Route path="/analytics" component={Analytics} />
              <Route path="/profile" component={Profile} />
              <Route path="/settings" component={Settings} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </PageErrorBoundary>
    </div>
  );
}

function Router() {
  useCanvasSync(true);
  return (
    <ExperienceProvider>
      <AppLayout>
        <AnimatedRoutes />
      </AppLayout>
    </ExperienceProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter
            base={(import.meta.env.BASE_URL ?? "/").replace(/\/$/, "")}
          >
            <AuthGate>
              <Router />
            </AuthGate>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
