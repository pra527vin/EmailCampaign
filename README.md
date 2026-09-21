# MailStrive

A production-ready system for managing and sending **personalised, permission-based**
bulk email campaigns through Amazon SES.

Every recipient receives an independently generated message addressed only to
them. Nothing is ever placed in `CC` or `BCC`, campaigns resume without
re-mailing anyone who already received the message, and unsubscribed addresses
are suppressed permanently across all future campaigns.

---

## Contents

- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Quick start (Windows)](#quick-start-windows)
- [Quick start (manual)](#quick-start-manual)
- [Configuration](#configuration)
- [Amazon SES setup](#amazon-ses-setup)
- [Domain authentication (SPF, DKIM, DMARC)](#domain-authentication-spf-dkim-dmarc)
- [Bounce and complaint handling](#bounce-and-complaint-handling)
- [How sending works](#how-sending-works)
- [Templates and personalisation](#templates-and-personalisation)
- [CSV format](#csv-format)
- [API reference](#api-reference)
- [Database schema](#database-schema)
- [Security](#security)
- [Compliance](#compliance)
- [Testing](#testing)
- [Production deployment](#production-deployment)
- [Operations runbook](#operations-runbook)

---

## Architecture

```
        Browser
           │  same-origin /api/* (Next.js rewrite proxy)
           ▼
   ┌───────────────┐
   │  Next.js UI   │  App Router · Tailwind · session cookie
   └───────┬───────┘
           │ HTTP
           ▼
   ┌───────────────┐        ┌──────────────┐
   │  Node.js API  │───────▶│  PostgreSQL  │  campaigns, recipients, events
   │   (Express)   │        └──────────────┘
   └───────┬───────┘
           │ enqueue
           ▼
   ┌───────────────┐
   │ Redis / BullMQ│  rate-limited job queue
   └───────┬───────┘
           │ consume
           ▼
   ┌───────────────┐        ┌──────────────┐
   │ Email Worker  │───────▶│  Amazon SES  │
   └───────────────┘        └──────┬───────┘
                                   │ SNS events
                                   ▼
                         POST /api/webhooks/ses
                    (signature-verified bounce / complaint)
```

The API never sends email. It writes rows and enqueues jobs; the worker owns
every call to SES. That separation is what lets a campaign of any size start
from a single HTTP request that returns in milliseconds, and it means the API
and the workers scale independently.

### Why there is a `shared` package

The deliverables list names `/backend` and `/worker`. Both need the same SES
client, the same MIME builder, the same personalisation logic and the same
unsubscribe-token signing — the API uses them to build a preview, the worker
uses them to build the real message. Duplicating that code would guarantee the
preview and the delivered message eventually drift apart, which is the one thing
a preview must never do. So it lives once, in `shared/`, and both import it.

---

## Repository layout

```
run.bat          One-command launcher for Windows (start / prod / stop)
prisma/          Schema, migrations and the bootstrap seed script
shared/          @mailstrive/shared — env, db, logger, queues, SES, MIME, rendering, tokens
backend/         @mailstrive/backend — Express REST API
worker/          @mailstrive/worker — BullMQ dispatch + send workers
frontend/        @mailstrive/frontend — Next.js dashboard
examples/        Example CSV and HTML email template
docker/          Optional container images (not required — see run.bat)
docker-compose.yml
.env.example
```

Each of `shared`, `backend`, `worker`, `frontend` is an npm workspace with its
own `package.json` and `tsconfig.json`, wired together with TypeScript project
references.

---

## Quick start (Windows)

### Prerequisites

Three things must be installed. The launcher checks for all of them and tells
you what is missing.

| | |
| --- | --- |
| **Node.js 20+** | <https://nodejs.org/> (LTS build) |
| **PostgreSQL 14+** | <https://www.postgresql.org/download/windows/> — the standard installer includes the `citext` extension the schema needs |
| **Redis** | [Memurai](https://www.memurai.com/get-memurai) is a native Redis-compatible server for Windows. Alternatively run Redis inside WSL: `wsl sudo service redis-server start` |

Create the database once, using the SQL shell (psql) that came with PostgreSQL:

```sql
CREATE ROLE mailstrive LOGIN PASSWORD 'mailstrive' SUPERUSER;
CREATE DATABASE mailstrive OWNER mailstrive;
```

`SUPERUSER` is only needed so the first migration can run
`CREATE EXTENSION citext`. You can drop the attribute afterwards.

### Run it

Double-click **`run.bat`**, or from a terminal:

```bat
run.bat
```

On the first run it will:

1. verify your Node version,
2. create `.env` from `.env.example` and generate `AUTH_SECRET` and
   `UNSUBSCRIBE_SECRET` for you,
3. install npm packages,
4. check that PostgreSQL and Redis are actually reachable,
5. generate the Prisma client and apply migrations,
6. create the admin account from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`,
7. open three windows — **API**, **Worker**, **Web** — and launch your browser.

Sign in at <http://localhost:3000> with the seeded admin credentials.

### Launcher commands

| Command | What it does |
| --- | --- |
| `run.bat` | Development mode with hot reload. The default. |
| `run.bat prod` | Builds all four packages, then runs the compiled output. |
| `run.bat stop` | Closes the three service windows. Leaves PostgreSQL and Redis running. |
| `run.bat help` | Usage summary. |

It is safe to run repeatedly: dependency install, migration and seeding are all
idempotent, and it refuses to launch anything if a prerequisite is missing
rather than leaving half the system up.

### Trying it without sending real email

`.env` starts with `SES_SANDBOX_DRY_RUN=true` left alone. Messages are fully
composed — headers, MIME parts, personalisation, unsubscribe tokens — and
recorded as sent, but never handed to SES. That lets you exercise the entire
pipeline before your domain is verified. Set it to `false` when you are ready to
send for real; it is rejected outright at boot when `NODE_ENV=production`.

---

## Quick start (manual)

For macOS, Linux, or if you would rather drive it yourself. Requires Node
20.11+, PostgreSQL 14+ (with `citext` available) and Redis 6+.

```bash
npm install
cp .env.example .env          # set AUTH_SECRET, UNSUBSCRIBE_SECRET, SES_*, SEED_ADMIN_*

npm run prisma:generate
npm run prisma:deploy         # applies migrations
npm run seed                  # creates the admin user + example template

npm run dev                   # API :4000, worker, and web :3000 together
```

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Individual processes:

```bash
npm run dev:api
npm run dev:worker
npm run dev:web
```

Verify everything before committing:

```bash
npm run verify                # lint + typecheck (all 4 packages) + tests
```

### Containers (optional)

`docker/` and `docker-compose.yml` are included but are **not** required for any
of the above. If you do want them, `docker compose up -d --build` starts
Postgres, Redis, migrations, API, worker and web together.

---

## Configuration

All configuration is environment-based and validated with Zod at process start —
a bad value fails the boot, not the campaign. See `.env.example` for the
annotated list. The values worth understanding:

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Signs session JWTs. Minimum 32 chars. Rotating it logs everyone out. |
| `UNSUBSCRIBE_SECRET` | Signs unsubscribe tokens. **Separate** from `AUTH_SECRET` — these tokens live in people's inboxes for years. Rotating it invalidates every unsubscribe link already delivered. |
| `APP_URL` | Public URL of the dashboard. Used for in-body unsubscribe links and CORS. |
| `API_PUBLIC_URL` | Public URL of the API. Must be reachable by Amazon SNS and by mailbox providers performing one-click unsubscribe. |
| `SES_MAX_SEND_RATE` | Messages/second handed to SES. Keep at or below your account quota. Shared across all worker replicas via Redis. |
| `WORKER_CONCURRENCY` | Parallel send jobs per worker process. Bounded above by the rate limiter. |
| `SEND_MAX_ATTEMPTS` | Attempts before a recipient is marked permanently `FAILED`. |
| `SES_CONFIGURATION_SET` | Enables SES event publishing to SNS. Required for delivery/open/click events. |
| `SES_SANDBOX_DRY_RUN` | Compose but do not send. Forbidden in production. |
| `SES_TRANSPORT` | `api` (default, SigV4 with an IAM key pair) or `smtp` (SES SMTP credentials on port 587). See below. |
| `SES_SMTP_USERNAME` / `SES_SMTP_PASSWORD` | SES SMTP credentials. Required when `SES_TRANSPORT=smtp`. **Not** an IAM key pair. |
| `COOKIE_SECURE` | Set `true` behind HTTPS. Also enables HSTS. |

Secrets are never sent to the frontend and are redacted from logs by the logger
configuration (`shared/src/logger/index.ts`).

---

## Amazon SES setup

### Two ways to reach SES

The same message can go out over either transport; the MIME bytes, headers and
List-Unsubscribe are identical. Only authentication differs.

| | `SES_TRANSPORT=api` | `SES_TRANSPORT=smtp` |
| --- | --- | --- |
| Credentials | IAM access key + secret (**40** chars) | SES SMTP username + password (**44** chars) |
| Where from | IAM console | SES console → SMTP settings |
| Wire | HTTPS, SigV4-signed | SMTP over STARTTLS, port 587 |
| Account quota & identity status on the Settings page | yes | no — API-only |
| Bounce/complaint events | configuration set parameter | `X-SES-CONFIGURATION-SET` header (handled for you) |

**These two credential types are not interchangeable**, and confusing them is by
far the most common setup failure:

- An SMTP password used as `AWS_SECRET_ACCESS_KEY` fails every send with
  `InvalidSignatureException` — the key ID is recognised, so AWS computes a
  signature and finds it does not match.
- An IAM secret used as `SES_SMTP_PASSWORD` fails with `535 Authentication
  Credentials Invalid`.

One more trap specific to SMTP: **SES SMTP passwords are derived per region.**
Credentials created in `us-east-2` are rejected by `us-east-1` with the same
`535`, so `AWS_REGION` must be the region the credentials were created in. The
SMTP host defaults to `email-smtp.<AWS_REGION>.amazonaws.com`.

To use SMTP:

```dotenv
SES_TRANSPORT=smtp
AWS_REGION=us-east-2          # the region the SMTP credentials were made in
SES_SMTP_USERNAME=AKIA...
SES_SMTP_PASSWORD=...
```

The Settings page reports which transport is active and, for SMTP, connects and
authenticates without sending so you can confirm the credentials before a
campaign. The worker reads credentials at startup, so restart it after a change.

### Setting up the account

1. **Verify a sender identity** in your chosen region — either the exact address
   in `SES_FROM_EMAIL` or, preferably, its whole domain. Domain verification is
   what lets SES apply DKIM signing.
2. **Request production access.** A new SES account is in the sandbox: it can
   only send to verified addresses and has a very low quota. Campaigns will fail
   until this is granted.
3. **Create a configuration set** and put its name in `SES_CONFIGURATION_SET`.
   Without one, SES cannot publish delivery, bounce and complaint events.
4. **Create an SNS topic**, subscribe it to the configuration set's event
   destination, and add an HTTPS subscription pointing at:

   ```
   https://your-api-domain/api/webhooks/ses
   ```

   The endpoint confirms the subscription automatically. It verifies the AWS
   signature on every message before acting on it — see
   `backend/src/services/sns-verifier.ts`.
5. **Use a least-privilege IAM policy.** The application needs only:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": [
         "ses:SendEmail",
         "ses:GetAccount",
         "ses:GetEmailIdentity",
         "ses:ListEmailIdentities"
       ],
       "Resource": "*"
     }]
   }
   ```

   In AWS, prefer an instance role or IRSA over static keys: leave
   `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` unset and the SDK's default
   credential chain takes over.

The **Settings** page reports live account status: sending enabled, production
access, 24-hour quota, current usage, identity verification and DKIM state.

---

## Domain authentication (SPF, DKIM, DMARC)

**These are DNS records, not application settings.** The application's
responsibility is to emit standards-compliant headers and send only from a
verified identity; alignment is configured at the DNS level.

| Record | Where | Value |
| --- | --- | --- |
| **DKIM** | DNS (3 CNAMEs) | Published by SES when you verify the domain. SES signs each outgoing message with it. |
| **SPF** | DNS (TXT) | Include Amazon SES: `v=spf1 include:amazonses.com ~all` (merge with any existing SPF record — you may only have one). |
| **DMARC** | DNS (TXT at `_dmarc.yourdomain.com`) | Start at `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com`, review the reports, then tighten to `p=quarantine` and `p=reject`. |
| **Custom MAIL FROM** | SES console + DNS | Optional but recommended: gives SPF alignment under your own domain instead of `amazonses.com`. |

Verify alignment before a first real campaign by sending to a seed address and
checking the received headers show `spf=pass`, `dkim=pass` and `dmarc=pass`.

**Settings → Domain authentication** checks the first three from DNS and gives
you the exact record to publish for anything missing. A DNS lookup that fails
is reported as a failed lookup, not as a missing record, so a local resolver
problem never sends you to edit a zone file.

One trap it exists to catch: verifying the *address* in SES is not the same as
verifying the *domain*. With only the address verified, SES signs with its own
`amazonses.com` key. The signature is valid but does not align with your From
domain, so DMARC then depends entirely on SPF.

---

## Inbox placement

There is no header, flag or setting that puts a message in someone's Primary
tab, and this application deliberately offers none. Anything that claims to
works by impersonating a different kind of mail, which breaks Google's bulk
sender requirements and anti-spam law, and costs more reputation than it buys.

What actually decides it, in order:

1. **Authentication.** SPF, DKIM and DMARC aligned to your own domain. Without
   this, nothing else matters — the message is filtered before content is
   considered. See the section above.
2. **Reputation.** Built from complaint rate, bounce rate, how consistently you
   send, and whether recipients open and reply. A new domain has none, so start
   at a few hundred messages a day to engaged recipients and grow over two to
   four weeks rather than sending to a whole list at once.
3. **List quality.** Only people who asked to hear from you. A purchased or
   scraped list produces complaints that follow the domain for months.
4. **Content.** Once a sender is trusted, Gmail sorts between Primary and
   Promotions by reading the message the way a person would.

The template preview reports on the fourth: image-dominated layouts, a long list
of links, 1×1 tracking pixels and URL shorteners are all noted, because each
pushes a message towards Promotions. A short, mostly-text message with one clear
link reads as correspondence; a full-width hero image with twelve buttons does
not, however it is authenticated.

What the preview will never suggest is removing the unsubscribe link or the
`List-Unsubscribe` header. Both are required for bulk mail, and dropping them to
look less promotional is exactly the evasion that gets a domain blocked.

### What the application does *not* do

It does not add misleading, spoofed or decorative headers, and it makes no
attempt to evade spam filtering. The headers it sets are exactly those defined
by RFC 5322, RFC 2045 and RFC 8058:

`From`, `To`, `Reply-To`, `Date`, `Message-ID`, `MIME-Version`, `Content-Type`,
`List-Unsubscribe`, `List-Unsubscribe-Post`, plus an `X-Campaign-ID` for your own
operational correlation.

Deliverability comes from authenticated domains, clean lists, genuine consent and
a low complaint rate. There is no substitute.

---

## Bounce and complaint handling

SNS events arrive at `POST /api/webhooks/ses` and are correlated to a recipient
by SES message id.

| Event | Effect |
| --- | --- |
| **Permanent (hard) bounce** | Recipient marked `BOUNCED`; address **suppressed permanently**. |
| **Transient bounce** | Recipient marked `BOUNCED`. **Not** suppressed — a full mailbox is not a bad address. |
| **Complaint** | Recipient marked `COMPLAINT`; address **suppressed permanently**. A complaint is an explicit statement that the mail is unwanted. |
| **Reject** | Recipient marked `FAILED`. |
| **Delivery / Open / Click** | Recorded in `email_events` for reporting. Status is unchanged — `SENT` already reflects a successful handoff. |

Bounces and complaints that arrive after a send decrement the campaign's
`sentCount`, so the dashboard reflects what actually reached a mailbox rather
than what was handed to SES.

Amazon SES expects bounce rates below **5%** and complaint rates below **0.1%**.
Exceeding either can get an account placed under review or suspended. The
dashboard surfaces both figures.

---

## How sending works

```
POST /api/campaigns/:id/start
   │
   ├─ materialise campaign_recipients from the list
   │    · suppressed addresses inserted as SKIPPED, not omitted, so the
   │      campaign record shows they were considered
   ├─ campaign → QUEUED
   └─ enqueue one campaign-dispatch job
            │
            ▼
      dispatch worker
            │  pages campaign_recipients WHERE status = PENDING (keyset cursor)
            │  flips each batch to QUEUED, then addBulk() to the send queue
            │  re-reads campaign status between batches → pause/cancel land fast
            ▼
      send worker  (concurrency N, limiter = SES_MAX_SEND_RATE/sec)
            │
            ├─ campaign PAUSED?    → recipient back to PENDING, no send
            ├─ campaign CANCELLED? → recipient SKIPPED, no send
            ├─ CLAIM: UPDATE ... WHERE status IN (PENDING, QUEUED) → SENDING
            │     count = 0 means someone else has it, or it is already SENT.
            │     This is the idempotency guarantee.
            ├─ suppression re-check (they may have unsubscribed while queued)
            ├─ compose → personalise → build MIME → SES SendEmail (one To:)
            └─ SENT + message id, or retry with exponential backoff, or FAILED
```

### The guarantees, and where they are enforced

| Guarantee | Mechanism |
| --- | --- |
| One message per recipient | `Destination.ToAddresses` always has exactly one entry; `CC`/`BCC` are never populated. Asserted in `backend/tests/email-compose.test.ts`. |
| No recipient sees another | Each message is composed from one recipient's row. Nothing iterates a list into a header. |
| No double send | Atomic conditional `UPDATE` claims the row. A `SENT` row is not claimable, so a duplicate job is a no-op. |
| Resume never re-mails | Only `PENDING`/`QUEUED` are resumable. `SENT`, `BOUNCED`, `COMPLAINT` and `UNSUBSCRIBED` are excluded by construction. |
| Suppressed addresses skipped | Checked at import, at materialisation, and once more inside the send job immediately before the SES call. |
| SES rate respected | BullMQ limiter keyed in Redis, so N worker replicas *divide* the budget rather than each taking it. |
| Survives a restart | On boot the worker returns stranded `SENDING`/`QUEUED` rows to `PENDING` and re-dispatches any campaign still in flight. |

### Pause, resume, cancel

Pause does not perform queue surgery. It flips the campaign status; in-flight
jobs observe it and return their recipient to `PENDING` without sending. Resume
re-dispatches from `PENDING`. This is why pause is instant and lossless even
with tens of thousands of jobs already queued.

### Retry

Transient SES failures (throttling, 5xx, network) are retried by BullMQ with
exponential backoff up to `SEND_MAX_ATTEMPTS`. Permanent rejections
(`MessageRejected`, unverified identity, validation errors) fail immediately
without burning attempts. After a campaign finishes, **Retry failed** resets
only `FAILED` recipients and re-runs them.

---

## Templates and personalisation

Templates use a deliberately minimal syntax:

```
{{name}}                    substitute, empty if missing
{{first_name | there}}      substitute, or "there" if missing or blank
{{unsubscribe_url}}         this recipient's signed unsubscribe link
```

There are no loops, conditionals or expressions. That is a security decision: a
template engine with an evaluation path, applied to user-supplied bodies, is a
server-side template injection vulnerability. Substituted values are HTML-escaped
in HTML contexts.

Variable names are matched case- and separator-insensitively, so `{{storeName}}`,
`{{store_name}}` and `{{Store Name}}` all resolve the same CSV column.

Standard fields (`email`, `name`, `first_name`, `last_name`, `company`,
`store_name`, `store_url`) always take precedence over custom CSV columns — an
`email` column in a CSV cannot redirect a message.

**Plain text**: supply your own, or leave it blank and a readable text
alternative is generated from the HTML (link targets preserved as
`label <https://…>`). Every message is sent as `multipart/alternative` with a
real text part.

**Unsubscribe footer**: if a template contains no unsubscribe link, a compliant
footer is appended automatically before `</body>`. You cannot accidentally send a
marketing message without an opt-out.

See `examples/merchant-announcement.html` for a complete responsive template.

---

## CSV format

Only `email` is required. Header matching is case- and separator-insensitive,
and these aliases are recognised:

| Field | Accepted headers |
| --- | --- |
| `email` | email, e-mail, email_address, mail, merchant_email |
| `name` | name, full name, contact_name, merchant_name |
| `first_name` | first_name, firstname, fname, given_name |
| `last_name` | last_name, lastname, surname, family_name |
| `company` | company, company_name, business, organisation |
| `store_name` | store_name, shop_name, store |
| `store_url` | store_url, shop_url, website, url, site |

**Every other column is preserved** and becomes available as `{{column_name}}`.

```csv
email,first_name,last_name,store_name,store_url,plan,city
amelia.stone@example.com,Amelia,Stone,Stone Goods,https://stonegoods.example.com,Pro,Manchester
```

### Mapping the columns yourself

The aliases above are only the opening guess. When you choose a file, the upload
form reads its header row in the browser and shows every column with a couple of
sample values, and each one can be pointed anywhere:

- at a first-class field, so a column called `Contact` becomes the address even
  though no alias would have matched it;
- at a **custom variable** with a name you choose, so `Tier` can be imported as
  `{{plan_tier}}` rather than `{{tier}}`;
- at **Do not import**, for columns that should not be stored at all.

The mapping travels with the upload and the server re-applies it while parsing,
so it is the file on the server that decides what is stored -- the browser only
collects the choices. Names you type are sanitised into usable placeholders
(`Plan Tier!` becomes `plan_tier`), a custom column can never shadow a mapped
field or `unsubscribe_url`, and two columns cannot claim the same field. If the
file changes between choosing and uploading, each entry is re-matched by header
name and falls back to auto-detection rather than writing one column's values
into another column's field.

The list page then shows exactly the placeholders that were produced, which are
the same names a template refers to.

### After the import

On import you get a summary of total rows, valid, invalid, duplicate, suppressed
and imported counts, plus the first 100 rejected rows with reasons. The original
file is archived to `UPLOAD_DIR` and its SHA-256 recorded, so any import can be
audited later.

Individual recipients can be edited afterwards from the list page -- address,
name parts, company, store and custom fields -- which is the quickest way to fix
a typo before a campaign goes out. Editing is refused while a campaign using that
list is queued, sending or paused, because those campaigns have already
snapshotted their recipients and the edit would silently disagree with what is
being delivered.

A working example is in `examples/merchants.csv`.

---

## API reference

All responses are `{ "data": ... }` on success and
`{ "error": { "code", "message", "details?" } }` on failure.

### Public

```
POST   /api/auth/login                  email + password → session cookie + CSRF token
POST   /api/auth/logout
GET    /api/unsubscribe/:token          inspect a token (for the confirmation page)
POST   /api/unsubscribe/:token          RFC 8058 one-click unsubscribe
POST   /api/unsubscribe/:token/confirm  confirmed from the hosted page
POST   /api/webhooks/ses                SNS events (AWS signature verified)
GET    /api/health                      readiness, includes a database check
```

### Authenticated

```
GET    /api/auth/me
POST   /api/auth/change-password
GET    /api/auth/sessions

POST   /api/recipient-lists/upload      multipart: file, name, description, skipSuppressed, columnMap
GET    /api/recipient-lists
GET    /api/recipient-lists/:id
GET    /api/recipient-lists/:id/recipients
PATCH  /api/recipient-lists/:id/recipients/:recipientId   edit one recipient
DELETE /api/recipient-lists/:id

GET    /api/templates
POST   /api/templates
GET    /api/templates/:id
PUT    /api/templates/:id
PATCH  /api/templates/:id/status        activate / deactivate
POST   /api/templates/:id/duplicate
DELETE /api/templates/:id

GET    /api/campaigns
POST   /api/campaigns
GET    /api/campaigns/:id
PUT    /api/campaigns/:id               drafts only
GET    /api/campaigns/:id/progress      lightweight, for polling
GET    /api/campaigns/:id/recipients    filter by status, search by email
GET    /api/campaigns/:id/events
POST   /api/campaigns/:id/start
POST   /api/campaigns/:id/pause
POST   /api/campaigns/:id/resume
POST   /api/campaigns/:id/cancel
POST   /api/campaigns/:id/retry-failed
DELETE /api/campaigns/:id

POST   /api/preview                     template id, campaign id, or raw HTML

GET    /api/dashboard/stats

GET    /api/settings/sender             live SES account + identity status
GET    /api/settings/deliverability     SPF/DKIM/DMARC check for the sending domain
GET    /api/settings/queue              queue depth
GET    /api/settings/suppressions
POST   /api/settings/suppressions
DELETE /api/settings/suppressions/:email
GET    /api/settings/audit-logs         admin only
GET    /api/settings/users              admin only
POST   /api/settings/users              admin only
PATCH  /api/settings/users/:id          admin only
```

Mutating requests require the `X-CSRF-Token` header matching the
`mailstrive_csrf` cookie. The frontend client does this automatically.

---

## Database schema

Nine tables, defined in `prisma/schema.prisma`:

| Table | Purpose |
| --- | --- |
| `users` | Accounts, roles, bcrypt password hashes |
| `sessions` | Server-side sessions, so logout and revocation take effect immediately |
| `email_templates` | HTML + text bodies, discovered variables, status |
| `recipient_lists` | One CSV import, with its full statistics and file provenance |
| `recipients` | Immutable imported rows; a campaign never mutates them |
| `campaigns` | Definition plus denormalised counters |
| `campaign_recipients` | Per-send state — the queue's unit of work |
| `email_events` | SES event history, correlated by message id |
| `suppression_list` | Global do-not-contact list |
| `audit_logs` | Who did what, when, from where |

Design notes:

- **`recipients` vs `campaign_recipients`.** The imported data is immutable; per
  send state is separate. That is what lets one list be mailed many times with
  each run keeping its own independent history.
- **Denormalised counters on `campaigns`.** The dashboard and the progress poller
  read them constantly; they must not scan millions of rows.
- **`citext` email columns.** Case-insensitive uniqueness without `lower()`
  everywhere. The unique constraints on `users.email`,
  `suppression_list.email` and `(list_id, email)` are what stop duplicate sends.
- **Indexes** cover every access path the application actually uses, notably
  `(campaign_id, status)` for the dispatcher and `message_id` for event
  correlation.

Migrations live in `prisma/migrations/`. Apply with `npm run prisma:deploy`
(`prisma migrate deploy`) — never `migrate dev` against production.

---

## Security

| Concern | Measure |
| --- | --- |
| Passwords | bcrypt, cost 12. Never logged. Login timing equalised for unknown accounts. |
| Sessions | Signed JWT in an `httpOnly` cookie whose `sid` must resolve to a live `sessions` row — so logout and revocation are immediate. Changing a password revokes every session. |
| CSRF | Origin/Referer check **plus** double-submit token. Exempt only for the SNS webhook and RFC 8058 one-click unsubscribe, both of which carry their own cryptographic authorisation. |
| Rate limiting | Global limit on `/api`; a much tighter limit on auth keyed by IP **and** submitted email; uploads capped separately. |
| Input validation | Zod on every body, query and param. Unknown fields are dropped before they reach Prisma. |
| Upload safety | Extension + MIME check, 25 MB cap enforced before parsing, row and field-length limits. |
| SQL injection | Prisma parameterises everything. The single raw query uses bound parameters. |
| XSS in preview | Template HTML is sanitised for the dashboard and rendered inside a fully sandboxed `iframe`. The **stored** HTML is never rewritten — mangling it would make the preview a lie. |
| Header injection | CR/LF stripped from every header value, so a subject can never inject a `Bcc:`. Covered by a test. |
| Template injection | No expression evaluation exists in the renderer. |
| Access control | Every query is scoped by `userId`; ownership is verified before any child resource is read. |
| Webhook forgery | Full AWS SNS signature verification: host-restricted certificate URL, cached certificate fetched over TLS, canonical string rebuilt from the documented field order, timestamp freshness check. |
| Secrets | Environment only, never sent to the frontend, redacted from logs. |
| HTTP headers | Helmet, restrictive CSP, HSTS when `COOKIE_SECURE=true`. |
| Audit | Logins, failures, imports, campaign state changes, suppression edits and user administration are all recorded. |

---

## Compliance

This system is built for **opt-in, permission-based** marketing. Using it for
unsolicited email violates the Amazon SES Acceptable Use Policy and laws
including CAN-SPAM, GDPR/PECR and CASL.

What the system enforces:

- Every marketing message carries a visible unsubscribe link — appended
  automatically if the template lacks one.
- `List-Unsubscribe` and `List-Unsubscribe-Post` headers are set, giving
  one-click unsubscribe in Gmail, Outlook and others.
- Unsubscribes take effect immediately and globally, and also cancel any pending
  sends to that address in *other* running campaigns.
- Suppression is checked three times: at import, at dispatch, and immediately
  before the SES call.
- A full audit trail is retained.

What you must do:

- Only import addresses that gave you consent, and keep a record of it.
- Include a valid physical postal address in your templates where the law
  requires it.
- Honour unsubscribes across every system you run, not just this one.
- Keep complaint rates below 0.1% and bounce rates below 5%.
- Never remove someone from the suppression list without a record of renewed
  consent.

---

## Testing

```bash
npm test            # backend/ — 46 tests
npm run verify      # lint + typecheck (4 packages) + tests
```

The suites cover the logic that decides what lands in a mailbox, without needing
a database, Redis or AWS:

- **`csv.service.test.ts`** — column aliasing, custom-column preservation,
  invalid-address rejection, duplicate detection, quoted fields spanning
  newlines, BOM handling, missing-column errors.
- **`email-compose.test.ts`** — variable substitution and defaults, HTML escaping,
  absence of any expression evaluation, plain-text derivation, unsubscribe token
  signing/tamper-rejection, per-recipient token uniqueness, RFC 5322 header
  correctness, **exactly one `To:` and no `Cc:`/`Bcc:`**, `List-Unsubscribe`
  emission, RFC 2047 encoding, and header-injection resistance.
- **`campaign-state.test.ts`** — the campaign transition table, and the explicit
  assertion that `SENT`, `BOUNCED`, `COMPLAINT` and `UNSUBSCRIBED` are never
  resumable.

---

## Production deployment

### Before the first real campaign

- [ ] `NODE_ENV=production`, `COOKIE_SECURE=true`, `SES_SANDBOX_DRY_RUN=false`
- [ ] `AUTH_SECRET` and `UNSUBSCRIBE_SECRET` are long, random and **different**
- [ ] `APP_URL` and `API_PUBLIC_URL` are the real public HTTPS origins
- [ ] Sender domain verified in SES; SES production access granted
- [ ] DKIM CNAMEs, SPF and DMARC published and verified passing
- [ ] SNS topic subscribed to `/api/webhooks/ses` and confirmed
- [ ] `SES_MAX_SEND_RATE` at or below your account quota
- [ ] The seeded admin password has been changed
- [ ] Database backups configured; Redis persistence enabled
- [ ] `UPLOAD_DIR` on a persistent volume
- [ ] Send a test campaign to a seed list and inspect the received headers

### Running behind a reverse proxy

The API sets `trust proxy` in production. Terminate TLS at the proxy and forward
`X-Forwarded-For` so rate limiting and audit logs record real client IPs.

### Scaling

The API and the worker scale horizontally and independently. Run as many worker
processes as you like — on one machine or several — as long as they share the
same Redis:

```bash
npm run start:worker      # repeat per process / per machine
```

The BullMQ rate limiter is keyed in Redis, so four workers **divide**
`SES_MAX_SEND_RATE` rather than each claiming it. To send faster, raise the rate
(within your SES quota) — do not simply add workers.

On Windows, run each extra worker from its own terminal, or register it as a
service with a supervisor such as [NSSM](https://nssm.cc/) so it restarts with
the machine.

Postgres is the component to watch first: `campaign_recipients` grows by one row
per recipient per campaign. Partition it by `campaign_id` or archive completed
campaigns once it becomes large.

### Zero-downtime deploys

Both services handle `SIGTERM`. The API stops accepting connections and drains;
the worker finishes its in-flight sends before exiting rather than abandoning a
message mid-delivery, so give it up to ~40 seconds to stop before forcing it.
Anything still unfinished is recovered on the next boot — the worker returns
stranded rows to `PENDING` and re-dispatches any campaign that was in flight.

`run.bat stop` closes the service windows. On Windows a console window close is
not a clean `SIGTERM`, so prefer pressing `Ctrl+C` in the Worker window and
waiting for it to exit when a campaign is actively sending.

---

## Operations runbook

**A campaign is stuck in `SENDING` with nothing progressing.**
Check the worker is running and Redis is reachable (Settings → Send queue). On
restart the worker re-dispatches campaigns still in flight automatically.

**Everything is failing with `MessageRejected`.**
Almost always an unverified sender identity or an SES account still in the
sandbox. Settings → Amazon SES reports both.

**Bounce rate is climbing.**
Stop sending. Hard bounces are suppressed automatically, but a rising rate means
the list quality is poor. Verify how those addresses were collected before
resuming.

**Someone was unsubscribed by mistake.**
Settings → Suppression list → Remove. Only do this with a record of renewed
consent; the removal is audit-logged.

**A campaign needs to stop immediately.**
Pause it. In-flight jobs stop before sending. Messages already accepted by SES
cannot be recalled.

**Recovering after a database restore.**
Run `npm run prisma:deploy`, then restart the worker — it will return stranded
rows to `PENDING` and resume any campaign that was mid-flight.

---

## Licence

Provided as-is for internal use. Review the Amazon SES Acceptable Use Policy and
the anti-spam law of every jurisdiction you send into before operating it.
