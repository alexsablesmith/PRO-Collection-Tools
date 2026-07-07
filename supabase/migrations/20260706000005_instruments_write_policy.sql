-- ─────────────────────────────────────────────────────────────────────────────
-- Instruments write policy
--
-- The custom-survey builder (Item Bank page), the "battery from freeform
-- template" flow, and the admin Instruments page all insert/update rows in
-- public.instruments directly from the browser as the authenticated user.
-- RLS is enabled on the table but had no INSERT/UPDATE policy for the
-- authenticated role, so those writes failed with
--   "new row violates row-level security policy for table instruments".
--
-- instruments is global reference data (no PHI, and — for now — no
-- organization_id, so custom instruments are visible across organizations;
-- org-scoping is tracked separately). Restrict writes to clinical roles.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.instruments enable row level security;  -- no-op if already enabled

drop policy if exists instruments_insert on public.instruments;
create policy instruments_insert on public.instruments
  for insert to authenticated
  with check (
    (select role from public.user_profiles where id = auth.uid())
      in ('app_admin', 'org_admin', 'clinical_user')
  );

drop policy if exists instruments_update on public.instruments;
create policy instruments_update on public.instruments
  for update to authenticated
  using (
    (select role from public.user_profiles where id = auth.uid())
      in ('app_admin', 'org_admin', 'clinical_user')
  )
  with check (
    (select role from public.user_profiles where id = auth.uid())
      in ('app_admin', 'org_admin', 'clinical_user')
  );
