// One-click sample logins work only on the computer running the app (see demoLoginAction).
// The login page uses the same check to decide whether to offer them at all, so a hosted
// site, LAN address or tunnel never shows buttons that cannot work.

/** True for requests addressed to this machine (localhost, 127.0.0.1 or ::1, any port). */
export function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  const name = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0];
  return name === "localhost" || name === "127.0.0.1" || name === "::1";
}
