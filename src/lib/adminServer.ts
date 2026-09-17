import type { NextApiRequest } from 'next'
import type { AuthedRequest } from '@/lib/serverAuth'

export interface AuditEntry {
  action:             string
  target_type?:       string
  target_id?:         string
  organization_id?:   string | null
  organization_name?: string | null
  details?:           Record<string, unknown>
}

/**
 * Appends a row to admin_audit_log. Called after an admin action succeeds.
 * A logging failure never undoes the action, but it is reported to the
 * server log so a gap in the audit trail is visible.
 */
export async function logAdminAction(auth: AuthedRequest, req: NextApiRequest, entry: AuditEntry) {
  let orgName = entry.organization_name ?? null
  if (entry.organization_id && orgName === null) {
    const { data } = await auth.admin
      .from('organizations')
      .select('name')
      .eq('id', entry.organization_id)
      .maybeSingle()
    orgName = data?.name ?? null
  }

  const forwarded = req.headers['x-forwarded-for']
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0].trim()
    ?? req.socket?.remoteAddress
    ?? null

  const { error } = await auth.admin.from('admin_audit_log').insert({
    actor_id:          auth.profile.id,
    actor_email:       auth.user.email ?? null,
    actor_role:        auth.profile.role,
    action:            entry.action,
    target_type:       entry.target_type ?? null,
    target_id:         entry.target_id ?? null,
    organization_id:   entry.organization_id ?? null,
    organization_name: orgName,
    details:           entry.details ?? {},
    ip_address:        ip,
    user_agent:        (req.headers['user-agent'] as string | undefined)?.slice(0, 500) ?? null,
  })

  if (error) console.error(`[audit] failed to log ${entry.action}:`, error.message)
}

/** Field-level diff for audit details: { field: { from, to } } for changed fields only. */
export function diffFields<T extends Record<string, unknown>>(before: T, patch: Partial<T>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const key of Object.keys(patch)) {
    const from = before[key]
    const to = patch[key]
    if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) changes[key] = { from, to }
  }
  return changes
}

/**
 * Seats in use: active users plus outstanding invites. Deactivated users and
 * App Admins don't count against an organization's seat limit.
 */
export async function countSeats(auth: AuthedRequest, organizationId: string) {
  const { data } = await auth.admin
    .from('user_profiles')
    .select('role, is_active, invite_accepted_at')
    .eq('organization_id', organizationId)
  return (data ?? []).filter(p =>
    p.role !== 'app_admin' && (p.is_active || p.invite_accepted_at === null)
  ).length
}

/** Revokes every session for the given users. Returns an error message on failure. */
export async function revokeSessions(auth: AuthedRequest, userIds: string[]) {
  if (userIds.length === 0) return null
  const { error } = await auth.admin.rpc('admin_revoke_sessions', { p_user_ids: userIds })
  if (error) {
    console.error('[admin] session revocation failed:', error.message)
    return error.message
  }
  return null
}

export type ManageableUser =
  | { user: import('@/types/database').UserProfile }
  | { status: number; error: string }

/**
 * Loads a user the caller is allowed to manage. org_admins are limited to
 * their own organization and can never act on an App Admin; nobody manages
 * their own account through these routes.
 */
export async function loadManageableUser(auth: AuthedRequest, userId: string | undefined): Promise<ManageableUser> {
  if (!userId) return { status: 400, error: 'user_id is required' }
  if (userId === auth.profile.id) return { status: 400, error: 'You cannot perform this action on your own account' }

  const { data: target } = await auth.admin.from('user_profiles').select('*').eq('id', userId).maybeSingle()
  if (!target) return { status: 404, error: 'User not found' }

  if (auth.profile.role === 'org_admin') {
    if (target.organization_id !== auth.profile.organization_id) {
      return { status: 403, error: 'You can only manage users in your own organization' }
    }
    if (target.role === 'app_admin') {
      return { status: 403, error: 'You cannot manage an App Admin' }
    }
  }
  return { user: target }
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}
