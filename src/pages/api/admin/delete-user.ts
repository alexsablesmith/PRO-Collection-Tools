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
    const { data: authUser } = await admin.auth.admin.getUserById(target.id)
    await revokeSessions(auth, [target.id])

    const { error: profileError } = await admin.from('user_profiles').delete().eq('id', target.id)
    if (profileError) {
      return res.status(409).json({
        error: `This user can't be deleted because records reference them (${profileError.message}). Deactivate them instead.`,
      })
    }

    const { error: authError } = await admin.auth.admin.deleteUser(target.id)

    await logAdminAction(auth, req, {
      action:          'user.deleted',
      target_type:     'user',
      target_id:       target.id,
      organization_id: target.organization_id,
      details: {
        email: authUser.user?.email ?? null,
        full_name: target.full_name,
        role: target.role,
        auth_delete_error: authError?.message ?? null,
      },
    })

    if (authError) {
      return res.status(500).json({ error: `Profile removed but auth deletion failed: ${authError.message}` })
    }

    return res.status(200).json({ message: 'User deleted' })
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Unexpected error' })
  }
}
