// Motion kit. Per-file imports work too (e.g. "@/components/motion/entrance").
// Server-safe (CSS only): FadeIn, SlideUp, ScaleIn, Stagger, StaggerItem, AnimatedCheck.
// Client components: MotionProvider (root layout only), InView, AnimatedNumber, PresenceSwap,
// GlowCard, TiltCard, PageTransition (src/app/template.tsx only).

export { AmbientPauser } from "./ambient-pauser";
export { AnimatedCheck } from "./animated-check";
export { AnimatedNumber, type AnimatedNumberFormat } from "./animated-number";
export { FadeIn, ScaleIn, SlideUp, type EntranceProps, type EntranceTag } from "./entrance";
export { GlowCard, TiltCard } from "./glow-card";
export { InView, type InViewVariant } from "./in-view";
export { MotionProvider } from "./motion-provider";
export { PresenceSwap } from "./presence-swap";
export { Stagger, StaggerItem } from "./stagger";
