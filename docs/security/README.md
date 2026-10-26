# Private Recipe Box implementation

This implements the remediation requested after [audit PR #19](https://github.com/brianrez80/cheryls-recipe-box/pull/19). It is prepared for review, not deployed. The live anonymous-access vulnerability remains until the coordinated rollout is completed and verified.

## Access model

Brian and Cheryl use separate Supabase Auth email magic links with PKCE. Automatic account creation is disabled in the client. The SDK persists each browser's session and refreshes it; the app verifies the user with Auth and calls recipe_box_access before fetching recipes or images. Sign-out locks and clears the interface immediately. Session checks run on auth changes, tab visibility and every minute; RLS checks every database/storage request independently.

recipe_private.authorized_users has exactly two possible seats, brian and cheryl, each mapped to a distinct verified Auth UUID. Only the database operator can enroll, replace, or disable these identities. End users have no membership-table read or mutation privileges. Account display names, email strings in browser input, user_metadata, recipe member_id and contributor labels do not grant access.

The private, parameterless SECURITY DEFINER helper reads only membership/Auth state with an empty search_path. It requires a verified non-anonymous, non-banned identity, enabled membership, a matching Auth session, unexpired session limits and unexpired JWT claims. Deleting a session or disabling a seat therefore denies new access even before a JWT expires. The exposed recipe_box_access RPC is SECURITY INVOKER and returns only the current caller's admission result.

Both enrolled identities can select, insert, update and delete every recipe in the same collection. Existing family_members remain attribution labels, including historical labels such as Tiffany; creating a label creates no account. Authenticated outsiders receive no recipe rows and cannot mutate them. Anonymous roles lose all recipe/label privileges. No policies authorize all authenticated users.

## Attachments and client safety

The recipe-images bucket becomes private. Storage policies permit only enrolled identities; restrictive fences prevent an unrelated permissive policy from reopening this bucket. Images are downloaded with the user's JWT and rendered as revocable in-memory blob URLs. New records store stable storage:// references; existing public URLs and all original_image_urls are preserved and resolved without rewriting rows. No service-role or secret key is added to the browser.

The SDK is pinned and integrity-checked. CSP blocks inline scripts and active-content injection while permitting the existing WebAssembly OCR engine. Recipe image attributes are escaped. Private import state is no longer persisted in sessionStorage. Retired legacy/diagnostic HTML pages redirect to the secure entry point. Pending requests cannot repopulate recipe state after sign-out.

## Migration and preservation

- 20260711054726_add_recipe_review_workflow.sql is a **fresh-only reconstruction** of the inspected schema. Its version already exists in live history; it must not run against an existing recipe database. It explicitly aborts if recipe tables exist.
- 20260814014436_add_legacy_recipe_links.sql uses the version and SQL actually recorded in the live project.
- 20261021015453_secure_shared_recipe_box.sql is the only new live migration. It changes authorization/storage configuration and adds membership machinery; it does not insert, update, delete, truncate or reassign any recipe or existing contributor record. Existing objects and file bytes stay in place.
- Historical source files that updated recipe attribution or seeded/upserted labels are archived as .sql.txt outside the migration directory. They are not replayed or falsely marked applied.
- All API grants are explicit; fresh tests run with automatic table/sequence grants disabled. UUID keys require no sequence grant.

See [migration provenance](HISTORY.md), [controlled enrollment and rollout](ROLLOUT.md), and [tests and limits](TEST-RESULTS.md).

## Integrations

The anonymous GitHub heartbeat is retired in this PR. It provided no application processing and would fail after access is secured. No privileged replacement, server key, scheduled job or new account-management infrastructure is introduced. If availability on an inactivity-pausing plan matters, Brian must choose an appropriate hosting/database plan or an approved operator process.

Other discovered integrations are client-side OCR, recipe-link imports, YouTube/source links and the PWA share target. Existing tests and the real OCR smoke test cover their relevant behavior. No other source-controlled background integration was found; Brian should confirm any external automation before release.

## Information and approvals still required

1. Both intended emails and verified UUIDs have been recorded privately through the separately approved Auth setup. Do not recreate accounts or commit those records. Both real preview sign-in/refresh/sign-out tests passed; this is not database enrollment.
2. Canonical HTTPS URL: https://cheryls-recipe-box.vercel.app/. The exact production root and isolated Auth-preview root are approved; no wildcard redirect. Adding a future staged application callback still needs review.
3. Custom SMTP, closed public signup and required email confirmation are configured. No further Auth configuration change is proposed by this PR.
4. Preserve the approved independently verified recipe/image backup. The current recovery strategy uses native Supabase daily physical points and documented Auth/email settings; custom Auth backup is stopped and remains incomplete. See the native-point coverage gate and maintenance approval in RELEASE-READINESS.md.
5. Separate approval to merge, apply the single live migration, enroll the verified UUIDs, change bucket access/purge CDN caches, and publish the app.
6. Final hosted collection sign-in/storage/negative-access validation with the real users after the approved rollout. The separate Auth-only preview does not certify the application-to-RLS-to-Storage path. See [current release gates and checklist](RELEASE-READINESS.md).
