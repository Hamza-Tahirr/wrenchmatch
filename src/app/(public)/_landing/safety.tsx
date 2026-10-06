import { ShieldCheck, ShieldAlert, FileBadge } from "lucide-react";

import { SafetyScene } from "@/components/illustrations";
import { LazyMount, ParallaxScene } from "@/components/parallax";
import { Holo, SectionHeading } from "./section-heading";

const RULES = [
  {
    icon: ShieldCheck,
    title: "Brakes and suspension are gated",
    body: "These requests only go to mechanics an admin has specifically approved for safety-critical work.",
  },
  {
    icon: FileBadge,
    title: "Insurance on record",
    body: "Mechanics add their insurance details when they apply. Anyone whose recorded insurance has expired is left out of matching.",
  },
  {
    icon: ShieldAlert,
    title: "Help when something's wrong",
    body: "Raise a help or dispute request from your booking, and our team reviews it.",
  },
] as const;

/** Safety section: spinning brake disc and shield art with the rules beside it. */
export function Safety() {
  return (
    <section aria-labelledby="safety-title" className="relative isolate overflow-hidden py-16 sm:py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50rem_30rem_at_20%_50%,rgba(251,146,60,0.12),transparent_65%),radial-gradient(40rem_26rem_at_85%_40%,rgba(52,211,153,0.10),transparent_65%)]"
      />
      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <div>
          <SectionHeading
            id="safety-title"
            eyebrow="Safety first"
            title={
              <>
                Safety-critical work goes to <Holo>approved hands</Holo>
              </>
            }
          />
          <ul className="stagger-reveal mt-8 space-y-6">
            {RULES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-success-600/12 text-success-600 ring-1 ring-success-600/30">
                  <Icon className="size-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-fg">{title}</h3>
                  <p className="mt-1 text-fg-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <ParallaxScene travel={0.32} className="reveal-scale mx-auto w-full max-w-xl">
          <div className="overflow-hidden rounded-[2rem] border border-line bg-[radial-gradient(80%_70%_at_35%_55%,rgba(251,146,60,0.16),transparent_65%),linear-gradient(180deg,#0b1233,#04060f)] shadow-[0_40px_120px_-55px_rgba(52,211,153,0.45)]">
            <LazyMount
              className="aspect-[5/4]"
              label="A drilled brake disc glowing hot at one edge inside a violet caliper, beside an emerald shield with chips reading Brakes and Suspension, gated."
            >
              <SafetyScene decorative className="w-full" />
            </LazyMount>
          </div>
        </ParallaxScene>
      </div>
    </section>
  );
}
