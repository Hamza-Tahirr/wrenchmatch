import { NextResponse, type NextRequest } from "next/server";

import { REQUEST_PATH_HEADER } from "@/lib/request-path";

// Runs before the protected areas render. It makes no access decision: it only forwards the
// requested path and query to the layouts (REQUEST_PATH_HEADER), whose requireRole() checks
// answer a signed-out visitor with a real 307 to /login?next=<this page> (and a wrong role
// with /access-denied) before any loading state streams. Pages, Server Actions and domain
// functions keep their own checks.

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const query = new URLSearchParams(searchParams);
  query.delete("_rsc");
  const search = query.toString();

  const headers = new Headers(request.headers);
  headers.set(REQUEST_PATH_HEADER, search ? `${pathname}?${search}` : pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/account/:path*",
    "/admin/:path*",
    "/bookings/:path*",
    "/mechanic/:path*",
    "/notifications/:path*",
    "/quotes/:path*",
    "/requests/:path*",
    "/support/:path*",
  ],
};
