import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type NimbusMascotState = "ready" | "overdue" | "momentum" | "assistant";

type NimbusMascotProps = {
  state?: NimbusMascotState;
  variant?: "mark" | "mascot";
  className?: string;
  imageClassName?: string;
  animated?: boolean;
  interactive?: boolean;
};

const cloudColors: Record<NimbusMascotState, string> = {
  ready: "#7565E8",
  overdue: "#665BA9",
  momentum: "#7565E8",
  assistant: "#5F51CA",
};

const tailColors: Record<NimbusMascotState, string> = {
  ready: "#A99DFF",
  overdue: "#FFB84D",
  momentum: "#B9FFEA",
  assistant: "#B8AEFF",
};

export function NimbusMascot({
  state = "ready",
  variant = "mascot",
  className,
  imageClassName,
  animated = true,
  interactive = true,
}: NimbusMascotProps) {
  const reduceMotion = useReducedMotion();
  const [wink, setWink] = useState(false);
  const canMove = animated && !reduceMotion;
  const isMark = variant === "mark";

  const bodyAnimation = !canMove
    ? undefined
    : state === "momentum"
      ? { x: [0, 15, -3, 0], y: [0, -4, 1, 0], rotate: [0, -2, 1, 0] }
      : state === "assistant"
        ? { y: [0, -2.5, 0], rotate: [0, 1, 0] }
        : isMark
          ? undefined
          : { y: [0, -1.5, 0] };

  const eyeScale = state === "momentum" ? 0.58 : state === "overdue" ? 0.72 : 1;
  const eyeShift = state === "assistant" ? 2.5 : state === "momentum" ? 3 : 0;

  function triggerWink() {
    if (!interactive || reduceMotion) return;
    setWink(true);
    window.setTimeout(() => setWink(false), 360);
  }

  return (
    <motion.span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      animate={bodyAnimation}
      whileHover={interactive && !reduceMotion ? { scale: 1.035, rotate: state === "overdue" ? -1 : 1 } : undefined}
      whileTap={interactive && !reduceMotion ? { scale: 0.97 } : undefined}
      onPointerDown={triggerWink}
      transition={
        state === "momentum"
          ? { duration: 0.85, ease: [0.22, 1, 0.36, 1] }
          : { duration: state === "assistant" ? 2.8 : 3.6, repeat: bodyAnimation ? Infinity : 0, ease: "easeInOut" }
      }
      aria-hidden="true"
    >
      {state === "momentum" && canMove && !isMark && (
        <motion.svg
          viewBox="0 0 72 42"
          className="absolute right-[77%] top-[32%] h-[38%] w-[56%] overflow-visible text-[#8f80f2]"
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: [0, 0.55, 0], x: [18, 0, -8] }}
          transition={{ duration: 0.72, repeat: Infinity, repeatDelay: 1.7 }}
        >
          <path d="M68 7H24M56 20H8M65 33H31" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
        </motion.svg>
      )}

      <svg
        viewBox="0 0 160 118"
        role="presentation"
        focusable="false"
        className={cn("h-full w-full overflow-visible select-none", imageClassName)}
      >
        <motion.path
          d="M34 86C18 86 8 76 8 62c0-13 10-24 23-26 5-17 20-29 38-29 16 0 30 9 37 23 4-2 9-3 14-3 17 0 31 13 31 30 0 16-13 29-30 29H34Z"
          fill={cloudColors[state]}
          animate={canMove && state === "overdue" ? { y: [0, 1.5, 0] } : undefined}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <path
          d="M91 80h20L99 94h12l-34 27 10-22H75l16-19Z"
          fill={tailColors[state]}
          stroke={cloudColors[state]}
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path d="M31 51c8-22 25-34 48-35" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="5" opacity=".13" />

        {state === "overdue" && (
          <>
            <path d="m54 47 19 5" fill="none" stroke="#211D36" strokeLinecap="round" strokeWidth="4" />
            <path d="m111 47-19 5" fill="none" stroke="#211D36" strokeLinecap="round" strokeWidth="4" />
          </>
        )}

        <motion.g
          animate={canMove && state === "assistant" ? { x: [0, eyeShift, -1, 0] } : { x: eyeShift }}
          transition={{ duration: 3.2, repeat: canMove && state === "assistant" ? Infinity : 0, ease: "easeInOut" }}
        >
          <motion.ellipse
            cx="66"
            cy="62"
            rx="8.5"
            ry="13"
            fill="#171522"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            animate={
              wink
                ? { scaleY: 0.08 }
                : canMove
                  ? { scaleY: [eyeScale, eyeScale, 0.08, eyeScale, eyeScale] }
                  : { scaleY: eyeScale }
            }
            transition={wink ? { duration: 0.12 } : { duration: 5.2, repeat: Infinity, times: [0, 0.44, 0.46, 0.49, 1] }}
          />
          <motion.ellipse
            cx="99"
            cy="62"
            rx="8.5"
            ry="13"
            fill="#171522"
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            animate={
              canMove
                ? { scaleY: [eyeScale, eyeScale, 0.08, eyeScale, eyeScale] }
                : { scaleY: eyeScale }
            }
            transition={{ duration: 5.2, repeat: canMove ? Infinity : 0, times: [0, 0.44, 0.46, 0.49, 1] }}
          />
        </motion.g>

        {state === "assistant" && !isMark && (
          <motion.circle
            cx="130"
            cy="38"
            r="5"
            fill="#B9FFEA"
            animate={canMove ? { opacity: [0.35, 1, 0.35], scale: [0.85, 1.15, 0.85] } : undefined}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </svg>
    </motion.span>
  );
}
