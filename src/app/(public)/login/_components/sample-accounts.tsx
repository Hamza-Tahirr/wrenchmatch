"use client";

import { Check, ChevronDown, Copy, KeyRound, LogIn, Sparkles } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { Avatar } from "@/components/ui/avatar";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { demoLoginAction } from "../actions";

export type SampleTone = "cyan" | "violet" | "emerald" | "amber" | "rose";

export type SampleAccount = {
  email: string;
  displayName: string;
  /** Short state chip, e.g. "Approved" or "Suspended". */
  chip: string;
  tone: SampleTone;
  description: string;
};

export type SampleTabId = "customer" | "mechanic" | "admin";

export type SampleTab = {
  id: SampleTabId;
  label: string;
  sections: Array<{ label: string | null; accounts: SampleAccount[] }>;
};

/** Serializable sample-login data the login page passes down (DEMO_MODE only). */
export type SampleLoginData = {
  password: string;
  tabs: SampleTab[];
  initialTab: SampleTabId;
};

type SampleAccountsProps = SampleLoginData & {
  /** Safe path to return to after logging in, or null. */
  next: string | null;
  /** Email of the account last filled into the form. */
  selectedEmail: string | null;
  onFill: (account: SampleAccount) => void;
};

const toneClasses: Record<SampleTone, string> = {
  cyan: "bg-neon-cyan/12 text-neon-cyan ring-neon-cyan/35",
  violet: "bg-neon-violet/14 text-neon-violet ring-neon-violet/40",
  emerald: "bg-success-600/14 text-success-700 ring-success-600/40",
  amber: "bg-warning-600/14 text-warning-700 ring-warning-600/40",
  rose: "bg-danger-600/14 text-danger-700 ring-danger-600/40",
};

/**
 * One-click sample logins grouped by role. Each "Log in as …" button posts only the
 * account's email to demoLoginAction (which accepts listed sample emails only). The shared
 * password and "fill in the form" shortcuts sit in the "Use the form instead" disclosure.
 */
export function SampleAccounts({ password, tabs, initialTab, next, selectedEmail, onFill }: SampleAccountsProps) {
  const baseId = useId();
  const [active, setActive] = useState<SampleTabId>(initialTab);
  const [copied, setCopied] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === active));

  function focusTab(index: number) {
    const target = tabs[(index + tabs.length) % tabs.length];
    if (!target) return;
    setActive(target.id);
    tabRefs.current[(index + tabs.length) % tabs.length]?.focus();
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(tabs.length - 1);
    }
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const allAccounts = tabs.flatMap((tab) => tab.sections.flatMap((section) => section.accounts));

  return (
    <section aria-labelledby={`${baseId}-title`} className="glass relative overflow-hidden rounded-[1.75rem] p-5 sm:p-6">
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full bg-neon-violet/20 blur-3xl" />
      <div className="@container relative">
        <p className="inline-flex items-center gap-2 font-mono text-xs font-semibold tracking-[0.22em] text-neon-cyan uppercase">
          <Sparkles aria-hidden="true" className="size-3.5" />
          Explore
        </p>
        <h2 id={`${baseId}-title`} className="mt-2 font-display text-xl font-semibold tracking-tight text-fg sm:text-2xl">
          Explore with a sample account
        </h2>
        <p className="mt-1.5 text-sm/6 text-fg-muted">
          One click signs you in to a ready-made account with sample requests, quotes and jobs.
        </p>

        <div
          role="tablist"
          aria-label="Sample account type"
          className="relative mt-5 grid rounded-2xl bg-canvas/60 p-1 ring-1 ring-line"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 rounded-xl bg-linear-to-r from-neon-cyan/25 to-neon-violet/25 shadow-glow-sm ring-1 ring-neon-cyan/45 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ width: `calc((100% - 0.5rem) / ${tabs.length})`, transform: `translateX(${activeIndex * 100}%)` }}
          />
          {tabs.map((tab, index) => {
            const selected = tab.id === active;
            const count = tab.sections.reduce((sum, section) => sum + section.accounts.length, 0);
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(tab.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={cn(
                  "relative z-10 flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold transition-colors sm:min-h-10",
                  selected ? "text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                {tab.label}
                <span aria-hidden="true" className="rounded-full bg-fg/10 px-1.5 text-[0.7rem] tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`${baseId}-panel-${tab.id}`}
            aria-labelledby={`${baseId}-tab-${tab.id}`}
            hidden={tab.id !== active}
            tabIndex={0}
            className="mt-4 space-y-4 rounded-xl focus-visible:outline-offset-4"
          >
            {tab.sections.map((section) => (
              <div key={section.label ?? tab.id}>
                {section.label ? (
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase">{section.label}</h3>
                ) : null}
                <ul className="stagger-children grid gap-2.5 @2xl:grid-cols-2">
                  {section.accounts.map((account) => (
                    <li
                      key={account.email}
                      className={cn(
                        "group relative flex flex-col gap-3 rounded-2xl border bg-surface/60 p-3.5 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-neon-cyan/45 hover:shadow-glow-sm",
                        account.email === selectedEmail ? "border-neon-cyan/60 shadow-glow-sm" : "border-line",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar name={account.displayName} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-fg">{account.displayName}</span>
                            <span className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ring-1", toneClasses[account.tone])}>
                              {account.chip}
                            </span>
                          </div>
                          <p className="mt-1 text-xs/5 text-fg-muted">{account.description}</p>
                        </div>
                      </div>
                      <form action={demoLoginAction} className="mt-auto">
                        <input type="hidden" name="email" value={account.email} />
                        <input type="hidden" name="next" value={next ?? ""} />
                        <SubmitButton size="sm" variant="secondary" fullWidth leadingIcon={<LogIn />} pendingText="Logging in…">
                          Log in as {account.displayName}
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}

        <details className="group mt-5 rounded-2xl bg-canvas/50 ring-1 ring-line open:ring-line-strong">
          <summary className="flex min-h-12 items-center justify-between gap-3 rounded-2xl px-4 text-sm font-semibold text-fg-muted transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <KeyRound aria-hidden="true" className="size-4 text-neon-cyan" />
              Use the form instead
            </span>
            <ChevronDown aria-hidden="true" className="size-4 transition-transform duration-300 group-open:rotate-180" />
          </summary>
          <div className="space-y-3 px-4 pb-4 text-sm text-fg-muted">
            <p className="flex flex-wrap items-center gap-2">
              Every sample account uses the password
              <code className="rounded-lg bg-surface-2 px-2 py-1 font-mono text-sm font-semibold text-fg ring-1 ring-line">{password}</code>
              <button
                type="button"
                onClick={copyPassword}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-neon-cyan ring-1 ring-neon-cyan/35 transition-colors hover:bg-neon-cyan/10 sm:min-h-8 sm:px-2"
              >
                {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <span role="status" className="sr-only">
                {copied ? "Password copied" : ""}
              </span>
            </p>
            <p>Fill in the form as:</p>
            <ul className="flex flex-wrap gap-2">
              {allAccounts.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    onClick={() => onFill(account)}
                    aria-pressed={account.email === selectedEmail}
                    className="inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-semibold text-fg-muted ring-1 ring-line-strong transition-colors hover:text-fg hover:ring-neon-cyan/50 aria-pressed:bg-neon-cyan/15 aria-pressed:text-fg aria-pressed:ring-neon-cyan/60 sm:min-h-8 sm:px-3 sm:text-xs"
                  >
                    <span className="sr-only">Fill in the form as </span>
                    {account.displayName}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </details>
      </div>
    </section>
  );
}
