// Display formatting shared by server and client code. The locale is fixed to en-US (US
// pilot) so server-rendered and client-rendered text always match.

const LOCALE = "en-US";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const currencyFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const countFormatter = new Intl.NumberFormat(LOCALE);

function currencyFormatter(currency: string): Intl.NumberFormat {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, { style: "currency", currency });
    currencyFormatters.set(currency, formatter);
  }
  return formatter;
}

/**
 * Formats an integer amount in the currency's minor unit (cents for USD).
 * `formatCents(12345)` → "$123.45". Throws on non-integer input: money is never fractional cents.
 */
export function formatCents(cents: number, currency = "USD"): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`formatCents expects integer cents, received ${cents}`);
  }
  const formatter = currencyFormatter(currency);
  const minorDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(cents / 10 ** minorDigits);
}

type DateKind = "date" | "datetime";

function dateFormatter(kind: DateKind, timeZone: string | undefined): Intl.DateTimeFormat {
  const key = `${kind}|${timeZone ?? ""}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(
      LOCALE,
      kind === "date"
        ? { year: "numeric", month: "short", day: "numeric", timeZone }
        : {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
            timeZone,
          },
    );
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

type ParsedDate = { date: Date; dateOnly: boolean };

function parseDate(value: string | Date): ParsedDate {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new RangeError("Invalid Date");
    return { date: value, dateOnly: false };
  }
  if (DATE_ONLY.test(value)) {
    // A calendar date ("2026-10-01") has no time zone; keep it on the same day everywhere.
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new RangeError(`Invalid calendar date: ${value}`);
    }
    return { date, dateOnly: true };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${value}`);
  return { date, dateOnly: false };
}

/**
 * "Oct 1, 2026". Accepts a Date, an ISO timestamp or a calendar date ("YYYY-MM-DD").
 * Calendar dates never shift across time zones; timestamps are shown in `timeZone`
 * (an IANA zone such as a request's "America/Phoenix"), or the runtime zone if omitted.
 */
export function formatDate(value: string | Date, timeZone?: string): string {
  const { date, dateOnly } = parseDate(value);
  return dateFormatter("date", dateOnly ? "UTC" : timeZone).format(date);
}

/**
 * "Oct 1, 2026, 2:30 PM MST", always naming the zone it is shown in. Pass the record's
 * IANA time zone so server and browser render the same text. A calendar date is
 * formatted as a date only.
 */
export function formatDateTime(value: string | Date, timeZone?: string): string {
  const { date, dateOnly } = parseDate(value);
  if (dateOnly) return dateFormatter("date", "UTC").format(date);
  return dateFormatter("datetime", timeZone).format(date);
}

/**
 * Approximate distance for display: "less than 1 mi", "about 6 mi". Distances come
 * from ZIP-area centroids, so they are never shown as exact.
 */
export function formatMiles(miles: number): string {
  if (!Number.isFinite(miles) || miles < 0) {
    throw new RangeError(`formatMiles expects a non-negative number, received ${miles}`);
  }
  if (miles < 1) return "less than 1 mi";
  return `about ${countFormatter.format(Math.round(miles))} mi`;
}

function pluralOf(singular: string): string {
  if (/[^aeiou]y$/i.test(singular)) return `${singular.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(singular)) return `${singular}es`;
  return `${singular}s`;
}

/**
 * Count plus noun: `pluralize(1, "quote")` → "1 quote", `pluralize(3, "quote")` → "3 quotes",
 * `pluralize(2, "person", "people")` → "2 people". The count is included in the result.
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  const noun = Math.abs(count) === 1 ? singular : (plural ?? pluralOf(singular));
  return `${countFormatter.format(count)} ${noun}`;
}

/** File sizes in binary units, matching upload limits: "820 KB", "1.2 MB", "8 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new RangeError(`formatBytes expects a non-negative number, received ${bytes}`);
  }
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  const kb = bytes / 1024;
  if (Math.round(kb) < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  const rounded = mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb);
  return `${rounded} MB`;
}
