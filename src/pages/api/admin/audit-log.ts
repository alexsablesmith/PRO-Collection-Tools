import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'

const PAGE_SIZE = 50

/** GET ?org_id=&actor_id=&action=&from=&to=&page= — newest first. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticateRequest(req, ['app_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })

  const { org_id, actor_id, action, from, to } = req.query as Record<string, string | undefined>
  const page = Math.max(0, Number(req.query.page) || 0)

  let q = auth.admin.from('admin_audit_log').select('*', { count: 'exact' })
  if (org_id)   q = q.eq('organization_id', org_id)
  if (actor_id) q = q.eq('actor_id', actor_id)
  if (action)   q = q.like('action', `${action.replace(/[%_]/g, '')}%`)
  if (from)     q = q.gte('created_at', from)
  if (to)       q = q.lte('created_at', `${to}T23:59:59.999Z`)

  const { data, count, error } = await q
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ entries: data ?? [], total: count ?? 0, page_size: PAGE_SIZE })
}
