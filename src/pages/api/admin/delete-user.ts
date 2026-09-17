import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticateRequest(req, ['app_admin', 'org_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })

  const { user_id } = req.body as { user_id: string }
  if (!user_id) return res.status(400).json({ error: 'user_id is required' })

  if (user_id === auth.profile.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' })
  }

  const admin = auth.admin
  const { data: target } = await admin
    .from('user_profiles')
    .select('*')
    .eq('id', user_id)
    .maybeSingle()

  if (!target) return res.status(404).json({ error: 'User not found' })

  // org_admins can only delete users within their own organization, and never an app_admin
  if (auth.profile.role === 'org_admin') {
    if (target.organization_id !== auth.profile.organization_id) {
      return res.status(403).json({ error: 'You can only delete users in your own organization' })
    }
    if (target.role === 'app_admin') {
      return res.status(403).json({ error: 'You cannot delete an App Admin' })
    }
  }

  try {
    await admin.from('user_profiles').delete().eq('id', user_id)

    const { error: authError } = await admin.auth.admin.deleteUser(user_id)
    if (authError) {
      return res.status(500).json({ error: `Profile removed but auth deletion failed: ${authError.message}` })
    }

    return res.status(200).json({ message: 'User deleted' })
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Unexpected error' })
  }
}
