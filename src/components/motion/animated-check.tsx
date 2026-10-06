import { cn } from "@/lib/cn";

type AnimatedCheckProps = {
  /** Pixel size of the square icon. */
  size?: number;
  tone?: "success" | "brand" | "violet";
  /** Accessible label; omit when the check is decorative. */
  label?: string;
  className?: string;
};

const toneClasses = {
  success: "text-success-600 drop-shadow-[0_0_14px_var(--color-success-600)]",
  brand: "text-neon-cyan drop-shadow-[0_0_14px_var(--color-neon-cyan)]",
  violet: "text-neon-violet drop-shadow-[0_0_14px_var(--color-neon-violet)]",
} as const;

/** A circle and check mark that draw themselves (CSS only; server-safe). */
export function AnimatedCheck({ size = 56, tone = "success", label, className }: AnimatedCheckProps) {
  return (
    <svg
      viewBox="0 0 52 52"
      width={size}
      height={size}
      className={cn("shrink-0", toneClasses[tone], className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      fill="none"
    >
      <circle cx="26" cy="26" r="24" className="fill-current opacity-10" />
      <circle
        cx="26"
        cy="26"
        r="24"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset="1"
        className="origin-center -rotate-90 animate-[wm-draw_0.7s_var(--ease-out-expo)_forwards]"
      />
      <path
        d="M15 27.5l7.5 7.5L38 19"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset="1"
        className="animate-[wm-draw_0.45s_var(--ease-out-expo)_0.45s_forwards]"
      />
    </svg>
  );
}
