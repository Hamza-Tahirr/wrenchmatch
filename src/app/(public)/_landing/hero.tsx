import { ArrowDown, ArrowRight, BadgeCheck, Clock3, LockKeyhole } from "lucide-react";

import { HeroScene } from "@/components/illustrations";
import { ParallaxScene, PointerTracker, Tilt } from "@/components/parallax";
import { ButtonLink } from "@/components/ui/button-link";
import { JumpLink } from "@/components/ui/jump-link";
import { cn } from "@/lib/cn";
import styles from "./landing.module.css";

const HEADLINE: ReadonlyArray<{ text: string; holo?: boolean }> = [
  { text: "Itemized" },
  { text: "repair" },
  { text: "quotes" },
  { text: "from" },
  { text: "approved", holo: true },
  { text: "mechanics", holo: true },
  { text: "near" },
  { text: "you." },
];

const PROMISES = [
  { icon: BadgeCheck, label: "Mechanics approved by hand" },
  { icon: LockKeyhole, label: "Contact details private until booking" },
  { icon: Clock3, label: "Online payments coming soon" },
] as const;

/**
 * Cinematic landing hero. CSS gradients and the headline paint first (the headline only
 * animates transform, so it stays the LCP element); the layered art fades in, drifts with
 * the scroll and leans toward the mouse.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <PointerTracker className="relative flex flex-col lg:grid lg:min-h-[min(calc(100svh-4rem),60rem)] lg:items-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70rem_40rem_at_78%_10%,rgba(124,92,255,0.22),transparent_60%),radial-gradient(50rem_32rem_at_10%_0%,rgba(34,211,238,0.16),transparent_62%)]"
        />
        {/* Aurora glow and a faint animated HUD grid behind the headline (above the scrim, below the text). */}
        <div aria-hidden="true" className="aurora pointer-events-none absolute inset-y-0 left-0 -z-10 w-full opacity-60 lg:z-[6] lg:w-[60%]" />
        <div aria-hidden="true" className="grid-bg pointer-events-none absolute inset-y-0 left-0 -z-10 w-full opacity-90 lg:z-[6] lg:w-[56%]" />
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:py-16">
          <div className={cn(styles.copy, "max-w-xl lg:max-w-[30rem] xl:max-w-[35rem] 2xl:max-w-[38rem]")}>
            <p className={cn(styles.fadeUp, "inline-flex items-center gap-2.5 rounded-full border border-line-strong bg-surface/70 px-3.5 py-1.5 text-sm font-medium text-fg-muted backdrop-blur-md")}>
              <span className="relative flex size-2.5" aria-hidden="true">
                <span className={cn(styles.ping, "absolute inline-flex size-full rounded-full bg-neon-cyan opacity-70")} />
                <span className="relative inline-flex size-2.5 rounded-full bg-neon-cyan" />
              </span>
              Now piloting in select ZIP codes
            </p>
            <h1
              id="hero-title"
              className="mt-6 font-display text-[2.6rem] leading-[1.04] font-semibold tracking-[-0.03em] text-fg sm:text-6xl lg:text-[3.3rem] xl:text-[3.75rem] 2xl:text-[4.25rem]"
            >
              {HEADLINE.map((word, index) => (
                <span key={word.text}>
                  <span className={styles.word}>
                    <span
                      className={cn(styles.wordInner, word.holo && "holo-text")}
                      style={{ animationDelay: `${80 + index * 70}ms` }}
                    >
                      {word.text}
                    </span>
                  </span>
                  {index < HEADLINE.length - 1 ? " " : null}
                </span>
              ))}
            </h1>
            <p
              className={cn(styles.fadeUp, "mt-6 max-w-lg text-lg/8 text-fg-muted xl:text-xl/8")}
              style={{ animationDelay: "420ms" }}
            >
              Describe what&rsquo;s wrong, add photos or a short video, and compare quotes from approved mechanics
              nearby, with parts, labor and tax on separate lines.
            </p>
            <div
              id="hero-cta"
              className={cn(styles.fadeUp, "mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4")}
              style={{ animationDelay: "540ms" }}
            >
              <ButtonLink href="/request" size="lg" trailingIcon={<ArrowRight />} className="sm:min-w-52">
                Find a Mechanic
              </ButtonLink>
              <JumpLink href="#how-it-works" size="lg" variant="secondary" trailingIcon={<ArrowDown />}>
                How it works
              </JumpLink>
            </div>
            <ul
              className={cn(styles.fadeUp, "mt-7 flex flex-wrap gap-x-5 gap-y-2.5 text-sm text-fg-muted")}
              style={{ animationDelay: "660ms" }}
            >
              {PROMISES.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2.5">
                  <span className="grid size-6 place-items-center rounded-md bg-neon-cyan/10 text-neon-cyan ring-1 ring-neon-cyan/25">
                    <Icon aria-hidden="true" className="size-3.5" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Readability scrim between the art and the text on large screens (dark theme). */}
        <div
          aria-hidden="true"
          className={cn(
            styles.scrim,
            "pointer-events-none absolute inset-y-0 left-0 z-[5] w-[62%] bg-[linear-gradient(90deg,var(--color-canvas)_0%,color-mix(in_oklab,var(--color-canvas)_82%,transparent)_42%,transparent_100%)]",
          )}
        />

        {/* The art drifts by depth as the hero scrolls (compositor-driven; still under reduced motion). */}
        <div className={styles.artFrame}>
          <ParallaxScene anchor="top" track="section" travel={0.42} className={cn("pointer-events-none", styles.art)}>
            <div className={styles.artIn}>
              <Tilt max={2.5}>
                <HeroScene />
              </Tilt>
            </div>
          </ParallaxScene>
        </div>
      </PointerTracker>
    </section>
  );
}
