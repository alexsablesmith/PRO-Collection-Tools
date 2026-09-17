import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { logAdminAction, diffFields } from '@/lib/adminServer'
import type { Instrument } from '@/types/database'

/**
 * GET   — every instrument with its owner and how many orgs have it enabled.
 * PATCH { instrument_id, license_required?, license_notes?, default_enabled?, organization_id? }
 * POST  { instrument_id, action: 'enable_all' | 'disable_all' } — bulk access for every org.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authenticateRequest(req, ['app_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })
  const admin = auth.admin

  if (req.method === 'GET') {
    const [instruments, access, orgs] = await Promise.all([
      admin.from('instruments')
        .select('id, code, name, version, type, is_active, organization_id, license_required, license_notes, default_enabled')
        .order('name'),
      admin.from('organization_instruments').select('instrument_id').eq('enabled', true),
      admin.from('organizations').select('id, name').order('name'),
    ])
    if (instruments.error) return res.status(500).json({ error: instruments.error.message })

    const enabledCount: Record<string, number> = {}
    for (const a of access.data ?? []) enabledCount[a.instrument_id] = (enabledCount[a.instrument_id] ?? 0) + 1

    return res.status(200).json({
      instruments: (instruments.data ?? []).map(i => ({ ...i, enabled_org_count: enabledCount[i.id] ?? 0 })),
      organizations: orgs.data ?? [],
    })
  }

  const { instrument_id } = req.body as { instrument_id?: string }
  const { data: inst } = await admin.from('instruments').select('*').eq('id', instrument_id ?? '').maybeSingle()
  if (!inst) return res.status(404).json({ error: 'Instrument not found' })

  if (req.method === 'PATCH') {
    const body = req.body as Partial<Instrument>
    const patch: Partial<Instrument> = {}
    if (body.license_required !== undefined) patch.license_required = !!body.license_required
    if (body.license_notes !== undefined)    patch.license_notes = body.license_notes?.trim() || null
    if (body.default_enabled !== undefined)  patch.default_enabled = !!body.default_enabled
    if (body.organization_id !== undefined) {
      patch.organization_id = body.organization_id || null
      if (patch.organization_id) {
        const { data: org } = await admin.from('organizations').select('id').eq('id', patch.organization_id).maybeSingle()
        if (!org) return res.status(404).json({ error: 'Organization not found' })
      }
    }

    const changes = diffFields(inst as Record<string, unknown>, patch as Record<string, unknown>)
    if (Object.keys(changes).length === 0) return res.status(200).json({ message: 'No changes' })

    const { error } = await admin.from('instruments').update(patch).eq('id', inst.id)
    if (error) return res.status(500).json({ error: error.message })

    await logAdminAction(auth, req, {
      action: 'instrument.updated', target_type: 'instrument', target_id: inst.id,
      organization_id: patch.organization_id ?? inst.organization_id ?? null,
      details: { instrument: inst.name, changes },
    })
    return res.status(200).json({ message: 'Instrument updated' })
  }

  if (req.method === 'POST') {
    const { action } = req.body as { action?: 'enable_all' | 'disable_all' }
    if (action !== 'enable_all' && action !== 'disable_all') return res.status(400).json({ error: 'Unknown action' })
    if (inst.organization_id) return res.status(400).json({ error: 'Custom instruments belong to a single organization' })

    const { data: orgs } = await admin.from('organizations').select('id')
    const { data: existing } = await admin.from('organization_instruments').select('*').eq('instrument_id', inst.id)
    const byOrg = new Map((existing ?? []).map(e => [e.organization_id, e]))
    const enabled = action === 'enable_all'

    const rows = (orgs ?? []).map(o => ({
      ...(byOrg.get(o.id) ?? { license_status: 'none' as const, license_reference: null, license_expires_on: null }),
      organization_id: o.id,
      instrument_id:   inst.id,
      enabled,
      updated_at:      new Date().toISOString(),
      updated_by:      auth.profile.id,
    }))
    const { error } = await admin.from('organization_instruments').upsert(rows, { onConflict: 'organization_id,instrument_id' })
    if (error) return res.status(500).json({ error: error.message })

    await logAdminAction(auth, req, {
      action: enabled ? 'instrument.enabled_for_all' : 'instrument.disabled_for_all',
      target_type: 'instrument', target_id: inst.id,
      details: { instrument: inst.name, organizations: rows.length },
    })
    return res.status(200).json({ message: `${inst.name} ${enabled ? 'enabled' : 'disabled'} for ${rows.length} organizations` })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
