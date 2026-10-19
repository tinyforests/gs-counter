# Tests

```bash
npm install
npm test
```

No Supabase project needed — both tests run the real `index.html` and `backend.js` in jsdom against a stub Supabase client.

## counter.test.js

Walks a full shift and prints what landed in the fake database at each step:

1. Sign-in clears for an allowlisted steward
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

The exercises print row shapes and assert required names, steward attribution, receipt recipient/content, receipt visibility on voided sales, and saved post-sale emails. Failures exit nonzero.

## gate.test.js

Four states across both modes: optional open mode with no session (not deployed), then with `REQUIRE_SIGN_IN: true` — no session, a signed-in email not on the allow list, and an allow-listed email.

## About the stub

The stub Supabase client in `counter.test.js` deliberately enforces what real Postgres enforces:

- `update()` with no `.eq()` filter is **refused** — this is what caught the one real bug during the port
- duplicate `id` is refused
- duplicate `items.sku` is refused, matching the unique index

Receipts are caught by a capture-phase click listener on `mailto:` anchors, so the test can read the receipt body without jsdom trying to open a mail client.

Don't loosen these to make something pass. A test that only passes against a permissive stub tells you nothing about production.
