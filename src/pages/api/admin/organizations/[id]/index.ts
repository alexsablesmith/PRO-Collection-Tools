import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { logAdminAction, diffFields } from '@/lib/adminServer'
import type { Organization, OrgPlan } from '@/types/database'

const PLANS: OrgPlan[] = ['trial', 'standard', 'enterprise', 'internal']

function isValidTimezone(tz: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

/** Returns the validated patch, or an error message. */
function validatePatch(body: Record<string, any>): Partial<Organization> | string {
  const patch: Partial<Organization> = {}
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

  if ('name' in body) {
    if (!text(body.name)) return 'Organization name is required'
    patch.name = text(body.name)!
  }
  for (const key of ['display_name', 'contact_name', 'contact_phone', 'billing_notes'] as const) {
    if (key in body) patch[key] = text(body[key])
  }
  if ('contact_email' in body) {
    const v = text(body.contact_email)
    if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'Contact email is not valid'
    patch.contact_email = v
  }
  if ('logo_url' in body) {
    const v = text(body.logo_url)
    if (v && !/^https:\/\//i.test(v)) return 'Logo URL must start with https://'
    patch.logo_url = v
  }
  if ('timezone' in body) {
    if (!isValidTimezone(body.timezone)) return 'Unknown time zone'
    patch.timezone = body.timezone
  }
  if ('default_language' in body) {
    if (!['en', 'es'].includes(body.default_language)) return 'Default language must be English or Spanish'
    patch.default_language = body.default_language
  }
  if ('require_mfa' in body) patch.require_mfa = !!body.require_mfa
  if ('session_timeout_minutes' in body) {
    const v = body.session_timeout_minutes
    if (v !== null && v !== '' && !(Number.isInteger(Number(v)) && Number(v) >= 5 && Number(v) <= 1440)) {
      return 'Session timeout must be between 5 and 1440 minutes'
    }
    patch.session_timeout_minutes = v === null || v === '' ? null : Number(v)
  }
  if ('allowed_email_domains' in body) {
    const raw: unknown[] = Array.isArray(body.allowed_email_domains) ? body.allowed_email_domains : []
    const domains = raw
      .map(d => String(d).trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean)
    if (domains.some(d => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d))) return 'Allowed domains must look like clinic.com'
    patch.allowed_email_domains = Array.from(new Set(domains))
  }
  if ('plan' in body) {
    if (!PLANS.includes(body.plan)) return 'Invalid plan'
    patch.plan = body.plan
  }
  if ('trial_ends_at' in body) patch.trial_ends_at = text(body.trial_ends_at)
  if ('seat_limit' in body) {
    const v = body.seat_limit
    if (v !== null && v !== '' && !(Number.isInteger(Number(v)) && Number(v) > 0)) return 'Seat limit must be a positive whole number'
    patch.seat_limit = v === null || v === '' ? null : Number(v)
  }
  return patch
}

/**
 * GET   — organization detail and stats. Logged as a support view.
 * PATCH — update name, profile/branding, security policy, or plan.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authenticateRequest(req, ['app_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })
  const admin = auth.admin
  const id = req.query.id as string

  const { data: org } = await admin.from('organizations').select('*').eq('id', id).maybeSingle()
  if (!org) return res.status(404).json({ error: 'Organization not found' })

  if (req.method === 'GET') {
    const { data: stats } = await admin.rpc('admin_org_stats')
    await logAdminAction(auth, req, {
      action: 'organization.viewed', target_type: 'organization', target_id: id,
      organization_id: id, organization_name: org.name,
    })
    return res.status(200).json({
      organization: org,
      stats: (stats ?? []).find(s => s.organization_id === id) ?? null,
      is_own_org: id === auth.profile.organization_id,
    })
  }

  if (req.method === 'PATCH') {
    const patch = validatePatch(req.body ?? {})
    if (typeof patch === 'string') return res.status(400).json({ error: patch })

    if (patch.name && patch.name.toLowerCase() !== org.name.toLowerCase()) {
      const { data: dup } = await admin.from('organizations').select('id').ilike('name', patch.name).neq('id', id).maybeSingle()
      if (dup) return res.status(409).json({ error: 'An organization with that name already exists' })
    }

    const changes = diffFields(org as Record<string, unknown>, patch as Record<string, unknown>)
    if (Object.keys(changes).length === 0) return res.status(200).json({ organization: org })

    const { data: updated, error } = await admin.from('organizations').update(patch).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })

    await logAdminAction(auth, req, {
      action: 'organization.updated', target_type: 'organization', target_id: id,
      organization_id: id, organization_name: updated.name, details: { changes },
    })
    return res.status(200).json({ organization: updated })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
