import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticateRequest(req, ['app_admin', 'org_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })

  const { user_id } = req.body as { user_id: string }
  if (!user_id) return res.status(400).json({ error: 'user_id is required' })

  const admin = auth.admin
  const { data: target } = await admin
    .from('user_profiles')
    .select('*')
    .eq('id', user_id)
    .maybeSingle()

  if (!target) return res.status(404).json({ error: 'User not found' })

  // org_admins can only reset MFA for users within their own organization, and never an app_admin
  if (auth.profile.role === 'org_admin') {
    if (target.organization_id !== auth.profile.organization_id) {
      return res.status(403).json({ error: 'You can only reset MFA for users in your own organization' })
    }
    if (target.role === 'app_admin') {
      return res.status(403).json({ error: 'You cannot reset MFA for an App Admin' })
    }
  }

  try {
    const { data: factorsData, error: listError } = await admin.auth.admin.mfa.listFactors({ userId: user_id })
    if (listError) return res.status(500).json({ error: listError.message })

    for (const factor of factorsData.factors) {
      const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user_id })
      if (deleteError) return res.status(500).json({ error: deleteError.message })
    }

    return res.status(200).json({ message: 'MFA reset. The user will be prompted to re-enroll on next login.' })
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Unexpected error' })
  }
}
