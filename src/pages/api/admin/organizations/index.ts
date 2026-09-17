import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { logAdminAction } from '@/lib/adminServer'
import type { OrgPlan } from '@/types/database'

const PLANS: OrgPlan[] = ['trial', 'standard', 'enterprise', 'internal']

/**
 * GET  — every organization with usage stats and the issues that need the
 *        App Admin's attention (licensing, seats, trials, deletions, email).
 * POST { name, plan?, trial_ends_at?, seat_limit? } — create an organization
 *        with the platform default instruments and batteries.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authenticateRequest(req, ['app_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })
  const admin = auth.admin

  if (req.method === 'GET') {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString()
    const [orgs, stats, access, instruments, emails] = await Promise.all([
      admin.from('organizations').select('*').order('name'),
      admin.rpc('admin_org_stats'),
      admin.from('organization_instruments')
        .select('organization_id, instrument_id, license_status, license_expires_on')
        .eq('enabled', true),
      admin.from('instruments').select('id, name, license_required').eq('license_required', true),
      admin.from('email_log')
        .select('organization_id, status')
        .in('status', ['bounced', 'complained', 'failed'])
        .gte('created_at', since),
    ])
    const firstError = orgs.error ?? stats.error ?? access.error ?? instruments.error ?? emails.error
    if (firstError) return res.status(500).json({ error: firstError.message })

    const today = new Date().toISOString().slice(0, 10)
    const licensed = new Map((instruments.data ?? []).map(i => [i.id, i.name]))
    const unlicensed: Record<string, string[]> = {}
    for (const row of access.data ?? []) {
      const name = licensed.get(row.instrument_id)
      if (!name) continue
      const valid = row.license_status === 'licensed' && (!row.license_expires_on || row.license_expires_on >= today)
      if (!valid) (unlicensed[row.organization_id] ??= []).push(name)
    }
    const emailFailures: Record<string, number> = {}
    for (const e of emails.data ?? []) {
      if (e.organization_id) emailFailures[e.organization_id] = (emailFailures[e.organization_id] ?? 0) + 1
    }
    const statsByOrg = new Map((stats.data ?? []).map(s => [s.organization_id, s]))

    return res.status(200).json({
      organizations: (orgs.data ?? []).map(o => ({
        ...o,
        stats: statsByOrg.get(o.id) ?? null,
        unlicensed_instruments: unlicensed[o.id] ?? [],
        email_failures_30d: emailFailures[o.id] ?? 0,
      })),
    })
  }

  if (req.method === 'POST') {
    const { name, plan, trial_ends_at, seat_limit } = req.body as {
      name?: string; plan?: OrgPlan; trial_ends_at?: string | null; seat_limit?: number | null
    }
    if (!name?.trim()) return res.status(400).json({ error: 'Organization name is required' })
    if (plan && !PLANS.includes(plan)) return res.status(400).json({ error: 'Invalid plan' })

    const { data: dup } = await admin.from('organizations').select('id').ilike('name', name.trim()).maybeSingle()
    if (dup) return res.status(409).json({ error: 'An organization with that name already exists' })

    const { data: org, error } = await admin.from('organizations').insert({
      name: name.trim(),
      plan: plan ?? 'trial',
      trial_ends_at: (plan ?? 'trial') === 'trial'
        ? (trial_ends_at || new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10))
        : null,
      seat_limit: seat_limit || null,
    }).select().single()
    if (error || !org) return res.status(500).json({ error: error?.message ?? 'Failed to create organization' })

    // Platform defaults: instruments flagged default_enabled, then default
    // battery templates (only the instruments the new org can use).
    const { data: defaults } = await admin
      .from('instruments').select('id').is('organization_id', null).eq('default_enabled', true)
    const enabledIds = new Set((defaults ?? []).map(i => i.id))
    if (enabledIds.size > 0) {
      await admin.from('organization_instruments').insert(
        Array.from(enabledIds).map(instrument_id => ({
          organization_id: org.id, instrument_id, enabled: true, updated_by: auth.profile.id,
        }))
      )
    }

    const { data: templates } = await admin.from('battery_templates').select('*').eq('is_default', true)
    const createdBatteries: string[] = []
    for (const t of templates ?? []) {
      const ids = t.instrument_ids.filter(id => enabledIds.has(id))
      if (ids.length === 0) continue
      const { error: batError } = await admin.from('batteries').insert({
        organization_id: org.id, name: t.name, instrument_ids: ids, created_by: auth.profile.id,
      })
      if (!batError) createdBatteries.push(t.name)
    }

    await logAdminAction(auth, req, {
      action:            'organization.created',
      target_type:       'organization',
      target_id:         org.id,
      organization_id:   org.id,
      organization_name: org.name,
      details: { plan: org.plan, seat_limit: org.seat_limit, default_instruments: enabledIds.size, default_batteries: createdBatteries },
    })

    return res.status(201).json({ organization: org })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
