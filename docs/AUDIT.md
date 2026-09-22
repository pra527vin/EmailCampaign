# MailStrive — Architecture Audit

Date: 2026-09-22
Scope: full monorepo (`shared`, `backend`, `worker`, `frontend`), read by hand against
the heuristic scan from `scripts/audit_repo.py`.

## Headline finding: this is not a legacy-spaghetti takeover

The mechanical scanner flagged 10 P1s. On manual verification, **7 of them are false
positives** caused by the scanner reading only the root `package.json` in this npm-workspaces
monorepo instead of each workspace's:

| Scanner claimed | Actual state |
|---|---|
| No queue library | `bullmq` + `ioredis` in `backend` and `worker`; campaign dispatch and send are real queue jobs (`shared/src/queue/index.ts`, `worker/src/processors/`) |
| No test suite | `vitest` in `backend`, 9 test files under `backend/tests/` |
| No rate limiting | `express-rate-limit` wired in `backend/src/middleware/rate-limit.ts` |
| No input validation | `zod` schemas enforced via `backend/src/middleware/validate.ts` |
| No structured logging | `pino-http` in use; only `prisma/seed.ts` and one frontend component still use `console.*` |
| TypeScript strict mode off | `tsconfig.base.json` has `strict: true`, plus `noUncheckedIndexedAccess` — scanner read `backend/tsconfig.json`, which extends it |
| In-process scheduling loses work | The flagged `setInterval` calls are session-pruning housekeeping (server) and UI status polling (frontend) — not campaign dispatch, which is properly queued |

The send pipeline (`worker/src/processors/send.processor.ts`) claims each recipient row
with an atomic conditional `UPDATE ... WHERE status IN (PENDING, QUEUED)`, so a duplicate
job physically cannot double-send — this is the idempotency guarantee the skill's
principle #6 asks for, already built. Every service function takes `userId` and every
query is scoped by it (`campaign.service.ts:requireCampaign`), so cross-account data leaks
aren't a live risk. Auth (`auth.service.ts`) does bcrypt + timing-safe session-token
comparison + server-side revocable sessions — better than most first-party implementations.

None of this means the audit was pointless — it means the actual gap list is much shorter
than the scanner's raw output, and the team should not spend effort re-solving problems
that don't exist.

## Confirmed findings

### P0 — correctness, security, or data loss

**None found.** The one scanner P0 (hardcoded secret) is a real AWS SES SMTP credential
sitting in the local `.env` — but `.env` is gitignored and was never committed (`git log
--all -- .env` is empty), and the two test-file hits are fake fixture strings
(`test-auth-secret-that-is-definitely-long-enough...`). Flagged to the user directly in
conversation since it was displayed in this session; rotate at your discretion, no code
change needed.

### P1 — blocks safe change

1. **No CI configuration.** ~~Confirmed — no `.github/workflows` in the repo.~~ **Fixed** —
   see ADR-0001. `.github/workflows/ci.yml` runs generate, `prisma migrate deploy` against
   a clean Postgres, typecheck, lint, test, and build on every push/PR.

2. **API is not versioned.** ~~Routes mount at `/recipient-lists`, `/campaigns`, etc.
   directly off `apiRouter`, with no `/v1` prefix.~~ **Fixed** — see ADR-0002. The
   frontend-facing routes now live under `/api/v1`; `/api/unsubscribe` and `/api/webhooks`
   stay unversioned deliberately, because they're external contracts (delivered-email
   links, the SNS subscription) this repo doesn't fully control the other end of.

### P2 — costs velocity

3. **Type-based folder layout.** `backend/src/{services,routes,middleware,validation}/`
   groups files by *kind* rather than by *feature* — campaign logic is spread across four
   directories. At the current size (largest service is 662 lines) this isn't costing much
   yet, but it will as `compose/` and other features grow.
   *Fix:* only worth doing if/when the team feels the pain — see recommendation below.

4. **A few files are getting large** and are candidates for splitting when next touched:
   `frontend/src/components/ui.tsx` (1451 lines), `frontend/src/app/(app)/campaigns/[id]/page.tsx`
   (740 lines), `frontend/src/components/compose/inputs.tsx` (717 lines),
   `backend/src/services/campaign.service.ts` (662 lines).

### P3 — polish

5. **No ADRs.** The reasoning behind good decisions already made (denormalised counters,
   citext emails, atomic claim-based idempotency) exists only in code comments. Worth
   capturing in `docs/adr/` so it survives the next person who touches this code, but
   doesn't block anything today.

## Not flagged, but worth naming explicitly

- **Single-tenant model.** There's no `organizationId`/tenant concept — every row is scoped
  to `userId` directly, and `User.role` is just `ADMIN`/`MEMBER`. This is consistent with
  an internal tool for one company (Flomerz), not a multi-tenant SaaS. If that's about to
  change (selling this to other companies), tenancy needs to be designed *before* the data
  model grows any further — that's a schema decision, not a refactor, and it only gets
  more expensive the longer it waits.
- **A feature is mid-flight.** Git status shows uncommitted work on a new `compose/`
  module (image composition, template service changes, a new sanitize test). Any
  structural change should land *around* that work, not compete with it — see
  recommendation below.

## Recommendation

Given the actual state — solid fundamentals, no P0s, a live feature in progress — a full
Phase 1–5 module-by-module restructure (as this skill's playbook assumes for a legacy
takeover) would be more churn than value right now. Status:

1. Ship the in-flight `compose` feature. *(unchanged — not touched by this pass)*
2. ~~Add CI~~ — **done**, ADR-0001.
3. ~~Version the API~~ — **done**, ADR-0002.
4. Revisit the folder layout only when a specific module (likely `campaigns` or the new
   `compose`) actually starts hurting to navigate — not preemptively. *(still open,
   deliberately deferred)*
5. Decide the multi-tenancy question explicitly, in an ADR, before it's forced by a sales
   conversation. *(still open — this is a product decision, not an engineering one; needs
   the team's input, not a unilateral code change)*

This is deliberately smaller than the skill's default playbook — the codebase earned that.
