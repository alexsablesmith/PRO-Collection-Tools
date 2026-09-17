-- ─────────────────────────────────────────────────────────────────────────────
-- App Admin dashboard
--
--  1. Organization lifecycle (active → deactivated → pending_deletion → purged),
--     profile/branding, per-org security policy, and plan/seat fields.
--  2. User invite lifecycle columns, and a guard so users can't change their
--     own role, organization, or account status from the browser.
--  3. Account-access enforcement in the database: a RESTRICTIVE policy on every
--     RLS-enabled table requires an active profile in an active organization
--     (and an MFA session when the org requires it). This is what makes
--     "deactivate" take effect immediately, not just in API routes.
--  4. Instrument org scoping + per-org instrument access and license tracking,
--     enforced by triggers on batteries and survey_requests.
--  5. Append-only admin audit log, email delivery log, platform notices,
--     default battery templates.
--  6. Service-role-only helper functions: org stats, user listing with email,
--     session revocation, and the transactional organization purge.
--
-- Apply in the Supabase SQL editor after migrations 1–8. Every new admin write
-- goes through /api/admin/* with the service role key; nothing here grants the
-- browser write access to the new tables.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 ── Organizations ──────────────────────────────────────────────────────────
alter table public.organizations
  add column if not exists status                  text not null default 'active',
  add column if not exists deactivated_at          timestamptz,
  add column if not exists deletion_requested_at   timestamptz,
  add column if not exists deletion_scheduled_for  timestamptz,
  add column if not exists display_name            text,
  add column if not exists logo_url                text,
  add column if not exists contact_name            text,
  add column if not exists contact_email           text,
  add column if not exists contact_phone           text,
  add column if not exists timezone                text not null default 'America/Los_Angeles',
  add column if not exists default_language        text not null default 'en',
  add column if not exists require_mfa             boolean not null default false,
  add column if not exists session_timeout_minutes int,
  add column if not exists allowed_email_domains   text[] not null default '{}',
  -- Orgs that predate plan tracking are real customers; new orgs start as trials.
  add column if not exists plan                    text not null default 'standard',
  add column if not exists trial_ends_at           date,
  add column if not exists seat_limit              int,
  add column if not exists billing_notes           text;

alter table public.organizations drop constraint if exists organizations_status_check;
alter table public.organizations add  constraint organizations_status_check
  check (status in ('active', 'deactivated', 'pending_deletion'));
alter table public.organizations drop constraint if exists organizations_default_language_check;
alter table public.organizations add  constraint organizations_default_language_check
  check (default_language in ('en', 'es'));
alter table public.organizations drop constraint if exists organizations_plan_check;
alter table public.organizations add  constraint organizations_plan_check
  check (plan in ('trial', 'standard', 'enterprise', 'internal'));
alter table public.organizations drop constraint if exists organizations_session_timeout_check;
alter table public.organizations add  constraint organizations_session_timeout_check
  check (session_timeout_minutes is null or session_timeout_minutes between 5 and 1440);
alter table public.organizations drop constraint if exists organizations_seat_limit_check;
alter table public.organizations add  constraint organizations_seat_limit_check
  check (seat_limit is null or seat_limit > 0);

alter table public.organizations alter column plan set default 'trial';

-- 2 ── User profiles ──────────────────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists invited_at         timestamptz,
  add column if not exists invited_by         uuid,
  add column if not exists invite_accepted_at timestamptz,
  add column if not exists deactivated_at     timestamptz;

-- Backfill. is_active=false used to mean either "invite pending" or
-- "deactivated"; a user who has set a password has accepted their invite.
update public.user_profiles set invited_at = created_at where invited_at is null;

update public.user_profiles p
   set invite_accepted_at = coalesce(u.last_sign_in_at, p.created_at)
  from auth.users u
 where u.id = p.id
   and p.invite_accepted_at is null
   and (p.is_active or coalesce(u.encrypted_password, '') <> '');

update public.user_profiles
   set deactivated_at = now()
 where not is_active and invite_accepted_at is not null and deactivated_at is null;

-- Role, organization, and account status are admin-controlled. The browser
-- (role "authenticated") may still update its own full_name.
create or replace function public.guard_user_profile_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  if new.role               is distinct from old.role
  or new.organization_id    is distinct from old.organization_id
  or new.is_active          is distinct from old.is_active
  or new.invited_at         is distinct from old.invited_at
  or new.invited_by         is distinct from old.invited_by
  or new.invite_accepted_at is distinct from old.invite_accepted_at
  or new.deactivated_at     is distinct from old.deactivated_at then
    raise exception 'Role, organization and account status can only be changed by an administrator'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_user_profile_changes on public.user_profiles;
create trigger guard_user_profile_changes
  before update on public.user_profiles
  for each row execute function public.guard_user_profile_changes();

-- 3 ── Caller helpers (used by RLS policies) ─────────────────────────────────
create or replace function public.caller_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$ select organization_id from user_profiles where id = auth.uid() $$;

create or replace function public.caller_role()
returns text
language sql stable security definer
set search_path = public
as $$ select role::text from user_profiles where id = auth.uid() $$;

-- True when the signed-in user may touch data: active profile, active org
-- (app admins are exempt from their own org's status so they can't lock
-- themselves out), and an aal2 session if the org requires MFA.
create or replace function public.caller_has_access()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select p.is_active
       and (p.role::text = 'app_admin' or o.status = 'active')
       and (not o.require_mfa or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
      from user_profiles p
      join organizations o on o.id = p.organization_id
     where p.id = auth.uid()
  ), false)
$$;

revoke execute on function public.caller_org_id()     from public, anon;
revoke execute on function public.caller_role()       from public, anon;
revoke execute on function public.caller_has_access() from public, anon;
grant  execute on function public.caller_org_id()     to authenticated, service_role;
grant  execute on function public.caller_role()       to authenticated, service_role;
grant  execute on function public.caller_has_access() to authenticated, service_role;

-- 4 ── Instrument scoping, access, and licensing ─────────────────────────────
alter table public.instruments
  add column if not exists organization_id  uuid references public.organizations (id),
  add column if not exists license_required boolean not null default false,
  add column if not exists license_notes    text,
  add column if not exists default_enabled  boolean not null default true;

create index if not exists instruments_org_idx on public.instruments (organization_id);

-- Backfill owners of custom instruments. Freeform template instruments belong
-- to the template's org; item-bank custom surveys belong to the one org whose
-- batteries use them. Anything ambiguous stays global for the app admin to
-- assign from the Platform page.
do $$
begin
  if to_regclass('public.survey_templates') is not null then
    update public.instruments i
       set organization_id = t.organization_id
      from public.survey_templates t
     where i.template_id = t.id and i.organization_id is null;
  end if;
end $$;

update public.instruments i
   set organization_id = owner.org_id
  from (
    select i2.id, min(b.organization_id::text)::uuid as org_id
      from public.instruments i2
      join public.batteries b on i2.id = any (b.instrument_ids::uuid[])
     where i2.organization_id is null
       and (i2.code like 'custom\_%' escape '\' or i2.code like 'freeform\_%' escape '\')
     group by i2.id
    having count(distinct b.organization_id) = 1
  ) owner
 where owner.id = i.id;

create table if not exists public.organization_instruments (
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  instrument_id      uuid not null references public.instruments (id) on delete cascade,
  enabled            boolean not null default true,
  license_status     text not null default 'none'
                     check (license_status in ('none', 'pending', 'licensed')),
  license_reference  text,
  license_expires_on date,
  updated_at         timestamptz not null default now(),
  updated_by         uuid,
  primary key (organization_id, instrument_id)
);

-- Existing orgs keep every global instrument they could already use.
insert into public.organization_instruments (organization_id, instrument_id, enabled)
select o.id, i.id, true
  from public.organizations o
 cross join public.instruments i
 where i.organization_id is null
on conflict do nothing;

create or replace function public.org_can_use_instrument(p_org uuid, p_instrument uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from instruments i
                  where i.id = p_instrument and i.organization_id = p_org)
      or exists (select 1 from organization_instruments oi
                  where oi.organization_id = p_org
                    and oi.instrument_id  = p_instrument
                    and oi.enabled)
$$;

revoke execute on function public.org_can_use_instrument(uuid, uuid) from public, anon;
grant  execute on function public.org_can_use_instrument(uuid, uuid) to authenticated, service_role;

-- Batteries may only contain instruments their org can use. Checked only when
-- instrument_ids change, so deactivating a legacy battery still works.
create or replace function public.enforce_battery_instruments()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_blocked text;
begin
  if tg_op = 'UPDATE'
     and new.instrument_ids is not distinct from old.instrument_ids
     and new.organization_id is not distinct from old.organization_id then
    return new;
  end if;

  select string_agg(coalesce(i.name, x.id::text), ', ')
    into v_blocked
    from unnest(new.instrument_ids::uuid[]) as x(id)
    left join instruments i on i.id = x.id
   where not org_can_use_instrument(new.organization_id, x.id);

  if v_blocked is not null then
    raise exception 'Your organization does not have access to: %', v_blocked
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists enforce_battery_instruments on public.batteries;
create trigger enforce_battery_instruments
  before insert or update on public.batteries
  for each row execute function public.enforce_battery_instruments();

-- A survey can only be sent from an active org, with a battery whose
-- instruments are all still enabled for that org.
create or replace function public.enforce_survey_request_access()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_status  text;
  v_blocked text;
begin
  select b.organization_id, o.status
    into v_org, v_status
    from batteries b
    join organizations o on o.id = b.organization_id
   where b.id = new.battery_id;

  if v_org is null then
    raise exception 'Battery % not found', new.battery_id;
  end if;
  if v_status <> 'active' then
    raise exception 'This organization is not active' using errcode = '42501';
  end if;

  select string_agg(coalesce(i.name, x.id::text), ', ')
    into v_blocked
    from batteries b
   cross join lateral unnest(b.instrument_ids::uuid[]) as x(id)
    left join instruments i on i.id = x.id
   where b.id = new.battery_id
     and not org_can_use_instrument(v_org, x.id);

  if v_blocked is not null then
    raise exception 'This battery includes instruments your organization no longer has access to: %', v_blocked
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists enforce_survey_request_access on public.survey_requests;
create trigger enforce_survey_request_access
  before insert on public.survey_requests
  for each row execute function public.enforce_survey_request_access();

-- 5 ── New admin tables (service role only unless noted) ─────────────────────
create table if not exists public.admin_audit_log (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  actor_id          uuid,
  actor_email       text,
  actor_role        text,
  action            text not null,
  target_type       text,
  target_id         text,
  organization_id   uuid,          -- no FK: the log must outlive purged orgs
  organization_name text,
  details           jsonb not null default '{}',
  ip_address        text,
  user_agent        text
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_org_idx     on public.admin_audit_log (organization_id, created_at desc);
create index if not exists admin_audit_log_actor_idx   on public.admin_audit_log (actor_id, created_at desc);

-- Append-only, including for the service role.
create or replace function public.admin_audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin_audit_log is append-only';
end $$;

drop trigger if exists admin_audit_log_immutable on public.admin_audit_log;
create trigger admin_audit_log_immutable
  before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_immutable();

create table if not exists public.email_log (
  id                        uuid primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  organization_id           uuid references public.organizations (id) on delete cascade,
  provider_message_id       text unique,
  email_type                text not null,
  recipient                 text not null,
  subject                   text,
  status                    text not null default 'sent'
                            check (status in ('sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed')),
  status_detail             text,
  related_user_id           uuid,
  related_survey_request_id uuid
);

create index if not exists email_log_org_idx    on public.email_log (organization_id, created_at desc);
create index if not exists email_log_status_idx on public.email_log (status, created_at desc);

create table if not exists public.platform_notices (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  severity   text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  is_active  boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.battery_templates (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  instrument_ids uuid[] not null default '{}',
  is_default     boolean not null default true,
  created_by     uuid,
  created_at     timestamptz not null default now()
);

alter table public.organization_instruments enable row level security;
alter table public.admin_audit_log          enable row level security;
alter table public.email_log                enable row level security;
alter table public.platform_notices         enable row level security;
alter table public.battery_templates        enable row level security;

revoke all on table public.organization_instruments from anon, authenticated;
revoke all on table public.admin_audit_log          from anon, authenticated;
revoke all on table public.email_log                from anon, authenticated;
revoke all on table public.platform_notices         from anon, authenticated;
revoke all on table public.battery_templates        from anon, authenticated;

-- The battery builder and send-survey page need to know what their org can use.
grant select on public.organization_instruments to authenticated;
drop policy if exists organization_instruments_read on public.organization_instruments;
create policy organization_instruments_read on public.organization_instruments
  for select to authenticated using (
    organization_id = (select public.caller_org_id())
    or (select public.caller_role()) = 'app_admin'
  );

-- 6 ── Instrument read/write scoping ─────────────────────────────────────────
drop policy if exists instruments_org_scope_select on public.instruments;
create policy instruments_org_scope_select on public.instruments
  as restrictive for select to authenticated using (
    organization_id is null
    or organization_id = (select public.caller_org_id())
    or (select public.caller_role()) = 'app_admin'
  );

drop policy if exists instruments_org_scope_insert on public.instruments;
create policy instruments_org_scope_insert on public.instruments
  as restrictive for insert to authenticated with check (
    (select public.caller_role()) = 'app_admin'
    or organization_id = (select public.caller_org_id())
  );

drop policy if exists instruments_org_scope_update on public.instruments;
create policy instruments_org_scope_update on public.instruments
  as restrictive for update to authenticated
  using (
    (select public.caller_role()) = 'app_admin'
    or organization_id = (select public.caller_org_id())
  )
  with check (
    (select public.caller_role()) = 'app_admin'
    or organization_id = (select public.caller_org_id())
  );

-- Members can always read their own org row (MFA and session settings are
-- needed before an aal2 session exists). Org writes go through the admin API.
grant select on public.organizations to authenticated;
drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations
  for select to authenticated using (id = (select public.caller_org_id()));

drop policy if exists organizations_no_browser_insert on public.organizations;
create policy organizations_no_browser_insert on public.organizations
  as restrictive for insert to authenticated with check (false);
drop policy if exists organizations_no_browser_update on public.organizations;
create policy organizations_no_browser_update on public.organizations
  as restrictive for update to authenticated using (false);
drop policy if exists organizations_no_browser_delete on public.organizations;
create policy organizations_no_browser_delete on public.organizations
  as restrictive for delete to authenticated using (false);

-- 7 ── Require an active account on every RLS-protected table ───────────────
-- RESTRICTIVE policies are AND-ed with the existing permissive ones, so this
-- narrows access without touching the base-schema policies.
do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists require_active_account on public.%I', t.relname);
    if t.relname = 'user_profiles' then
      execute 'create policy require_active_account on public.user_profiles
                 as restrictive for all to authenticated
                 using (id = auth.uid() or (select public.caller_has_access()))
                 with check (id = auth.uid() or (select public.caller_has_access()))';
    elsif t.relname = 'organizations' then
      execute 'create policy require_active_account on public.organizations
                 as restrictive for select to authenticated
                 using (id = (select public.caller_org_id()) or (select public.caller_has_access()))';
    else
      execute format(
        'create policy require_active_account on public.%I
           as restrictive for all to authenticated
           using ((select public.caller_has_access()))
           with check ((select public.caller_has_access()))',
        t.relname);
    end if;
  end loop;
end $$;

-- 8 ── Service-role helper functions ─────────────────────────────────────────
create or replace function public.admin_org_stats()
returns table (
  organization_id       uuid,
  active_users          int,
  pending_invites       int,
  deactivated_users     int,
  patients              int,
  surveys_sent          int,
  surveys_sent_30d      int,
  surveys_completed     int,
  surveys_completed_30d int,
  last_survey_at        timestamptz,
  last_sign_in_at       timestamptz
)
language sql stable security definer
set search_path = public, auth
as $$
  select
    o.id,
    coalesce(u.active, 0),
    coalesce(u.pending, 0),
    coalesce(u.deactivated, 0),
    coalesce(pt.n, 0),
    coalesce(s.sent, 0),
    coalesce(s.sent_30d, 0),
    coalesce(s.completed, 0),
    coalesce(s.completed_30d, 0),
    s.last_at,
    u.last_sign_in
  from organizations o
  left join lateral (
    select count(*) filter (where p.is_active)::int                                     as active,
           count(*) filter (where not p.is_active and p.invite_accepted_at is null)::int as pending,
           count(*) filter (where not p.is_active and p.invite_accepted_at is not null)::int as deactivated,
           max(au.last_sign_in_at)                                                      as last_sign_in
      from user_profiles p
      left join auth.users au on au.id = p.id
     where p.organization_id = o.id
  ) u on true
  left join lateral (
    select count(*)::int as n from patients where patients.organization_id = o.id
  ) pt on true
  left join lateral (
    select count(*)::int                                                                         as sent,
           count(*) filter (where sr.created_at > now() - interval '30 days')::int               as sent_30d,
           count(*) filter (where sr.status = 'completed')::int                                  as completed,
           count(*) filter (where sr.status = 'completed'
                              and sr.completed_at > now() - interval '30 days')::int             as completed_30d,
           greatest(max(sr.created_at), max(sr.completed_at))                                    as last_at
      from survey_requests sr
      join patients p2 on p2.id = sr.patient_id
     where p2.organization_id = o.id
  ) s on true
$$;

create or replace function public.admin_list_users(p_org uuid default null)
returns table (
  id                 uuid,
  organization_id    uuid,
  role               text,
  full_name          text,
  email              text,
  is_active          boolean,
  created_at         timestamptz,
  invited_at         timestamptz,
  invite_accepted_at timestamptz,
  deactivated_at     timestamptz,
  last_sign_in_at    timestamptz,
  mfa_enrolled       boolean
)
language sql stable security definer
set search_path = public, auth
as $$
  select p.id, p.organization_id, p.role::text, p.full_name, au.email::text,
         p.is_active, p.created_at, p.invited_at, p.invite_accepted_at,
         p.deactivated_at, au.last_sign_in_at,
         exists (select 1 from auth.mfa_factors f
                  where f.user_id = p.id and f.status::text = 'verified')
    from user_profiles p
    left join auth.users au on au.id = p.id
   where p_org is null or p.organization_id = p_org
   order by p.created_at
$$;

-- Deleting auth sessions revokes their refresh tokens; the short-lived access
-- token that remains is rejected by caller_has_access() and serverAuth.
create or replace function public.admin_revoke_sessions(p_user_ids uuid[])
returns int
language plpgsql security definer
set search_path = public, auth
as $$
declare
  n int;
begin
  delete from auth.sessions where user_id = any (p_user_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- Permanently removes an organization and all of its data in one transaction.
-- Auth users are deleted afterwards by the API (auth.admin.deleteUser).
create or replace function public.admin_purge_organization(p_org uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_org      organizations%rowtype;
  v_users    uuid[];
  v_patients uuid[];
  v_requests uuid[];
  v_counts   jsonb := '{}';
  n          int;
begin
  select * into v_org from organizations where id = p_org for update;
  if not found then
    raise exception 'Organization not found';
  end if;
  if v_org.status <> 'pending_deletion' then
    raise exception 'Organization must be scheduled for deletion before it can be purged';
  end if;
  if v_org.deletion_scheduled_for > now() then
    raise exception 'The deletion grace period ends %', v_org.deletion_scheduled_for;
  end if;
  if exists (select 1 from user_profiles where organization_id = p_org and role::text = 'app_admin') then
    raise exception 'Move App Admin accounts out of this organization before purging it';
  end if;

  select coalesce(array_agg(id), '{}') into v_users    from user_profiles where organization_id = p_org;
  select coalesce(array_agg(id), '{}') into v_patients from patients      where organization_id = p_org;
  select coalesce(array_agg(sr.id), '{}') into v_requests
    from survey_requests sr
   where sr.patient_id = any (v_patients)
      or sr.battery_id in (select id from batteries where organization_id = p_org);

  if to_regclass('public.cat_item_responses') is not null then
    delete from cat_item_responses where domain_session_id in (
      select id from cat_domain_sessions where survey_request_id = any (v_requests));
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('cat_item_responses', n);
  end if;
  if to_regclass('public.cat_domain_sessions') is not null then
    delete from cat_domain_sessions where survey_request_id = any (v_requests);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('cat_domain_sessions', n);
  end if;

  delete from survey_responses where survey_request_id = any (v_requests) or patient_id = any (v_patients);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('survey_responses', n);

  delete from email_log where related_survey_request_id = any (v_requests) or organization_id = p_org;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('email_log', n);

  delete from survey_requests where id = any (v_requests);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('survey_requests', n);

  delete from report_audit_log where patient_id = any (v_patients) or generated_by = any (v_users);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('report_audit_log', n);

  delete from clinical_events where organization_id = p_org or patient_id = any (v_patients);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('clinical_events', n);

  delete from patients where id = any (v_patients);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('patients', n);

  delete from batteries where organization_id = p_org;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('batteries', n);

  delete from organization_instruments where organization_id = p_org;

  if to_regclass('public.survey_templates') is not null then
    if to_regclass('public.template_promis_items') is not null then
      delete from template_promis_items where template_id in (
        select id from survey_templates where organization_id = p_org);
    end if;
    if to_regclass('public.template_freeform_questions') is not null then
      delete from template_freeform_questions where template_id in (
        select id from survey_templates where organization_id = p_org);
    end if;
    delete from instruments where template_id in (
      select id from survey_templates where organization_id = p_org);
    delete from survey_templates where organization_id = p_org;
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('survey_templates', n);
  end if;

  delete from instruments where organization_id = p_org;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('custom_instruments', n);

  if to_regclass('public.export_audit_log') is not null then
    delete from export_audit_log where exported_by = any (v_users);
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('export_audit_log', n);
  end if;

  delete from user_profiles where id = any (v_users);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('user_profiles', n);

  delete from organizations where id = p_org;

  return jsonb_build_object('counts', v_counts, 'user_ids', to_jsonb(v_users));
end $$;

revoke execute on function public.admin_org_stats()                  from public, anon, authenticated;
revoke execute on function public.admin_list_users(uuid)             from public, anon, authenticated;
revoke execute on function public.admin_revoke_sessions(uuid[])      from public, anon, authenticated;
revoke execute on function public.admin_purge_organization(uuid)     from public, anon, authenticated;
grant  execute on function public.admin_org_stats()                  to service_role;
grant  execute on function public.admin_list_users(uuid)             to service_role;
grant  execute on function public.admin_revoke_sessions(uuid[])      to service_role;
grant  execute on function public.admin_purge_organization(uuid)     to service_role;
