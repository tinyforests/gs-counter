# Tests

```bash
npm install
npm test
```

No Supabase project needed — both tests run the real `index.html` and `backend.js` in jsdom against a stub Supabase client.

## counter.test.js

Walks a full shift and prints what landed in the fake database at each step:

1. Sign-in gate clears for an allow-listed email
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

Each line prints expected-looking output; read it rather than trusting an exit code. There are no assertions by design — the point is to see the real row shapes.

## gate.test.js

Three sign-in states: no session, a signed-in email not on the allow list, and an allow-listed email.

## About the stub

The stub Supabase client in `counter.test.js` deliberately enforces what real Postgres enforces:

- `update()` with no `.eq()` filter is **refused** — this is what caught the one real bug during the port
- duplicate `id` is refused
- duplicate `items.sku` is refused, matching the unique index

Don't loosen these to make something pass. A test that only passes against a permissive stub tells you nothing about production.
