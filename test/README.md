# Tests

```bash
npm install
npm test
```

No Supabase project needed — both tests run the real `index.html` and `backend.js` in jsdom against a stub Supabase client.

## counter.test.js

Walks a full shift and prints what landed in the fake database at each step:

1. Open mode: the counter comes straight up with no sign-in
2. Studio picker → name step
3. Add an item under Items, check it gets tag number `001`
4. Sale: customer name, phone, scan `001`, Square payment, note
5. Confirmation screen, and the sale row as it would be stored
6. Stocktake sets Mont Albert to 12, logs a `stocktake` movement
7. Receive 5 more → 17, logs a `received` movement
8. Stocktake at Hawthorn → both studios' counts coexist
9. Sales book totals
10. Void restores the sold unit to stock
11. CSV export button present
12. A voided sale offers no receipt
13. A sale with no email offers to add one on the confirmation screen
14. That email is written back onto the sale row, and the receipt opens
15. A live sale can have its receipt re-sent from the sales book

Each line prints expected-looking output; read it rather than trusting an exit code. There are no assertions by design — the point is to see the real row shapes.

Steps 2a and 2b check the Notion import: a seeded customer is suggested as the steward types, and tapping it prefills their contact details and skips the contact step when an email is already on file. Steps 16 and 17 check that the pre-counter history shows beside the sales book and that the customer list grows from real sales.

## no-migration.test.js

The same walkthrough with `customers` and `daily_history` missing entirely, as they are if `migrate-notion.sql` was never run. Everything must still work; the history note is simply absent and the name lookup falls back to past sales only. The stub returns Postgres's real `relation "public.customers" does not exist` error so the data layer's handling of it is exercised, not bypassed.

## gate.test.js

Four states across both modes: open mode with no session (what the studio runs today), then with `REQUIRE_SIGN_IN: true` — no session, a signed-in email not on the allow list, and an allow-listed email.

## About the stub

The stub Supabase client in `counter.test.js` deliberately enforces what real Postgres enforces:

- `update()` with no `.eq()` filter is **refused** — this is what caught the one real bug during the port
- duplicate `id` is refused
- duplicate `items.sku` is refused, matching the unique index

Receipts are caught by a capture-phase click listener on `mailto:` anchors, so the test can read the receipt body without jsdom trying to open a mail client.

Don't loosen these to make something pass. A test that only passes against a permissive stub tells you nothing about production.
