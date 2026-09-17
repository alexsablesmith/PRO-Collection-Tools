import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import type { EmailStatus } from '@/types/database'

const PAGE_SIZE = 50

/** GET ?org_id=&status=&problems=1&page= — newest first. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticateRequest(req, ['app_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })

  const { org_id, status, problems } = req.query as Record<string, string | undefined>
  const page = Math.max(0, Number(req.query.page) || 0)

  let q = auth.admin.from('email_log').select('*', { count: 'exact' })
  if (org_id)   q = q.eq('organization_id', org_id)
  if (status)   q = q.eq('status', status as EmailStatus)
  if (problems) q = q.in('status', ['bounced', 'complained', 'failed', 'delivery_delayed'])

  const [{ data, count, error }, { data: orgs }] = await Promise.all([
    q.order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
    auth.admin.from('organizations').select('id, name').order('name'),
  ])
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({
    emails: data ?? [], total: count ?? 0, page_size: PAGE_SIZE,
    webhook_configured: !!process.env.RESEND_WEBHOOK_SECRET,
    organizations: orgs ?? [],
  })
}
