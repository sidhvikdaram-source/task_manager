import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export function ThinkingIndicator({ label = "Thinking…" }: { label?: string }) {
  const dots = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const motion = gsap.matchMedia();
    motion.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.to(dots.current!.children, {
        y: -4,
        opacity: 1,
        scale: 1.15,
        duration: 0.5,
        stagger: 0.16,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    });
    return () => motion.revert();
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex min-h-12 items-center gap-3 text-sm text-muted-foreground"
    >
      <span
        ref={dots}
        aria-hidden="true"
        className="inline-flex items-center gap-1.5 px-1"
      >
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="h-1.5 w-1.5 rounded-full bg-primary opacity-60"
          />
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}
