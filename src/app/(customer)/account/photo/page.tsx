import { CalendarCheck, EyeOff, ShieldCheck, UserRound } from "lucide-react";
import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { MyAvatar } from "@/components/media/my-avatar";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth/viewer";

export const metadata: Metadata = { title: "Profile picture" };

const AUDIENCE = [
  {
    icon: UserRound,
    title: "You",
    text: "It shows next to your name in the header and on your account.",
  },
  {
    icon: CalendarCheck,
    title: "Your booked mechanic",
    text: "Only once a booking with them is confirmed, so they recognise you on the day.",
  },
  {
    icon: EyeOff,
    title: "Not before booking",
    text: "Mechanics who are only quoting never see it, and neither do other customers.",
  },
  {
    icon: ShieldCheck,
    title: "Cleaned on upload",
    text: "We resize it and strip hidden data such as GPS location and camera details.",
  },
] as const;

export default async function AccountPhotoPage() {
  await requireRole("customer", "/account/photo");

  return (
    <PageContainer size="narrow">
      <PageHeader
        back={{ href: "/account", label: "Your account" }}
        eyebrow="Account"
        title="Profile picture"
        description="Add a friendly face to your account. You can change or remove it at any time."
      />

      <div className="mt-8 space-y-6">
        <section aria-label="Your profile picture" className="glass relative overflow-hidden rounded-3xl p-6 sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--color-neon-violet)_22%,transparent),transparent_70%)]"
          />
          <MyAvatar className="relative" />
        </section>

        <section aria-labelledby="avatar-audience" className="glass-lite rounded-2xl p-5 sm:p-6">
          <h2 id="avatar-audience" className="text-base font-semibold text-fg">
            Who sees your picture
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {AUDIENCE.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-neon-cyan ring-1 ring-neon-cyan/25">
                  <Icon className="size-4" />
                </span>
                <span className="space-y-0.5">
                  <span className="block text-sm font-semibold text-fg">{title}</span>
                  <span className="block text-sm text-fg-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageContainer>
  );
}
