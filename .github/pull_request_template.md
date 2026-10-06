## What changed

<!-- A short summary, and the issue it closes if there is one (Closes #123). -->

## Why

## How it was checked

- [ ] `npm run typecheck` and `npm run lint`
- [ ] `npm test` (plus `npm run test:libsql` when database code changed)
- [ ] `npm run test:e2e` for flow changes
- [ ] Affected pages checked at phone and desktop width, in the light and dark themes

## Project rules (see CONTRIBUTING.md and docs/ARCHITECTURE.md)

- [ ] No secrets, `.env*` files, database files or uploads in the diff
- [ ] Money is still computed only in `src/server/pricing.ts`
- [ ] Payments stay "coming soon": nothing moves a booking past `pending_payment`
- [ ] Queries stay scoped to the viewer (unauthorized reads return "not found")
- [ ] Schema changes come as a new `db/migrations/NNNN_*.sql` file plus `npm run db:types`
