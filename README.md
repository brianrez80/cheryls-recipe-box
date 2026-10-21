# Cheryl's Private Recipe Box

Two separate Supabase Auth magic-link identities share one private recipe collection. This branch prepares security remediation for review; it does not activate production access.

Start with [architecture and status](docs/security/README.md), [approval-only rollout and recovery](docs/security/ROLLOUT.md), and [test results](docs/security/TEST-RESULTS.md). Brian's and Cheryl's emails and verified UUIDs are enrolled only through the approved operator process.

Local checks: `npm ci --ignore-scripts`, `npm test`, `npm run test:database`, `npm run test:browser`, `npm run test:ocr`, and `npm run check`. Tests use synthetic data and intercept Supabase traffic.
