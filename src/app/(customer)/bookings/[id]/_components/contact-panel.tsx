import { Lock, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";

import type { CustomerBookingDetail } from "@/server/customer/booking-views";

import { InlineNote, Panel } from "../../../_components/facts";

const rowLinkClass =
  "group flex min-h-11 items-center gap-3 rounded-xl px-1 -mx-1 font-medium text-brand-700 transition-colors hover:bg-fg/5 hover:text-brand-800";
const iconClass =
  "grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-neon-cyan transition-colors group-hover:border-neon-cyan/40";

/** The mechanic's phone, email (and garage address) once a booking is confirmed; why not otherwise. */
export function ContactPanel({ booking }: { booking: CustomerBookingDetail }) {
  const name = booking.mechanic.displayName;
  const contact = booking.mechanicContact;
  const visible = booking.contactVisibility === "visible" && contact;

  return (
    <Panel
      title={`Contact ${name}`}
      titleId="contact-title"
      eyebrow={
        visible ? "Unlocked" : booking.contactVisibility === "hidden_until_confirmed" ? "Private until confirmed" : "Not shared"
      }
      actions={
        visible ? (
          <ShieldCheck aria-hidden="true" className="size-5 text-success-600 drop-shadow-[0_0_8px_var(--color-success-500)]" />
        ) : (
          <Lock aria-hidden="true" className="size-5 text-fg-subtle" />
        )
      }
      bodyClassName="space-y-3"
    >
      {visible ? (
        <>
          <ul className="space-y-1.5 text-sm">
            <li>
              <a href={`tel:${contact.phone}`} className={rowLinkClass}>
                <span aria-hidden="true" className={iconClass}>
                  <Phone className="size-4" />
                </span>
                <span className="font-mono tabular">
                  <span className="sr-only">Phone: </span>
                  {contact.phone}
                </span>
              </a>
            </li>
            <li>
              <a href={`mailto:${contact.email}`} className={rowLinkClass}>
                <span aria-hidden="true" className={iconClass}>
                  <Mail className="size-4" />
                </span>
                <span className="min-w-0 break-all">
                  <span className="sr-only">Email: </span>
                  {contact.email}
                </span>
              </a>
            </li>
            {contact.garageAddress ? (
              <li className="flex items-start gap-3 py-1">
                <span aria-hidden="true" className={iconClass}>
                  <MapPin className="size-4" />
                </span>
                <span className="pt-2 text-fg">
                  <span className="sr-only">Garage address: </span>
                  {[contact.garageAddress.line1, contact.garageAddress.city, contact.garageAddress.state, contact.garageAddress.zip]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </li>
            ) : null}
          </ul>
          <InlineNote icon={<Lock />}>Shared because this booking is confirmed.</InlineNote>
        </>
      ) : booking.contactVisibility === "visible" ? (
        <InlineNote icon={<Lock />}>
          {name}&rsquo;s contact details aren&rsquo;t available right now. Ask us for help if you need to reach them.
        </InlineNote>
      ) : booking.contactVisibility === "hidden_until_confirmed" ? (
        <div className="space-y-3">
          <div aria-hidden="true" className="space-y-2">
            <div className="h-9 rounded-xl border border-line bg-surface-2/60 blur-[1px]" />
            <div className="h-9 w-4/5 rounded-xl border border-line bg-surface-2/60 blur-[1px]" />
          </div>
          <InlineNote icon={<Lock />}>
            Contact details unlock once the booking is confirmed. Online payments are coming soon, so this reservation
            can&rsquo;t be confirmed yet, and {name} can&rsquo;t see your phone, email or address either.
          </InlineNote>
        </div>
      ) : (
        <InlineNote icon={<Lock />}>Contact details aren&rsquo;t shared for cancelled bookings.</InlineNote>
      )}
    </Panel>
  );
}
