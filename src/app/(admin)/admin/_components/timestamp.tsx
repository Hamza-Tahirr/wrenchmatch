import { formatDate, formatDateTime } from "@/lib/format";

import { relativeTime } from "../_lib/display";

type TimestampProps = {
  /** UTC ISO timestamp. */
  iso: string;
  /** IANA zone to show it in (the request's zone, or the admin reporting zone). */
  timeZone: string;
  /** "datetime" (default), "date", or "relative" ("3 hours ago", with the full time on hover). */
  format?: "datetime" | "date" | "relative";
  /** Needed for "relative": the request's clock. */
  now?: Date;
  className?: string;
};

/** A <time> element showing an instant in a named time zone. */
export function Timestamp({ iso, timeZone, format = "datetime", now, className }: TimestampProps) {
  const full = formatDateTime(iso, timeZone);
  const text =
    format === "date" ? formatDate(iso, timeZone) : format === "relative" && now ? relativeTime(iso, now, timeZone) : full;
  return (
    <time dateTime={iso} title={text === full ? undefined : full} className={className}>
      {text}
    </time>
  );
}
