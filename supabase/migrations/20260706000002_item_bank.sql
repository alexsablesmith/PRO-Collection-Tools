-- ─────────────────────────────────────────────────────────────────────────────
-- Item bank + clinical events
--
-- items: master question bank. One row per question, tagged with ICF
--   domain(s), mental-health b-code, and body region(s) from the PROM
--   database spreadsheet. item_key matches the key used in
--   survey_responses.raw_responses so item-level answers join back to
--   their metadata (the basis for the med-legal ADL matrix).
--
-- clinical_events: patient timeline anchors (surgery, injury, treatment
--   start/end) used for pre/post score comparisons.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.items (
  id                    uuid primary key default gen_random_uuid(),
  instrument_code       text not null,   -- matches instruments.scoring_config_key
  item_key              text not null,   -- matches raw_responses key, e.g. 'odi_1'
  position              int  not null,
  text_en               text not null,
  text_es               text,
  options               jsonb not null default '[]',  -- [{value, label}]
  higher_is_worse       boolean not null default true, -- item-level orientation (not the instrument score's)
  icf_primary_code      text,            -- e.g. 'd440'
  icf_primary_label     text,
  icf_secondary_code    text,
  icf_secondary_label   text,
  mh_code               text,            -- e.g. 'b152'
  mh_label              text,
  body_region_primary   text,
  body_region_secondary text,
  response_format       text,
  coding_notes          text,
  unique (instrument_code, item_key)
);

create index if not exists items_instrument_idx  on public.items (instrument_code, position);
create index if not exists items_icf_idx         on public.items (icf_primary_code);
create index if not exists items_body_region_idx on public.items (body_region_primary);

create table if not exists public.clinical_events (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  event_type      text not null check (event_type in ('surgery','injury','treatment_start','treatment_end','other')),
  label           text not null,
  event_date      date not null,
  notes           text,
  created_by      uuid references public.user_profiles (id),
  created_at      timestamptz not null default now()
);

create index if not exists clinical_events_patient_idx on public.clinical_events (patient_id, event_date);

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.items           enable row level security;
alter table public.clinical_events enable row level security;

-- The patient survey flow never reads these from the browser; no anon access.
revoke all on table public.items           from anon;
revoke all on table public.clinical_events from anon;

-- Item bank is global reference data (no PHI): readable by any signed-in user,
-- writable only via service role (seeds/migrations).
drop policy if exists items_read on public.items;
create policy items_read on public.items
  for select to authenticated using (true);

-- Clinical events are PHI: org members only.
drop policy if exists clinical_events_org_select on public.clinical_events;
create policy clinical_events_org_select on public.clinical_events
  for select to authenticated using (
    organization_id = (select organization_id from public.user_profiles where id = auth.uid())
  );

drop policy if exists clinical_events_org_write on public.clinical_events;
create policy clinical_events_org_write on public.clinical_events
  for insert to authenticated with check (
    organization_id = (select organization_id from public.user_profiles where id = auth.uid())
    and (select role from public.user_profiles where id = auth.uid()) in ('app_admin','org_admin','clinical_user')
  );

drop policy if exists clinical_events_org_delete on public.clinical_events;
create policy clinical_events_org_delete on public.clinical_events
  for delete to authenticated using (
    organization_id = (select organization_id from public.user_profiles where id = auth.uid())
    and (select role from public.user_profiles where id = auth.uid()) in ('app_admin','org_admin','clinical_user')
  );
