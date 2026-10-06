import type { ReactNode } from "react";

import { GlowCard } from "@/components/motion/glow-card";
import { cn } from "@/lib/cn";

import { CountUp } from "../../_components/count-up";
import { HudLabel } from "../../_components/hud";
import { BoardTabLink } from "./board-shell";
import type { BoardTab } from "./board-tab-keys";

export type BoardStat = {
  tab: BoardTab;
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
  tone: "cyan" | "violet" | "blue" | "success";
};

const TONES = {
  cyan: { icon: "text-neon-cyan bg-neon-cyan/10 ring-neon-cyan/30", bar: "from-neon-cyan" },
  violet: { icon: "text-neon-violet bg-neon-violet/10 ring-neon-violet/30", bar: "from-neon-violet" },
  blue: { icon: "text-neon-blue bg-neon-blue/10 ring-neon-blue/30", bar: "from-neon-blue" },
  success: { icon: "text-success-600 bg-success-600/10 ring-success-600/30", bar: "from-success-600" },
} as const;

/**
 * Counters that count up on arrival; each opens its view of the board in place. Phones get
 * compact tiles (icon, number, label) so the map and the jobs come into view sooner; from
 * `sm` the label sits on top with the hint under the number.
 */
export function BoardStats({ stats }: { stats: readonly BoardStat[] }) {
  return (
    <ul aria-label="Summary" className="stagger-children grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
      {stats.map((stat) => {
        const tone = TONES[stat.tone];
        return (
          <GlowCard as="li" key={stat.tab} tilt maxTilt={5} className="glass-lite card-hover rounded-2xl">
            <BoardTabLink
              tab={stat.tab}
              aria-label={`${stat.label}: ${stat.value}. Show this view.`}
              className="group relative grid h-full min-h-16 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 overflow-hidden rounded-2xl p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-y-2 sm:p-5"
            >
              <span aria-hidden="true" className={cn("absolute inset-x-0 bottom-0 h-px bg-gradient-to-r to-transparent opacity-70", tone.bar)} />
              <span
                aria-hidden="true"
                className={cn(
                  "row-span-2 grid size-9 shrink-0 place-items-center rounded-xl ring-1 [&_svg]:size-4 sm:col-start-2 sm:row-span-1 sm:row-start-1 sm:[&_svg]:size-[1.1rem]",
                  tone.icon,
                )}
              >
                {stat.icon}
              </span>
              <span
                aria-hidden="true"
                className="col-start-2 row-start-1 block font-display text-2xl leading-none font-semibold tracking-tight text-fg sm:col-span-2 sm:col-start-1 sm:row-start-2 sm:text-4xl sm:leading-tight"
              >
                <CountUp value={stat.value} />
              </span>
              <HudLabel
                tone="muted"
                className="col-start-2 row-start-2 mt-1 block min-w-0 leading-4 tracking-[0.08em] break-words sm:col-start-1 sm:row-start-1 sm:mt-0 sm:leading-5 sm:tracking-[0.18em]"
              >
                {stat.label}
              </HudLabel>
              <span aria-hidden="true" className="hidden text-xs text-fg-subtle sm:col-span-2 sm:row-start-3 sm:-mt-1 sm:block">
                {stat.hint}
              </span>
            </BoardTabLink>
          </GlowCard>
        );
      })}
    </ul>
  );
}
