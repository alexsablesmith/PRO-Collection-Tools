import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { logAdminAction } from '@/lib/adminServer'

/**
 * Platform default batteries, copied into every newly created organization.
 * GET | POST { name, instrument_ids } | PATCH { id, name?, instrument_ids?, is_default? } | DELETE ?id=
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authenticateRequest(req, ['app_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })
  const admin = auth.admin

  if (req.method === 'GET') {
    const { data, error } = await admin.from('battery_templates').select('*').order('name')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ templates: data ?? [] })
  }

  const body = (req.body ?? {}) as { id?: string; name?: string; instrument_ids?: string[]; is_default?: boolean }

  async function validateInstruments(ids: string[] | undefined) {
    if (!ids || ids.length === 0) return 'Choose at least one instrument'
    const { data } = await admin.from('instruments').select('id').in('id', ids).is('organization_id', null)
    return (data ?? []).length === new Set(ids).size ? null : 'Default batteries can only use global instruments'
  }

  if (req.method === 'POST') {
    if (!body.name?.trim()) return res.status(400).json({ error: 'Name is required' })
    const invalid = await validateInstruments(body.instrument_ids)
    if (invalid) return res.status(400).json({ error: invalid })

    const { data, error } = await admin.from('battery_templates').insert({
      name: body.name.trim(), instrument_ids: body.instrument_ids, is_default: true, created_by: auth.profile.id,
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    await logAdminAction(auth, req, {
      action: 'battery_template.created', target_type: 'battery_template', target_id: data.id,
      details: { name: data.name, instruments: data.instrument_ids.length },
    })
    return res.status(201).json({ template: data })
  }

  if (req.method === 'PATCH') {
    const patch: { name?: string; instrument_ids?: string[]; is_default?: boolean } = {}
    if (body.name !== undefined) {
      if (!body.name.trim()) return res.status(400).json({ error: 'Name is required' })
      patch.name = body.name.trim()
    }
    if (body.instrument_ids !== undefined) {
      const invalid = await validateInstruments(body.instrument_ids)
      if (invalid) return res.status(400).json({ error: invalid })
      patch.instrument_ids = body.instrument_ids
    }
    if (body.is_default !== undefined) patch.is_default = !!body.is_default

    const { data, error } = await admin.from('battery_templates').update(patch).eq('id', body.id ?? '').select().maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Template not found' })
    await logAdminAction(auth, req, {
      action: 'battery_template.updated', target_type: 'battery_template', target_id: data.id,
      details: { name: data.name, fields: Object.keys(patch) },
    })
    return res.status(200).json({ template: data })
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string
    const { data, error } = await admin.from('battery_templates').delete().eq('id', id ?? '').select().maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Template not found' })
    await logAdminAction(auth, req, {
      action: 'battery_template.deleted', target_type: 'battery_template', target_id: id, details: { name: data.name },
    })
    return res.status(200).json({ message: 'Template deleted' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
