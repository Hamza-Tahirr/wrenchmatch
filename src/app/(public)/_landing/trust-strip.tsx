import { BadgeCheck, LockKeyhole, ReceiptText, ShieldCheck } from "lucide-react";

const POINTS = [
  {
    icon: BadgeCheck,
    title: "Manually approved",
    body: "An admin reviews every mechanic's application before they receive jobs.",
  },
  {
    icon: ReceiptText,
    title: "Itemized quotes",
    body: "Parts, labor and tax on separate lines, with a time slot and an expiry.",
  },
  {
    icon: LockKeyhole,
    title: "Private until booking",
    body: "Your phone, email and exact address are shared only after a booking is confirmed.",
  },
  {
    icon: ShieldCheck,
    title: "Safety work gated",
    body: "Brake and suspension jobs go only to mechanics approved for that work.",
  },
] as const;

/** Four rules that are built into the marketplace (no invented numbers or logos). */
export function TrustStrip() {
  return (
    <section aria-labelledby="trust-title" className="relative z-10 mt-2 pb-4 sm:pb-8 lg:-mt-10">
      <h2 id="trust-title" className="sr-only">
        What you can count on
      </h2>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <ul className="stagger-reveal glass grid gap-px overflow-hidden rounded-3xl sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="group relative flex gap-4 bg-canvas/40 p-5 sm:p-6">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-neon-cyan/25 to-neon-violet/20 text-neon-cyan ring-1 ring-neon-cyan/30 transition-[box-shadow,transform] duration-300 group-hover:-translate-y-0.5 group-hover:shadow-glow-sm"
              >
                <Icon className="size-5" />
              </span>
              <div>
                <h3 className="font-semibold text-fg">{title}</h3>
                <p className="mt-1 text-sm/6 text-fg-muted">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
