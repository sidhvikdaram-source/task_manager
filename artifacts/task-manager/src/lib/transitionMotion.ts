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

export function transitionMotion(_style: string, direction = 1) {
  const animate = { opacity: 1, x: 0, y: 0, scale: 1 };
  const ease = [0.18, 1, 0.22, 1] as const;

  return {
    initial: { opacity: 1, x: direction * 10, y: 0, scale: 1 },
    animate,
    transition: { duration: 0.16, ease },
  };
}
