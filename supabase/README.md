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
| `20260907000008_adl_battery_seed.sql` | Seeds the ADL Functional Assessment battery instruments | ADL battery |
| `20260916000009_admin_dashboard.sql` | Org lifecycle/settings/plan columns, user invite lifecycle, per-org instrument access + licensing, admin audit log, email log, notices, default batteries, and database-level enforcement of deactivation and per-org MFA | App Admin dashboard (`/admin`) |

## After applying `20260916000009_admin_dashboard.sql`

1. **Deploy the app release that ships with it at the same time.** The migration blocks
   browsers from changing `user_profiles.is_active`/`role`/`organization_id`
   directly, and the new account-setup and Users pages go through `/api/*` instead.
2. **Check every PHI table has RLS enabled.** Deactivation is enforced by a
   restrictive `require_active_account` policy added to every table with RLS on;
   a table with RLS off would not get it:
   ```sql
   select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
   ```
   Any table created later needs RLS and that policy too (copy the loop at the end
   of section 7 in the migration).
3. **Review custom instrument owners** under Admin → Instruments & Defaults. The
   migration assigns custom surveys to the one organization whose batteries use
   them; anything ambiguous stays global until you assign it.
4. **Flag license-required instruments** on the same page. Nothing is flagged by
   default; check each copyright holder's terms for commercial software use.
5. **Connect email delivery tracking:** in Resend → Webhooks, add
   `https://<your site>/api/webhooks/resend` with the delivered,
   delivery_delayed, bounced, and complained events, and set
   `RESEND_WEBHOOK_SECRET` in Vercel.

