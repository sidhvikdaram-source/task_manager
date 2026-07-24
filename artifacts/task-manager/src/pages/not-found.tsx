import { ArrowLeft, Compass } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <section className="bento-card relative flex min-h-[min(36rem,75dvh)] overflow-hidden p-6 sm:p-10">
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative my-auto max-w-xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Compass className="h-6 w-6" />
        </div>
        <p className="mt-8 text-xs font-black uppercase tracking-[0.16em] text-primary">Page not found</p>
        <h1 className="tech-title mt-2 text-4xl sm:text-6xl">This route has moved.</h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
          The address does not point to an active Velocity screen. Return to My Day and continue from your current plan.
        </p>
        <Link href="/" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground">
          <ArrowLeft className="h-4 w-4" />
          Return to My Day
        </Link>
      </div>
    </section>
  );
}
