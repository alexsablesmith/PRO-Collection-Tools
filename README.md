# Prolix Health

Patient-reported outcome (PRO) collection and analysis platform for clinicians
and medical-legal evaluators.

## Tech Stack
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Row Level Security)
- **Hosting**: Vercel
- **PDF Generation**: jsPDF (in-browser, no PHI sent to third-party servers)

## Architecture notes

- **Patient survey flow is server-mediated.** The survey page never talks to
  the database directly; it calls `/api/survey/[token]/*` routes that validate
  the survey token server-side (load, save progress, atomic submit). The anon
  database role has no table access.
- **Item bank** (`items` table): every question in the platform, tagged with
  ICF domain(s), mental-health b-codes, and body region(s). Item-level survey
  answers join back to this metadata by `item_key` — this powers the
  medical-legal ADL impact matrix and the custom survey builder.
  Source of truth: `data/PROM_Survey_Database.xlsx` →
  `scripts/generate_item_bank.py` → seed migrations.
- **Scoring rules** live in `src/config/scoring.ts` — the auditable source of
  truth for all clinical scoring logic; every change is a Git commit.
- **All clinician-facing output is English**, even when the survey was
  administered in Spanish (bilingual question definitions share item ids).
- **Reports** are generated in the browser; report generation is audit-logged.

## Setup

### 1. Clone and install
```bash
git clone https://github.com/alexsablesmith/PRO-Collection-Tools.git
cd PRO-Collection-Tools
npm install
```

### 2. Environment variables
```bash
cp .env.example .env.local
```
Fill in Supabase credentials. `SUPABASE_SERVICE_ROLE_KEY` is required — the
survey token flow and admin API routes run server-side with the service role.

### 3. Database
Apply the SQL in `supabase/migrations/` in filename order (see
`supabase/README.md` for details and for adopting the Supabase CLI).

### 4. First admin user
1. Supabase → Authentication → Users → Add User
2. SQL Editor:
```sql
INSERT INTO public.organizations (name) VALUES ('Your Clinic Name');
INSERT INTO public.user_profiles (id, organization_id, role, full_name, is_active)
VALUES ('YOUR_SUPABASE_USER_ID', (SELECT id FROM public.organizations LIMIT 1), 'app_admin', 'Your Name', true);
```

### 5. Run locally
```bash
npm run dev
```

## Adding new instruments

Fixed-form instruments are data, not code, except for scoring:
1. Add the questions to `data/PROM_Survey_Database.xlsx` (with ICF domain and
   body region tags) and re-run `python3 scripts/generate_item_bank.py`
2. Add a scoring function + `INSTRUMENT_META` entry in `src/config/scoring.ts`
3. Apply the regenerated seed migrations
4. Add the instrument to a battery via the admin panel

Custom one-off surveys can be assembled in-app from the Item Bank page
without any code changes.

## Instrument licensing

Some bundled instruments require licenses for commercial use — notably
DASH/QuickDASH (Institute for Work & Health), WOMAC, NDI, and HAQ-DI.
Confirm licensing before offering them to customer organizations.
ODI, KOOS, HOOS, LEFS, FAAM, PHQ-9, GAD-7, PCS, TSK-11, and PROMIS
instruments are generally free to use (PROMIS per HealthMeasures terms).

## HIPAA

- BAAs signed with Supabase and Vercel.
- RLS enforces organization isolation; anon role has no table access.
- Keep `supabase/migrations/` as the reviewed source of truth for policies
  (run `npx supabase db pull` once to capture the pre-existing baseline).
