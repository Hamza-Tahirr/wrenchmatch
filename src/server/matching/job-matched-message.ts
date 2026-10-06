import "server-only";

import { PREFERRED_WINDOW_INFO, type PreferredWindow, type RequestServiceMode } from "@/lib/domain";
import { formatDate, formatMiles } from "@/lib/format";
import { weekdayOfDate } from "@/lib/time";
import { APP_NAME } from "@/server/config";
import type { NotifyInput } from "@/server/notifications/notify";

/** Notification type and email template of the "job matched" event. */
export const JOB_MATCHED = "job_matched";

export type JobMatchedMessageInput = {
  requestId: string;
  mechanicDisplayName: string;
  /** The request ZIP's city and state. */
  city: string;
  state: string;
  categoryName: string;
  vehicleYear: number;
  vehicleMake: string;
  vehicleModel: string;
  serviceMode: RequestServiceMode;
  preferredDate: string;
  preferredWindow: PreferredWindow;
  distanceMiles: number;
};

export type JobMatchedMessage = Required<Pick<NotifyInput, "type" | "title" | "body" | "linkPath" | "email">>;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const SERVICE_TEXT: Readonly<Record<RequestServiceMode, string>> = {
  mobile: "mobile (you go to the customer)",
  garage: "at your garage (the customer brings the car)",
  either: "mobile or at your garage",
};

function preferredTime(date: string, timeWindow: PreferredWindow): string {
  const day = `${WEEKDAYS[weekdayOfDate(date)]}, ${formatDate(date)}`;
  if (timeWindow === "flexible") return `${day}, flexible (any time that week)`;
  const info = PREFERRED_WINDOW_INFO[timeWindow];
  return `${day}, ${info.label.toLowerCase()} (${info.hours})`;
}

/**
 * The in-app notification and dev-mailbox email for a mechanic newly matched to a request.
 * Only coarse request fields (area, category, vehicle, timing, approximate distance): never
 * the customer's contact details or exact address.
 */
export function jobMatchedMessage(input: JobMatchedMessageInput): JobMatchedMessage {
  const title = `New repair request near ${input.city}, ${input.state}`;
  const vehicle = `${input.vehicleYear} ${input.vehicleMake} ${input.vehicleModel}`;
  const when = preferredTime(input.preferredDate, input.preferredWindow);
  const service = SERVICE_TEXT[input.serviceMode];
  const distance = `${formatMiles(input.distanceMiles)} from your base`;
  const linkPath = `/mechanic/jobs/${input.requestId}`;

  const body =
    `${input.categoryName} for a ${vehicle}, ${distance}. Preferred time: ${when}. ` +
    `Service: ${service}. Open the job to see the details and send a quote.`;

  const text = [
    `Hi ${input.mechanicDisplayName},`,
    "",
    `A customer near ${input.city}, ${input.state} is looking for a mechanic.`,
    "",
    `Job: ${input.categoryName}`,
    `Vehicle: ${vehicle}`,
    `Preferred time: ${when}`,
    `Service: ${service}`,
    `Distance: ${distance} (approximate, measured between ZIP areas)`,
    "",
    `Sign in to ${APP_NAME} to see the request and send a quote: ${linkPath}`,
    "",
    "The customer's phone, email and exact address are shared only after a confirmed booking.",
  ].join("\n");

  return {
    type: JOB_MATCHED,
    title,
    body,
    linkPath,
    email: { subject: title, text, template: JOB_MATCHED },
  };
}
