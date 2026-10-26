# Recovered migration history

Read-only inspection identified Supabase project knpovxbqoohsddquiyjv from the tracked project URL. The inspected live schema has 17 recipe columns, four family-member columns, a nullable member_id foreign key with ON DELETE SET NULL, the status check and recorded indexes. catalog-before.json records that schema and the former policies/ACLs without recipe contents.

The actual live migration history contains:

| Version | Recorded name | Source treatment |
|---|---|---|
| 20260711054726 | add_recipe_review_workflow | Original SQL archived verbatim; fresh bootstrap reconstruction uses the same already-recorded version |
| 20260814014436 | add_legacy_recipe_links | Restored with the actual recorded version and SQL |
| 20261026013444 | secure_shared_recipe_box | Approved security SQL applied successfully by Supabase's migration API; repository filename aligned to its recorded execution version |

The original recipes CREATE TABLE and later family schema were created outside this recorded chain. Their structure was recovered from the catalog, not inferred from sample customer recipes. The old repository had a differently dated link migration and two family scripts absent from live history. Those source scripts are preserved under history/source-*.sql.txt; their recipe UPDATE and label UPSERT statements must not run during this rollout.

## Why the bootstrap differs from historical SQL

The first migration is deliberately labeled as a reconstructed fresh bootstrap. It represents the existing object footprint required before later migrations and rejects a database that already contains either recipe table. It is not presented as the literal historical review script. Literal historical scripts are in history/live-*.sql.txt.

No existing history entries were edited, removed or fabricated. No unapplied family script is marked applied. Before release, only the first two versions were recorded. The security SQL originally reviewed as 20261021015453_secure_shared_recipe_box.sql was then actually executed by the approved Supabase migration API, which assigned version 20261026013444. The stored executed SQL was compared with the reviewed source and matched exactly after line-ending normalization. The repository filename was aligned to this actual record without changing any SQL bytes. A proposed remote version rewrite was rejected and not performed; all three real history entries remain intact.

Before a future approved push, inspect supported CLI help and review migration list --linked and db push --linked --dry-run against the explicitly verified project. After this release all three listed versions must match, with none pending. preflight.sql was the pre-security guard and intentionally rejects an already-created private schema; do not rerun it as though this release were unapplied. Do not use --include-all, migration repair, a reset or a history-table edit to suppress a discrepancy. Any changed history/schema requires a new review.

Fresh initialization replays the reconstructed baseline, the recorded links migration and the new security migration. It creates no authorized accounts or membership seats; enrollment is a separate approved operator action.
