import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, role, organization_id } = req.body as {
    email: string
    role: string
    organization_id: string
  }

  if (!email || !role || !organization_id) {
    return res.status(400).json({ error: 'email, role, and organization_id are required' })
  }

  const allowedRoles = ['org_admin', 'clinical_user', 'read_only']
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' })
  }

  try {
    const admin = getSupabaseAdmin()

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { organization_id, role },
    })

    if (error) return res.status(400).json({ error: error.message })

    // Create a placeholder profile row — will be active once the user accepts the invite
    await admin.from('user_profiles').insert({
      id: data.user.id,
      organization_id,
      role,
      full_name: null,
      is_active: false,
    })

    return res.status(200).json({ message: 'Invite sent' })
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Unexpected error' })
  }
}
