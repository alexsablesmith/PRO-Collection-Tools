import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import type { Role } from '@/types/database'

const ROLE_LABELS: Record<string, string> = {
  org_admin:     'Org Admin',
  clinical_user: 'Clinical User',
  read_only:     'Read Only',
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticateRequest(req, ['app_admin', 'org_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })

  const { email, role, organization_id, org_name } = req.body as {
    email: string
    role: string
    organization_id: string
    org_name?: string
  }

  if (!email || !role || !organization_id) {
    return res.status(400).json({ error: 'email, role, and organization_id are required' })
  }

  // org_admins can only invite into their own organization
  if (auth.profile.role === 'org_admin' && organization_id !== auth.profile.organization_id) {
    return res.status(403).json({ error: 'You can only invite users to your own organization' })
  }

  const allowedRoles = ['org_admin', 'clinical_user', 'read_only']
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  const resendKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL

  if (!siteUrl) return res.status(500).json({ error: 'NEXT_PUBLIC_SITE_URL is not configured' })
  if (!resendKey) return res.status(500).json({ error: 'RESEND_API_KEY is not configured' })
  if (!fromEmail) return res.status(500).json({ error: 'RESEND_FROM_EMAIL is not configured' })

  try {
    const admin = auth.admin
    const redirectTo = `${siteUrl}/account/setup`

    // Try invite first; if user already exists, fall back to recovery (password reset)
    let linkData: any
    let linkError: any

    const invite = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo, data: { organization_id, role } },
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

    // Upsert profile row (creates if new, updates role/org if existing)
    await admin.from('user_profiles').upsert({
      id: linkData.user.id,
      organization_id,
      role: role as Role,
      full_name: null,
      is_active: false,
    }, { onConflict: 'id' })

    // Send branded email via Resend
    const orgDisplay = org_name ?? 'your organization'
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

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: `You've been invited to Prolix Health`,
        html,
      }),
    })

    if (!emailRes.ok) {
      const emailErr = await emailRes.json()
      return res.status(500).json({ error: `Invite link created but email failed: ${emailErr.message ?? 'unknown error'}` })
    }

    return res.status(200).json({ message: 'Invite sent' })
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Unexpected error' })
  }
}
