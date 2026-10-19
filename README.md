# G&S Counter

Studio sales and stock for Gardener & Son.

- Live dogfood site: https://tinyforests.github.io/gs-counter/
- Public source: https://github.com/tinyforests/gs-counter
- Local checkout: `/Users/tyson/Projects/gs-counter`
- Supabase project: `etusezzqkjvbyackadag` (Sydney)
- Initial steward/admin: `tyson@gardenerandson.com`

## Run locally

```sh
python3 -m http.server 8080
```

Open http://localhost:8080. Authentication redirects must be allowlisted in Supabase; local development is not configured for email login by default.

## Deploy

Push to `main`. The Pages workflow runs the supplied counter/gate exercises, packages only `index.html`, `backend.js`, `config.js` and `.nojekyll`, then deploys through GitHub Pages. Source, SQL and mailer files are not included in the hosted static artifact.

```sh
git add .
git commit -m "Describe your change"
git push
```

No framework or build step is needed. `config.js` contains a public publishable key, not a service-role credential. Database row-level security restricts access to allowlisted stewards. GitHub Pages itself is publicly reachable; business records require sign-in.

## Sign-in emails

A private Supabase outbox feeds a Google Apps Script worker every minute. See [mailer/README.md](mailer/README.md). Allow a minute or two for delivery. MailApp acceptance is not confirmation of inbox delivery; the previous inbox-delivery issue still needs Workspace delivery-log investigation.

To add staff, insert their lower-case email into `public.stewards` in Supabase. Never put the mailer token or a service-role key in this repo. `schema.sql` is the original counter database schema; `mailer/schema.sql` adds the email queue. Both have already been applied to the connected project. The worker credential hash is configured separately, not committed.

## Checks

```sh
cd test
npm ci --ignore-scripts
npm test
```

The jsdom exercises print observed behavior and assert the key receipt and sign-in outcomes; failures exit nonzero. The mailer was separately checked against PostgreSQL/PGlite and a simulated Apps Script runtime during setup.

## Dogfood limits

- Square is recorded as a payment method; the app does not charge Square.
- Sales and stock changes are separate writes. Concurrent edits or failed stock writes can cause drift; reconcile during testing.
- Sales book reads the latest 500 rows, movements the latest 100.
- Allowlisted stewards can read customer contact details. The admin label does not implement separate database permissions.
- Signing in has been verified through a sent-email copy; arrival in the requested inbox still needs tracing.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing the data mapping or stock behavior. The custom domain `counter.gardenerandson.com` is not configured.

## October 19 update

Customer names are required. The contact step asks for email first; phone and email remain optional. After a sale, staff can open a receipt in their mail app, copy its text, or add an email and save it onto the sale. Active sales can have a receipt opened again from the sales book. These actions prepare an email for manual sending; they do not send automatically. The existing steward sign-in and database access policies remain active.
