import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { logAdminAction } from '@/lib/adminServer'
import type { NoticeSeverity, PlatformNotice } from '@/types/database'

const SEVERITIES: NoticeSeverity[] = ['info', 'warning', 'critical']

/** GET | POST { message, severity, starts_at?, ends_at? } | PATCH { id, ...fields } | DELETE ?id= */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authenticateRequest(req, ['app_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })
  const admin = auth.admin

  if (req.method === 'GET') {
    const { data, error } = await admin.from('platform_notices').select('*').order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ notices: data ?? [] })
  }

  const body = (req.body ?? {}) as Partial<PlatformNotice>
  const patch: Partial<PlatformNotice> = {}
  if (body.message !== undefined) {
    if (!body.message.trim()) return res.status(400).json({ error: 'Message is required' })
    if (body.message.length > 500) return res.status(400).json({ error: 'Keep notices under 500 characters' })
    patch.message = body.message.trim()
  }
  if (body.severity !== undefined) {
    if (!SEVERITIES.includes(body.severity)) return res.status(400).json({ error: 'Invalid severity' })
    patch.severity = body.severity
  }
  if (body.starts_at !== undefined) patch.starts_at = body.starts_at || new Date().toISOString()
  if (body.ends_at !== undefined)   patch.ends_at = body.ends_at || null
  if (body.is_active !== undefined) patch.is_active = !!body.is_active
  if (patch.starts_at && patch.ends_at && patch.ends_at <= patch.starts_at) {
    return res.status(400).json({ error: 'End time must be after start time' })
  }

  if (req.method === 'POST') {
    if (!patch.message) return res.status(400).json({ error: 'Message is required' })
    const { data, error } = await admin.from('platform_notices')
      .insert({ ...patch, created_by: auth.profile.id }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    await logAdminAction(auth, req, {
      action: 'notice.created', target_type: 'notice', target_id: data.id,
      details: { message: data.message, severity: data.severity, starts_at: data.starts_at, ends_at: data.ends_at },
    })
    return res.status(201).json({ notice: data })
  }

  if (req.method === 'PATCH') {
    const { data, error } = await admin.from('platform_notices').update(patch).eq('id', body.id ?? '').select().maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Notice not found' })
    await logAdminAction(auth, req, {
      action: 'notice.updated', target_type: 'notice', target_id: data.id, details: { fields: patch },
    })
    return res.status(200).json({ notice: data })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    const { data, error } = await admin.from('platform_notices').delete().eq('id', id ?? '').select().maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Notice not found' })
    await logAdminAction(auth, req, {
      action: 'notice.deleted', target_type: 'notice', target_id: id, details: { message: data.message },
    })
    return res.status(200).json({ message: 'Notice deleted' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
