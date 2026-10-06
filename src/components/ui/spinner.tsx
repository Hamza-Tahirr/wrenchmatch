import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const sizes = {
  sm: "size-4",
  md: "size-5",
  lg: "size-8",
} as const;

type SpinnerProps = {
  size?: keyof typeof sizes;
  /** When set, the spinner is announced as a status message; otherwise it is decorative. */
  label?: string;
  className?: string;
};

export function Spinner({ size = "md", label, className }: SpinnerProps) {
  const icon = (
    <LoaderCircle aria-hidden="true" className={cn("shrink-0 animate-spin", sizes[size], className)} />
  );
  if (!label) return icon;
  return (
    <span role="status" className="inline-flex items-center gap-2">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}
