# Validation results and limits

## Prepared email OTP follow-up — not deployed

The OTP/image-loading follow-up passes 28 Node test entries (including all original application files), 11 browser tests, 126 disposable database checks, 63 static checks, JavaScript syntax, and one real synthetic OCR smoke. Browser cases use the pinned real Supabase SDK with intercepted synthetic provider responses. Samsung Galaxy/Android emulation covers a cross-browser handoff without PKCE state, typed leading-zero codes, reuse rejection, persistence/logout and mobile shared CRUD. Other cases cover a delayed verification after logout, a late initial session check, on-demand/offscreen private photos, retry and cancellation, and continued authorization denial. No production customer data is used in fixtures.

An original local test-file syntax typo was corrected before these passing results; no known test failure is waived. No live OTP email was sent, no live email template/provider setting was changed, and no deployment was created during preparation. Actual Samsung hardware/Gmail delivery and live six-digit issuance remain approval-time acceptance checks in [EMAIL-OTP-RELEASE.md](EMAIL-OTP-RELEASE.md).

Repository validation uses synthetic identities, recipes and images; no live recipe/file data was used in these regression fixtures. Separate, explicitly approved operator work prepared and verified the two real Auth identities and encrypted local backups outside Git. Those actions do not enroll recipe membership or apply this PR. Read-only release review and the October 24 rerun are recorded in [release readiness](RELEASE-READINESS.md).

## Commands

Run npm ci --ignore-scripts in the repository, then:

| Command | Evidence |
|---|---|
| npm run check | JavaScript syntax checks |
| npm test | Existing application test files and focused authentication/race/error checks |
| node test.js | Static application validation |
| npm run test:database | Fresh and existing-schema PostgreSQL tests without automatic grants |
| npm run test:browser | Real pinned SDK and headless browser against synthetic Auth/API fixtures |
| npm run test:ocr | Real browser OCR worker/WebAssembly with a synthetic recipe image; public CDN downloads only |

Browser tests default to installed Microsoft Edge. For bundled Chromium, install it with npx playwright install chromium and set PLAYWRIGHT_CHANNEL=chromium. No database URL, secret, production login or email is needed. PGlite runs real PostgreSQL in memory with minimal Auth/Storage stand-ins; it never resets an existing database.

## Latest results

- Database: fresh 63/63 and existing 63/63 checks passed (126 total).
- Browser: 5/5 passed, including PKCE/no signup, session persistence, two identities sharing CRUD/search on mobile, anonymous/outsider/expired-session denial, invalid-link recovery with continuing Auth monitoring, stored-content safety and delayed responses after sign-out.
- Real OCR smoke: 1/1 passed under the application CSP.
- Application/authentication: 15/15 Node test entries passed, including all 11 pre-existing test files and four added focused checks.
- Static validator: 63 passed, zero failed; syntax checks passed.
- No failing test is intentionally waived.

This is a static JavaScript application with no TypeScript compilation or application build script. Syntax, application regression, browser and database checks are the relevant repository gates. The PR workflow repeats the deterministic suites on Ubuntu with Chromium; the network-dependent OCR smoke is an explicit local command.

SQL tests confirm anonymous CRUD denial; outsider/forged/expired admission denial; both users' shared CRUD; no client membership read/write/account creation; service-independent explicit grants; private attachments despite another permissive storage policy; immediate membership/session revocation; fresh initialization; and byte-for-byte JSON preservation of complete synthetic recipe, label and object-metadata records. SHA-256 aggregate manifests also match. An injected late migration failure rolls back schema/permissions without changing records. The guarded emergency lock is tested.

## Unverified release gates

Both real users have passed delivery, verification, fresh PKCE magic-link sign-in, persistence and sign-out on the isolated Auth-only HTTPS preview. Exact hosted production/preview redirects and closed-signup/confirmation/SMTP configuration were independently read during backup preparation. Actual recipe membership remains absent. The hosted application-to-RLS-to-Storage path, two-person enrollment, production sign-in after publication, private Storage downloads/uploads, expired/revoked gateway-session denial and public-cache invalidation remain unexercised. Browser Auth/API regression replies are simulated; they do not certify those remaining hosted data controls. The OCR worker is real, but its input is synthetic.

The local database tests compare stored metadata and references; they do not prove a production backup contains every image byte. A read-only MIME inventory found JPEG and PNG files, both supported by the private image path. The original approved encrypted backup is preserved. The failed custom Auth archive remains incomplete and has been excluded from the recovery plan at Brian’s direction. Native physical recovery-point coverage, the preserved verified recipe/image archive and matching release preservation manifests now supply the recovery gates in RELEASE-READINESS.md. Keep all backup contents and private verification records outside Git.

No Docker/native disposable Supabase stack or paid hosted test project was created. Run the final hosted checks before activating production and keep the vulnerability marked unresolved until successful deployment verification.
