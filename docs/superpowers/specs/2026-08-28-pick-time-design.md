# Pick Time — design

Date: 2026-08-28
Status: approved, ready for implementation planning

## Problem

Timeinator answers "what time is it there?" It does not answer "when can the
four of us meet?" That second question needs shared state: several people, each
in a different zone, marking when they are unavailable and when they would
prefer to meet, then reading off the windows that survive.

Today the app is a static build with no server and no storage. Shared state
cannot live in a URL parameter, so this feature introduces a backend.

## Scope

A new page where one person opens a poll, marks a week, and shares a link.
Anyone with the link marks their own availability and sees everyone else's.
Under the calendar, a ranked list of windows that work for the group.

Out of scope: accounts, email invitations, calendar import, notifications,
recurring availability, editing another person's marks.

## Decisions

Each of these was chosen over stated alternatives; the reasoning is recorded so
a later reader does not relitigate it.

### Concrete dated weeks, navigable

The grid shows a real dated week and arrows move to any other week. Marks are
stored as absolute UTC instants, so each participant marks in their own zone
and sees everyone else's marks correctly shifted.

The rejected alternative was an abstract Mon–Sun pattern. It cannot work here:
"Tuesday 14:00" is a different instant for every participant, and there is no
correct way to shift it across a DST boundary or the date line. A cross-timezone
tool that stores wall clocks is lying.

### Intervals, not slots

Every mark is a half-open `[start, end)` interval of UTC epoch seconds. The
grid resolution — 15m / 30m / 1h — is a per-viewer zoom next to the timezone
dropdown, not a property of the poll.

This falls out of the interval model for free. A one-hour mark from Alice
renders as two filled cells for Bob at 30-minute zoom, because the overlap
question is interval intersection rather than cell equality. A per-poll fixed
granularity would have forced everyone onto the creator's choice and would have
had to rewrite existing marks if it ever changed.

### Opaque token identity

On first mark the server mints a random participant id and a separate secret
token. The browser keeps the token in `localStorage`; every mutating request
carries it. The participant supplies a display name once.

The user's phrase was "device / browser signature". A real fingerprint —
canvas, fonts, UA hash — was rejected: two colleagues on the same laptop model
and browser version can hash identically and silently merge into one
participant, and the hash shifts on a browser update, orphaning marks. A random
token has neither failure mode. It degrades honestly instead: clearing storage
or switching browsers makes you a new participant, and a visible "Not you?
Start over" affordance makes that recoverable rather than mysterious.

### Red disqualifies, green ranks

A candidate window is disqualified if any participant's `busy` interval
intersects it at all. It is then scored by how many participants' `preferred`
intervals fully cover it.

The asymmetry is deliberate: a fragment of busy ruins a meeting, a fragment of
preferred does not make one. Showing only unanimous windows was rejected —
with three or more people it usually finds nothing and gives no hint about
which near-miss to chase.

## Architecture

```
server/index.ts       Hono app: /api routes, then static dist/ + SPA fallback
server/db.ts          node:sqlite, schema applied on boot
server/routes.ts      the six handlers
server/tsconfig.json  nodenext, allowImportingTsExtensions, no DOM lib
shared/intervals.ts   pure interval math — imported by BOTH server and browser
data/timeinator.db    gitignored; directory from DATA_DIR, default ./data
```

Hono with `@hono/node-server`, and Node 24's built-in `node:sqlite`. Two small
pure-JS dependencies and no native module, so there is no compile toolchain to
install on the deploy host and nothing to rebuild across Node upgrades. Node 24
strips TypeScript natively, so the server runs as `node server/index.ts` with
no build step of its own.

`shared/` exists because the proposals list is computed in the browser from
data the server already returned, while the server needs the same interval
normalization on write. One copy of that math, imported twice, is how the two
stay in agreement.

### Running it

- **Dev** — `pnpm dev` runs Vite on 4001 and `node --watch server/index.ts` on
  4002 concurrently (adds `concurrently` as a devDependency). Vite proxies
  `/api` to 4002.
