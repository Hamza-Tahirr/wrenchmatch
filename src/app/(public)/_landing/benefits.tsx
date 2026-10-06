import { BellRing, CalendarCheck, Camera, FileCheck2, MapPinned, ReceiptText, Send, Truck } from "lucide-react";
import type { ReactNode } from "react";

import { ApproximateAreaArt, MobileServiceArt, UploadPhotos } from "@/components/illustrations";
import { GlowCard } from "@/components/motion/glow-card";
import { cn } from "@/lib/cn";
import styles from "./landing.module.css";
import { Holo, SectionHeading } from "./section-heading";

type Tile = {
  key: string;
  icon: ReactNode;
  title: string;
  body: string;
  art: ReactNode;
  className?: string;
  glow?: "cyan" | "violet";
};

/** Small HTML mock of itemized lines (example values, labelled). */
function QuoteLinesArt() {
  const rows = [
    ["Labor · 0.5 h", "$60.00"],
    ["Group 51R battery", "$159.00"],
    ["Tax on parts", "$13.12"],
  ] as const;
  return (
    <div aria-hidden="true" className="w-full max-w-xs rounded-2xl border border-line-strong bg-canvas/70 p-4 text-sm shadow-[0_20px_40px_-24px_rgba(34,211,238,0.5)]">
      <p className="font-mono text-[0.65rem] tracking-[0.2em] text-neon-cyan uppercase">Example quote</p>
      <dl className="mt-3 space-y-2">
        {rows.map(([label, price]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-fg-muted">{label}</dt>
            <dd className="font-mono text-fg tabular-nums">{price}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t border-dashed border-line-strong pt-2">
          <dt className="font-semibold text-fg">Total</dt>
          <dd className="font-mono text-lg font-semibold text-neon-cyan tabular-nums text-glow">$232.12</dd>
        </div>
      </dl>
    </div>
  );
}

/** Small HTML mock of a change-order approval. */
function ChangeOrderArt() {
  return (
    <div aria-hidden="true" className="w-full max-w-xs rounded-2xl border border-line-strong bg-canvas/70 p-4 text-sm shadow-[0_20px_40px_-24px_rgba(139,92,246,0.55)]">
      <p className="font-mono text-[0.65rem] tracking-[0.2em] text-neon-violet uppercase">Extra work proposed</p>
      <p className="mt-2 font-medium text-fg">Replace serpentine belt</p>
      <p className="font-mono text-fg-muted tabular-nums">+ $84.00 · needs your OK</p>
      <div className="mt-3 flex gap-2">
        <span className="rounded-lg bg-linear-to-r from-neon-cyan to-neon-blue px-3 py-1.5 text-xs font-semibold text-on-brand">
          Approve
        </span>
        <span className="rounded-lg px-3 py-1.5 text-xs font-semibold text-fg-muted ring-1 ring-line-strong">Decline</span>
      </div>
    </div>
  );
}

/** Small HTML mock of the in-app notifications a customer receives (real notification types). */
function NotificationsArt() {
  const items = [
    { icon: Send, title: "Request sent", meta: "Matched mechanics notified", when: "now" },
    { icon: ReceiptText, title: "Quote received", meta: "Battery replacement · itemized", when: "2 h" },
    { icon: CalendarCheck, title: "Reservation created", meta: "Pending payment · not charged", when: "1 d" },
  ] as const;
  return (
    <div aria-hidden="true" className="relative w-full max-w-xs pt-3 lg:max-w-[16.5rem] xl:max-w-xs">
      <span className="absolute top-0 -right-1 z-10 grid size-10 place-items-center rounded-2xl bg-linear-to-br from-neon-cyan to-neon-violet text-on-brand shadow-glow">
        <BellRing className={cn("size-5", styles.ring)} />
        <span className="absolute -top-1 -right-1 size-3 rounded-full bg-neon-pink ring-2 ring-canvas" />
      </span>
      <ul className="space-y-2.5">
        {items.map(({ icon: Icon, title, meta, when }, index) => (
          <li
            key={title}
            className={cn(
              styles.notif,
              "flex items-center gap-3 rounded-2xl border border-line-strong bg-canvas/75 p-3 shadow-[0_18px_36px_-22px_rgba(34,211,238,0.55)]",
              index === 0 && "pr-12",
              index === 1 && "ml-2 border-neon-violet/40 sm:ml-3",
              index === 2 && "ml-4 sm:ml-6",
            )}
            style={{ animationDelay: `${index * 0.7}s` }}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-neon-cyan/12 text-neon-cyan ring-1 ring-neon-cyan/30">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg">{title}</span>
              <span className="block truncate text-xs text-fg-muted">{meta}</span>
            </span>
            <span className="self-start font-mono text-[0.65rem] text-fg-subtle">{when}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TILES: readonly Tile[] = [
  {
    key: "media",
    icon: <Camera />,
    title: "Photos and video tell the story",
    body: "Add up to five photos and a short video with your request, and more photos while it is open. Location data is stripped from every picture.",
    art: <UploadPhotos decorative className="w-60 sm:w-72 lg:w-80" />,
    className: "lg:col-span-2",
  },
  {
    key: "quotes",
    icon: <ReceiptText />,
    title: "Quotes you can compare",
    body: "Parts, labor and tax on separate lines, so you compare like for like.",
    art: <QuoteLinesArt />,
    glow: "violet",
  },
  {
    key: "mobile",
    icon: <Truck />,
    title: "Mobile or garage",
    body: "Choose a mechanic who comes to you, or drive to their garage.",
    art: <MobileServiceArt decorative className="w-52" />,
    glow: "violet",
  },
  {
    key: "area",
    icon: <MapPinned />,
    title: "Approximate areas only",
    body: "Maps and distances use ZIP areas. Your exact address stays private until you book.",
    art: <ApproximateAreaArt decorative className="w-52" />,
  },
  {
    key: "changes",
    icon: <FileCheck2 />,
    title: "No surprise extras",
    body: "If the mechanic finds more work, they propose it and you approve or decline before it happens.",
    art: <ChangeOrderArt />,
    glow: "violet",
  },
  {
    key: "notify",
    icon: <BellRing />,
    title: "Updates at every step",
    body: "In-app notifications when quotes arrive, a slot is reserved or a job starts.",
    art: <NotificationsArt />,
    className: "lg:col-span-2",
  },
];

/** Bento grid of benefits with mini illustrations; cards tilt and glow under the pointer. */
export function Benefits() {
  return (
    <section aria-labelledby="benefits-title" className="relative isolate overflow-x-clip py-16 sm:py-24">
      <div aria-hidden="true" className="aurora pointer-events-none absolute inset-x-0 top-24 -z-10 h-[60%] opacity-70" />
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          id="benefits-title"
          eyebrow="Why WrenchMatch"
          title={
            <>
              Built for <Holo>clarity</Holo>, not surprises
            </>
          }
          description="The rules below are part of how requests, quotes and bookings work, not just promises."
        />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {TILES.map((tile) => (
            <li key={tile.key} className={cn("reveal flex", tile.className)}>
              <GlowCard
                tilt
                maxTilt={5}
                glow={tile.glow ?? "cyan"}
                className="glass-lite relative flex min-h-[19rem] w-full flex-col overflow-hidden rounded-3xl p-6 transition-[border-color] duration-300 hover:border-neon-cyan/40"
              >
                <div
                  className={cn(
                    "flex flex-1 items-center justify-center pb-5",
                    tile.className?.includes("col-span-2") && "lg:justify-end lg:pb-0",
                  )}
                >
                  {tile.art}
                </div>
                <div className={cn(tile.className?.includes("col-span-2") && "lg:absolute lg:bottom-6 lg:left-6 lg:max-w-[46%]")}>
                  <span aria-hidden="true" className="mb-3 grid size-9 place-items-center rounded-xl bg-neon-cyan/10 text-neon-cyan ring-1 ring-neon-cyan/25 [&_svg]:size-4.5">
                    {tile.icon}
                  </span>
                  <h3 className="text-lg font-semibold text-fg">{tile.title}</h3>
                  <p className="mt-1.5 text-sm/6 text-fg-muted">{tile.body}</p>
                </div>
              </GlowCard>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
