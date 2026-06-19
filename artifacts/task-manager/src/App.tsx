import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Calendar from "@/pages/Calendar";
import FocusArena from "@/pages/FocusArena";
import Analytics from "@/pages/Analytics";
import NotFound from "@/pages/not-found";
import { useAuth } from "@workspace/replit-auth-web";
import { Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // Always refetch when component mounts or query is invalidated
      gcTime: 1000 * 60 * 5, // 5 minutes keep data in cache for fast back-nav
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

function LoginScreen() {
  const { login } = useAuth();
  const isEmbedded = window.self !== window.top;
  const appUrl = window.location.origin + (import.meta.env.BASE_URL ?? "/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6 max-w-sm px-6">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Zap className="w-6 h-6 text-primary-foreground fill-primary-foreground" />
          </div>
          <span className="font-bold text-2xl tracking-tight">Velocity</span>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Your gamified task manager</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Complete tasks, earn VP, and level up your productivity.
          </p>
        </div>
        {isEmbedded ? (
          <>
            <Button
              onClick={() => window.open(appUrl, "_blank", "noopener,noreferrer")}
              size="lg"
              className="w-full"
            >
              Open Velocity ↗
            </Button>
            <p className="text-xs text-muted-foreground">
              Log in there, then come back here — the embed will update automatically.
            </p>
          </>
        ) : (
          <Button onClick={login} size="lg" className="w-full">
            Log in to get started
          </Button>
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
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/focus" component={FocusArena} />
        <Route path="/analytics" component={Analytics} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthGate>
            <Router />
          </AuthGate>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
