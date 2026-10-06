import Link from "next/link";
import { Logo } from "./logo";

const links = [
  { href: "/help", label: "Help Center" },
  { href: "/help#getting-started", label: "Getting started" },
  { href: "/help#payments", label: "Payments" },
  { href: "/help#terms", label: "Terms" },
  { href: "/help#privacy", label: "Privacy" },
] as const;

export function SiteFooter() {
  return (
    <footer className="relative mt-12 border-t border-line bg-canvas/60 backdrop-blur-sm">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-px h-px bg-linear-to-r from-transparent via-neon-cyan/50 to-transparent"
      />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between lg:px-8">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-md text-sm text-fg-muted">
            Describe the problem, compare itemized quotes from approved local mechanics, and book the one that fits.
          </p>
          <p className="max-w-md text-xs text-fg-subtle">
            Pilot service. Online payments are coming soon; emails are captured in the app for now.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-sm font-medium text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline hover:decoration-neon-cyan"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
