"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { m, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";

import { cn } from "@/lib/cn";
import { ParallaxContext, useIsClient, useMediaQuery, type ParallaxContextValue, type ParallaxEntrance } from "./context";
import { useMotionFactor } from "./parallax-scene";
import { useScrollActivity } from "./scroll-activity";

type StoryContextValue = {
  count: number;
  active: number;
  setActive: (index: number) => void;
  progress: MotionValue<number>;
  factor: MotionValue<number>;
};

const StoryContext = createContext<StoryContextValue | null>(null);

function useStory(): StoryContextValue {
  const story = useContext(StoryContext);
  if (!story) throw new Error("Story parts must be rendered inside <StickyScrollStory>.");
  return story;
}

/** Holds the active step and the story's scroll progress (0 → 1 across all steps). */
export function StoryRoot({ count, className, children }: { count: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start center", "end center"] });
  const factor = useMotionFactor();
  useScrollActivity();
  const value = useMemo<StoryContextValue>(
    () => ({ count, active, setActive, progress: scrollYProgress, factor }),
    [count, active, scrollYProgress, factor],
  );
  return (
    <StoryContext.Provider value={value}>
      <div ref={ref} className={cn("relative", className)}>
        {children}
      </div>
    </StoryContext.Provider>
  );
}

/** One step of the story: becomes active when it crosses the middle of the viewport. */
export function StoryStepItem({
  index,
  id,
  className,
  children,
}: {
  index: number;
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const { active, setActive } = useStory();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(index);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [index, setActive]);

  return (
    <li ref={ref} id={id} data-active={active === index} className={className}>
      {children}
    </li>
  );
}

/** The pinned layout's media query: large screens with motion allowed. */
const PINNED_LAYOUT = "(min-width: 64rem) and (prefers-reduced-motion: no-preference)";

/**
 * Renders its children only where the pinned story layout is shown (client side, after
 * hydration), so phones never run the rail's spring or the panel's scene transforms.
 */
export function StoryDesktopOnly({ children }: { children: ReactNode }) {
  return useMediaQuery(PINNED_LAYOUT) ? children : null;
}

/** Vertical rail beside the steps; its glowing fill follows the scroll (pinned layout only). */
export function StoryRail({ className }: { className?: string }) {
  return (
    <StoryDesktopOnly>
      <StoryRailFill className={className} />
    </StoryDesktopOnly>
  );
}

function StoryRailFill({ className }: { className?: string }) {
  const { progress, factor } = useStory();
  const smooth = useSpring(progress, { stiffness: 120, damping: 24, mass: 0.4 });
  // Under reduced motion the rail is hidden by CSS; keep the value static anyway.
  const scaleY = useTransform(() => (factor.get() ? Math.min(1, Math.max(0, smooth.get())) : 1));
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute top-0 bottom-0 w-px", className)}>
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-line-strong to-transparent" />
      <m.div
        className="absolute inset-0 origin-top bg-linear-to-b from-neon-cyan via-neon-blue to-neon-violet shadow-[0_0_12px_2px_color-mix(in_oklab,var(--color-neon-cyan)_55%,transparent)]"
        style={{ scaleY }}
      />
    </div>
  );
}

/** Step number bubble; glows while its step is active. */
export function StoryMarker({ index, className }: { index: number; className?: string }) {
  const { active } = useStory();
  const state = active === index ? "active" : index < active ? "done" : "todo";
  return (
    <span
      aria-hidden="true"
      data-state={state}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full border font-mono text-sm font-semibold tabular-nums transition-[background-color,border-color,color,box-shadow] duration-300",
        "border-line-strong bg-surface text-fg-subtle",
        "data-[state=done]:border-neon-cyan/50 data-[state=done]:text-brand-800",
        "data-[state=active]:border-neon-cyan data-[state=active]:bg-neon-cyan data-[state=active]:text-on-brand data-[state=active]:shadow-[0_0_0_6px_color-mix(in_oklab,var(--color-neon-cyan)_16%,transparent),0_0_24px_color-mix(in_oklab,var(--color-neon-cyan)_55%,transparent)]",
        className,
      )}
    >
      {String(index + 1).padStart(2, "0")}
    </span>
  );
}

