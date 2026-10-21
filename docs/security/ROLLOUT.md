# Approval-only rollout, backup and recovery

Nothing in this document authorizes a live change. The implementation has not changed live Auth, grants, RLS, recipes, files, migration history or deployments.

## Before scheduling release

- Obtain Brian's and Cheryl's exact emails privately and confirm each mailbox is controlled by the intended person. Do not infer identity from contributor labels, browser data or display names.
- Confirm project ref knpovxbqoohsddquiyjv and the intended deployment. The repository advertises a GitHub Pages URL and the prior audit also found a Vercel project; Brian must identify the canonical host. Keep PKCE requests and callback on the same browser/origin.
- Approve exact HTTPS Site URL and redirect entries, SMTP/email delivery, email confirmation requirements and disabling public signups. The client uses shouldCreateUser:false; database enrollment remains a separate allowlist even if an unwanted Auth account exists.
- Pin the reviewed release commit and confirm no external job depends on anonymous recipe/image access. Retire the heartbeat as part of this release.
- vercel.json disables automatic Vercel deployment for the review branch codex/secure-private-recipe-box. It changes no live settings; other branches retain their existing deployment behavior. An explicitly approved preview or production publication is a separate release action. Do not remove the review-branch guard before preview approval.
- Run the SQL/browser suites in a disposable hosted Supabase environment if available. Local tests do not replace hosted Auth, real email, Storage HTTP and CDN checks.

## Backup and recovery checklist

1. Brian approves a restricted, encrypted backup destination and retention. Store no customer backup or credentials in Git, browser fixtures, CI artifacts or this workspace's test inputs.
2. Use approved operator tooling to export the complete public.recipes and public.family_members schema/data, all constraints/defaults/indexes, ACLs/policies, bucket configuration, storage metadata, and migration history. A database backup does not contain Storage file bytes.
3. Separately back up every recipe-images object with its path and a SHA-256 byte checksum. Preserve original object names and the recipe URL/reference fields.
4. Save the output of preservation-manifest.sql in the private backup record. It returns counts and SHA-256 aggregate fingerprints, not recipe text. Save the exact preflight/catalog and release SQL.
5. Verify that backup files are readable and complete. Test the recovery procedure with synthetic data in an isolated database. A production-backup restore needs Brian's separate authorization and must never overwrite the live database as a test.
6. Freeze normal user writes during the short migration/manifest-comparison window so concurrent edits cannot invalidate preservation comparisons. maintenance.html is prepared as a static, script-free holding page. A maintenance page alone does not fix the existing anonymous API exposure; minimize the gap between final backup and approved authorization change.

## Controlled enrollment

The two identities must be prepared only after Brian explicitly approves account registration/enrollment. An operator creates/invites the two exact emails through Supabase Auth without manually asserting email confirmation. Each person verifies their own email. Use an approved preview of this client if needed to handle PKCE while membership is still absent: it fails closed and does not fetch the collection until the database grants admission.

Read each verified Auth UUID through approved operator tooling. Cross-check the exact email and verified status, and obtain Brian's approval for the two UUID-to-seat mappings. No real values belong in the PR.

After the security schema is installed, run supabase/admin/enroll.sql as postgres inside an operator transaction, setting these four transaction-local values privately:

- recipebox.brian_id and recipebox.brian_email
- recipebox.cheryl_id and recipebox.cheryl_email

Use BEGIN, set the four values with SET LOCAL, execute enroll.sql, then COMMIT. The script creates no Auth users and changes no email, recipe or contributor data. It rejects missing/duplicate/unverified/banned identities, occupied seats mapped to a different user, and non-operator execution. Re-running for the same two mappings is harmless. It does not re-enable an intentionally disabled seat.

The membership table has no browser administration route or end-user write grant. Adding a contributor label does not enroll a person.

## Coordinated production sequence

1. Get explicit approval for the backup, Auth configuration, maintenance window, reviewed commit and each live action. Pre-stage assets without publishing the replacement. Do not merge into a branch that auto-publishes until this sequence is approved.
2. Complete backups, identity verification, callback/SMTP setup and the final preflight. The replacement client may be staged before SQL: its admission check fails closed when the RPC/schema is absent.
3. Review supabase migration list --project-ref knpovxbqoohsddquiyjv and supabase db push --project-ref knpovxbqoohsddquiyjv --dry-run --skip-vault. Exactly one security migration must be pending. Do not pass --include-all, --include-seed or --include-roles.
4. During the approved window, apply only that migration using the supported migration runner so only actually executed SQL is recorded. Its transaction initially leaves zero enrolled users; an enrollment problem creates a private outage, not public access.
5. Compare preservation-manifest.sql to the pre-change record. Recipe rows, labels and Storage object metadata must match exactly. Independently check object backup/path/byte integrity. Stop on any difference.
6. Enroll the two approved verified UUIDs using the operator script. Confirm exactly two intended seats. No data reassignment is needed; both identities see the same existing records, including legacy/null or inactive contributor labels.
7. Publish the reviewed application and invalidate old HTML/JS caches. Old PIN clients fail against the protected API; do not restore their anonymous permissions. The retired legacy/diagnostic pages redirect to the secure entry point.
8. Check the private bucket's formerly public URLs from a clean browser. Old public CDN/browser copies cannot be assumed erased by a bucket flag. Where supported, an approved operator can purge the bucket cache using Supabase's server-side purge facility; never put a secret in the app. Do not delete or overwrite objects to force invalidation. If cache behavior cannot be certified, get Supabase guidance and keep the release gate open.
9. Verify separate real magic links and persistent sessions for Brian and Cheryl, shared browsing/search, photo loading, sign-out and expiry. Verify anonymous REST/Storage denial and membership exclusion. Keep any write smoke test synthetic and separately approved; no automatic production test creates or deletes customer recipes.
10. Confirm hosted advisor results and negative access tests, and record the final checks/approvals. Only then describe the live vulnerability as fixed.

## Rollback and emergency containment

- **Before commit:** any migration error rolls the transaction back, including policies/grants and the new schema. Disposable tests inject a late error and verify rollback and unchanged records.
- **After commit:** keep RLS and the private bucket in place. If the app fails, publish a maintenance page or forward-fix the secure client. Do not revert to the PIN app with anonymous permissions.
- If all access must stop, Brian can approve emergency-lock.sql. It requires the postgres operator and an explicit approval setting and disables the two membership records. It touches no recipe/file data. Re-enabling a seat is an explicit operator decision after identity/session review.
- Do not reset the database, rerun historical scripts, drop recipes, restore broad grants/defaults, or overwrite live data as a permission rollback.
- A data recovery operation is a separate approved incident procedure. Recover from the private backup into an isolated destination first, reconcile changes made since the backup and preserve original IDs/paths. Production recovery must be approved by Brian.

An immediate pre-rollout revocation of anonymous access would reduce the current exposure but would interrupt the present PIN app and heartbeat. No such containment has been applied or implicitly approved here.

References: [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [CDN purge](https://supabase.com/docs/guides/storage/cdn/purge-cdn-cache), [magic links](https://supabase.com/docs/guides/auth/auth-email-passwordless).
