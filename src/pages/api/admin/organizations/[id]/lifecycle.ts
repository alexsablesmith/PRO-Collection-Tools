import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { logAdminAction, revokeSessions } from '@/lib/adminServer'

const DELETION_GRACE_DAYS = 30

type Action = 'deactivate' | 'reactivate' | 'schedule_deletion' | 'cancel_deletion' | 'purge'

/**
 * POST { action, confirm_name? }
 *
 *   active ──deactivate──▶ deactivated ──schedule_deletion──▶ pending_deletion ──purge──▶ (gone)
 *      ▲                        │  ▲                                   │
 *      └───────reactivate───────┘  └──────────cancel_deletion──────────┘
 *
 * Deleting requires typing the org name, and data is kept for a 30-day grace
 * period before it can be purged (skipped when the org has no patients).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticateRequest(req, ['app_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })
  const admin = auth.admin
  const id = req.query.id as string
  const { action, confirm_name } = req.body as { action?: Action; confirm_name?: string }

  const { data: org } = await admin.from('organizations').select('*').eq('id', id).maybeSingle()
  if (!org) return res.status(404).json({ error: 'Organization not found' })

  const nameConfirmed = confirm_name?.trim() === org.name
  const audit = (details: Record<string, unknown> = {}) => logAdminAction(auth, req, {
    action: `organization.${action}`, target_type: 'organization', target_id: id,
    organization_id: id, organization_name: org.name, details,
  })

  switch (action) {
    case 'deactivate': {
      if (org.status !== 'active') return res.status(400).json({ error: 'Organization is not active' })
      if (id === auth.profile.organization_id) {
        return res.status(400).json({ error: 'You cannot deactivate your own organization' })
      }
      const { error } = await admin.from('organizations')
        .update({ status: 'deactivated', deactivated_at: new Date().toISOString() }).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })

      const { data: users } = await admin.from('user_profiles').select('id').eq('organization_id', id)
      const revokeError = await revokeSessions(auth, (users ?? []).map(u => u.id))
      await audit({ users_signed_out: users?.length ?? 0, revoke_error: revokeError })
      return res.status(200).json({
        message: 'Organization deactivated. Its users have been signed out and its survey links are paused.',
        ...(revokeError ? { warning: `Signing users out failed: ${revokeError}` } : {}),
      })
    }

    case 'reactivate': {
      if (org.status === 'active') return res.status(400).json({ error: 'Organization is already active' })
      const { error } = await admin.from('organizations').update({
        status: 'active', deactivated_at: null, deletion_requested_at: null, deletion_scheduled_for: null,
      }).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
      await audit({ previous_status: org.status })
      return res.status(200).json({ message: 'Organization reactivated' })
    }

    case 'schedule_deletion': {
      if (org.status !== 'deactivated') {
        return res.status(400).json({ error: 'Deactivate the organization before scheduling deletion' })
      }
      if (!nameConfirmed) return res.status(400).json({ error: 'Type the organization name exactly to confirm' })

      const { count: patients } = await admin
        .from('patients').select('id', { count: 'exact', head: true }).eq('organization_id', id)
      const graceDays = (patients ?? 0) === 0 ? 0 : DELETION_GRACE_DAYS
      const now = new Date()
      const scheduled = new Date(now.getTime() + graceDays * 86400_000)

      const { error } = await admin.from('organizations').update({
        status: 'pending_deletion',
        deletion_requested_at: now.toISOString(),
        deletion_scheduled_for: scheduled.toISOString(),
      }).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
      await audit({ patients: patients ?? 0, grace_days: graceDays, scheduled_for: scheduled.toISOString() })
      return res.status(200).json({
        message: graceDays === 0
          ? 'Organization has no patients, so it can be purged now.'
          : `Deletion scheduled. Data can be purged after ${scheduled.toDateString()}.`,
      })
    }

    case 'cancel_deletion': {
      if (org.status !== 'pending_deletion') return res.status(400).json({ error: 'No deletion is scheduled' })
      const { error } = await admin.from('organizations').update({
        status: 'deactivated', deletion_requested_at: null, deletion_scheduled_for: null,
      }).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
      await audit()
      return res.status(200).json({ message: 'Deletion cancelled. The organization remains deactivated.' })
    }

    case 'purge': {
      if (!nameConfirmed) return res.status(400).json({ error: 'Type the organization name exactly to confirm' })

      const { data: result, error } = await admin.rpc('admin_purge_organization', { p_org: id })
      if (error || !result) return res.status(400).json({ error: error?.message ?? 'Purge failed' })

      const authErrors: string[] = []
      for (const userId of result.user_ids) {
        const { error: authError } = await admin.auth.admin.deleteUser(userId)
        if (authError) authErrors.push(`${userId}: ${authError.message}`)
      }

      await audit({ counts: result.counts, auth_users_deleted: result.user_ids.length - authErrors.length, auth_errors: authErrors })
      return res.status(200).json({
        message: 'Organization and all of its data were permanently deleted.',
        counts: result.counts,
        ...(authErrors.length ? { warning: `Some login accounts could not be removed: ${authErrors.join('; ')}` } : {}),
      })
    }

    default:
      return res.status(400).json({ error: 'Unknown action' })
  }
}
