import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { logAdminAction, loadManageableUser, revokeSessions } from '@/lib/adminServer'

/** POST { user_id } — signs the user out of every device. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticateRequest(req, ['app_admin', 'org_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })

  const loaded = await loadManageableUser(auth, (req.body as { user_id?: string }).user_id)
  if ('error' in loaded) return res.status(loaded.status).json({ error: loaded.error })

  const revokeError = await revokeSessions(auth, [loaded.user.id])
  if (revokeError) return res.status(500).json({ error: revokeError })

  await logAdminAction(auth, req, {
    action:          'user.sessions_revoked',
    target_type:     'user',
    target_id:       loaded.user.id,
    organization_id: loaded.user.organization_id,
    details:         { full_name: loaded.user.full_name },
  })

  return res.status(200).json({ message: 'User signed out of all sessions' })
}