- **Prod** — `pnpm build && pnpm start`. One process serves `dist/` and `/api`.

`pnpm build` type-checks both projects: `tsc --noEmit && tsc -p server --noEmit
&& vite build`.

### Consequence: the deploy changes shape

This is the real cost of the feature and it is not avoidable once there is a
database. Timeinator stops being a folder of static files and becomes a Node
process with a SQLite file to keep and back up. The home page keeps working
exactly as before, served by that process.

### PWA interaction

The service worker currently claims every navigation. It needs
`navigateFallbackDenylist: [/^\/api\//]` in the Workbox config, or API requests
are answered from the offline cache instead of the server. The Pick Time page
requires network and is not made available offline.

## Data model

Three tables. Every time is UTC epoch seconds. No wall clocks are stored
anywhere.

```sql
CREATE TABLE polls (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE participants (
  id         TEXT PRIMARY KEY,
  token      TEXT NOT NULL UNIQUE,
  poll_id    TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  timezone   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE marks (
  id             INTEGER PRIMARY KEY,
  poll_id        TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  start_s        INTEGER NOT NULL,
  end_s          INTEGER NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('busy', 'preferred'))
);

CREATE INDEX marks_poll ON marks (poll_id, start_s);
CREATE INDEX participants_poll ON participants (poll_id);
```

`participants.id` and `participants.token` are deliberately separate columns.
`id` is public and appears in every response so the grid can label marks by
name. `token` is secret, lives only in one browser's `localStorage`, and is
never returned by any endpoint. Collapsing them into one column would mean
anyone who loaded the poll could edit anyone else's marks.

Poll ids are 12 characters of Crockford base32 drawn from
`crypto.randomBytes` — 60 bits, short enough to paste into a chat message and
far too sparse to enumerate. Tokens are 32 hex characters from the same source.

### Normalization on write

Marks are normalized per `(participant, kind)` before they are stored:
overlapping and touching intervals merge into one row. Across kinds they are
made mutually exclusive — where a participant's `busy` and `preferred`
intervals overlap, `busy` wins and the overlap is subtracted from `preferred`.
That rule is fixed rather than last-write-wins, because `PUT` replaces the whole
set at once and the payload has no ordering to appeal to; the client subtracts
as it paints, so the server rule only ever fires on a malformed or replayed
payload. A participant therefore never holds two intervals of the same kind
that touch, and never holds a `busy` and a `preferred` interval that overlap.

This is `shared/intervals.ts`, and it is the first thing to write tests for.

## API

All routes are under `/api`. Mutating routes read the secret token from an
`X-Participant` header.

| Route | Body / result |
|---|---|
| `POST /api/polls` | `{ title? }` → `{ pollId }` |
| `GET /api/polls/:id` | → `{ poll, participants[], marks[] }`, no tokens |
| `POST /api/polls/:id/participants` | `{ name, timezone }` → `{ participant, token }` |
| `PATCH /api/polls/:id/participants/me` | `{ name?, timezone? }` → `{ participant }` |
| `PUT /api/polls/:id/marks` | `{ marks: [{ start_s, end_s, kind }] }` → normalized set |
| `GET /api/polls/:id/version` | → `{ updated_at }` |

Every mutating route bumps `polls.updated_at` in the same transaction as its
write, which is what makes the `version` check meaningful.

`PUT` replaces the caller's entire mark set rather than applying a per-cell
diff. With drag-painting this is idempotent, race-free, and needs no conflict
resolution; a participant's mark set is tens of intervals, so the payload stays
small. The client debounces it to roughly 500ms after a drag ends.

Other people's changes arrive by re-fetching `GET /api/polls/:id` every 10
seconds while the tab is visible, and once on focus, gated by the cheap
`version` check. No websockets.

### Errors

- Unknown poll id → 404, and the page shows "This poll doesn't exist" rather
  than an empty grid.
- Missing or unrecognised token on a mutating route → 401.
- A token belonging to a different poll → 401, identical to an unrecognised
  token, so the response never confirms that the token is valid somewhere else.
