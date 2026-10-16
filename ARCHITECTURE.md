# G&S Counter — engineering notes

For whoever works on this next, including an AI agent. The README covers deploying it; this covers how it works and where the traps are.

## Shape of it

A single static page, no build step, no framework, no package.json. Three script files load in order:

```
supabase-js (CDN)  →  config.js  →  backend.js  →  index.html's inline <script>
```

| File | Owns |
|---|---|
| `config.js` | Supabase credentials, studio list. The only file that differs between environments. |
| `backend.js` | Data layer, auth gate. Talks to Postgres. Knows nothing about the UI. |
| `index.html` | All UI and business logic, in one inline script. Knows nothing about Supabase. |
| `schema.sql` | Tables, allow list, RLS policies, realtime. Idempotent — safe to re-run. |

That separation is deliberate: the app was originally built on a different backend and ported by replacing `backend.js` alone. Keep it that way. If you find yourself importing `supabase` inside `index.html`, stop and add a method to the data layer instead.

### The data-layer interface

`backend.js` exposes exactly one global the app uses:

```js
const db        = await claude.use("db");         // Firestore-shaped document store
const user      = await claude.use("user");       // who's signed in
const downloads = await claude.use("downloads");  // save a file
```

The name is a leftover from where this app started, and it's load-bearing — `index.html` calls it in several places. Renaming it means touching both files; there's no other reason to.

`claude.use()` does not resolve until a steward is signed in and on the allow list. That's the whole access gate: the app's `boot()` awaits it, so no UI beyond the sign-in screen renders for anyone who isn't allowed in.

**`db` methods** (a deliberate subset of the Firestore API):

```js
db.collection("items").onSnapshot(cb, errCb)   // live, returns unsubscribe
db.collection("items").add({...})              // → {id}
db.collection("sales").doc().set({...})         // insert with a client-made uuid
db.doc("items/" + id).update({...})            // partial update
```

`orderBy()` and `limit()` exist but are no-ops — ordering and limits are fixed per table in `backend.js`'s `QUERY` map (items by sku ascending; sales by time descending, 500; movements by time descending, 100). The app calls them for historical reasons. If you need the sales book to go past 500 rows, raise it there, not in the app.

There is no `delete`. Items are archived (`archived: true`) and sales are voided (`voided: true`). Nothing is ever removed, which is what makes the sales book trustworthy at BAS time.

## Data model

Three tables. The app speaks camelCase documents; Postgres uses snake_case columns. The translation lives in `MAPS` at the top of `backend.js` and nowhere else.

| App field | Column | Notes |
|---|---|---|
| `createdAt` / `at` | `created_ms` / `at_ms` | `Date.now()` integers, not timestamps — the app sorts and formats them directly |
| `lowAt` | `low_at` | low-stock alert threshold |
| `customerName` | `customer_name` | |
| `itemCount` | `item_count` | |
| `stewardId` | `steward_id` | auth uid |
| `netUnits` | `net_units` | |

**Adding a field is a four-line change:** column in `schema.sql`, entry in the relevant `MAPS` block, add it to `NUMERIC` if it's a number, then use it in `index.html`. Miss the `MAPS` entry and the field silently vanishes on write — `toRow()` drops anything it doesn't recognise. That silence is the single most likely way to lose data here.

### Stock

Stock is a JSONB column on `items`, keyed by studio id:

```json
{ "mont-albert": 12, "hawthorn": 3 }
```

A missing key means *not tracked at this studio* (`onHand()` returns `null`), which is different from zero and renders as "—". An item with no key still sells; a stocktake is what starts tracking it.

`update()` in `backend.js` special-cases `stock`: it merges against the cached row rather than replacing, so writing Mont Albert's count can't wipe Hawthorn's. **This is the bug that bit once already.** Any new JSON column needs the same treatment or it will clobber.

Stock moves in three places, all in `index.html`:
- `moveStockForSale(sale, +1)` after a sale is recorded — decrements
- `moveStockForSale(sale, -1)` when a sale is voided — restores
- `setStock()` from receiving, single adjustments, and stocktake

