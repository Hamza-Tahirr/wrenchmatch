import { ArrowRight, BadgeCheck, CalendarClock, Images, MapPinned } from "lucide-react";

import { MechanicsScene } from "@/components/illustrations";
import { LazyMount, ParallaxScene, PointerTracker, Tilt } from "@/components/parallax";
import { ButtonLink } from "@/components/ui/button-link";
import { Holo, SectionHeading } from "./section-heading";

const POINTS = [
  { icon: MapPinned, text: "Get requests that match your services, the makes you work on and your travel radius." },
  { icon: CalendarClock, text: "Set your own prices and availability, and quote only the jobs you want." },
  { icon: Images, text: "Show a gallery of your recent work to customers you quote." },
  { icon: BadgeCheck, text: "Customer contact details are shared once a booking is confirmed." },
] as const;

/** "For mechanics": parallax garage scene with the pitch beside it. */
export function ForMechanics() {
  return (
    <section id="for-mechanics" aria-labelledby="mechanics-title" className="relative py-16 sm:py-24">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16 lg:px-8">
        <PointerTracker className="order-2 lg:order-1">
          <ParallaxScene travel={0.3} className="reveal-scale">
            <Tilt max={4}>
              <div className="overflow-hidden rounded-[2rem] border border-line bg-[radial-gradient(90%_80%_at_65%_25%,rgba(139,92,246,0.22),transparent_65%),linear-gradient(180deg,#0b1233,#04060f)] shadow-[0_40px_120px_-50px_rgba(139,92,246,0.6)]">
                <LazyMount
                  className="aspect-[4/3]"
                  label="A mechanic with a holographic job board in a futuristic garage: a car on a glowing lift, a lit tool wall and a floating board of matched repair jobs with approximate distances."
                >
                  <MechanicsScene decorative className="w-full" />
                </LazyMount>
              </div>
            </Tilt>
          </ParallaxScene>
        </PointerTracker>
        <div className="order-1 lg:order-2">
          <SectionHeading
            id="mechanics-title"
            eyebrow="For mechanics"
            title={
              <>
                Quote the jobs <Holo>you want</Holo>
              </>
            }
            description="Apply once, get approved by our team, and receive repair requests that fit your skills and area."
          />
          <ul className="stagger-reveal mt-8 space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3.5 text-fg-muted">
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-neon-violet/12 text-neon-violet ring-1 ring-neon-violet/30">
                  <Icon className="size-4" />
                </span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>
          <div className="reveal mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <ButtonLink href="/signup?role=mechanic" size="lg" trailingIcon={<ArrowRight />} className="shrink-0 whitespace-nowrap">
              Apply as a mechanic
            </ButtonLink>
            <p className="text-sm text-fg-subtle">Every application is reviewed by hand. Payouts are coming soon.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
