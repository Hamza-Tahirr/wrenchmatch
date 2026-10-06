import { CircleCheck, Lock, ShieldCheck } from "lucide-react";

import { Panel } from "../../../_components/hud";

/** What a matched mechanic can and can't see before a confirmed booking. */
export function PrivacyCard({ booked = false }: { booked?: boolean }) {
  const item = "flex gap-2.5";
  return (
    <Panel id="job-privacy" title="What you can see" icon={<ShieldCheck />} tone="violet">
      <ul className="space-y-3 text-sm text-fg-muted">
        <li className={item}>
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-600" />
          Vehicle, problem, approximate area and preferred time
        </li>
        <li className={item}>
          <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-600" />
          Photos the customer shared, with location data removed
        </li>
        {booked ? (
          <li className={item}>
            <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-600" />
            Booked with you: phone, email, exact address and video are on the booking page
          </li>
        ) : (
          <li className={item}>
            <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-neon-violet" />
            Phone, email, exact address and video only after a confirmed booking
          </li>
        )}
      </ul>
    </Panel>
  );
}
