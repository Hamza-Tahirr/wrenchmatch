// Where the hosted database is, for the scripts that work on it (npm run db:push:remote and
// db:migrate:remote): TURSO_DATABASE_URL and TURSO_AUTH_TOKEN from the environment, otherwise
// from .env.vercel (written by `vercel env pull`). That file is only read here, never loaded
// into process.env, and no script reads .env.production.local.
import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

export const VERCEL_ENV_FILE = ".env.vercel";

export type RemoteTarget = {
  url: string;
  authToken: string | null;
  /** Where the settings came from, for the console ("the environment" or ".env.vercel"). */
  source: string;
};

function clean(value: string | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

/** The hosted database's settings, or null when neither place has TURSO_DATABASE_URL. */
export function readRemoteTarget(projectDir: string = process.cwd()): RemoteTarget | null {
  const url = clean(process.env.TURSO_DATABASE_URL);
  if (url) return { url, authToken: clean(process.env.TURSO_AUTH_TOKEN), source: "the environment" };

  const file = path.join(projectDir, VERCEL_ENV_FILE);
  if (!fs.existsSync(file)) return null;
  const values = parseEnv(fs.readFileSync(file, "utf8"));
  const fileUrl = clean(values.TURSO_DATABASE_URL);
  if (!fileUrl) return null;
  return { url: fileUrl, authToken: clean(values.TURSO_AUTH_TOKEN), source: VERCEL_ENV_FILE };
}

export const MISSING_REMOTE_TARGET =
  `No hosted database configured: set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, or pull them ` +
  `into ${VERCEL_ENV_FILE} with "vercel env pull ${VERCEL_ENV_FILE}".`;
