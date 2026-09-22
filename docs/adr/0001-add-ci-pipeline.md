# ADR-0001: Add a CI pipeline (install, generate, migrate, typecheck, lint, test, build)

- **Date:** 2026-09-22
- **Status:** Accepted
- **Deciders:** Flomerz engineering

## Context

The repo had no `.github/workflows` at all. Typecheck, lint, and the vitest suite only ran
on a developer's machine, so nothing stopped a broken `main` or a migration that fails to
apply cleanly from reaching production. This was the single confirmed P1 in
`docs/AUDIT.md` — everything else the mechanical scanner flagged (missing queue, missing
tests, missing validation, etc.) turned out to already exist once checked by hand.

## Decision

Added `.github/workflows/ci.yml`: one job, triggered on every push to `main` and every
pull request, that runs against a real ephemeral Postgres 16 service container (matching
`docker-compose.yml`'s image) in this order:

1. `npm ci`
2. `prisma generate`
3. `prisma migrate deploy` against the clean database — this is the check that a migration
   file is actually valid and applies from zero, not just that it worked on whichever
   database the author's laptop already had.
4. `npm run typecheck` (all workspaces)
5. `npm run lint`
6. `npm run test` (backend vitest suite — pure-logic tests, no DB/Redis needed per
   `backend/tests/setup.ts`)
7. `npm run build` (all workspaces, including `next build`)

## Alternatives considered

| Option | Why not |
|---|---|
| Skip the Postgres service, just typecheck/lint/test/build | Would miss the exact failure mode principle #5 exists to catch: a migration that doesn't apply cleanly to a fresh database |
| Matrix across multiple Node versions | `engines` pins `>=20.11.0` and there's one deploy target; a matrix would be pure CI time cost with no real coverage gain right now |
| Separate jobs per step | One job is simpler to read and fails fast in the same order a developer would debug locally; split into parallel jobs only if the total runtime becomes a problem |

## Consequences

**Good:** a broken typecheck, lint violation, failing test, bad migration, or build error
now fails the PR instead of reaching `main`. This is the safety net every later
restructuring step depends on.

**Bad:** every PR now pays the cost of spinning up a Postgres container and running a full
build; a few extra minutes per run.

**Revisit when:** the single job's runtime becomes annoying (split into parallel jobs), or
a staging/production deploy step needs to be added after `verify` passes.
