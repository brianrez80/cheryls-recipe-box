# Disposable database audit

Run Node 22+: `npm ci --ignore-scripts`, then `npm test` in this directory. No database URL, API key, Docker, live data, or Supabase connection is used. PGlite runs real PostgreSQL in memory with pgvector and minimal synthetic auth/storage schemas. Each invocation creates a new instance; it does not reset or delete an existing database.

The harness disables all automatic table and sequence grants before replaying every migration. It checks RLS and exercises synthetic access scenarios. It does not simulate GoTrue, PostgREST, GraphQL, Edge Functions, email delivery, Stripe networking, browser cookies, Supabase platform extensions, or concurrent sessions. A passing result is SQL-layer evidence, not full hosted deployment certification.

Currently expected to FAIL: the original recipes table baseline is missing. Do not paper over this failure with a fabricated schema. Recover/review the baseline before declaring readiness.
