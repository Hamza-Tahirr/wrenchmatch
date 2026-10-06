import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { LazyMount } from "./lazy-mount";
import {
  StoryCounter,
  StoryDesktopOnly,
  StoryInlineStage,
  StoryMarker,
  StoryPanel,
  StoryRail,
  StoryRoot,
  StoryScene,
  StoryStepItem,
} from "./story-client";

export type StoryStep = {
  /** Anchor id of the step (`#step-compare`). */
  id: string;
  title: string;
  body: ReactNode;
  /** Short label for the step chip and the panel counter; defaults to the title. */
  label?: string;
  /**
   * Returns the step's illustration. Called twice ("panel" for the pinned stage on large
   * screens, "inline" for the list layout) so each copy gets its own SVG ids. Only the copy
   * the current layout shows is ever mounted, when it nears the viewport.
   */
  scene: (variant: "panel" | "inline") => ReactNode;
};

export type StickyScrollStoryProps = {
  steps: readonly StoryStep[];
  /** Accessible name of the step list. */
  label: string;
  /** Heading level of the step titles. Default 3. */
  headingLevel?: 2 | 3;
  className?: string;
};

/** Dark stage behind a scene (also the placeholder until the art mounts). */
const STAGE =
  "bg-[radial-gradient(120%_90%_at_60%_10%,rgba(56,189,248,0.16),transparent_60%),radial-gradient(90%_80%_at_20%_100%,rgba(139,92,246,0.18),transparent_65%),linear-gradient(180deg,#0b1233,#050817)]";

/**
 * "How it works" scroll story.
 *
 * - Large screens (motion allowed): the scene panel stays pinned while the steps scroll past;
 *   scenes cross-fade and slide, their layers drift by depth, a glowing rail marks progress.
 * - Phones and tablets: a vertical story. Each step's label leads, then its scene card rises
 *   into view with layered depth (backdrop, middle ground, then the floating cards) and keeps
 *   drifting while it stays on screen, then the text.
 * - Reduced motion: a calm list (two columns on large screens) with still scenes.
 *
 * Native scrolling only (no scroll-jacking); the steps are a semantic <ol>. The art is
 * decorative and lazily mounted, so it stays out of the server HTML.
 */
export function StickyScrollStory({ steps, label, headingLevel = 3, className }: StickyScrollStoryProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <StoryRoot count={steps.length} className={className}>
      <div className="lg:motion-safe:grid lg:motion-safe:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:motion-safe:gap-14 xl:motion-safe:gap-20">
        <div className="relative">
          <StoryRail className="left-5 hidden lg:motion-safe:block" />
          <ol aria-label={label} className="space-y-16 sm:space-y-20 lg:motion-safe:space-y-0">
            {steps.map((step, index) => (
              <StoryStepItem
                key={step.id}
                index={index}
                id={step.id}
                className={cn(
                  "group/step relative scroll-mt-24",
                  "lg:motion-reduce:grid lg:motion-reduce:grid-cols-2 lg:motion-reduce:items-center lg:motion-reduce:gap-12",
                  "lg:motion-safe:flex lg:motion-safe:min-h-[78vh] lg:motion-safe:items-center lg:motion-safe:pl-16",
                  index === 0 && "lg:motion-safe:min-h-[64vh] lg:motion-safe:items-start lg:motion-safe:pt-[12vh]",
                )}
              >
                {/* Phones and tablets: the step chip leads, above its scene. */}
                <div aria-hidden="true" className="mb-4 flex items-center gap-3 lg:hidden">
                  <StoryMarker index={index} />
                  <span className="font-mono text-xs font-semibold tracking-[0.2em] text-brand-800 uppercase">
                    Step {index + 1}
                    <span className="text-fg-subtle"> · {step.label ?? step.title}</span>
                  </span>
                  <span className="h-px min-w-6 flex-1 bg-linear-to-r from-line-strong to-transparent" />
                </div>
                <StoryInlineStage
                  className={cn(
                    "mb-6 overflow-hidden rounded-[1.75rem] border border-line shadow-[0_30px_70px_-40px_rgba(34,211,238,0.5)] lg:motion-safe:hidden lg:motion-reduce:mb-0 lg:motion-reduce:[grid-column:2] lg:motion-reduce:[grid-row:1]",
                    STAGE,
                  )}
                >
                  <LazyMount className="aspect-[5/4]">{step.scene("inline")}</LazyMount>
                </StoryInlineStage>
                <div className="relative lg:motion-reduce:[grid-column:1] lg:motion-reduce:[grid-row:1]">
                  <div className="hidden items-center gap-3 lg:flex lg:motion-safe:absolute lg:motion-safe:top-0 lg:motion-safe:-left-16">
                    <StoryMarker index={index} />
                    <span
                      aria-hidden="true"
                      className="font-mono text-xs font-semibold tracking-[0.22em] text-brand-800 uppercase lg:motion-safe:hidden"
                    >
                      Step {index + 1}
                    </span>
                  </div>
                  <div className="lg:motion-reduce:mt-4 lg:motion-safe:opacity-75 lg:motion-safe:transition-opacity lg:motion-safe:duration-500 lg:motion-safe:group-data-[active=true]/step:opacity-100">
                    <Heading className="text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">
                      <span className="sr-only">Step {index + 1}: </span>
                      {step.title}
                    </Heading>
                    <div className="mt-4 space-y-3 text-base/7 text-pretty text-fg-muted sm:text-lg/8">{step.body}</div>
                  </div>
                </div>
              </StoryStepItem>
            ))}
          </ol>
        </div>
        <div aria-hidden="true" className="hidden lg:motion-safe:block">
          <StoryPanel className="top-[max(5.5rem,calc(50vh-19rem))]">
            <div className="relative overflow-hidden rounded-[2rem] border border-line bg-[radial-gradient(120%_90%_at_70%_0%,rgba(56,189,248,0.14),transparent_60%),linear-gradient(180deg,#0a1130,#050817)] p-3 shadow-[0_40px_120px_-50px_rgba(56,189,248,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className={cn("relative aspect-[5/4] w-full overflow-hidden rounded-[1.4rem]", STAGE)}>
                <StoryDesktopOnly>
                  {steps.map((step, index) => (
                    <StoryScene key={step.id} index={index}>
                      <LazyMount className="size-full" rootMargin="60% 0px">
                        {step.scene("panel")}
                      </LazyMount>
                    </StoryScene>
                  ))}
                </StoryDesktopOnly>
              </div>
              <StoryCounter labels={steps.map((step) => step.label ?? step.title)} className="relative px-3 pt-3.5 pb-2" />
            </div>
          </StoryPanel>
        </div>
      </div>
    </StoryRoot>
  );
}
