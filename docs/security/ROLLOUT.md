# Approval-only rollout, backup and recovery

Nothing in this document authorizes a live change. Separately approved email/Auth preparation is complete: both intended users verified their own email and passed real magic-link sign-in, refresh and sign-out on the isolated Auth preview. The security migration, membership enrollment, private Storage and replacement production application remain unapplied. See [current release gates](RELEASE-READINESS.md).

## Before scheduling release

- Obtain Brian's and Cheryl's exact emails privately and confirm each mailbox is controlled by the intended person. Do not infer identity from contributor labels, browser data or display names.
- Confirm project ref knpovxbqoohsddquiyjv and the approved canonical host https://cheryls-recipe-box.vercel.app/. Keep PKCE requests and callback on the same browser/origin.
- Approve exact HTTPS Site URL and redirect entries, SMTP/email delivery, email confirmation requirements and disabling public signups. The client uses shouldCreateUser:false; database enrollment remains a separate allowlist even if an unwanted Auth account exists.
- Pin the reviewed release commit and confirm no external job depends on anonymous recipe/image access. Retire the heartbeat as part of this release.
- vercel.json disables automatic Vercel deployment for the review branch codex/secure-private-recipe-box. It changes no live settings; other branches retain their existing deployment behavior. An explicitly approved preview or production publication is a separate release action. Do not remove the review-branch guard before preview approval.
- Run the SQL/browser suites in a disposable hosted Supabase environment if available. Local tests do not replace hosted Auth, real email, Storage HTTP and CDN checks.

## Backup and recovery reference

The current approved strategy uses native Supabase physical recovery points, the preserved independently verified local recipe/image archive, and documented Auth/email settings. The October 25 native point postdates both accounts' creation and verification. Custom Auth backup/diagnostic work is stopped and its incomplete archive is not accepted. See the single authoritative [recovery and release checklist](RELEASE-READINESS.md). No new password or export is required by this document.

## Controlled enrollment

The two identities must be prepared only after Brian explicitly approves account registration/enrollment. An operator creates/invites the two exact emails through Supabase Auth without manually asserting email confirmation. Each person verifies their own email. Use an approved preview of this client if needed to handle PKCE while membership is still absent: it fails closed and does not fetch the collection until the database grants admission.

Read each verified Auth UUID through approved operator tooling. Cross-check the exact email and verified status, and obtain Brian's approval for the two UUID-to-seat mappings. No real values belong in the PR.

After the security schema is installed, run supabase/admin/enroll.sql as postgres inside an operator transaction, setting these four transaction-local values privately:

- recipebox.brian_id and recipebox.brian_email
- recipebox.cheryl_id and recipebox.cheryl_email

Use BEGIN, set the four values with SET LOCAL, execute enroll.sql, then COMMIT. The script creates no Auth users and changes no email, recipe or contributor data. It rejects missing/duplicate/unverified/banned identities, occupied seats mapped to a different user, and non-operator execution. Re-running for the same two mappings is harmless. It does not re-enable an intentionally disabled seat.

The membership table has no browser administration route or end-user write grant. Adding a contributor label does not enroll a person.

## Coordinated production sequence

Use the single current checklist in [RELEASE-READINESS.md](RELEASE-READINESS.md). It includes native recovery evidence, the one pending migration, private enrollment, Storage/cache work, main-branch Vercel publication and hosted acceptance. This file retains operator enrollment and containment reference details; it is not a second release checklist.

## Rollback and emergency containment

- **Before commit:** any migration error rolls the transaction back, including policies/grants and the new schema. Disposable tests inject a late error and verify rollback and unchanged records.
- **After commit:** keep RLS and the private bucket in place. If the app fails, publish a maintenance page or forward-fix the secure client. Do not revert to the PIN app with anonymous permissions.
- If all access must stop, Brian can approve emergency-lock.sql. It requires the postgres operator and an explicit approval setting and disables the two membership records. It touches no recipe/file data. Re-enabling a seat is an explicit operator decision after identity/session review.
- Do not reset the database, rerun historical scripts, drop recipes, restore broad grants/defaults, or overwrite live data as a permission rollback.
- A data recovery operation is a separate approved incident procedure. Recover from the private backup into an isolated destination first, reconcile changes made since the backup and preserve original IDs/paths. Production recovery must be approved by Brian.

An immediate pre-rollout revocation of anonymous access would reduce the current exposure but would interrupt the present PIN app and heartbeat. No such containment has been applied or implicitly approved here.

References: [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [CDN purge](https://supabase.com/docs/guides/storage/cdn/purge-cdn-cache), [magic links](https://supabase.com/docs/guides/auth/auth-email-passwordless).
