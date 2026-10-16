# Counter sign-in email delivery

Dogfood deployment: https://tinyforests.github.io/gs-counter/
Supabase: etusezzqkjvbyackadag (Sydney).
Initial steward/admin: tyson@gardenerandson.com.
Workspace sender: hello@lundbech.me, display name Gardener & Son — Counter.
Apps Script: https://script.google.com/home/projects/1wTo_dR8xqxULRrrlOOkFuLC-ExNzG1qhf8qDb4KTau0ZMMq9HH7I0WCc/edit

The enabled Supabase Send Email hook calls public.counter_send_email. It checks the steward list and queues auth emails in the private counter_mail schema. The Apps Script deliverCounterMail trigger polls once a minute using a dedicated credential in Script Properties. Only its SHA-256 digest is stored in counter_mail.config. The script has no service-role key and no access to sales, stock, or customer records.

Only the newest pending link per email/action is delivered. Queued links expire after 15 minutes; sent tokens are cleared immediately. Failed sends retry up to five claims. Two-minute leases and script delivery markers reduce duplicates after network failures. Email delivery cannot be guaranteed exactly once.

Add lower-case emails to public.stewards to add staff; no script changes are needed. Supported actions are signup, magiclink, recovery and invite. Email-address changes are rejected; administer steward changes through Supabase.

If mail stops, inspect Apps Script Executions and Google send quota, then counter_mail.outbox state/attempts without selecting token_hash. Re-running setupMailer repairs its trigger and preserves the credential. Never put the credential in source, browser config or logs. Rotation requires updating Script Properties and its database hash together.

The page acknowledges queue acceptance, not inbox delivery. Allow a minute or two and check spam. GitHub Pages is publicly reachable; records require steward sign-in. The earlier Sites copy remains owner-private. counter.gardenerandson.com is not connected.
