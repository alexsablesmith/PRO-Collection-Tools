-- ─────────────────────────────────────────────────────────────────────────────
-- Remove the auth.users → user_profiles triggers
--
-- Two triggers created a profile whenever an auth user was created:
--
--   on_auth_user_created          → handle_new_user()
--   on_auth_user_created_profile  → handle_new_user_profile()
--
-- The second copied organization_id and role straight from
-- raw_user_meta_data and forced is_active = true, overwriting any existing
-- profile. With public sign-up enabled, anyone could sign up with
-- {"role": "app_admin"} in their metadata and receive an active App Admin
-- profile. It also made every new invitee look "already active", which broke
-- the invite flow.
--
-- Profiles are created only by /api/admin/invite-user (service role), which
-- sets the org and role chosen by the inviting admin and starts the profile
-- inactive until the invite is accepted. Nothing else depends on the triggers.
--
-- Public sign-up should also stay disabled (Authentication → Sign In /
-- Providers → "Allow new users to sign up" off); invites use the admin API.
-- ─────────────────────────────────────────────────────────────────────────────

drop trigger if exists on_auth_user_created_profile on auth.users;
drop trigger if exists on_auth_user_created         on auth.users;

drop function if exists public.handle_new_user_profile();
drop function if exists public.handle_new_user();
