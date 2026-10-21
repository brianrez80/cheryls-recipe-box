# Testing the private Recipe Box

Use [the current validation commands and results](docs/security/TEST-RESULTS.md). Tests use disposable PostgreSQL and synthetic browser fixtures. They require no live database URL or accounts.

The retired browser console redirects to the secure app. The PIN test and old rollback/deployment instructions are obsolete.

Production acceptance, backup verification, enrollment and rollback are in [the approval-only rollout](docs/security/ROLLOUT.md). Passing local tests does not authorize a merge, live SQL/Auth changes or deployment.
