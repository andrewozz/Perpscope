# ETL/secrets/

Drop your downloaded GCP service-account JSON key here (from GCP Console
Phase 1, Step 4 — "Add Key" on the `etl-runner` service account).

**Everything in this folder except this README is gitignored** (see the root
`.gitignore`: `ETL/secrets/`). Nothing you put here will ever be committed.

Suggested filename: `etl-runner-key.json` (matches the default path in
`ETL/.env` — rename it or update `.env` if you saved it under a different name).

## What NOT to do
- Never paste the contents of this key into a chat, PR, issue, or commit message.
- Never rename this folder or move the key outside it without also updating `.env`.
- If you ever suspect this key leaked, revoke it immediately in
  GCP Console -> IAM & Admin -> Service Accounts -> etl-runner -> Keys -> Delete,
  then generate a new one and update `.env`.
