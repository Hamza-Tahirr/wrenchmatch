import { ArrowRight, Camera, EyeOff, ImagePlus, Video } from "lucide-react";

import { UploadPhotos } from "@/components/illustrations";
import { PointerTilt } from "@/components/parallax";
import { ButtonLink } from "@/components/ui/button-link";
import { formatBytes } from "@/lib/format";
import { effectiveMaxBytes } from "@/server/storage/config";
import { Holo, SectionHeading } from "./section-heading";

const FACTS = [
  { icon: Camera, title: "Photos with your request", body: "Up to five JPEG, PNG or WebP photos, 8 MB each. Add more while the request is open." },
  {
    icon: Video,
    title: "One short video",
    // Smaller on the hosted site, where one request carries only a few MB.
    body: `MP4, MOV or WebM up to ${formatBytes(effectiveMaxBytes("request_video"))}. Mechanics see it only once a booking is confirmed.`,
  },
  { icon: EyeOff, title: "Location data removed", body: "Every picture is re-encoded with its EXIF and GPS data stripped." },
  { icon: ImagePlus, title: "Before and after", body: "Once a booking is confirmed, you and your mechanic can add before/after photos." },
] as const;

/** Feature highlight: adding photos and video to a request. */
export function MediaFeature() {
  return (
    <section aria-labelledby="media-title" className="relative py-16 sm:py-24">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="glass relative overflow-hidden rounded-[2rem] px-5 py-10 sm:px-10 sm:py-14 lg:px-14">
          <div aria-hidden="true" className="aurora pointer-events-none absolute inset-0 -z-10 opacity-60" />
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
            <div>
              <SectionHeading
                id="media-title"
                eyebrow="Show, don't just tell"
                title={
                  <>
                    Add <Holo>photos and video</Holo> to your request
                  </>
                }
                description="A picture of the warning light or the leak helps mechanics quote accurately the first time."
              />
              <dl className="stagger-reveal mt-8 grid gap-5 sm:grid-cols-2">
                {FACTS.map(({ icon: Icon, title, body }) => (
                  <div key={title}>
                    <dt className="flex items-center gap-2.5 font-semibold text-fg">
                      <Icon aria-hidden="true" className="size-4.5 text-neon-cyan" />
                      {title}
                    </dt>
                    <dd className="mt-1.5 text-sm/6 text-fg-muted">{body}</dd>
                  </div>
                ))}
              </dl>
              <div className="reveal mt-9">
                <ButtonLink href="/request" size="lg" trailingIcon={<ArrowRight />}>
                  Start a request
                </ButtonLink>
              </div>
            </div>
            <figure className="reveal-scale mx-auto w-full max-w-md">
              <PointerTilt max={7}>
                <div className="relative rounded-[1.75rem] border border-dashed border-neon-cyan/45 bg-canvas/50 p-6 text-center shadow-[inset_0_0_60px_-20px_rgba(34,211,238,0.35)] sm:p-8">
                  <UploadPhotos decorative className="mx-auto w-full max-w-xs" />
                  <p className="mt-2 font-semibold text-fg">Drag photos in, or choose files</p>
                  <p className="mt-1 text-sm text-fg-subtle">JPEG, PNG or WebP · up to 8 MB each</p>
                  <div aria-hidden="true" className="mt-5 flex justify-center gap-2.5">
                    {["from-neon-cyan/40 to-neon-blue/30", "from-neon-violet/40 to-neon-cyan/25", "from-neon-blue/40 to-neon-violet/30"].map((gradient) => (
                      <span key={gradient} className={`size-14 rounded-xl bg-linear-to-br ${gradient} ring-1 ring-line-strong`} />
                    ))}
                    <span className="grid size-14 place-items-center rounded-xl border border-dashed border-neon-cyan/50 text-xl text-neon-cyan">+</span>
                  </div>
                </div>
              </PointerTilt>
              <figcaption className="mt-4 text-center text-sm text-fg-subtle">The photo step of the request form</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}
