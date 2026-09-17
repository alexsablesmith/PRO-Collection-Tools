import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { sendEmail, escapeHtml } from '@/lib/email'

const COOLDOWN_MS = 2 * 60_000

export type ResetOutcome =
  | { sent: true; userId: string; organizationId: string }
  | { sent: false; reason: 'no_account' | 'not_eligible' | 'cooldown' | 'error'; detail?: string }

/**
 * Emails a password reset link to an existing, active account. Pending
 * invitees, deactivated users, and users in deactivated orgs get nothing:
 * they need an invite or reactivation instead. Callers facing the public
 * must not reveal the outcome, so the endpoint can't be used to probe
 * which emails have accounts.
 */
export async function sendPasswordReset(
  admin: SupabaseClient<Database>,
  rawEmail: string,
  { enforceCooldown }: { enforceCooldown: boolean }
): Promise<ResetOutcome> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) return { sent: false, reason: 'error', detail: 'NEXT_PUBLIC_SITE_URL is not configured' }

  const email = rawEmail.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { sent: false, reason: 'no_account' }

  if (enforceCooldown) {
    const { count } = await admin
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .eq('recipient', email)
      .eq('email_type', 'password_reset')
      .gte('created_at', new Date(Date.now() - COOLDOWN_MS).toISOString())
    if ((count ?? 0) > 0) return { sent: false, reason: 'cooldown' }
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${siteUrl}/account/reset-password` },
  })
  if (linkError || !link?.properties?.action_link || !link.user) {
    return { sent: false, reason: 'no_account', detail: linkError?.message }
  }

  const { data: profile } = await admin.from('user_profiles').select('*').eq('id', link.user.id).maybeSingle()
  if (!profile || !profile.is_active || !profile.invite_accepted_at) return { sent: false, reason: 'not_eligible' }

  const { data: org } = await admin.from('organizations').select('*').eq('id', profile.organization_id).maybeSingle()
  if (!org || (org.status !== 'active' && profile.role !== 'app_admin')) return { sent: false, reason: 'not_eligible' }

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1F4E79;margin-bottom:8px">Reset your Prolix Health password</h2>
      <p style="color:#555;margin-bottom:4px">We received a request to reset the password for your <strong>${escapeHtml(org.display_name || org.name)}</strong> account.</p>
      <p style="color:#555;margin-bottom:32px">This link is valid for 1 hour and can be used once.</p>
      <a href="${link.properties.action_link}"
         style="background:#1F4E79;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;display:inline-block;font-weight:600">
        Choose a New Password
      </a>
      <p style="color:#999;font-size:12px;margin-top:32px">
        If you didn't request this, you can ignore this email; your password won't change.
      </p>
    </div>
  `

  const emailError = await sendEmail(admin, {
    to:              email,
    subject:         'Reset your Prolix Health password',
    html,
    email_type:      'password_reset',
    organization_id: profile.organization_id,
    related_user_id: profile.id,
  })
  if (emailError) return { sent: false, reason: 'error', detail: emailError }

  return { sent: true, userId: profile.id, organizationId: profile.organization_id }
}
