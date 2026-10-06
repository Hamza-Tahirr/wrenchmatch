// The sample logins: users rows with is_demo_account = 1 (an internal flag), verified emails
// and scrypt hashes of the documented DEMO_PASSWORD. The story's main cast is exactly
// DEMO_ACCOUNTS (the one-click logins on the login page); a supporting cast of customers and
// mechanics fills the marketplace and can log in with the same password. Admins exist only
// through this seed; sign-up offers customer or mechanic accounts only.
import type { UserRole } from "@/lib/domain";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/server/auth/demo-accounts";
import { hashPassword } from "@/server/auth/password";
import type { Viewer } from "@/server/context";
import { writeTx } from "@/server/db/tx";
import { newId } from "@/server/ids";

import type { SeedAccounts, SeedRun } from "./types";

/** The sample accounts by role in the story (docs/DEMO_DATA.md). */
export const EMAIL = {
  admin: "admin@example.com",
  dana: "customer@example.com",
  luis: "customer2@example.com",
  marco: "mechanic@example.com",
  priya: "mechanic2@example.com",
  sam: "garage@example.com",
  jordan: "jordan@example.com",
  alex: "applicant@example.com",
  taylor: "suspended@example.com",
  morgan: "expired@example.com",
  casey: "rejected@example.com",
  // Supporting cast (not one-click logins).
  nina: "nina@example.com",
  omar: "omar@example.com",
  grace: "grace@example.com",
  ben: "ben@example.com",
  hannah: "hannah@example.com",
  rosa: "rosa@example.com",
  valley: "valleyauto@example.com",
  kenji: "kenji@example.com",
  elena: "elena@example.com",
  andre: "andre@example.com",
  westside: "westside@example.com",
} as const;

export type SampleEmail = (typeof EMAIL)[keyof typeof EMAIL];

/** The one-click logins (DEMO_ACCOUNTS) and the role each must have. */
const LISTED_ROLES: Readonly<Partial<Record<SampleEmail, UserRole>>> = {
  "admin@example.com": "admin",
  "customer@example.com": "customer",
  "customer2@example.com": "customer",
  "mechanic@example.com": "mechanic",
  "mechanic2@example.com": "mechanic",
  "garage@example.com": "mechanic",
  "jordan@example.com": "mechanic",
  "applicant@example.com": "mechanic",
  "suspended@example.com": "mechanic",
  "expired@example.com": "mechanic",
  "rejected@example.com": "mechanic",
};

/** The supporting cast: real accounts with the same password, not listed for one-click login. */
export const SUPPORTING_ACCOUNTS: ReadonlyArray<{ email: SampleEmail; displayName: string; role: UserRole }> = [
  { email: EMAIL.nina, displayName: "Nina P.", role: "customer" },
  { email: EMAIL.omar, displayName: "Omar H.", role: "customer" },
  { email: EMAIL.grace, displayName: "Grace W.", role: "customer" },
  { email: EMAIL.ben, displayName: "Ben C.", role: "customer" },
  { email: EMAIL.hannah, displayName: "Hannah L.", role: "customer" },
  { email: EMAIL.rosa, displayName: "Rosa M.", role: "mechanic" },
  { email: EMAIL.valley, displayName: "Valley Auto Care", role: "mechanic" },
  { email: EMAIL.kenji, displayName: "Kenji W.", role: "mechanic" },
  { email: EMAIL.elena, displayName: "Elena V.", role: "mechanic" },
  { email: EMAIL.andre, displayName: "Andre B.", role: "mechanic" },
  { email: EMAIL.westside, displayName: "Westside Garage & Tire", role: "mechanic" },
];

/**
 * Seeds every account in DEMO_ACCOUNTS, which must match the story's main cast exactly (the
 * login page lists DEMO_ACCOUNTS, so a mismatch would advertise a login that doesn't work),
 * plus the supporting cast. `signedUpAt` gives each account's sign-up time.
 */
export async function seedAccounts(run: SeedRun, signedUpAt: (email: SampleEmail) => Date): Promise<SeedAccounts> {
  const listed = new Map(DEMO_ACCOUNTS.map((account) => [account.email, account]));
  const expected = Object.entries(LISTED_ROLES) as [SampleEmail, UserRole][];
  const problems = [
    ...expected
      .filter(([email, role]) => listed.get(email)?.role !== role)
      .map(([email, role]) => `${email} should be listed as a ${role}`),
    ...DEMO_ACCOUNTS.filter((account) => !(account.email in LISTED_ROLES)).map((account) => `${account.email} has no sample data`),
    ...SUPPORTING_ACCOUNTS.filter((account) => listed.has(account.email)).map((account) => `${account.email} is listed twice`),
  ];
  if (problems.length > 0) {
    throw new Error(`DEMO_ACCOUNTS and the sample-data seed disagree: ${problems.join("; ")}.`);
  }

  const cast = [
    ...expected.map(([email, role]) => {
      const account = listed.get(email);
      if (!account) throw new Error(`Missing sample account ${email}`);
      return { email, role, displayName: account.displayName };
    }),
    ...SUPPORTING_ACCOUNTS,
  ];
  // Each account gets its own salt; scrypt runs on the libuv thread pool, so hash in parallel.
  const hashes = await Promise.all(cast.map(() => hashPassword(DEMO_PASSWORD)));
  const viewers = new Map<string, Viewer>();
  await writeTx(run.db, async (trx) => {
    for (const [index, { email, role, displayName }] of cast.entries()) {
      const id = newId();
      const at = signedUpAt(email);
      run.assertPast(at, `${email} signing up`);
      const atIso = at.toISOString();
      await trx
        .insertInto("users")
        .values({
          id,
          email,
          password_hash: hashes[index],
          role,
          display_name: displayName,
          // Local development auto-verifies emails (as sign-up does); nothing is sent.
          email_verified_at: atIso,
          is_demo_account: 1,
          created_at: atIso,
          updated_at: atIso,
        })
        .execute();
      viewers.set(email, { id, role, email, displayName });
    }
  });
  run.log(`Sample accounts: ${viewers.size} (${expected.length} one-click logins), all with the password "${DEMO_PASSWORD}".`);

  return {
    viewer(email) {
      const viewer = viewers.get(email);
      if (!viewer) throw new Error(`No sample account ${email}`);
      return viewer;
    },
    all: () => [...viewers.values()],
  };
}
