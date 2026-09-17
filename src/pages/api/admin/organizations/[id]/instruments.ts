import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { logAdminAction, diffFields, isUuid } from '@/lib/adminServer'
import type { LicenseStatus, OrganizationInstrument } from '@/types/database'

const LICENSE_STATUSES: LicenseStatus[] = ['none', 'pending', 'licensed']

/**
 * GET — global instruments plus this org's custom ones, each with the org's
 *       access row (or null when never enabled).
 * PUT { instrument_id, enabled?, license_status?, license_reference?, license_expires_on? }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authenticateRequest(req, ['app_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })
  const admin = auth.admin
  const orgId = req.query.id
  if (!isUuid(orgId)) return res.status(400).json({ error: 'Invalid organization id' })

  if (req.method === 'GET') {
    const [instruments, access] = await Promise.all([
      admin.from('instruments')
        .select('id, code, name, version, type, is_active, organization_id, license_required, license_notes, default_enabled')
        .or(`organization_id.is.null,organization_id.eq.${orgId}`)
        .order('name'),
      admin.from('organization_instruments').select('*').eq('organization_id', orgId),
    ])
    if (instruments.error) return res.status(500).json({ error: instruments.error.message })
    const byId = new Map((access.data ?? []).map(a => [a.instrument_id, a]))
    return res.status(200).json({
      instruments: (instruments.data ?? []).map(i => ({ ...i, access: byId.get(i.id) ?? null })),
    })
  }

  if (req.method === 'PUT') {
    const body = req.body as Partial<OrganizationInstrument> & { instrument_id?: string }
    if (!body.instrument_id) return res.status(400).json({ error: 'instrument_id is required' })
    if (body.license_status && !LICENSE_STATUSES.includes(body.license_status)) {
      return res.status(400).json({ error: 'Invalid license status' })
    }

    const { data: inst } = await admin.from('instruments')
      .select('id, name, organization_id').eq('id', body.instrument_id).maybeSingle()
    if (!inst) return res.status(404).json({ error: 'Instrument not found' })
    if (inst.organization_id && inst.organization_id !== orgId) {
      return res.status(400).json({ error: "That is another organization's custom instrument" })
    }

    const { data: existing } = await admin.from('organization_instruments')
      .select('*').eq('organization_id', orgId).eq('instrument_id', inst.id).maybeSingle()

    const patch: Partial<OrganizationInstrument> = {}
    if (body.enabled !== undefined) patch.enabled = !!body.enabled
    if (body.license_status !== undefined) patch.license_status = body.license_status
    if (body.license_reference !== undefined) patch.license_reference = body.license_reference?.trim() || null
    if (body.license_expires_on !== undefined) patch.license_expires_on = body.license_expires_on || null

    const before = existing ?? { enabled: false, license_status: 'none', license_reference: null, license_expires_on: null }
    const changes = diffFields(before as Record<string, unknown>, patch as Record<string, unknown>)
    if (Object.keys(changes).length === 0) return res.status(200).json({ access: existing })

    const { data: saved, error } = await admin.from('organization_instruments').upsert({
      ...before,
      ...patch,
      organization_id: orgId,
      instrument_id:   inst.id,
      updated_at:      new Date().toISOString(),
      updated_by:      auth.profile.id,
    }, { onConflict: 'organization_id,instrument_id' }).select().single()
    if (error) return res.status(500).json({ error: error.message })

    await logAdminAction(auth, req, {
      action: 'organization.instrument_access_changed', target_type: 'instrument', target_id: inst.id,
      organization_id: orgId, details: { instrument: inst.name, changes },
    })
    return res.status(200).json({ access: saved })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
