import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

// Server-safe entrance animations (pure CSS, no JavaScript): they play at first paint and
// whenever the element mounts after a client-side navigation, never hide content without
// JavaScript, and collapse to the final state under prefers-reduced-motion.

export type EntranceTag =
  | "div"
  | "section"
  | "article"
  | "aside"
  | "header"
  | "footer"
  | "li"
  | "ul"
  | "ol"
  | "span"
  | "p"
  | "figure";

export type EntranceProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  as?: EntranceTag;
  /** Delay in seconds (like Motion). */
  delay?: number;
  /** Duration in seconds. */
  duration?: number;
  /** Reveal while scrolling into view (CSS scroll timeline) instead of on mount. */
  inView?: boolean;
  children?: ReactNode;
};

function Entrance({
  as: Tag = "div",
  delay,
  duration,
  inView = false,
  animation,
  revealClass,
  className,
  style,
  children,
  ...rest
}: EntranceProps & { animation: string; revealClass: string }) {
  const timing: CSSProperties = inView
    ? {}
    : {
        ...(delay ? { animationDelay: `${delay}s` } : {}),
        ...(duration ? { animationDuration: `${duration}s` } : {}),
      };
  return (
    <Tag {...rest} data-reveal="" className={cn(inView ? revealClass : animation, className)} style={{ ...timing, ...style }}>
      {children}
    </Tag>
  );
}

/** Fades in. */
export function FadeIn(props: EntranceProps) {
  return <Entrance {...props} animation="animate-fade-in" revealClass="reveal" />;
}

/** Fades in while rising 18px. */
export function SlideUp(props: EntranceProps) {
  return <Entrance {...props} animation="animate-slide-up" revealClass="reveal" />;
}

/** Fades in while scaling up from 94%. */
export function ScaleIn(props: EntranceProps) {
  return <Entrance {...props} animation="animate-scale-in" revealClass="reveal-scale" />;
}
