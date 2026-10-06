import "server-only";

import { headers } from "next/headers";

import { DEMO_MODE } from "@/server/config";

import { isLocalHost } from "./local-host";

/**
 * Whether this request can use the one-click sample logins: DEMO_MODE on the computer running
 * the app (see demoLoginAction). Pages that mention the sample accounts use it so a hosted site
 * never points at buttons it does not show.
 */
export async function sampleLoginsAvailable(): Promise<boolean> {
  return DEMO_MODE && isLocalHost((await headers()).get("host"));
}
