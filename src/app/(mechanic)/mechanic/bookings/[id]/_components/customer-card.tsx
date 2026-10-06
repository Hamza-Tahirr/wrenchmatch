import { Lock, Mail, MapPin, Phone, UserRound, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { MyBookingDetail } from "@/server/mechanic/bookings";

import { DetailGrid, DetailItem } from "../../../_components/facts";
import { Panel } from "../../../_components/hud";

/** Customer contact and service location: shown only for confirmed bookings. */
export function CustomerCard({ booking }: { booking: MyBookingDetail }) {
  const customer = booking.customer;
  return (
    <Panel
      id="customer"
      title="Customer and location"
      icon={<UserRound />}
      tone={customer ? "success" : "violet"}
      actions={customer ? <Badge tone="success">Shared after confirmation</Badge> : <Badge tone="neutral">Hidden</Badge>}
      bodyClassName="space-y-5"
    >
      {customer ? (
        <>
          <DetailGrid>
            <DetailItem icon={<UserRound />} label="Customer">
              {customer.displayName}
            </DetailItem>
            <DetailItem icon={<Phone />} label="Phone">
              <a href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`} className="font-mono font-medium text-brand-700 underline underline-offset-4">
                {customer.phone}
              </a>
            </DetailItem>
            <DetailItem icon={<Mail />} label="Email">
              <a href={`mailto:${customer.email}`} className="font-medium break-all text-brand-700 underline underline-offset-4">
                {customer.email}
              </a>
            </DetailItem>
            <DetailItem icon={<MapPin />} label={booking.serviceMode === "mobile" ? "Service address" : "Customer's address"}>
              {customer.address.label}
              {customer.address.notes ? <span className="block text-fg-muted">{customer.address.notes}</span> : null}
            </DetailItem>
          </DetailGrid>
          <p className="text-sm text-fg-muted">Shared with you because this booking was confirmed. Use these details only for this job.</p>
        </>
      ) : (
        <p className="flex items-start gap-2.5 rounded-xl border border-dashed border-line-strong p-4 text-sm text-fg-muted">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-neon-violet" />
          {booking.contactNotice}
        </p>
      )}
      <DetailGrid>
        <DetailItem icon={<Wrench />} label="Where the work happens">
          {booking.serviceLocation}
        </DetailItem>
        <DetailItem icon={<MapPin />} label="Area">
          {booking.areaLabel}
        </DetailItem>
      </DetailGrid>
    </Panel>
  );
}
