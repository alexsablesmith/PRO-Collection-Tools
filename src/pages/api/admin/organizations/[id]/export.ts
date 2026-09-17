import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { logAdminAction } from '@/lib/adminServer'

const PAGE_SIZE = 500

const EXPORT_TABLES = [
  'organization', 'users', 'patients', 'clinical_events', 'batteries', 'custom_instruments',
  'instrument_access', 'survey_requests', 'survey_responses', 'report_audit_log',
] as const
type ExportTable = typeof EXPORT_TABLES[number]

/**
 * GET ?table=&offset= — one page of an organization's data for a full export
 * (offboarding, records requests). The client pages through every table and
 * assembles the files. The first page of the first table is audit-logged.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticateRequest(req, ['app_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })
  const admin = auth.admin
  const orgId = req.query.id as string
  const table = req.query.table as ExportTable
  const offset = Math.max(0, Number(req.query.offset) || 0)
  const to = offset + PAGE_SIZE - 1

  if (!EXPORT_TABLES.includes(table)) return res.status(400).json({ error: 'Unknown table' })

  const { data: org } = await admin.from('organizations').select('*').eq('id', orgId).maybeSingle()
  if (!org) return res.status(404).json({ error: 'Organization not found' })

  let rows: unknown[] = []
  let error: { message: string } | null = null

  switch (table) {
    case 'organization':
      rows = [org]
      await logAdminAction(auth, req, {
        action: 'organization.exported', target_type: 'organization', target_id: orgId,
        organization_id: orgId, organization_name: org.name,
      })
      break
    case 'users': {
      const r = await admin.rpc('admin_list_users', { p_org: orgId })
      rows = (r.data ?? []).slice(offset, to + 1); error = r.error
      break
    }
    case 'patients': {
      const r = await admin.from('patients').select('*').eq('organization_id', orgId).order('created_at').range(offset, to)
      rows = r.data ?? []; error = r.error
      break
    }
    case 'clinical_events': {
      const r = await admin.from('clinical_events').select('*').eq('organization_id', orgId).order('created_at').range(offset, to)
      rows = r.data ?? []; error = r.error
      break
    }
    case 'batteries': {
      const r = await admin.from('batteries').select('*').eq('organization_id', orgId).order('created_at').range(offset, to)
      rows = r.data ?? []; error = r.error
      break
    }
    case 'custom_instruments': {
      const r = await admin.from('instruments').select('*').eq('organization_id', orgId).order('name').range(offset, to)
      rows = r.data ?? []; error = r.error
      break
    }
    case 'instrument_access': {
      const r = await admin.from('organization_instruments').select('*').eq('organization_id', orgId).range(offset, to)
      rows = r.data ?? []; error = r.error
      break
    }
    case 'survey_requests':
    case 'survey_responses':
    case 'report_audit_log': {
      // Joined through patients: these tables have no organization_id column.
      const r = await (admin.from(table) as any)
        .select('*, patients!inner(organization_id)')
        .eq('patients.organization_id', orgId)
        .order('id')
        .range(offset, to)
      rows = (r.data ?? []).map(({ patients, ...rest }: any) => rest)
      error = r.error
      break
    }
  }

  if (error) return res.status(500).json({ error: `${table}: ${error.message}` })
  return res.status(200).json({ rows, next_offset: rows.length === PAGE_SIZE ? offset + PAGE_SIZE : null })
}
