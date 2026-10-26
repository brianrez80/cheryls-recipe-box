# Email OTP and faster private photos — approval-only release

Prepared October 25, 2026. No live Auth setting, email template, database record, policy or deployment was changed while preparing this fix. The completed security migration must not be rerun. Public signup stays disabled; existing verified identities and private membership, RLS and Storage remain in force.

## Findings

The production template's subject is `Your sign-in link`; its body contains only `{{ .ConfirmationURL }}`. The deployed client requests a PKCE email link and exchanges its callback code using browser-local verifier state. Official Supabase guidance requires that requesting context for PKCE exchange. Samsung Gmail can hand a link to another browser context; a deterministic two-browser test reproduces that failure and then succeeds with a manually entered email OTP without any requesting-browser state. The aggregate read-only Auth log review found two expiry-related events in the inspected window, but did not identify a specific phone/browser or prove whether a link was also consumed by email scanning or reused. These remain possible additional causes; no private log values were exported.

The live Site URL is exactly https://cheryls-recipe-box.vercel.app/. Its exact root redirect and https://recipe-box-auth-check.vercel.app/ are allowlisted, with no wildcard. Public signup, anonymous sign-ins and manual linking are off; email confirmation and the email provider are on. No redirect mismatch was found. The current Email OTP settings are **eight digits, 3,600 seconds**, not the six digits required by this UI. Those settings and the template need the same approved cutover.

The confirmed loading bottleneck is an awaited download of the collection's private images before showing the app, repeated on collection reload. Storage currently holds 181 images totaling approximately 225.25 MiB; this is the whole bucket size, not a measured sign-in transfer. The fix opens the metadata-backed interface first and downloads only photos near the viewport, using the existing authenticated Storage API. At most four distinct downloads run concurrently; duplicate references share one request. Requests time out after 30 seconds, can be retried, and are aborted/discarded on lock/sign-out. Blob URLs are revoked and no private image falls back to a public URL. No image bytes, paths or stored references are rewritten.

## Prepared application behavior

- Request via `signInWithOtp` with `shouldCreateUser:false`; verify the typed six-digit string via `verifyOtp({ email, token, type:'email' })`.
- Numeric mobile keyboard, leading-zero support, paste handling, a 60-second resend cooldown, server rate-limit messages, retry/change-email controls, and an "I already have a code" path after refresh or in a different browser.
- Codes remain only in the input/request memory and are cleared from the field before verification. No code is saved to URL, browser storage, source or logs. SDK sessions retain existing persistence/refresh behavior.
- Auth verification alone grants no recipe access: verified-user and database-admission checks still run. Late verification cannot undo sign-out; a late old session check cannot cancel a newer OTP login.
- Existing magic-link callbacks remain supported for already-issued links and for rollback. New code emails contain no authentication link for email scanners to consume.

## One coordinated release plan — requires Brian's approval

1. Verify final PR CI and current secure production revision. Arrange a brief pause in new sign-in requests with the two owners; keep existing sessions open. No database backup, migration, enrollment or Storage-permission action is needed.
2. Merge/publish the reviewed OTP-capable application first. Confirm the canonical deployment and refresh both owners' Recipe Box pages. While the old template remains active, legacy magic-link callbacks still work; do not start new code tests during this short cutover.
3. In protected Supabase settings, change **Email OTP length 8 → 6** and **expiration 3,600 → 600 seconds**. Replace only the **Magic link or OTP** subject with `Your Recipe Box sign-in code` and body with [email-otp.proposed.html](email-templates/email-otp.proposed.html). It uses `{{ .Token }}` and contains no `ConfirmationURL` or `TokenHash` link. Keep all signup, confirmation, redirect, SMTP/Resend, account, membership, RLS and private-bucket settings unchanged. Do not create credentials or users.
4. Have each owner request a fresh production code and enter it on their own Samsung browser while opening Gmail separately; verify the displayed identity, shared browse/search/private photos, reload and sign-out. Check a Windows browser as well. Never share a real code, link or token. Recheck anonymous/outsider denial. Accept the release only after these actual provider/device checks pass; current browser tests use synthetic provider replies.

The temporary pause coordinates the new six-digit UI with the old eight-digit/link-only configuration. Already-authenticated sessions are not invalidated. Old email links may expire earlier when the global expiry is shortened; request a fresh code after cutover. No code-plus-auth-link transition email is proposed, because scanning such a link could consume the same one-time credential before code entry.

## Rollback

Prefer a secure forward fix for a provider/device-specific failure. If application rollback is required, coordinate new sign-in requests, restore the original subject/body in [magic-link.before.html](email-templates/magic-link.before.html), restore the former eight-digit/3,600-second values, then restore the prior **secure** production application at merge `331d3f346cab02c85484d0c5a04a7ca4c4965034` (Vercel `dpl_3t4Vnoep2LNqYq94KLN4eUzvoLi3`). Current OTP-capable code still accepts old link callbacks during that sequence. Existing sessions and all database security restrictions remain intact. Never restore the old anonymous/PIN permissions or restore data as an authentication rollback. This fallback returns the known phone-link limitation, so complete Samsung OTP acceptance before declaring the problem resolved.

## Tests and limits

Synthetic automated coverage includes the real pinned Supabase JS SDK, a request/browser handoff with no PKCE verifier, both enrolled identities, wrong/reused codes, no signup, persistent sessions, logout, cancellation of a late verification, shared mobile CRUD/search/private uploads, offscreen/delayed/failed photo loading, no public-image fallback and malicious stored-content rejection. Unit coverage also checks request cooldown, malformed codes, wrong verified email, denied membership and bounded/cancelled image work. Database regression tests use disposable in-memory PostgreSQL with automatic grants disabled, never the live migration.

Actual Samsung hardware/Gmail delivery and live six-digit GoTrue issuance cannot be certified before the approved template/settings cutover. No physical Samsung device was automated and no real verification email was sent during preparation. Production data was used only for aggregate read-only inspection, never copied into fixtures.

References: [Supabase email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless#with-otp), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [email templates and scanning](https://supabase.com/docs/guides/auth/auth-email-templates).
