import "server-only";

import { USER_ROLES, type UserRole } from "@/lib/domain";

// Where people are sent before and after signing in. Every "next" value comes from the
// URL or a form field, so it is reduced to a same-site path before it is used anywhere.

/** Roles a person can choose when signing up. Admins exist only through the seed. */
export const SIGNUP_ROLES = ["customer", "mechanic"] as const satisfies readonly UserRole[];
export type SignupRole = (typeof SIGNUP_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

export function isSignupRole(value: unknown): value is SignupRole {
  return typeof value === "string" && (SIGNUP_ROLES as readonly string[]).includes(value);
}

const MAX_NEXT_LENGTH = 512;
// Only used to parse relative paths; never part of a returned value.
const PLACEHOLDER_ORIGIN = "http://wrenchmatch.invalid";
// Whitespace, control characters and backslashes: browsers strip or rewrite these, which
// can turn "/\evil.example" or "/\t/evil.example" into a protocol-relative URL.
const UNSAFE_CHARACTERS = /[\s\\\u0000-\u001f\u007f]/;
// Signing in must never lead back to a sign-in page.
const AUTH_PAGES = ["/login", "/signup"] as const;

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Returns `raw` as a same-site path ("/requests/abc?tab=quotes"), or null when it is not
 * a plain relative path: absolute or protocol-relative URLs ("https://x", "//x"),
 * backslashes, whitespace or control characters, anything that normalizes to "//...",
 * overlong values, and the login/signup pages themselves.
 */
export function sanitizeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || UNSAFE_CHARACTERS.test(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return null;

  // Dot segments can normalize "/.//evil.example" to "//evil.example".
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (!path.startsWith("/") || path.startsWith("//") || path.length > MAX_NEXT_LENGTH) return null;
  if (AUTH_PAGES.some((page) => isUnder(url.pathname, page))) return null;
  return path;
}

function pathnameOf(path: string): string {
  return new URL(path, PLACEHOLDER_ORIGIN).pathname;
}

/** "/login", or "/login?next=<path>" when `next` is a safe path. */
export function loginPath(next?: string | null): string {
  const safe = sanitizeNextPath(next);
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}

/** "/signup" with an optional preselected role and a safe "next" path. */
export function signupPath(options: { role?: SignupRole; next?: string | null } = {}): string {
  const params = new URLSearchParams();
  if (options.role) params.set("role", options.role);
  const safe = sanitizeNextPath(options.next);
  if (safe) params.set("next", safe);
  const query = params.toString();
  return query ? `/signup?${query}` : "/signup";
}

/** Each role's landing page after logging in without a usable "next" path. */
export const ROLE_HOME_PATHS: Readonly<Record<UserRole, string>> = {
  customer: "/account",
  mechanic: "/mechanic/jobs",
  admin: "/admin",
};

export function homePathFor(role: UserRole): string {
  return ROLE_HOME_PATHS[role];
}

// Pages every signed-in role can open.
const SHARED_PATHS = ["/notifications", "/help"] as const;

/**
 * Whether a role can use the page at `pathname`, judged by area: /mechanic belongs to
 * mechanics, /admin to admins, everything else to customers; a few pages are shared
 * (mechanics also use /support). Used only to choose a redirect target; each page still
 * checks access itself.
 */
export function isPathForRole(role: UserRole, pathname: string): boolean {
  if (pathname === "/" || SHARED_PATHS.some((shared) => isUnder(pathname, shared))) return true;
  const mechanicArea = isUnder(pathname, "/mechanic");
  const adminArea = isUnder(pathname, "/admin");
  switch (role) {
    case "customer":
      return !mechanicArea && !adminArea;
    case "mechanic":
      return mechanicArea || isUnder(pathname, "/support");
    case "admin":
      return adminArea;
  }
}

/**
 * Where to go after logging in: the safe `next` path when it belongs to the role's area
 * (a customer sent to log in from /requests/abc returns there), otherwise the role's
 * home: customer /account, mechanic /mechanic/jobs, admin /admin.
 */
export function postLoginPath(role: UserRole, next: unknown): string {
  const safe = sanitizeNextPath(next);
  return safe && isPathForRole(role, pathnameOf(safe)) ? safe : homePathFor(role);
}

/** After signing up: customers continue to `next` (or /request); mechanics start their application. */
export function postSignupPath(role: SignupRole, next: unknown): string {
  if (role === "mechanic") return "/mechanic/apply";
  const safe = sanitizeNextPath(next);
  return safe && isPathForRole("customer", pathnameOf(safe)) ? safe : "/request";
}

/** "/access-denied?need=mechanic&from=/mechanic/jobs" for a signed-in user with the wrong role. */
export function accessDeniedPath(roles: readonly UserRole[], from?: string | null): string {
  const params = new URLSearchParams();
  const needed = roles.filter(isUserRole);
  if (needed.length > 0) params.set("need", needed.join(","));
  const safe = sanitizeNextPath(from);
  if (safe) params.set("from", safe);
  const query = params.toString();
  return query ? `/access-denied?${query}` : "/access-denied";
}

/** Parses the access-denied page's "need" parameter ("mechanic" or "customer,admin"). */
export function parseRoleList(raw: unknown): UserRole[] {
  if (typeof raw !== "string") return [];
  const roles = raw.split(",").map((part) => part.trim());
  return USER_ROLES.filter((role) => roles.includes(role));
}
