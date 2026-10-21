# Cheryl's Recipe Box readiness and security review

Audit date: October 20, 2026 (America/Denver). Live work was limited to catalog/advisor/migration-history reads. No customer rows were used, no live SQL mutations or auth-setting changes were made, and no releases were performed.

The [Supabase announcement](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) says existing objects retain their privileges; newly created public tables and sequences need explicit grants. RLS and SQL privileges are separate checks. Do not restore broad default privileges.

Evidence: catalog-snapshot.json records live public tables, effective table CRUD privileges, ACLs, policies, sequences, function metadata, defaults, migration versions, and security advisors. Column-level exceptions are called out below. This is a metadata snapshot, not a database backup.

## Mapping and scope

Source repository identified as brianrez80/cheryls-recipe-box via the existing local Git remote, then cloned separately. Tracked config.js explicitly points to knpovxbqoohsddquiyjv.supabase.co, matching the inspected project. Reviewed browser PIN logic, database calls, three SQL migrations, live recipes/family_members privileges/policies and migration history. No recipe content was fetched.

## Confirmed findings

1. **P1 unauthorized recipe access/mutation:** recipes grants anon/authenticated CRUD and has a PUBLIC FOR ALL policy with USING(true) and WITH CHECK(true). Any caller using the public API context can read, insert, update and delete recipes. The PIN in auth.js is checked in the browser and only sets sessionStorage/UI state; it does not create an authenticated Supabase identity. This is a confirmed authorization defect despite an empty Security Advisor result.
2. **P1 fresh-deployment blocker:** the repository's first migration ALTERs recipes, but its CREATE TABLE baseline is absent. Disposable replay fails immediately. Live history lists two migrations with different timestamps, while source has three. Recover the authoritative schema and reconcile migration history before a fresh deployment/reset is supportable.
3. **Family isolation is not enforced:** family_members allows public reads and anonymous inserts (non-empty name only in the live policy); member_id is not an authenticated ownership check. Visitors can create family identities; recipe ownership labels cannot enforce access isolation under the broad recipe policy.
4. **October 30:** existing grants survive the change. The source eventually explicitly grants family_members SELECT/INSERT to anon/authenticated, preserving the currently public design, but that is not a safe authorization architecture. Do not add fresh broad recipe grants simply to make replay succeed.
5. No sequences or public functions. No leaked-password advisor warning. Browser PIN behavior is unrelated to Supabase password screening.
6. The scheduled GitHub heartbeat also reads recipes with a publishable key. Include it in the coordinated auth/containment rollout; revoking anonymous reads will make that workflow fail. It is schedule/manual-triggered, not triggered by this PR.

## Prepared changes

Added future migration/security instructions, catalog evidence and a disposable replay test that exposes the missing baseline. A separate docs/supabase-oct30/proposed-containment.sql revokes browser access as a containment option; it is deliberately outside automatic migrations and guarded against accidental execution.

**Do not apply that containment SQL with the current browser app:** it stops recipe and family-member operations. To fix without disruption, first implement verified server-side or Supabase Auth sessions with explicit household membership, migrate identity associations after approval, introduce RLS ownership/membership policies and narrow grants, test two households, and switch the client and database controls together. Household access decisions are required; do not infer them from display names or a browser-supplied member_id.

## Verification

- 11 existing Node test files PASS.
- Fresh database replay FAIL: relation public.recipes does not exist.
- Catalog proves the broad public policy/privileges. No destructive live proof-of-concept was run.
- End-to-end corrected authentication and cross-household isolation cannot pass until that coordinated implementation exists. No build pipeline/package manifest is present in this static app.

## Rollback and approvals

No automatic database migration is proposed or applied. Revert this PR to remove audit tooling/docs. For an explicitly approved containment deployment, capture fresh ACLs first. Restoring the captured per-table anon/authenticated privileges would restore the insecure previous behavior and therefore needs separate approval; do not use broad default grants. Never alter/delete recipes to roll back permissions.

Readiness: **NOT READY for secure reproducible deployment.** Existing access is expected to continue on October 30, but the confirmed anonymous-write vulnerability and missing baseline remain unresolved. Brian must approve the intended family/household access model, coordinated auth implementation, any containment interruption, live SQL and release.
