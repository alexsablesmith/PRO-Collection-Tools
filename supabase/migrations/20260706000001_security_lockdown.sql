-- ─────────────────────────────────────────────────────────────────────────────
-- Security lockdown
--
-- 1. Revokes ALL anonymous (anon role) access to every table in public.
--    The patient survey flow no longer touches the database from the
--    browser — it goes through /api/survey/[token]/* routes that validate
--    the survey token server-side and use the service role.
--
-- 2. submit_survey(): atomic, idempotent survey submission. Either the
--    demographics update + all response rows + the request status flip
--    commit together, or none of them do.
--
-- 3. delete_patient(): transactional cascade delete, replacing the old
--    client-side multi-table delete that could fail halfway and orphan data.
--
-- Apply BEFORE deploying the app version that ships with this migration:
-- the survey page stops using anon table access in the same release.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 ── Revoke all anon table access ──────────────────────────────────────────
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on table public.%I from anon', t.tablename);
  end loop;
end $$;

-- 2 ── Atomic survey submission ──────────────────────────────────────────────
create or replace function public.submit_survey(
  p_request_id   uuid,
  p_demographics jsonb,
  p_responses    jsonb
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_req survey_requests%rowtype;
begin
  select * into v_req from survey_requests where id = p_request_id for update;
  if not found then
    raise exception 'survey request % not found', p_request_id;
  end if;

  -- Idempotent: a duplicate submit (double-tap, retry after network blip)
  -- is a no-op rather than a duplicate set of response rows.
  if v_req.status = 'completed' then
    return;
  end if;

  if p_demographics is not null then
    update patients set
      first_name         = coalesce(nullif(p_demographics->>'first_name', ''), first_name),
      last_name          = coalesce(nullif(p_demographics->>'last_name', ''), last_name),
      date_of_birth      = coalesce(nullif(p_demographics->>'date_of_birth', '')::date, date_of_birth),
      gender             = coalesce(nullif(p_demographics->>'gender', ''), gender),
      preferred_language = coalesce(nullif(p_demographics->>'preferred_language', ''), preferred_language)
    where id = v_req.patient_id;
  end if;

  insert into survey_responses
    (survey_request_id, patient_id, instrument_id, raw_responses, raw_score,
     t_score, standard_error, total_score, severity_label, subscale_scores, completed_at)
  select
    p_request_id,
    v_req.patient_id,
    (x->>'instrument_id')::uuid,
    x->'raw_responses',
    (x->>'raw_score')::numeric,
    (x->>'t_score')::numeric,
    (x->>'standard_error')::numeric,
    (x->>'total_score')::numeric,
    x->>'severity_label',
    case when x->'subscale_scores' = 'null'::jsonb then null else x->'subscale_scores' end,
    now()
  from jsonb_array_elements(p_responses) as x;

  update survey_requests
     set status            = 'completed',
         completed_at      = now(),
         partial_responses = null
   where id = p_request_id;
end $$;

revoke execute on function public.submit_survey(uuid, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.submit_survey(uuid, jsonb, jsonb) to service_role;

-- 3 ── Transactional patient cascade delete ──────────────────────────────────
create or replace function public.delete_patient(p_patient_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  delete from cat_item_responses where domain_session_id in (
    select ds.id
      from cat_domain_sessions ds
      join survey_requests sr on sr.id = ds.survey_request_id
     where sr.patient_id = p_patient_id
  );
  delete from cat_domain_sessions where survey_request_id in (
    select id from survey_requests where patient_id = p_patient_id
  );
  delete from survey_responses where patient_id = p_patient_id;
  delete from survey_requests  where patient_id = p_patient_id;
  delete from report_audit_log where patient_id = p_patient_id;
  delete from patients         where id = p_patient_id;
end $$;

revoke execute on function public.delete_patient(uuid) from public, anon, authenticated;
grant  execute on function public.delete_patient(uuid) to service_role;
