export const routeOrder = [
  "/",
  "/workspace",
  "/school",
  "/projects",
  "/review",
  "/focus",
  "/calendar",
  "/social",
  "/analytics",
  "/settings",
  "/profile",
] as const;

export function routeDirection(previousPath: string, nextPath: string) {
  const previousIndex = routeOrder.indexOf(
    previousPath as (typeof routeOrder)[number],
  );
  const nextIndex = routeOrder.indexOf(nextPath as (typeof routeOrder)[number]);
  if (previousIndex < 0 || nextIndex < 0 || previousIndex === nextIndex) return 1;
  return nextIndex > previousIndex ? 1 : -1;
}

export function transitionMotion(_style: string, direction = 1) {
  const style = _style || "velocity-slide";
  const animate = {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    clipPath: "inset(0% 0% 0% 0%)",
  };

  if (style === "soft-glide") {
    return {
      initial: {
        ...animate,
        opacity: 0,
        x: direction * 24,
        y: 12,
        scale: 0.992,
        filter: "blur(5px)",
      },
      animate,
      transition: {
        duration: 0.38,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    };
  }

  if (style === "panel-sweep") {
    return {
      initial: {
        ...animate,
        opacity: 0.5,
        x: direction * 72,
        clipPath:
          direction > 0
            ? "inset(0% 0% 0% 38%)"
            : "inset(0% 38% 0% 0%)",
      },
      animate,
      transition: {
        duration: 0.3,
        ease: [0.16, 1, 0.3, 1] as const,
      },
    };
  }

  if (style === "quick-stack") {
    return {
      initial: {
        ...animate,
        opacity: 0,
        x: direction * 38,
        y: 20,
        scale: 0.965,
      },
      animate,
      transition: {
        type: "spring" as const,
        stiffness: 360,
        damping: 30,
        mass: 0.72,
      },
    };
  }

  return {
    initial: {
      ...animate,
      opacity: 0.72,
      x: direction * 52,
    },
    animate,
    transition: {
      duration: 0.26,
      ease: [0.18, 1, 0.22, 1] as const,
    },
  };
}