/** Sticky stage that holds the step scenes on large screens. */
export function StoryPanel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("sticky", className)}>{children}</div>;
}

/** One step's scene inside the panel: cross-fades/slides in, and its layers drift by depth. */
export function StoryScene({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  const { active, count, progress, factor } = useStory();
  const ready = useIsClient();
  const local = useTransform(() => Math.min(1, Math.max(0, progress.get() * count - index)));
  const parallax = useMemo<ParallaxContextValue>(
    () => ({ progress: local, rest: 0.5, distance: 110, factor, ready }),
    [local, factor, ready],
  );
  const state = active === index ? "active" : index < active ? "before" : "after";
  return (
    <ParallaxContext.Provider value={parallax}>
      <div
        data-state={state}
        className={cn(
          "absolute inset-0 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity,transform]",
          "data-[state=active]:translate-y-0 data-[state=active]:scale-100 data-[state=active]:opacity-100",
          "data-[state=before]:-translate-y-10 data-[state=before]:scale-[0.96] data-[state=before]:opacity-0",
          "data-[state=after]:translate-y-10 data-[state=after]:scale-[0.96] data-[state=after]:opacity-0",
          className,
        )}
      >
        {children}
      </div>
    </ParallaxContext.Provider>
  );
}

/** Layered entrance of a phone story scene: backdrop first, floating cards last. */
const INLINE_ENTRANCE: ParallaxEntrance = { start: 0.03, stagger: 0.09, span: 0.2 };

/**
 * A step's scene card in the list layout (phones and tablets): as it scrolls in, the card
 * rises and scales up while its layers arrive one depth at a time (backdrop, then the
 * middle ground, then the floating cards), and afterwards they keep drifting by depth.
 * Driven by the card's own scroll position on a native scroll timeline where available;
 * still under reduced motion.
 */
export function StoryInlineStage({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const factor = useMotionFactor();
  const ready = useIsClient();
  const reduce = useReducedMotion();
  const parallax = useMemo<ParallaxContextValue>(
    () => ({ progress: scrollYProgress, rest: 0.5, distance: 0, travel: 0.14, factor, ready, entrance: INLINE_ENTRANCE }),
    [scrollYProgress, factor, ready],
  );
  const transform = useTransform(
    scrollYProgress,
    [0, 0.03, 0.14, 0.3, 1],
    ["translateY(36px) scale(0.92)", "translateY(36px) scale(0.92)", "translateY(9px) scale(0.98)", "translateY(0px) scale(1)", "translateY(0px) scale(1)"],
  );
  const opacity = useTransform(scrollYProgress, [0, 0.03, 0.14, 0.26, 1], [0.2, 0.2, 0.8, 1, 1]);
  const moving = ready && reduce !== true;
  return (
    <ParallaxContext.Provider value={parallax}>
      <m.div
        ref={ref}
        className={cn("relative", moving && "will-change-transform", className)}
        style={moving ? { transform, opacity } : undefined}
      >
        {children}
      </m.div>
    </ParallaxContext.Provider>
  );
}

/** "01 / 04" counter with a segmented progress bar for the panel. */
export function StoryCounter({ labels, className }: { labels: readonly string[]; className?: string }) {
  const { active, count } = useStory();
  return (
    <div aria-hidden="true" className={cn("flex items-center gap-4", className)}>
      <span className="font-mono text-xs tracking-[0.2em] text-[#a5f3fc] tabular-nums">
        {String(active + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
      </span>
      <span className="flex flex-1 gap-1.5">
        {labels.map((label, index) => (
          <span
            key={label}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-500",
              index <= active ? "bg-linear-to-r from-[#67e8f9] to-[#a78bfa]" : "bg-[rgba(196,210,255,0.22)]",
            )}
          />
        ))}
      </span>
      <span className="min-w-0 truncate text-xs font-medium text-[#c3cdf0]">{labels[active]}</span>
    </div>
  );
}
