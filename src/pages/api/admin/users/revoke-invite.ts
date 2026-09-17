import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { logAdminAction, loadManageableUser } from '@/lib/adminServer'

/** POST { user_id } — cancels a pending invite and removes the unused account. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticateRequest(req, ['app_admin', 'org_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })

  const loaded = await loadManageableUser(auth, (req.body as { user_id?: string }).user_id)
  if ('error' in loaded) return res.status(loaded.status).json({ error: loaded.error })
  const target = loaded.user

  if (target.invite_accepted_at || target.is_active) {
    return res.status(400).json({ error: 'This user has already set up their account. Deactivate or delete them instead.' })
  }

  const { data: authUser } = await auth.admin.auth.admin.getUserById(target.id)

  const { error } = await auth.admin.from('user_profiles').delete().eq('id', target.id)
  if (error) return res.status(500).json({ error: error.message })

  const { error: authError } = await auth.admin.auth.admin.deleteUser(target.id)

  await logAdminAction(auth, req, {
    action:          'user.invite_revoked',
    target_type:     'user',
    target_id:       target.id,
    organization_id: target.organization_id,
    details:         { email: authUser.user?.email ?? null, role: target.role, auth_delete_error: authError?.message ?? null },
  })

  if (authError) return res.status(500).json({ error: `Invite revoked but auth cleanup failed: ${authError.message}` })
  return res.status(200).json({ message: 'Invite revoked' })
}
