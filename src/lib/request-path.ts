// Shared by src/proxy.ts and the server auth helpers (no server-only import here: the proxy
// is compiled separately from the app's server components).

/**
 * Request header carrying the requested page's path and query ("/mechanic/jobs?tab=quotes").
 * src/proxy.ts sets it for the protected areas so their layouts, which cannot see their own
 * path, can send signed-out visitors to /login?next=<that exact page>. It is only a redirect
 * hint: the value is sanitized like any "next" parameter and never used for authorization.
 */
export const REQUEST_PATH_HEADER = "x-wm-path";
