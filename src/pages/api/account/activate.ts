import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase'

/**
 * POST { full_name } — completes invite acceptance after the new user sets a
 * password. Only a never-accepted invite can activate itself; a deactivated
 * user can't re-enable their account by revisiting the setup page.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' })

  const admin = getSupabaseAdmin()
  const { data: { user }, error } = await admin.auth.getUser(authHeader.slice(7))
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired session' })

  const fullName = String((req.body as { full_name?: string }).full_name ?? '').trim()
  if (!fullName) return res.status(400).json({ error: 'Full name is required' })

  const { data: profile } = await admin.from('user_profiles').select('*').eq('id', user.id).maybeSingle()
  if (!profile) return res.status(404).json({ error: 'No invitation found for this account' })

  if (profile.invite_accepted_at) {
    // Password reset for an existing user: update the name only.
    await admin.from('user_profiles').update({ full_name: fullName }).eq('id', user.id)
    if (!profile.is_active) return res.status(403).json({ error: 'Your account has been deactivated. Contact your administrator.' })
    return res.status(200).json({ message: 'Account updated' })
  }

  const { data: org } = await admin.from('organizations').select('status').eq('id', profile.organization_id).maybeSingle()
  if (org?.status !== 'active') {
    return res.status(403).json({ error: 'Your organization is not active. Contact your administrator.' })
  }

  const { error: updateError } = await admin.from('user_profiles').update({
    full_name: fullName,
    is_active: true,
    invite_accepted_at: new Date().toISOString(),
  }).eq('id', user.id)
  if (updateError) return res.status(500).json({ error: updateError.message })

  return res.status(200).json({ message: 'Account activated' })
}
