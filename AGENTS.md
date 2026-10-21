# Repository guidance

## Supabase migrations and October 30 defaults

- Pair every new API table with explicit per-role, per-operation GRANT statements, ENABLE ROW LEVEL SECURITY, and ownership/tenant policies where client access is required. Never restore automatic default grants or grant privileges on all tables.
- Identify actual supabase-js, REST, GraphQL and RPC callers before selecting privileges. Include service_role explicitly; RLS bypass does not bypass SQL privileges. Preserve column-level grants.
- Grant sequence USAGE only to inserting roles that need nextval; add SELECT only for a demonstrated sequence-reading workflow. UUID identifiers do not need sequence grants.
- Keep internal tables server-only; RLS without policies is intentional default-deny. Do not add permissive policies to silence advisors.
- Revoke PUBLIC, anon and authenticated execution on internal functions; inspect trigger/RPC dependencies first. Keep SECURITY DEFINER search_path restricted and identifiers qualified.
- Test fresh replay with table and sequence automatic grants disabled, authorized users, another tenant, anonymous users and privileged server calls using synthetic fixtures. Document rollback and blockers.
- Verify repository/project mapping from configuration. Never apply live migrations, change live auth settings, merge or deploy without Brian's explicit release approval.
