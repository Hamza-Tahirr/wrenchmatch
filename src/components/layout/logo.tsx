import { Wrench } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/** Brand mark (neon tile) + wordmark linking to the landing page. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg", className)}>
      <span
        aria-hidden="true"
        className="relative grid size-9 place-items-center rounded-xl bg-linear-to-br from-neon-cyan via-brand-500 to-neon-violet text-on-brand shadow-glow-sm transition-[box-shadow,transform] duration-300 group-hover:scale-105 group-hover:shadow-glow"
      >
        <span className="absolute inset-px rounded-[0.7rem] bg-linear-to-br from-fg/30 to-transparent opacity-60" />
        <Wrench className="relative size-[1.125rem] transition-transform duration-500 ease-out group-hover:-rotate-[25deg]" strokeWidth={2.4} />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-fg">
        Wrench<span className="bg-linear-to-r from-neon-cyan to-neon-violet bg-clip-text text-transparent">Match</span>
      </span>
      <span className="sr-only">home</span>
    </Link>
  );
}
