import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { countSeats } from '@/lib/adminServer'

/** GET ?org_id= — users (with email, last sign-in, MFA status) plus seat usage. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticateRequest(req, ['app_admin', 'org_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })

  const orgId = (req.query.org_id as string | undefined) || auth.profile.organization_id
  if (auth.profile.role === 'org_admin' && orgId !== auth.profile.organization_id) {
    return res.status(403).json({ error: 'You can only view users in your own organization' })
  }

  const [{ data: users, error }, { data: org }, seatsUsed] = await Promise.all([
    auth.admin.rpc('admin_list_users', { p_org: orgId }),
    auth.admin.from('organizations').select('*').eq('id', orgId).maybeSingle(),
    countSeats(auth, orgId),
  ])
  if (error) return res.status(500).json({ error: error.message })
  if (!org) return res.status(404).json({ error: 'Organization not found' })

  return res.status(200).json({ users: users ?? [], organization: org, seats_used: seatsUsed })
}
