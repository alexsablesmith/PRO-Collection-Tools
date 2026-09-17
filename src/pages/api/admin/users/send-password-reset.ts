import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { logAdminAction, loadManageableUser } from '@/lib/adminServer'
import { sendPasswordReset } from '@/lib/passwordReset'

/** POST { user_id } — emails the user a password reset link. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticateRequest(req, ['app_admin', 'org_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })

  const loaded = await loadManageableUser(auth, (req.body as { user_id?: string }).user_id)
  if ('error' in loaded) return res.status(loaded.status).json({ error: loaded.error })
  const target = loaded.user

  if (!target.invite_accepted_at) {
    return res.status(400).json({ error: "This user hasn't finished setting up their account. Resend the invite instead." })
  }
  if (!target.is_active) {
    return res.status(400).json({ error: 'This user is deactivated. Reactivate them first.' })
  }

  const { data: authUser } = await auth.admin.auth.admin.getUserById(target.id)
  const email = authUser.user?.email
  if (!email) return res.status(404).json({ error: 'No email on file for this user' })

  const outcome = await sendPasswordReset(auth.admin, email, { enforceCooldown: false })
  if (!outcome.sent) {
    const message = outcome.reason === 'not_eligible'
      ? "This user's organization is deactivated."
      : `Couldn't send the reset email: ${outcome.detail ?? outcome.reason}`
    return res.status(400).json({ error: message })
  }

  await logAdminAction(auth, req, {
    action:          'user.password_reset_sent',
    target_type:     'user',
    target_id:       target.id,
    organization_id: target.organization_id,
    details:         { email, full_name: target.full_name },
  })

  return res.status(200).json({ message: `Password reset email sent to ${email}.` })
}
