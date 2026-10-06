import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";

import { SectionHeading } from "./section-heading";

const FAQ = [
  {
    q: "When do I pay?",
    a: "Online payments are coming soon. For now you can send requests, compare quotes and reserve a slot; a reservation stays “pending payment” and no card is charged.",
  },
  {
    q: "Who can see my phone number and address?",
    a: "Mechanics see your car, the problem, your photos and an approximate area. Your phone number, email and exact address are shared only after a booking is confirmed.",
  },
  {
    q: "How are mechanics approved?",
    a: "Mechanics apply with their experience, services, service area and insurance details. An admin reviews every application by hand before they can receive jobs.",
  },
  {
    q: "What if no mechanic covers my area?",
    a: "You'll see that right after you send your request, with the actual number of mechanics we notified, never a made-up match.",
  },
] as const;

/** A few common questions as accessible disclosures, linking to the full help page. */
export function FaqTeaser() {
  return (
    <section aria-labelledby="faq-title" className="relative py-16 sm:py-24">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16 lg:px-8">
        <div>
          <SectionHeading
            id="faq-title"
            eyebrow="Questions"
            title="Good to know"
            description="Short answers to what people ask most. The help page has the rest."
          />
          <Link
            href="/help"
            className="reveal mt-6 inline-flex items-center gap-2 rounded-md font-semibold text-neon-cyan underline-offset-4 hover:underline"
          >
            Read the help page
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <div className="stagger-reveal space-y-3">
          {FAQ.map((item) => (
            <details key={item.q} className="group glass-lite rounded-2xl px-5 py-1 transition-[border-color,box-shadow] duration-300 open:border-neon-cyan/40 open:shadow-glow-sm">
              <summary className="flex min-h-14 items-center justify-between gap-4 py-3 font-semibold text-fg [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus aria-hidden="true" className="size-5 shrink-0 text-neon-cyan transition-transform duration-300 group-open:rotate-45" />
              </summary>
              <p className="pb-4 text-fg-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
