# Database migrations

The SQL in `migrations/` is the version-controlled source of truth for schema
changes going forward. The database predates this directory, so the base
schema (tables created via the SQL editor) is not yet captured here.

## Applying a migration (SQL editor — current workflow)

1. Supabase Dashboard → your project → **SQL Editor**
2. Paste the contents of the migration file, in filename order
3. Run, and record which migrations you have applied

## Recommended: adopt the Supabase CLI

```bash
npm i -D supabase
npx supabase login
npx supabase link --project-ref xcwlshhxtldtpkxqbxzx

# One-time: capture the existing (pre-migration) schema as a baseline
npx supabase db pull

# From then on, apply new migrations with
npx supabase db push
```

`db pull` writes the live schema — including all current RLS policies — into
a migration file, which puts your HIPAA-critical policies under version
control and code review.

## Migration order

| File | What it does | Required by |
|---|---|---|
| `20260706000001_security_lockdown.sql` | Revokes all anon table access; adds `submit_survey()` and `delete_patient()` transactional functions | Server-side survey flow (app keeps working before it via fallbacks, but anon lockdown should be applied ASAP) |
| `20260706000002_item_bank.sql` | Item bank tables + clinical events + custom survey support | Item bank browser, ADL matrix, pre/post comparisons |
| `20260706000003_item_bank_seed.sql` | Seeds 321 questions from PROM_Survey_Database.xlsx with ICF/body-region metadata | Same as above |
| `20260706000004_new_instruments_seed.sql` | Registers ODI, NDI, DASH, QuickDASH, KOOS, HOOS, WOMAC, LEFS, FAAM, HAQ-DI, UW Pain Concerns in the instruments table | Administering the new instruments |
| `20260706000005_instruments_write_policy.sql` | RLS policy letting clinical-role users insert/update instruments | Custom survey builder, freeform batteries, admin instrument creation |
| `20260719000006_custom_surveys_no_score.sql` | Flips pre-existing custom surveys to scoring type "none" (no composite score) | Correct display of custom surveys created before 2026-07-19 |
