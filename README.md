# MDE Clinical Survey Platform

Multidisciplinary Pain Evaluation — Clinical Survey Web Application

## Tech Stack
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Row Level Security)
- **Hosting**: Vercel (recommended)
- **PDF Generation**: jsPDF (in-browser, no PHI sent to servers)

## Setup

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/mde-app.git
cd mde-app
npm install
```

### 2. Set up environment variables
```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in your Supabase credentials.

### 3. Set up the database
Run the migration SQL in your Supabase project:
- Go to supabase.com → your project → SQL Editor
- Paste and run the contents of `supabase_migration.sql`

### 4. Create your first admin user
1. Go to Supabase → Authentication → Users → Add User
2. Create a user with your email and password
3. Go to SQL Editor and run:
```sql
-- Replace the values below with your actual user ID and organization details
-- First create an organization
INSERT INTO public.organizations (name) VALUES ('Your Clinic Name');

-- Then create the user profile (replace USER_ID and ORG_ID)
INSERT INTO public.user_profiles (id, organization_id, role, full_name)
VALUES (
  'YOUR_SUPABASE_USER_ID',
  (SELECT id FROM public.organizations LIMIT 1),
  'admin',
  'Your Name'
);
```

### 5. Create your first battery
Log in as admin → Batteries → New Battery → Select instruments → Create

### 6. Run locally
```bash
npm run dev
```
Open http://localhost:3000

## Deploying to Vercel

1. Push your code to GitHub
2. Go to vercel.com → New Project → Import from GitHub
3. Add environment variables in Vercel project settings
4. Deploy

## HIPAA Note
Before using with real patient data:
- Upgrade Supabase to Pro and sign the BAA
- Upgrade Vercel to Pro and request the BAA
- See the Technical Specification document for full compliance checklist

## Scoring Configuration
All instrument scoring rules are in `src/config/scoring.ts`.
This file is the auditable source of truth for all clinical scoring logic.
Every change is tracked in Git history.

## Adding New Instruments
1. Add question definitions to `src/pages/survey/[token].tsx`
2. Add scoring function to `src/config/scoring.ts`
3. Add metadata to `INSTRUMENT_META` in `src/config/scoring.ts`
4. Register the instrument in Supabase instruments table
5. Add to a battery via the admin panel
