# Recipe Box — native recovery and coordinated release

Reviewed October 25, 2026. This is the authoritative release checklist, superseding the abandoned custom Auth backup requirement. No restore, migration, enrollment, permission change, merge or deployment is authorized by this document.

## Readiness decision

**Ready for Brian's coordinated release approval.** The authenticated dashboard now lists the October 25 physical backup as available for restoration. Both intended accounts were created and email-confirmed before that recovery point. Current read-only schema/history, identity mapping, inventory, Auth configuration and PR checks pass. No custom Auth backup, paid PITR add-on or new password prompt is required. Hosted application/RLS/Storage acceptance remains an execution-time gate; the live vulnerability is not fixed yet.

## Recovery evidence

| Component | Verified state |
|---|---|
| Project | Cheryls-recipe-box / knpovxbqoohsddquiyjv; Pro organization |
| Native scheduled backups | Refreshed authenticated dashboard lists seven available PHYSICAL backups, October 19–25 |
| Newest native point | October 25, 2026, 10:36:07 UTC / 4:36:07 AM MDT |
| Auth coverage of that point | Both intended identities were created AND email-confirmed by that timestamp (2/2). Their privately recorded UUID/email mappings match current verified users. Coverage is established from provider availability, documented physical-backup scope and read-only timestamps; no backup was restored or independently opened. |
| PITR | Not enabled; dashboard offers the optional add-on. Nothing enabled or purchased. |
| Current live inventory | 69 recipes, 4 contributors, 181 image objects; exactly two intended verified Auth users |
| Image metadata freshness | Zero image objects show creation/update after the original local backup completed. This is metadata evidence, not a new byte-for-byte download verification. |
| Local archive | Original independently verified encrypted October 24 backup, 236,419,426 bytes; SHA-256 rechecked unchanged |
| Local archive SHA-256 | 2c6870a8d6f9feecfae89b758caec57ab10a3819df828a5f239eaac3616f0368 |
| Local recovery coverage | All 69 recipe rows/columns/metadata, 4 contributors, schema/ACL/RLS/migration history and all 181 image files with original paths and SHA-256; prior independent reopen, second downloads and isolated public-schema restore passed |
| Failed Auth archive | Still incomplete, retained separately, excluded from every recovery guarantee; diagnostics stopped at Brian's direction |

The original archive remains in the approved Windows Documents backup folder, outside Git. Its original tools and verification records are preserved, and its exact size/SHA-256 were rechecked unchanged on October 25. No encryption password is requested or copied into this report. Native backup contents have not been restored/tested here; the dashboard, source creation/confirmation timestamps and Supabase's documented physical-backup coverage are the evidence. Pro daily retention is seven days, so recheck availability immediately before release or any later recovery.

## Recovery strategy

Use a native physical recovery point for the database, including Auth user UUIDs and verification state that actually existed at that point. Use the verified encrypted local archive for recipe/image recovery, especially the Storage file bytes that database backups omit. Reconcile snapshot times before combining data. Do not use the incomplete Auth archive as a fallback or waive its failed checks.

For a disaster requiring restoration, obtain separate incident approval. Prefer restoring to an isolated compatible Supabase project with no public client traffic, then reconcile records/UUIDs and reapply the approved secure migration and two-seat enrollment before cutover. Pre-release backups contain the old permissive recipe policies; restoring them directly into the public project could reopen anonymous access. Keep the target isolated and the recovered recipe-images bucket private, restore files at their original paths/MIME types/metadata, and verify every SHA-256 against the local archive. Never blindly overwrite production or replay incompatible historical migrations. A full restore can lose changes since its recovery point and requires downtime/reconciliation.

Hosted Auth settings/API keys and email credentials require separate recovery handling; they are not implied by database recovery. Retain the documented settings below and credentials privately in the password manager/protected service settings. If recovery must use an older point without the accounts, Brian and Cheryl must be recreated through controlled enrollment and verify their own emails again; new UUIDs must be privately reauthorized. That is a recovery limitation, not permission to fabricate confirmation or reuse absent UUIDs.

### Auth/email settings to preserve

- Canonical Site URL and production redirect: https://cheryls-recipe-box.vercel.app/.
- Additional exact approved redirect: https://recipe-box-auth-check.vercel.app/; no wildcards. Keep the approved invitation body while this preview remains its verification destination.
- Email provider on; public signup off; email confirmation required; anonymous sign-ins and manual identity linking off.
- SMTP: smtp.resend.com, port 465, username resend; sender recipebox@auth.trixietechnologies.com; display name Cheryl's Recipe Box. Preserve the domain-scoped Resend sending credential privately; no key is in this repository.
- Sending domain auth.trixietechnologies.com verified; outbound TLS enforced. Preserve the approved invitation template and three DNS records; do not alter other Trixie/AI email routing.
- Both separate sign-in/persistence/sign-out device tests passed. Keep the private two-UUID mapping outside Git; validate it against recovered/current verified Auth users before any enrollment. Require fresh sign-in after recovery.

## One approval-only rollout checklist

