import { HowItWorksCompare, HowItWorksDescribe, HowItWorksFixed, HowItWorksMatch } from "@/components/illustrations";
import { StickyScrollStory, type StoryStep } from "@/components/parallax";
import { Holo, SectionHeading } from "./section-heading";

const STEPS: readonly StoryStep[] = [
  {
    id: "step-describe",
    label: "Describe",
    title: "Describe the problem",
    body: (
      <>
        <p>
          Tell us about your car and what&rsquo;s happening, then snap the warning light or the problem area. Add up to
          five photos and a short video.
        </p>
        <p className="text-base text-fg-subtle">
          Location data is removed from every photo, and your video stays private until a booking is confirmed.
        </p>
      </>
    ),
    scene: () => <HowItWorksDescribe decorative className="w-full" />,
  },
  {
    id: "step-match",
    label: "Match",
    title: "Approved mechanics nearby are matched",
    body: (
      <>
        <p>
          We notify up to five approved mechanics who cover your ZIP code, work on your make and offer that repair.
        </p>
        <p className="text-base text-fg-subtle">
          Distances are approximate, measured between ZIP areas. If nobody covers your request, you&rsquo;ll see that
          straight away instead of a made-up match.
        </p>
      </>
    ),
    scene: () => <HowItWorksMatch decorative className="w-full" />,
  },
  {
    id: "step-compare",
    label: "Compare",
    title: "Compare itemized quotes",
    body: (
      <>
        <p>
          Each quote lists parts, labor and tax on separate lines, with what&rsquo;s included, a time slot, the
          estimated duration and when it expires. Compare like for like and pick the one that suits you.
        </p>
        <p className="text-base text-fg-subtle">Mechanics without completed reviews show as &ldquo;New&rdquo;.</p>
      </>
    ),
    scene: () => <HowItWorksCompare decorative className="w-full" />,
  },
  {
    id: "step-fixed",
    label: "Reserve",
    title: "Reserve your slot and get it fixed",
    body: (
      <>
        <p>
          Choose the quote and time to reserve it. The mechanic comes to you or you visit their garage, and any extra
          work needs your approval first.
        </p>
        <p className="text-base text-fg-subtle">
          Online payments are coming soon, so for now a reservation stays &ldquo;pending payment&rdquo; and no card is
          charged.
        </p>
      </>
    ),
    scene: () => <HowItWorksFixed decorative className="w-full" />,
  },
];

/** "How it works": pinned scroll story with four layered scenes. */
export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-title" className="relative scroll-mt-16 pt-14 pb-10 sm:pt-20 sm:pb-16">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          id="how-it-works-title"
          eyebrow="How it works"
          title={
            <>
              From warning light to <Holo>fixed</Holo>, in four steps
            </>
          }
          description="Every booking starts from a quote you have reviewed. Here is the whole journey."
        />
        <StickyScrollStory label="How WrenchMatch works" steps={STEPS} className="mt-14 sm:mt-16" />
      </div>
    </section>
  );
}
