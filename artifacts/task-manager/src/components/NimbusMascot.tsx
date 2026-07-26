import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type NimbusMascotState = "ready" | "overdue" | "momentum" | "assistant" | "sunny" | "stormy" | "foggy" | "windy" | "rainbow";

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
  sunny: "#8A79F0",
  stormy: "#393452",
  foggy: "#8B879B",
  windy: "#6C70DF",
  rainbow: "#7565E8",
};

const tailColors: Record<NimbusMascotState, string> = {
  ready: "#A99DFF",
  overdue: "#FFB84D",
  momentum: "#B9FFEA",
  assistant: "#B8AEFF",
  sunny: "#FFD166",
  stormy: "#FFD166",
  foggy: "#D8D5E4",
  windy: "#9DE8F5",
  rainbow: "#FFB4D9",
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
  const [rewardPulse, setRewardPulse] = useState(false);
  const pulseTimer = useRef<number | null>(null);
  const canMove = animated && !reduceMotion;
  const isMark = variant === "mark";

  const bodyAnimation = !canMove
    ? undefined
    : rewardPulse
      ? { scale: [1, 1.12, 0.97, 1], rotate: [0, -4, 4, 0], y: [0, -7, 0] }
    : state === "momentum"
      ? { x: [0, 15, -3, 0], y: [0, -4, 1, 0], rotate: [0, -2, 1, 0] }
      : state === "windy"
        ? { x: [0, 5, -3, 2, 0], rotate: [0, 2, -2, 1, 0] }
      : state === "stormy" || state === "overdue"
        ? { y: [0, 2, 0], scale: [1, 0.99, 1] }
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

  useEffect(() => {
    const trigger = () => {
      if (reduceMotion) return;
      setRewardPulse(true);
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(() => setRewardPulse(false), 900);
    };
    window.addEventListener("nimbus:forecast-reward", trigger);
    return () => {
      window.removeEventListener("nimbus:forecast-reward", trigger);
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    };
  }, [reduceMotion]);

  return (
    <motion.span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      animate={bodyAnimation}
      whileHover={interactive && !reduceMotion ? { scale: 1.035, rotate: state === "overdue" ? -1 : 1 } : undefined}
      whileTap={interactive && !reduceMotion ? { scale: 0.97 } : undefined}
      onPointerDown={triggerWink}
      transition={
        rewardPulse
          ? { duration: 0.8, ease: [0.22, 1, 0.36, 1] }
        : state === "momentum"
          ? { duration: 0.85, ease: [0.22, 1, 0.36, 1] }
          : { duration: state === "assistant" ? 2.8 : state === "windy" ? 1.6 : 3.6, repeat: bodyAnimation ? Infinity : 0, ease: "easeInOut" }
      }
      aria-hidden="true"
    >
      {(state === "momentum" || state === "windy") && canMove && !isMark && (
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
        <defs>
          <linearGradient id="nimbus-rainbow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8B7CF6" />
            <stop offset=".35" stopColor="#ED8FD1" />
            <stop offset=".68" stopColor="#FFD166" />
            <stop offset="1" stopColor="#72D6C5" />
          </linearGradient>
        </defs>
        <motion.path
          d="M34 86C18 86 8 76 8 62c0-13 10-24 23-26 5-17 20-29 38-29 16 0 30 9 37 23 4-2 9-3 14-3 17 0 31 13 31 30 0 16-13 29-30 29H34Z"
          fill={state === "rainbow" ? "url(#nimbus-rainbow)" : cloudColors[state]}
          animate={canMove && (state === "overdue" || state === "stormy") ? { opacity: [1, .76, 1, .9, 1], y: [0, 1.5, 0] } : undefined}
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

        {(state === "overdue" || state === "stormy") && !isMark && (
          <>
            {[52, 79, 108].map((x, index) => (
              <motion.path
                key={x}
                d={`M${x} 91v10`}
                stroke="#8EDCF0"
                strokeLinecap="round"
                strokeWidth="3"
                animate={canMove ? { y: [0, 12], opacity: [0, 1, 0] } : undefined}
                transition={{ duration: .8, repeat: Infinity, delay: index * .2 }}
              />
            ))}
            <motion.path
              d="M92 80h19L99 94h12l-34 27 10-22H75l17-19Z"
              fill="#FFD166"
              animate={canMove ? { opacity: [1, .2, 1, .35, 1] } : undefined}
              transition={{ duration: .55, repeat: Infinity, repeatDelay: 1.2 }}
            />
          </>
        )}

        {state === "foggy" && !isMark && (
          <motion.g opacity=".7" animate={canMove ? { x: [-5, 5, -5] } : undefined} transition={{ duration: 4, repeat: Infinity }}>
            <path d="M20 94h78" stroke="#D8D5E4" strokeLinecap="round" strokeWidth="5" />
            <path d="M50 106h88" stroke="#D8D5E4" strokeLinecap="round" strokeWidth="5" />
          </motion.g>
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