- [x] **Recovery gate:** October 25 10:36:07 UTC native physical point is available after both users' creation AND verification. Original encrypted local archive checksum is unchanged; failed Auth archive is still incomplete and excluded. No restore or custom diagnostic was run. Recheck availability at release time.
- [ ] **Release authorization:** Brian approves the final PR #20 commit/tree, short maintenance/write-freeze window, exact migration, two private UUID-to-seat enrollments, private Storage/cache work and the merge/publication together. Main is the Vercel production branch. Confirm no unexpected recipe/image changes since the recovery evidence; stop on any discrepancy.
- [ ] **Read-only preflight:** Reconfirm project/identity scope, exactly two verified intended users, current 69/4/181 comparison inventory, two recorded migration versions and absence of recipe_private. Save private preservation fingerprints. Review exactly one pending file: 20261021015453_secure_shared_recipe_box.sql. Use supported authenticated operator tooling; never replay the fresh-only reconstruction over production, repair history blindly, reset, seed or include all migrations. A missing local CLI is an operator-tool setup detail, not a reason to resume custom Auth backup work.
- [ ] **Atomic security migration:** After explicit approval, execute and record only that migration. It creates the fixed two-seat membership structure, preserves RLS, removes legacy permissive recipe policies, adds least-privilege grants/restrictive Storage policies and makes the existing bucket private in the same transaction. It performs no existing recipe/contributor/object DML. Initially zero users have admission; the old PIN client will lose access during the approved window.
- [ ] **Preservation and private enrollment:** Compare all recipe/contributor/object-metadata fingerprints to the pre-change values, preserving references and file paths. Then execute supabase/admin/enroll.sql in one protected operator transaction with the two privately verified UUID/email mappings. Confirm exactly two intended enabled seats. No browser membership administration or additional accounts.
- [ ] **Publish and cache:** Only after preservation/enrollment succeed, merge the approved PR and observe its Vercel production deployment. Verify READY, exact merged commit/tree, project/team and canonical HTTPS domain. Do not run an extra ad hoc deployment. Retire the anonymous heartbeat through this PR. Perform the approved server-side recipe-images cache purge (Pro capability verified), keep credentials private, and verify old public URLs stop serving content after propagation. Browser copies already downloaded cannot be recalled.
- [ ] **Production acceptance:** Brian and Cheryl separately test fresh production magic links, refresh, sign-out, shared browse/search and private images. Verify anonymous/outsider/expired/revoked-session denial through the hosted API/Storage path. Temporary synthetic write smoke tests need explicit approval; do not test by changing real recipes. Compare preservation evidence before permitted writes. Keep the vulnerability unresolved until all acceptance checks pass.
- [ ] **Failure response:** Before migration commit, errors roll back transactionally. After commit, retain RLS/private Storage and use maintenance/secure forward fixes. An approved emergency lock may disable seats without changing recipes/files. Never reopen anonymous grants or restore the PIN security model. Native/local data restoration remains a separate, isolated-first incident approval.

## Genuine remaining limits

The missing-Auth recovery-point gap is resolved under the approved native recovery strategy. Brian's explicit coordinated release approval is the remaining pre-release gate. Read-only checks reconfirmed 69 recipes, 4 contributors, 181 images, exactly two eligible verified users, matching private UUID/email mappings, existing RLS, expected columns/foreign key, two historical migration entries, no private membership schema, and no public views or application-table triggers. No image object creation/update timestamp is newer than the original verified local backup. Exact production/preview redirects, closed signup, required confirmation, email provider and Resend SMTP were rechecked without reading credentials.

PR #20 remains open, mergeable and unmerged at code commit 12e015c6a92c5e9f26454b5283906f9fd279d0ac; its existing GitHub checks still report success. Only local security documentation differs from that code commit. Production still serves base commit b2cb1806649d9c84585cb1b92df26c19e3667eb6; no publication occurred. The approval scope includes attaching these reviewed documentation updates to PR #20 without application/migration changes, followed by its required CI gate before merge.

The production acceptance checks are execution-time requirements, not evidence of an existing implementation failure. They include both owners' actual production PKCE/session/shared-collection flows, hosted unauthorized/expired-session denial, private downloads and CDN denial of old public URLs. With explicit approval, use a clearly labeled temporary synthetic recipe/image for create/edit/delete checks and remove only those test fixtures; compare preservation manifests before test writes and restore the original inventory afterward. Real shared recipe/Storage authorization has not been deployed; current anonymous access remains live. A hosted disaster recovery has not been rehearsed, and recovery-point age/data-loss limits must be accepted explicitly. No known code failure remains from the reviewed implementation: 126 database checks, 15 Node entries, 5 browser checks, 1 real synthetic OCR smoke and 63 static checks passed; no unnecessary rerun was performed for documentation-only changes.

References: [native backups and retention](https://supabase.com/docs/guides/platform/backups), [physical recovery and Auth/control-plane scope](https://supabase.com/docs/guides/platform/clone-project), [PR #20](https://github.com/brianrez80/cheryls-recipe-box/pull/20).
