import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type NimbusMascotProps = {
  state?: "ready" | "overdue" | "momentum" | "assistant";
  className?: string;
  imageClassName?: string;
  animated?: boolean;
};

export function NimbusMascot({
  state = "ready",
  className,
  imageClassName,
  animated = true,
}: NimbusMascotProps) {
  const reduceMotion = useReducedMotion();
  const source = state === "overdue"
    ? "/brand/nimbus-overdue.png"
    : "/brand/nimbus-mascot.png";
  const canMove = animated && !reduceMotion;

  return (
    <motion.span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      animate={
        !canMove
          ? undefined
          : state === "momentum"
            ? { x: [0, 22, -5, 0], y: [0, -5, 2, 0], rotate: [0, -2, 1, 0] }
            : state === "assistant"
              ? { y: [0, -2.5, 0], rotate: [0, 1.5, 0] }
              : { y: [0, -1.5, 0] }
      }
      transition={
        state === "momentum"
          ? { duration: 0.9, ease: [0.22, 1, 0.36, 1] }
          : { duration: state === "assistant" ? 2.6 : 3.4, repeat: Infinity, ease: "easeInOut" }
      }
      aria-hidden="true"
    >
      {state === "momentum" && canMove && (
        <motion.span
          className="absolute right-[72%] top-1/2 h-[2px] w-3/4 origin-right rounded-full bg-current opacity-30"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: [0, 1, 0], opacity: [0, 0.45, 0] }}
          transition={{ duration: 0.75 }}
        />
      )}
      <img
        src={source}
        alt=""
        draggable={false}
        className={cn("h-full w-full object-contain select-none", imageClassName)}
      />
    </motion.span>
  );
}
