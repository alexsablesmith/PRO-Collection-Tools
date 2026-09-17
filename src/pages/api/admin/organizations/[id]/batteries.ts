import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { logAdminAction } from '@/lib/adminServer'

/**
 * GET  — the org's batteries, flagged when they contain instruments the org
 *        can no longer use (support view; no patient data).
 * POST { battery_id } — copy a battery into the platform default templates.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authenticateRequest(req, ['app_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })
  const admin = auth.admin
  const orgId = req.query.id as string

  if (req.method === 'GET') {
    const [batteries, instruments, access] = await Promise.all([
      admin.from('batteries').select('*').eq('organization_id', orgId).order('created_at'),
      admin.from('instruments').select('id, name, organization_id'),
      admin.from('organization_instruments').select('instrument_id').eq('organization_id', orgId).eq('enabled', true),
    ])
    if (batteries.error) return res.status(500).json({ error: batteries.error.message })

    const enabled = new Set((access.data ?? []).map(a => a.instrument_id))
    const byId = new Map((instruments.data ?? []).map(i => [i.id, i]))
    return res.status(200).json({
      batteries: (batteries.data ?? []).map(b => ({
        ...b,
        instruments: b.instrument_ids.map(iid => {
          const inst = byId.get(iid)
          return {
            id: iid,
            name: inst?.name ?? 'Unknown instrument',
            available: !!inst && (inst.organization_id === orgId || enabled.has(iid)),
          }
        }),
      })),
    })
  }

  if (req.method === 'POST') {
    const { battery_id } = req.body as { battery_id?: string }
    const { data: bat } = await admin.from('batteries').select('*').eq('id', battery_id ?? '').eq('organization_id', orgId).maybeSingle()
    if (!bat) return res.status(404).json({ error: 'Battery not found' })

    // Org-private instruments can't be part of a platform-wide default.
    const { data: insts } = await admin.from('instruments').select('id, organization_id').in('id', bat.instrument_ids)
    const globalIds = bat.instrument_ids.filter(iid => insts?.find(i => i.id === iid && i.organization_id === null))
    if (globalIds.length === 0) return res.status(400).json({ error: 'This battery only contains custom instruments' })

    const { data: template, error } = await admin.from('battery_templates').insert({
      name: bat.name, instrument_ids: globalIds, is_default: true, created_by: auth.profile.id,
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })

    await logAdminAction(auth, req, {
      action: 'battery_template.created', target_type: 'battery_template', target_id: template.id,
      organization_id: orgId,
      details: { name: bat.name, from_battery: bat.id, skipped_custom: bat.instrument_ids.length - globalIds.length },
    })
    return res.status(201).json({
      template,
      message: globalIds.length < bat.instrument_ids.length
        ? 'Saved as a platform default (custom instruments were left out).'
        : 'Saved as a platform default.',
    })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
