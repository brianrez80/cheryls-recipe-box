# Validation results and limits

Validation uses synthetic identities, recipes and images. No live accounts were registered or authorized, and no live recipe/file data was used in tests. Read-only live inspection covered schema/history, policies, role privileges and aggregate image MIME types; it did not download customer recipes or files.

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

The hosted Supabase gateway's JWT verification, live GoTrue email delivery/refresh/logout behavior, actual two-person enrollment, production callback allowlists, hosted Storage downloads/uploads and public-cache invalidation have not been exercised. Browser Auth/API replies are simulated; they are not a certification of the production provider configuration. The OCR worker is real, but its input is synthetic.

The local database tests compare stored metadata and references; they do not prove a production backup contains every image byte. A read-only MIME inventory found JPEG and PNG files, both supported by the private image path. Backup/path/byte validation and matching real preservation manifests remain approval-time requirements.

No Docker/native disposable Supabase stack or paid hosted test project was created. Run the final hosted checks before activating production and keep the vulnerability marked unresolved until successful deployment verification.
