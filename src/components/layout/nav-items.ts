export type ViewerRole = "customer" | "mechanic" | "admin";

export type NavItem = {
  href: string;
  label: string;
  /**
   * Path prefixes that make this item the current page (segment-aware: "/request" does
   * not match "/requests/1"). Defaults to the href's path; [] means never current.
   */
  match?: readonly string[];
};

/**
 * Main navigation per role (ARCHITECTURE section 10): customers get areas 2-5, mechanics
 * areas 6-7 and admins area 8 (its sections are in the admin sub-navigation, help desk
 * included); the logo is the landing page. Customers and mechanics also get Help & support
 * (/support). Notifications and Help are separate header buttons for every signed-in role.
 */
export const roleNavItems: Readonly<Record<ViewerRole, readonly NavItem[]>> = {
  customer: [
    { href: "/request", label: "Request repair" },
    { href: "/quotes", label: "Quotes", match: ["/quotes", "/requests"] },
    { href: "/bookings", label: "Bookings" },
    { href: "/account", label: "Account" },
    { href: "/support", label: "Support" },
  ],
  mechanic: [
    { href: "/mechanic/jobs", label: "Job board", match: ["/mechanic/jobs", "/mechanic/bookings"] },
    { href: "/mechanic/profile", label: "Profile", match: ["/mechanic/profile", "/mechanic/apply"] },
    { href: "/support", label: "Support" },
  ],
  admin: [{ href: "/admin", label: "Dashboard" }],
};

export const signedOutNav = {
  findMechanic: { href: "/request", label: "Find a Mechanic", match: [] },
  forMechanics: { href: "/signup?role=mechanic", label: "For mechanics", match: [] },
  help: { href: "/help", label: "Help" },
  logIn: { href: "/login", label: "Log in" },
  signUp: { href: "/signup", label: "Sign up" },
} as const satisfies Record<string, NavItem>;

export const helpNavItem: NavItem = { href: "/help", label: "Help" };
export const notificationsNavItem: NavItem = { href: "/notifications", label: "Notifications" };

export const roleLabels: Readonly<Record<ViewerRole, string>> = {
  customer: "Customer",
  mechanic: "Mechanic",
  admin: "Admin",
};

export function isActivePath(pathname: string, href: string, match?: readonly string[]): boolean {
  const prefixes = match ?? [href.split(/[?#]/)[0] ?? href];
  return prefixes.some((prefix) =>
    prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
