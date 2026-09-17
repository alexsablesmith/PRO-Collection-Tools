import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { logAdminAction, loadManageableUser, revokeSessions } from '@/lib/adminServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticateRequest(req, ['app_admin', 'org_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })

  const loaded = await loadManageableUser(auth, (req.body as { user_id?: string }).user_id)
  if ('error' in loaded) return res.status(loaded.status).json({ error: loaded.error })
  const target = loaded.user
  const admin = auth.admin

  try {
    const { data: factorsData, error: listError } = await admin.auth.admin.mfa.listFactors({ userId: target.id })
    if (listError) return res.status(500).json({ error: listError.message })

    for (const factor of factorsData.factors) {
      const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: target.id })
      if (deleteError) return res.status(500).json({ error: deleteError.message })
    }

    // Existing aal2 sessions would otherwise stay valid without a factor.
    await revokeSessions(auth, [target.id])

    await logAdminAction(auth, req, {
      action:          'user.mfa_reset',
      target_type:     'user',
      target_id:       target.id,
      organization_id: target.organization_id,
      details:         { full_name: target.full_name, factors_removed: factorsData.factors.length },
    })

    return res.status(200).json({ message: 'MFA reset. The user will be prompted to re-enroll on next login.' })
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Unexpected error' })
  }
}
