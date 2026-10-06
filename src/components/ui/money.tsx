import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";

export type MoneyProps = {
  /** Integer amount in the currency's minor unit (cents). */
  cents: number;
  currency?: string;
  className?: string;
};

/** Formats integer cents ("$123.45") with tabular digits so columns line up. */
export function Money({ cents, currency = "USD", className }: MoneyProps) {
  return <span className={cn("tabular-nums", className)}>{formatCents(cents, currency)}</span>;
}
