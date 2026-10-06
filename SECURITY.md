# Security

Please do not open a public issue for a security problem. Report it privately with
**Security → Report a vulnerability** on this repository (private vulnerability reporting is
on), describe the issue and how to reproduce it, and allow time for a fix before sharing it.

Context for reports:

- The hosted pilot (<https://wrenchmatch.vercel.app>) holds **sample data only**. Its sample
  accounts and their shared password are public by design for demonstrations.
- **Online payments are not connected**: no card data is collected and nothing is charged.
- Secrets (Turso and Vercel Blob credentials) live in the Vercel project settings and in
  git-ignored local files (`.env.vercel`), never in this repository. If you find a credential in
  the history, report it so it can be revoked.

## How credentials are kept out of the repository

Four independent checks, so one slip is never enough:

1. **`.gitignore`** keeps `.env*` (except `.env.example`), `.vercel/`, `.data/` and the
   portable toolchain out of git.
2. **Pre-commit and pre-push hooks** (`.githooks/`, switched on by `npm install`) run
   `scripts/check-secrets.mjs`. A commit or push is refused when it contains an environment
   file, a private key, a local database, a known token format (GitHub, Vercel Blob, JWTs such
   as Turso tokens, AWS, Stripe, AI provider keys, Slack, Google, npm) or the exact value of any
   secret in this computer's `.env.vercel` / `.env.local`. This works for commits from the
   terminal and from GitHub Desktop; the pre-push check also catches commits made with
   `--no-verify`.
3. **CI** runs the same scan over every tracked file on each push and pull request
   (`npm run secrets:check` runs it locally).
4. **GitHub secret scanning with push protection** is on for this repository.

If a real secret ever reaches a commit, revoke it at the provider first, then remove it.
- A production security review is part of the remaining launch work (see the README).
