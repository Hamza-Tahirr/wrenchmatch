import { BellRing, CalendarCheck, Camera, CreditCard, Lock, Receipt } from "lucide-react";
import type { ReactNode } from "react";

const NEXT_STEPS: ReadonlyArray<{ icon: ReactNode; title: string; body: string }> = [
  {
    icon: <BellRing />,
    title: "We notify approved mechanics",
    body: "Up to five of the closest mechanics who cover your area, work on your make and offer this repair. You'll see exactly how many.",
  },
  {
    icon: <Receipt />,
    title: "Itemized quotes arrive",
    body: "Labor, parts, taxes and fees as separate lines, with a time slot, duration and expiry.",
  },
  {
    icon: <CalendarCheck />,
    title: "You choose one to reserve",
    body: "Online payments are coming soon, so a reservation stays pending and you won't be charged.",
  },
];

const PRIVACY: ReadonlyArray<{ icon: ReactNode; text: string }> = [
  { icon: <Lock />, text: "Phone, email and exact address are shared only after a confirmed booking." },
  { icon: <Camera />, text: "Photos are re-encoded without location or camera data before mechanics see them." },
  { icon: <CreditCard />, text: "No card details are asked for or stored." },
];

/** Side panel of the request wizard: what happens next and what stays private. */
export function RequestAside() {
  return (
    <div className="glass space-y-6 rounded-3xl p-5 sm:p-6">
      <section aria-labelledby="request-next-title">
        <h2 id="request-next-title" className="font-mono text-xs font-medium tracking-[0.18em] text-brand-700 uppercase">
          What happens next
        </h2>
        <ol className="relative mt-4 space-y-5">
          <span aria-hidden="true" className="absolute top-2 bottom-2 left-[1.0625rem] w-px bg-linear-to-b from-neon-cyan/60 via-neon-blue/40 to-transparent" />
          {NEXT_STEPS.map((step, index) => (
            <li key={step.title} className="relative flex gap-3.5">
              <span
                aria-hidden="true"
                className="relative grid size-9 shrink-0 place-items-center rounded-xl border border-brand-300/40 bg-brand-50 text-brand-800 shadow-glow-sm [&_svg]:size-4"
              >
                {step.icon}
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-fg">
                  <span className="sr-only">{index + 1}. </span>
                  {step.title}
                </p>
                <p className="mt-0.5 text-pretty text-fg-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="request-privacy-title" className="border-t border-line pt-5">
        <h2 id="request-privacy-title" className="font-mono text-xs font-medium tracking-[0.18em] text-brand-700 uppercase">
          Your privacy
        </h2>
        <ul className="mt-3 space-y-3">
          {PRIVACY.map((item) => (
            <li key={item.text} className="flex gap-2.5 text-sm text-fg-muted">
              <span aria-hidden="true" className="mt-0.5 shrink-0 text-neon-cyan [&_svg]:size-4">
                {item.icon}
              </span>
              {item.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