- Malformed intervals (`end_s <= start_s`, non-integer, outside a sane year
  range) → 400.

### Abuse guards

Anyone can create a poll, so: at most 50 participants per poll, at most 500
mark rows per participant after normalization, and an in-memory per-IP rate
limit on `POST /api/polls`. Exceeding a cap is a 429 with a plain message.

## The page

Routes `/pick` (creates a poll, redirects) and `/pick/:id` (the poll).

**Top bar** — the timezone `AutoComplete` reused from the home page, with the
same `normalizeForSearch` matching; zoom `[15m][30m][1h]`; brush
`[Preferred][Busy]`; week navigation `‹ Sep 1–7 ›`; and the existing
`ShareButton` pointed at the poll URL.

**Grid** — seven day columns by all 24 hours, rows sized by the zoom (96 / 48 /
24), scrolling vertically under a sticky day header and hour gutter. The full
24 hours are always shown: hiding the night would hide the middle of someone
else's workday, which is the whole reason this tool exists.

**Cells** — each cell is divided into one thin vertical stripe per participant,
in legend order: green for preferred, red with a hatch for busy, empty for no
answer. Names cannot fit in a 30-minute cell but stripes plus a legend can, and
hover or tap names them. The hatch keeps red/green from being the only channel
carrying meaning.

**Painting** — mousedown decides the operation from that cell's current state
for the current participant (unmarked → apply brush, already yours → clear),
and the drag carries that one operation. Touch uses the same gesture.

**Mobile** — the same grid component with `visibleDays={3}` and horizontal
paging. Unlike the home page, which needs separate desktop and mobile grids
because it transposes rows into columns, this grid keeps its orientation and
only narrows, so one component covers both.

**Week and zone** — weeks run Monday to Sunday, bounded in the viewer's chosen
zone. The zone defaults to `dayjs.tz.guess()` on a first visit and to the
participant's stored `timezone` afterwards.

**Identity** — reading a poll requires nothing: a visitor sees the grid, the
legend and the proposals without becoming a participant. The first paint opens
a small "What should we call you?" prompt,
posts the participant, and stashes the token. The participant's own stripe is
emphasised. A quiet "Not you? Start over" clears the token.

## Proposals

Below the grid, with its own `[30m][1h][2h]` length control — kept separate
from the grid zoom, because "how long is the meeting" and "how finely am I
painting" are different questions. The three durations match those already in
`CreateEventPopover`.

Candidate windows step every 15 minutes across the span the marks actually
cover, not merely the visible week, since marks may live on any week. For each
window of the chosen length:

1. Disqualify it if any participant's `busy` interval intersects it.
2. Score it by the number of participants whose `preferred` intervals fully
   cover it.

Sort by score descending, then chronologically. Suppress a candidate that
overlaps an already-shown, better-scoring one, and show the top 8. Each
row renders in the viewer's chosen zone and names who prefers it and who has
not marked at all, so a near-miss says who to go ask. Each row offers a "Create
event" link through the existing `googleCalendar.ts`.

When no window qualifies, say so explicitly and name the participants whose
busy marks are eliminating the most candidates.

This runs entirely in the browser off the `GET` response, through
`shared/intervals.ts`.

## Testing

The repo has no test framework today. Add Vitest, which shares Vite's config
and transform and so needs close to no setup.

Cover the places where a bug is silent rather than visible:

- `shared/intervals.ts` — merge, subtract, coverage, candidate generation,
  scoring, and DST boundaries. Pure functions, table-driven, written first.
- The six API handlers against an in-memory `node:sqlite` database. The case
  that matters most for correctness: a missing, malformed, or foreign token
  cannot read or write another participant's marks.

Grid rendering is checked manually. It is where tests cost the most and catch
the least.

## Security note

A poll URL is a bearer token. Anyone holding the link can read every
participant's availability and add their own. This is the right trade for a
tool whose entire purpose is being pasted into a group chat, but it is a
deliberate choice and the page should not imply the data is private. Poll ids
carry enough entropy that they cannot be enumerated.
