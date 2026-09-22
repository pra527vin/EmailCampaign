# ADR-0002: Version the authenticated API at /api/v1; keep /api/unsubscribe and /api/webhooks unversioned

- **Date:** 2026-09-22
- **Status:** Accepted
- **Deciders:** Flomerz engineering

## Context

Every route was mounted directly under `/api` with no version prefix
(`backend/src/routes/index.ts`). The only client today is the bundled Next.js frontend, so
nothing has broken yet — but a response-shape change to any endpoint would be a breaking
change with no migration path the moment a second client exists (a public API, a mobile
app, a partner integration).

Two routes are not like the others, though: `oneClickUnsubscribeUrl()`
(`shared/src/email/unsubscribe.ts`) bakes `${API_PUBLIC_URL}/api/unsubscribe/:token` into
the `List-Unsubscribe` header of every campaign email at send time, and the SNS webhook
(`backend/src/routes/webhook.routes.ts`) is registered with AWS as a fixed subscription
endpoint URL. Both are contracts with something outside this codebase — already-delivered
mail and a live AWS subscription — that this repo does not fully control the other end of.
Moving either path would silently break one-click unsubscribe for every email already sent,
or stop SES delivery events from ever confirming/arriving again.

## Decision

Split the single router into two:

- `publicApiRouter`, mounted at `/api` — `unsubscribe` and `webhooks` only. This surface is
  permanent and unversioned by design; it never moves.
- `v1Router`, mounted at `/api/v1` — auth, recipient-lists, templates, campaigns, settings,
  dashboard stats, preview. Everything the frontend calls.

The frontend's API client (`frontend/src/lib/api.ts`) now prefixes bare paths with
`/api/v1` by default; the one caller that needs the stable surface (the public unsubscribe
confirmation page) passes the full `/api/unsubscribe/...` path explicitly, which bypasses
that prefix.

## Alternatives considered

| Option | Why not |
|---|---|
| Version everything, including unsubscribe/webhooks | Breaks live external contracts (delivered emails, the SNS subscription) for a versioning scheme that exists to *avoid* breaking clients |
| Leave unversioned until a second client actually shows up | The migration is one PR today; it becomes a coordinated frontend+backend release once the frontend is the thing pinned to the old shape too |
| A version header instead of a URL prefix | URL-prefix versioning is simpler to test, cache, and reason about from logs; nothing here needs content negotiation |

## Consequences

**Good:** the frontend and any future API consumer can be versioned independently going
forward; the two endpoints that are actually external contracts are now explicit about it
in code and can never be accidentally versioned by someone adding a route to the wrong
router.

**Bad:** two routers to keep straight instead of one; a new contributor has to learn the
`publicApiRouter` vs. `v1Router` distinction (mitigated by the comment in
`routes/index.ts` and this ADR).

**Revisit when:** a `v2` is actually needed — at that point, add contract tests that freeze
`v1`'s response shapes before touching anything (see
`references/api-versioning.md` in the mail-campaign-architecture skill).
