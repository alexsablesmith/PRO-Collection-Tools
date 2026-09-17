import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'
import { logAdminAction, loadManageableUser, countSeats, revokeSessions } from '@/lib/adminServer'
import type { Role, UserProfile } from '@/types/database'

const ASSIGNABLE_ROLES: Role[] = ['org_admin', 'clinical_user', 'read_only']

/**
 * POST { user_id, role?, organization_id?, is_active? }
 * Role changes, activation/deactivation, and (App Admin only) moving a user
 * to another organization. Deactivating or moving a user signs them out.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticateRequest(req, ['app_admin', 'org_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })

  const { user_id, role, organization_id, is_active } = req.body as {
    user_id?: string; role?: Role; organization_id?: string; is_active?: boolean
  }

  const loaded = await loadManageableUser(auth, user_id)
  if ('error' in loaded) return res.status(loaded.status).json({ error: loaded.error })
  const target = loaded.user

  if (target.role === 'app_admin') {
    return res.status(403).json({ error: 'App Admin accounts can only be changed in the database' })
  }

  const patch: Partial<UserProfile> = {}
  const actions: string[] = []

  if (role !== undefined && role !== target.role) {
    if (!ASSIGNABLE_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' })
    patch.role = role
    actions.push('user.role_changed')
  }

  if (organization_id !== undefined && organization_id !== target.organization_id) {
    if (auth.profile.role !== 'app_admin') {
      return res.status(403).json({ error: 'Only an App Admin can move users between organizations' })
    }
    const { data: dest } = await auth.admin.from('organizations').select('*').eq('id', organization_id).maybeSingle()
    if (!dest) return res.status(404).json({ error: 'Destination organization not found' })
    if (dest.status !== 'active') return res.status(400).json({ error: 'Cannot move a user into a deactivated organization' })
    if (dest.seat_limit !== null && (await countSeats(auth, dest.id)) >= dest.seat_limit) {
      return res.status(400).json({ error: `${dest.name} has no seats available (limit ${dest.seat_limit})` })
    }
    patch.organization_id = organization_id
    actions.push('user.moved')
  }

  if (is_active !== undefined && is_active !== target.is_active) {
    if (is_active) {
      if (!target.invite_accepted_at) {
        return res.status(400).json({ error: 'This user has not accepted their invite yet. Resend the invite instead.' })
      }
      const orgId = patch.organization_id ?? target.organization_id
      const { data: org } = await auth.admin.from('organizations').select('name, seat_limit').eq('id', orgId).single()
      if (org?.seat_limit != null && (await countSeats(auth, orgId)) >= org.seat_limit) {
        return res.status(400).json({ error: `${org.name} has no seats available (limit ${org.seat_limit})` })
      }
      patch.is_active = true
      patch.deactivated_at = null
      actions.push('user.reactivated')
    } else {
      patch.is_active = false
      patch.deactivated_at = new Date().toISOString()
      actions.push('user.deactivated')
    }
  }

  if (actions.length === 0) return res.status(200).json({ message: 'No changes' })

  const { error } = await auth.admin.from('user_profiles').update(patch).eq('id', target.id)
  if (error) return res.status(500).json({ error: error.message })

  const signOut = patch.is_active === false || patch.organization_id !== undefined
  const revokeError = signOut ? await revokeSessions(auth, [target.id]) : null

  for (const action of actions) {
    await logAdminAction(auth, req, {
      action,
      target_type:     'user',
      target_id:       target.id,
      organization_id: target.organization_id,
      details: {
        full_name: target.full_name,
        ...(action === 'user.role_changed' ? { from: target.role, to: patch.role } : {}),
        ...(action === 'user.moved' ? { from_org: target.organization_id, to_org: patch.organization_id } : {}),
        ...(signOut ? { sessions_revoked: !revokeError } : {}),
      },
    })
  }

  return res.status(200).json({
    message: 'User updated',
    ...(revokeError ? { warning: `User updated, but signing them out failed: ${revokeError}` } : {}),
  })
}
