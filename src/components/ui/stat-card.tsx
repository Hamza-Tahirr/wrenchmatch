import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";
import { AnimatedNumber, type AnimatedNumberFormat } from "@/components/motion/animated-number";
import { cn } from "@/lib/cn";

export type StatCardProps = {
  label: ReactNode;
  /** Computed from real data; never a placeholder number. Numbers count up when shown. */
  value: ReactNode;
  /** How a numeric `value` is formatted (default "integer"; money: integer cents + "cents"). */
  format?: AnimatedNumberFormat;
  hint?: ReactNode;
  /** Decorative icon element. */
  icon?: ReactNode;
  /** Makes the whole card a link to the matching list. */
  href?: string;
  /** Real recent values (oldest first) drawn as a glowing sparkline; needs 2+ points. */
  trend?: number[];
  /** Accent color of the icon chip and sparkline. */
  tone?: "cyan" | "violet" | "success" | "warning" | "danger";
  className?: string;
};

const toneColors = {
  cyan: "var(--color-neon-cyan)",
  violet: "var(--color-neon-violet)",
  success: "var(--color-success-600)",
  warning: "var(--color-warning-600)",
  danger: "var(--color-danger-600)",
} as const;

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const width = 120;
  const height = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => [index * step, height - 3 - ((value - min) / span) * (height - 6)] as const);
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="mt-3 h-9 w-full overflow-visible"
      style={{ filter: `drop-shadow(0 0 6px ${color})` }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A labelled figure for dashboards: glass card, count-up number, optional sparkline. */
export function StatCard({ label, value, format = "integer", hint, icon, href, trend, tone = "cyan", className }: StatCardProps) {
  const marker = icon ?? (href ? <ArrowRight /> : null);
  const color = toneColors[tone];
  const content = (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-16 -z-10 size-40 rounded-full opacity-25 blur-3xl transition-opacity duration-300 group-hover:opacity-45"
        style={{ background: color }}
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-fg-muted">{label}</p>
        {marker ? (
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-fg/[0.04] transition-transform duration-300 group-hover:scale-110 [&_svg]:size-[1.125rem]"
            style={{ color, boxShadow: `0 0 18px -8px ${color}` }}
          >
            {marker}
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg tabular-nums">
        {typeof value === "number" ? <AnimatedNumber value={value} format={format} /> : value}
      </p>
      {hint ? <p className="mt-1 text-sm text-fg-subtle">{hint}</p> : null}
      {trend && trend.length >= 2 ? <Sparkline values={trend} color={color} /> : null}
    </>
  );
  const classes = cn("glass-lite group relative isolate block overflow-hidden rounded-2xl p-5", className);
  if (!href) return <div className={classes}>{content}</div>;
  return (
    <Link href={href} className={cn(classes, "card-hover")}>
      {content}
    </Link>
  );
}
