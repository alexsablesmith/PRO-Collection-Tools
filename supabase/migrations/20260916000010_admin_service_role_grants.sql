-- ─────────────────────────────────────────────────────────────────────────────
-- Service role grants for the admin dashboard tables
--
-- This project does not grant new public tables to service_role by default,
-- so the /api/admin/* routes got "permission denied" on the tables created in
-- 20260916000009_admin_dashboard.sql. items (20260706000002) had the same gap.
-- ─────────────────────────────────────────────────────────────────────────────

grant select, insert, update, delete on table public.organization_instruments to service_role;
grant select, insert, update, delete on table public.email_log                to service_role;
grant select, insert, update, delete on table public.platform_notices         to service_role;
grant select, insert, update, delete on table public.battery_templates        to service_role;
grant select, insert, update, delete on table public.items                    to service_role;

-- Audit log stays append-only (the immutability trigger also blocks
-- update/delete); the service role only needs to write and read it.
grant select, insert on table public.admin_audit_log to service_role;
