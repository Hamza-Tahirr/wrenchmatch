import { Bell, CircleHelp, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/cn";
import { HeaderScrollEffect } from "./header-scroll-effect";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";
import {
  helpNavItem,
  notificationsNavItem,
  roleLabels,
  roleNavItems,
  signedOutNav,
  type NavItem,
  type ViewerRole,
} from "./nav-items";
import { NavLink } from "./nav-link";

export type SiteHeaderViewer = { role: ViewerRole; displayName: string; avatarSrc?: string | null };

export type SiteHeaderProps = {
  /** The signed-in user, or null when signed out. Only role and display name are used. */
  viewer: SiteHeaderViewer | null;
  /** Unread in-app notifications, shown as a badge on the bell. */
  unreadCount?: number;
  /** Server Action that ends the session; renders a "Log out" button when given. */
  logoutAction?: () => Promise<void>;
};

const desktopLink =
  "relative rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-fg/[0.06] hover:text-fg aria-[current=page]:text-fg aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-3 aria-[current=page]:after:-bottom-[14px] aria-[current=page]:after:h-0.5 aria-[current=page]:after:animate-[wm-tab-in_0.35s_var(--ease-out-expo)_both] aria-[current=page]:after:rounded-full aria-[current=page]:after:bg-linear-to-r aria-[current=page]:after:from-neon-cyan aria-[current=page]:after:to-neon-violet aria-[current=page]:after:shadow-[0_0_12px_var(--color-neon-cyan)]";
const mobileLink =
  "relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-base font-medium text-fg-muted transition-colors hover:bg-fg/[0.06] hover:text-fg aria-[current=page]:bg-neon-cyan/[0.08] aria-[current=page]:text-fg aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-2 aria-[current=page]:before:left-0 aria-[current=page]:before:w-0.5 aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-neon-cyan aria-[current=page]:before:shadow-[0_0_10px_var(--color-neon-cyan)]";

function NavItems({ items, linkClassName }: { items: readonly NavItem[]; linkClassName: string }) {
  return items.map((item) => (
    <li key={item.href}>
      <NavLink href={item.href} match={item.match} className={linkClassName}>
        {item.label}
      </NavLink>
    </li>
  ));
}

function UnreadBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "grid h-5 min-w-5 place-items-center rounded-full bg-linear-to-br from-danger-500 to-neon-pink px-1.5 font-mono text-[0.6875rem] font-semibold text-on-brand tabular-nums shadow-glow-danger",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function NotificationsButton({ count }: { count: number }) {
  return (
    <NavLink
      href={notificationsNavItem.href}
      className="group relative inline-flex size-11 items-center justify-center rounded-xl text-fg-muted transition-colors hover:bg-fg/[0.06] hover:text-fg aria-[current=page]:bg-neon-cyan/10 aria-[current=page]:text-brand-800 lg:size-10"
    >
      <Bell aria-hidden="true" className={cn("size-5 origin-top transition-transform group-hover:rotate-12", count > 0 && "text-fg")} />
      <span className="sr-only">
        {notificationsNavItem.label}
        {count > 0 ? `, ${count} unread` : ""}
      </span>
      {count > 0 ? (
        <span aria-hidden="true" className="absolute -top-0.5 -right-0.5">
          <UnreadBadge count={count} className="ring-2 ring-canvas" />
        </span>
      ) : null}
    </NavLink>
  );
}

/** Help Center as an icon button from lg up; the small-screen menu lists it as a link. */
function HelpButton() {
  return (
    <NavLink
      href={helpNavItem.href}
      title={helpNavItem.label}
      className="relative hidden size-10 items-center justify-center rounded-xl text-fg-muted transition-colors hover:bg-fg/[0.06] hover:text-fg aria-[current=page]:bg-neon-cyan/10 aria-[current=page]:text-brand-800 lg:inline-flex"
    >
      <CircleHelp aria-hidden="true" className="size-5" />
      <span className="sr-only">{helpNavItem.label}</span>
    </NavLink>
  );
}

function LogoutForm({ action, fullWidth = false }: { action: () => Promise<void>; fullWidth?: boolean }) {
  return (
    <form action={action} className={fullWidth ? "min-w-0 flex-1" : undefined}>
      <SubmitButton
        variant={fullWidth ? "secondary" : "ghost"}
        size={fullWidth ? "md" : "sm"}
        fullWidth={fullWidth}
        leadingIcon={<LogOut />}
        pendingText="Logging out…"
      >
        Log out
      </SubmitButton>
    </form>
  );
}

function SignedInHeader({
  viewer,
  unreadCount,
  logoutAction,
}: {
  viewer: SiteHeaderViewer;
  unreadCount: number;
  logoutAction?: () => Promise<void>;
}) {
  const items = roleNavItems[viewer.role];
  return (
    <>
      <nav aria-label="Main" className="ml-6 hidden lg:block">
        <ul className="flex items-center gap-1">
          <NavItems items={items} linkClassName={desktopLink} />
        </ul>
      </nav>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <HelpButton />
        <NotificationsButton count={unreadCount} />
        <div className="hidden items-center gap-2.5 border-l border-line pl-3 lg:flex">
          <Avatar name={viewer.displayName} src={viewer.avatarSrc} size="sm" />
          {/* From xl the name shows beside the avatar; at lg it stays available to screen readers. */}
          <div className="sr-only leading-tight xl:not-sr-only xl:max-w-40">
            <p className="truncate text-sm font-medium text-fg">{viewer.displayName}</p>
            <p className="font-mono text-[11px] tracking-wide text-fg-subtle uppercase">{roleLabels[viewer.role]}</p>
          </div>
          {logoutAction ? <LogoutForm action={logoutAction} /> : null}
          <ThemeToggle />
        </div>
        {/* Log out is pinned to the bottom of the sheet, with the theme toggle beside it. */}
        <MobileMenu footer={logoutAction ? <LogoutForm action={logoutAction} fullWidth /> : undefined}>
          <div className="space-y-4 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3 border-b border-line px-3 pb-4">
              <Avatar name={viewer.displayName} src={viewer.avatarSrc} size="md" />
              <div className="min-w-0 leading-tight">
                <p className="truncate font-medium text-fg">{viewer.displayName}</p>
                <p className="text-sm text-fg-muted">{roleLabels[viewer.role]} account</p>
              </div>
            </div>
            <nav aria-label="Main">
              <ul className="stagger-children space-y-1">
                <NavItems items={items} linkClassName={mobileLink} />
                <li>
                  <NavLink href={notificationsNavItem.href} className={mobileLink}>
                    {notificationsNavItem.label}
                    {unreadCount > 0 ? (
                      <span className="ml-auto inline-flex items-center gap-1.5 text-sm font-normal text-fg-subtle">
                        <UnreadBadge count={unreadCount} />
                        unread
                      </span>
                    ) : null}
                  </NavLink>
                </li>
                <NavItems items={[helpNavItem]} linkClassName={mobileLink} />
              </ul>
            </nav>
          </div>
        </MobileMenu>
      </div>
    </>
  );
}

function SignedOutHeader() {
  const { findMechanic, forMechanics, help, logIn, signUp } = signedOutNav;
  return (
    <div className="ml-auto flex items-center gap-2">
      <nav aria-label="Main" className="hidden lg:block">
        <ul className="flex items-center gap-1">
          <NavItems items={[forMechanics, help, logIn]} linkClassName={desktopLink} />
          <li className="ml-1">
            <ThemeToggle />
          </li>
          <li className="ml-1">
            <NavLink href={signUp.href} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              {signUp.label}
            </NavLink>
          </li>
          <li className="ml-1">
            <NavLink href={findMechanic.href} match={findMechanic.match} className={buttonClasses({ size: "sm" })}>
              {findMechanic.label}
            </NavLink>
          </li>
        </ul>
      </nav>
      {/* Visibility lives on a wrapper: the button's own inline-flex would override `hidden`. */}
      <div className="hidden sm:block lg:hidden">
        <NavLink href={findMechanic.href} match={findMechanic.match} className={buttonClasses({ size: "sm" })}>
          {findMechanic.label}
        </NavLink>
      </div>
      {/* Sign up is pinned to the bottom of the sheet, with the theme toggle beside it. */}
      <MobileMenu
        footer={
          <NavLink href={signUp.href} className={buttonClasses({ variant: "secondary", fullWidth: true })}>
            {signUp.label}
          </NavLink>
        }
      >
        <nav aria-label="Main" className="space-y-4 px-4 py-4 sm:px-6">
          <NavLink
            href={findMechanic.href}
            match={findMechanic.match}
            className={buttonClasses({ size: "lg", fullWidth: true })}
          >
            {findMechanic.label}
          </NavLink>
          <ul className="stagger-children space-y-1">
            <NavItems items={[forMechanics, help, logIn]} linkClassName={mobileLink} />
          </ul>
        </nav>
      </MobileMenu>
    </div>
  );
}

/** Site header with role-aware navigation, notifications and a small-screen menu. */
export function SiteHeader({ viewer, unreadCount = 0, logoutAction }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-(--wm-header-bg) pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 transition-[background-color,box-shadow] duration-300 data-[scrolled=true]:bg-(--wm-header-bg-scrolled) data-[scrolled=true]:shadow-(--wm-shadow-header)">
      <HeaderScrollEffect />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-linear-to-r from-transparent via-neon-cyan/60 to-transparent opacity-0 transition-opacity duration-300 [[data-scrolled=true]_&]:opacity-100"
      />
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Logo />
        {viewer ? (
          <SignedInHeader viewer={viewer} unreadCount={unreadCount} logoutAction={logoutAction} />
        ) : (
          <SignedOutHeader />
        )}
      </div>
    </header>
  );
}
