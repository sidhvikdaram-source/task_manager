export const routeOrder = [
  "/",
  "/school",
  "/projects",
  "/focus",
  "/calendar",
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

export function transitionMotion(style: string, direction = 1) {
  const animate = { opacity: 1, x: 0, y: 0, scale: 1 };
  const ease = [0.22, 1, 0.36, 1] as const;

  if (style === "panel-sweep") {
    return {
      initial: { opacity: 0.14, x: direction * 58, y: 0, scale: 1 },
      animate,
      transition: { duration: 0.3, ease },
    };
  }
  if (style === "soft-glide") {
    return {
      initial: { opacity: 0.2, x: direction * 24, y: 7, scale: 1 },
      animate,
      transition: { duration: 0.29, ease },
    };
  }
  if (style === "quick-stack") {
    return {
      initial: {
        opacity: 0.16,
        x: direction * 34,
        y: 8,
        scale: 0.985,
      },
      animate,
      transition: { duration: 0.24, ease },
    };
  }
  return {
    initial: { opacity: 0.18, x: direction * 42, y: 0, scale: 1 },
    animate,
    transition: { duration: 0.27, ease },
  };
}
