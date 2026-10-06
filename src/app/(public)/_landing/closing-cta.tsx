import { ArrowRight, Wrench } from "lucide-react";

import { ButtonLink } from "@/components/ui/button-link";
import { cn } from "@/lib/cn";
import styles from "./landing.module.css";

/** Closing call to action band with a slowly orbiting conic light. */
export function ClosingCta() {
  return (
    <section aria-labelledby="cta-title" className="relative pt-8 pb-24 sm:pb-32">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="glow-border reveal-scale relative isolate overflow-hidden rounded-[2.25rem] px-6 py-14 text-center sm:px-12 sm:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(135deg,#0b1338,#070a1f_55%,#120b33)] light:bg-[linear-gradient(135deg,oklch(0.955_0.035_215),oklch(0.99_0.006_250)_52%,oklch(0.95_0.045_295))]"
          />
          <div aria-hidden="true" className="pointer-events-none absolute -inset-[40%] -z-10 flex items-center justify-center opacity-70">
            <div
              className={cn(
                styles.orbit,
                "size-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(34,211,238,0.28)_60deg,transparent_120deg,transparent_200deg,rgba(139,92,246,0.3)_260deg,transparent_320deg)] blur-2xl",
              )}
            />
          </div>
          <div aria-hidden="true" className="grid-bg pointer-events-none absolute inset-0 -z-10 opacity-60" />
          <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-2xl bg-linear-to-br from-neon-cyan to-neon-violet text-on-brand shadow-glow">
            <Wrench className="size-6" />
          </span>
          <h2 id="cta-title" className="mx-auto mt-6 max-w-2xl font-display text-3xl font-semibold tracking-tight text-fg sm:text-5xl">
            Something wrong with your car? <span className="holo-text">Get it quoted.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg/8 text-fg-muted">
            Describe the problem in a few minutes and compare itemized quotes from approved mechanics near you.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <ButtonLink href="/request" size="lg" trailingIcon={<ArrowRight />} className="sm:min-w-56">
              Find a Mechanic
            </ButtonLink>
            <ButtonLink href="/signup?role=mechanic" size="lg" variant="secondary">
              I&rsquo;m a mechanic
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