Stock writes are **fire-and-forget after the sale**: `finish()` saves the sale, shows the confirmation, then moves stock without awaiting. A sale is never lost because a stock write failed. The trade is that stock can drift from sales if a write fails mid-sale; a stocktake is the correction, and that's an acceptable trade for a two-person studio.

### Tag numbers

`nextNumber()` returns max existing number + 1, zero-padded to three. It reads `S.usedNumbers`, which is built from **all** item rows including archived ones, so retiring an item doesn't free its number and old handwritten tags can't collide with new stock. A unique partial index on `items.sku` is the backstop.

## Auth

Magic link (Supabase OTP), then an allow-list check against the `stewards` table. Two layers, and both matter:

1. **The gate in `backend.js`** — cosmetic. It stops the UI rendering.
2. **RLS in `schema.sql`** — real. Every policy on every table calls `is_steward()`, which matches the JWT's email against `stewards`. A `security definer` function, so it reads the table regardless of the caller's own policies.

This is why the anon key is safe in a public repo. Without a session whose email is in `stewards`, every query returns zero rows and every write is refused. If you ever add a table, **add its policies in the same migration** — RLS defaults to deny-all once enabled, but a table created without `enable row level security` is wide open to anyone with the anon key.

`role` is `steward` or `admin`. It currently only gates `canEdit()`/`isOwner()`, which the UI barely uses — both roles can do everything in practice. If you want real separation, it belongs in the RLS policies, not the UI.

## Realtime

Each table has a Supabase channel; any change triggers a **full refetch** of that table, not an incremental patch. Crude, and fine at this size — the biggest query is 500 sales. If the sales book ever gets large, this is the first thing to fix.

`safeRender()` in `index.html` guards against live updates wiping a steward's half-typed input: while someone is on the name, contact, payment or stocktake screen, incoming data updates the header only, not the form. Any new screen with text inputs needs adding to that check.

## Testing

```bash
cd test && npm install && node counter.test.js && node gate.test.js
```

`counter.test.js` runs the app in jsdom against a stub Supabase that enforces the behaviour the real one does — filtered updates, unique constraints, duplicate keys — and walks a full shift: add item, sale by tag number, payment, stocktake, receiving, per-studio isolation, void-restores-stock, CSV. `gate.test.js` checks the three sign-in states.

The stub matters. The one real bug found during the port (stock updates sent without their row filter) only surfaced because the stub refuses an unfiltered `update()`, the way Postgres would with RLS. **If you loosen the stub to make a test pass, you've broken the test, not fixed the code.**

## Known limits

- **Square is not connected.** Recording a sale as Square records the fact; the reader takes the payment separately. Reconcile monthly against Square's own report. Connecting it properly needs a server-side OAuth flow, which this architecture has nowhere to put.
- **Last writer wins.** No transactions, no optimistic locking. Two stewards editing one item in the same second: later write stands.
- **Sales book caps at 500 rows, movements at 100.** Raise in `QUERY`.
- **Customer contacts are readable by every steward.** Name, phone, email sit in `sales`. If that ever needs narrowing, it's an RLS policy on `sales`, not a UI change.
- **Studio ids are permanent.** They're stored on every sale and as stock keys. Renaming `mont-albert` orphans history. Change the display `name` freely; never the `id`.
- **Deleting a steward** from the allow list revokes access on their next request, but their existing session's JWT stays valid until it expires (an hour by default).

## Common changes

**Add a studio** — add to `STUDIOS` in `config.js`. Nothing else; stock keys and sale rows are created on demand.

**Add a payment method** — add to `METHODS` in `index.html`. The id is stored raw on the sale, so pick it once and keep it.

**Change the brand** — the palette and type live in `:root` custom properties at the top of `index.html`, mirroring the G&S design standard. Dark mode is defined twice, under `prefers-color-scheme` and under `[data-theme="dark"]`; change both.

**Push Notion the daily totals** — `sales` is queryable by `day`; sum `total` where `voided = false`. No code here does it yet.
