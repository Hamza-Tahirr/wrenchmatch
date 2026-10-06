import { ClipboardList } from "lucide-react";

import { NotFound } from "@/components/illustrations";
import { PageContainer } from "@/components/layout/page-container";
import { ButtonLink } from "@/components/ui/button-link";

import { HudLabel } from "../../_components/hud";

/** Shown for unknown job ids and for jobs this mechanic wasn't matched to. */
export default function JobNotFound() {
  return (
    <PageContainer size="narrow" padY={false} className="py-12 text-center sm:py-16">
      <div className="glass aurora relative overflow-hidden rounded-3xl px-5 py-10 sm:px-10">
        <NotFound decorative className="mx-auto w-52 sm:w-60" />
        <HudLabel className="mt-4 block">Signal lost</HudLabel>
        <h1 className="holo-text mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Job not found</h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-pretty text-fg-muted">
          Jobs open only for the mechanics they were matched to. The link may be mistyped, or this job may belong to another
          mechanic&rsquo;s board.
        </p>
        <div className="mt-8 flex justify-center">
          <ButtonLink href="/mechanic/jobs" leadingIcon={<ClipboardList />}>
            Go to your job board
          </ButtonLink>
        </div>
      </div>
    </PageContainer>
  );
}
