import { formatDate } from "@/lib/format";

const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago"; older than a week,
 * the date ("Oct 1, 2026"). `now` comes from the request's clock so rendering is consistent.
 */
export function formatRelativeTime(iso: string, now: Date): string {
  const elapsed = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed)) return iso;
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), "hour");
  if (elapsed < 7 * DAY) return relative.format(-Math.floor(elapsed / DAY), "day");
  return formatDate(iso);
}
