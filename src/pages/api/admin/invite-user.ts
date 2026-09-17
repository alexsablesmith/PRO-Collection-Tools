import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { logAdminAction, countSeats } from '@/lib/adminServer'
import { sendEmail, escapeHtml } from '@/lib/email'
import type { Role } from '@/types/database'

const ROLE_LABELS: Record<string, string> = {
  org_admin:     'Org Admin',
  clinical_user: 'Clinical User',
  read_only:     'Read Only',
}

/**
 * POST { email, role, organization_id }  — invite a new user
 * POST { resend_user_id }                 — resend a pending invite
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticateRequest(req, ['app_admin', 'org_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })
  const admin = auth.admin

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) return res.status(500).json({ error: 'NEXT_PUBLIC_SITE_URL is not configured' })

  const body = req.body as { email?: string; role?: string; organization_id?: string; resend_user_id?: string }
  const isResend = !!body.resend_user_id

  let email: string
  let role: string
  let organizationId: string

  if (isResend) {
    const { data: pending } = await admin
      .from('user_profiles').select('*').eq('id', body.resend_user_id!).maybeSingle()
    if (!pending) return res.status(404).json({ error: 'User not found' })
    if (pending.invite_accepted_at) return res.status(400).json({ error: 'This user has already accepted their invite' })
    const { data: authUser } = await admin.auth.admin.getUserById(pending.id)
    if (!authUser.user?.email) return res.status(404).json({ error: 'No email on file for this user' })
    email = authUser.user.email
    role = pending.role
    organizationId = pending.organization_id
  } else {
    if (!body.email || !body.role || !body.organization_id) {
      return res.status(400).json({ error: 'email, role, and organization_id are required' })
    }
    email = body.email.trim().toLowerCase()
    role = body.role
    organizationId = body.organization_id
    if (!['org_admin', 'clinical_user', 'read_only'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' })
    }
  }

  // org_admins can only invite into their own organization
  if (auth.profile.role === 'org_admin' && organizationId !== auth.profile.organization_id) {
    return res.status(403).json({ error: 'You can only invite users to your own organization' })
  }

  const { data: org } = await admin.from('organizations').select('*').eq('id', organizationId).maybeSingle()
  if (!org) return res.status(404).json({ error: 'Organization not found' })
  if (org.status !== 'active') {
    return res.status(400).json({ error: 'Users cannot be invited to a deactivated organization' })
  }

  if (!isResend) {
    const domain = email.split('@')[1] ?? ''
    if (org.allowed_email_domains.length > 0 && !org.allowed_email_domains.includes(domain)) {
      return res.status(400).json({
        error: `${org.name} only allows invites to: ${org.allowed_email_domains.map(d => '@' + d).join(', ')}`,
      })
    }
    if (org.seat_limit !== null && (await countSeats(auth, org.id)) >= org.seat_limit) {
      return res.status(400).json({
        error: `${org.name} has used all ${org.seat_limit} seats (active users plus pending invites). Raise the seat limit or deactivate a user first.`,
      })
    }
  }

  try {
    const redirectTo = `${siteUrl}/account/setup`

    // Try invite first; if user already exists, fall back to recovery (password reset)
    let linkData: any
    let linkError: any

    const invite = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo, data: { organization_id: organizationId, role } },
    })
    linkData = invite.data
    linkError = invite.error

    if (linkError?.message?.toLowerCase().includes('already registered') || linkError?.message?.toLowerCase().includes('already been registered')) {
      const recovery = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      })
      linkData = recovery.data
      linkError = recovery.error
    }

    if (linkError || !linkData?.properties?.action_link) {
      return res.status(400).json({ error: linkError?.message ?? 'Failed to generate invite link' })
    }

    const { data: existingProfile } = await admin
      .from('user_profiles')
      .select('*')
      .eq('id', linkData.user.id)
      .maybeSingle()

    if (!isResend) {
      // If this email already belongs to a user who has set up their account,
      // refuse rather than silently reassigning their org/role.
      if (existingProfile?.is_active || existingProfile?.invite_accepted_at) {
        let orgName = existingProfile.organization_id
        const { data: existingOrg } = await admin
          .from('organizations')
          .select('name')
          .eq('id', existingProfile.organization_id)
          .maybeSingle()
        if (existingOrg?.name) orgName = existingOrg.name

        return res.status(409).json({
          error: `This email already belongs to ${existingProfile.is_active ? 'an active' : 'a deactivated'} user in "${orgName}". Change their role, status, or organization from the Users page instead of inviting them again.`,
        })
      }

      // Upsert profile row: creates it if new, or updates role/org if a
      // pending (never-activated) profile already exists. Preserve any
      // full_name already on file rather than clobbering it.
      await admin.from('user_profiles').upsert({
        id: linkData.user.id,
        organization_id: organizationId,
        role: role as Role,
        full_name: existingProfile?.full_name ?? null,
        is_active: false,
        invited_at: new Date().toISOString(),
        invited_by: auth.profile.id,
        invite_accepted_at: null,
        deactivated_at: null,
      }, { onConflict: 'id' })
    } else {
      await admin.from('user_profiles')
        .update({ invited_at: new Date().toISOString(), invited_by: auth.profile.id })
        .eq('id', linkData.user.id)
    }

    const orgDisplay = escapeHtml(org.display_name || org.name)
    const roleLabel = ROLE_LABELS[role] ?? role
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#1F4E79;margin-bottom:8px">You've been invited to Prolix Health</h2>
        <p style="color:#555;margin-bottom:4px">You have been added to <strong>${orgDisplay}</strong> as a <strong>${roleLabel}</strong>.</p>
        <p style="color:#555;margin-bottom:32px">Click the button below to set up your account. This link is valid for 24 hours.</p>
        <a href="${linkData.properties.action_link}"
           style="background:#1F4E79;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;display:inline-block;font-weight:600">
          Set Up My Account
        </a>
        <p style="color:#999;font-size:12px;margin-top:32px">
          If you weren't expecting this invitation, you can ignore this email.<br/>
          This link will expire in 24 hours.
        </p>
      </div>
    `

    const emailError = await sendEmail(admin, {
      to:              email,
      subject:         `You've been invited to Prolix Health`,
      html,
      email_type:      'invite',
      organization_id: organizationId,
      related_user_id: linkData.user.id,
    })

    await logAdminAction(auth, req, {
      action:          isResend ? 'user.invite_resent' : 'user.invited',
      target_type:     'user',
      target_id:       linkData.user.id,
      organization_id: organizationId,
      organization_name: org.name,
      details:         { email, role, email_error: emailError },
    })

    if (emailError) {
      return res.status(500).json({ error: `Invite link created but email failed: ${emailError}` })
    }

    return res.status(200).json({ message: isResend ? 'Invite resent' : 'Invite sent' })
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Unexpected error' })
  }
}
