import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { adminFetch } from '@/lib/adminClient'
import type { AdminUserRow, Organization } from '@/types/database'
import Flash, { FlashMessage, resultFlash } from '@/components/admin/Flash'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { fmtAgo, fmtDate, ROLE_LABELS } from '@/components/admin/format'

const ASSIGNABLE_ROLES = ['org_admin', 'clinical_user', 'read_only'] as const
const INVITE_TTL_MS = 24 * 3600_000

type Confirm = { title: string; body: string; label: string; danger?: boolean; run: () => Promise<void> }

function userStatus(u: AdminUserRow) {
  if (u.is_active) return { label: 'Active', cls: 'bg-green-100 text-green-700' }
  if (u.invite_accepted_at) return { label: 'Deactivated', cls: 'bg-gray-200 text-gray-600' }
  const expired = u.invited_at && Date.now() - new Date(u.invited_at).getTime() > INVITE_TTL_MS
  return expired
    ? { label: 'Invite expired', cls: 'bg-amber-100 text-amber-800' }
    : { label: 'Invite pending', cls: 'bg-blue-100 text-blue-700' }
}

/**
 * User management for one organization. Used by org admins on /admin/users
 * (their own org) and by the App Admin on the organization detail page,
 * where `organizations` enables moving users between orgs.
 */
export default function OrgUsersPanel({
  orgId, organizations,
}: {
  orgId: string
  organizations?: Pick<Organization, 'id' | 'name' | 'status'>[]
}) {
  const { profile } = useAuth()
  const [users,   setUsers]   = useState<AdminUserRow[]>([])
  const [org,     setOrg]     = useState<Organization | null>(null)
  const [seats,   setSeats]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [flash,   setFlash]   = useState<FlashMessage>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [moving,  setMoving]  = useState<AdminUserRow | null>(null)
  const [moveTo,  setMoveTo]  = useState('')

  const [showInvite,  setShowInvite]  = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole,  setInviteRole]  = useState<typeof ASSIGNABLE_ROLES[number]>('clinical_user')
  const [sending,     setSending]     = useState(false)

  useEffect(() => { load() }, [orgId])

  async function load() {
    try {
      const json = await adminFetch<{ users: AdminUserRow[]; organization: Organization; seats_used: number }>(
        `/api/admin/users?org_id=${orgId}`
      )
      setUsers(json.users)
      setOrg(json.organization)
      setSeats(json.seats_used)
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
    }
    setLoading(false)
  }

  async function run(path: string, body: Record<string, unknown>, fallback: string) {
    setFlash(null)
    try {
      const result = await adminFetch(path, { body })
      setFlash(resultFlash(result, fallback))
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
    }
    await load()
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return
    setSending(true)
    await run('/api/admin/invite-user', { email: inviteEmail.trim(), role: inviteRole, organization_id: orgId }, `Invite sent to ${inviteEmail.trim()}.`)
    setInviteEmail(''); setInviteRole('clinical_user'); setShowInvite(false)
    setSending(false)
  }

  const name = (u: AdminUserRow) => u.full_name || u.email || 'this user'
  const seatFull = org?.seat_limit != null && seats >= org.seat_limit
  const canInvite = org?.status === 'active' && !seatFull

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="text-sm text-gray-500">
          {org && (
            <>
              Seats used: <span className={seatFull ? 'text-red-600 font-semibold' : 'text-gray-800 font-medium'}>
                {seats}{org.seat_limit != null ? ` / ${org.seat_limit}` : ''}
              </span>
              {org.allowed_email_domains.length > 0 && (
                <span className="ml-3">Invites limited to {org.allowed_email_domains.map(d => '@' + d).join(', ')}</span>
              )}
            </>
          )}
        </div>
        <button
          onClick={() => { setShowInvite(true); setFlash(null) }}
          disabled={!canInvite}
          title={!canInvite ? (seatFull ? 'No seats available' : 'Organization is not active') : undefined}
          className="btn-primary text-sm"
        >
          + Invite User
        </button>
      </div>

      <Flash message={flash} onClose={() => setFlash(null)} />

      {showInvite && (
        <div className="card mb-6 border-2 border-blue-200">
          <h2 className="font-semibold text-gray-800 mb-4">Invite New User</h2>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Email address</label>
              <input
                type="email" className="input" placeholder="user@example.com" value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendInvite()}
              />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value as any)}>
                {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={sendInvite} disabled={sending || !inviteEmail.trim()} className="btn-primary text-sm">
              {sending ? 'Sending...' : 'Send Invite'}
            </button>
            <button onClick={() => setShowInvite(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : users.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">No users yet.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-hdrbg">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">User</th>
                <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Role</th>
                <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Last sign-in</th>
                <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">2FA</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const status = userStatus(u)
                const pending = !u.is_active && !u.invite_accepted_at
                const manageable = u.id !== profile?.id && u.role !== 'app_admin'
                return (
                  <tr key={u.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{u.full_name || '—'}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {manageable ? (
                        <select
                          className="text-sm border border-gray-200 rounded px-2 py-1"
                          value={u.role}
                          onChange={e => run('/api/admin/users/update', { user_id: u.id, role: e.target.value }, `Role updated for ${name(u)}.`)}
                        >
                          {ASSIGNABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                          {ROLE_LABELS[u.role]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.cls}`}>{status.label}</span>
                      {pending && u.invited_at && <div className="text-xs text-gray-400 mt-0.5">Invited {fmtDate(u.invited_at)}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{pending ? '—' : fmtAgo(u.last_sign_in_at)}</td>
                    <td className="px-4 py-3 text-gray-500">{u.mfa_enrolled ? 'Enrolled' : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {manageable && (
                        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                          {pending ? (
                            <>
                              <button onClick={() => run('/api/admin/invite-user', { resend_user_id: u.id }, `Invite resent to ${u.email}.`)} className="text-xs text-blue-600 hover:text-blue-800">
                                Resend invite
                              </button>
                              <button
                                onClick={() => setConfirm({
                                  title: 'Revoke invite?', label: 'Revoke invite', danger: true,
                                  body: `The invite link sent to ${u.email} will stop working.`,
                                  run: () => run('/api/admin/users/revoke-invite', { user_id: u.id }, 'Invite revoked.'),
                                })}
                                className="text-xs text-red-500 hover:text-red-700"
                              >
                                Revoke
                              </button>
                            </>
                          ) : (
                            <>
                              {u.is_active ? (
                                <button
                                  onClick={() => setConfirm({
                                    title: `Deactivate ${name(u)}?`, label: 'Deactivate', danger: true,
                                    body: 'They will be signed out everywhere immediately and won\'t be able to sign in until reactivated.',
                                    run: () => run('/api/admin/users/update', { user_id: u.id, is_active: false }, `${name(u)} deactivated.`),
                                  })}
                                  className="text-xs text-gray-600 hover:text-gray-900"
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button onClick={() => run('/api/admin/users/update', { user_id: u.id, is_active: true }, `${name(u)} reactivated.`)} className="text-xs text-blue-600 hover:text-blue-800">
                                  Reactivate
                                </button>
                              )}
                              {u.is_active && (
                                <button onClick={() => run('/api/admin/users/revoke-sessions', { user_id: u.id }, `${name(u)} signed out of all sessions.`)} className="text-xs text-gray-600 hover:text-gray-900">
                                  Sign out
                                </button>
                              )}
                              <button
                                onClick={() => setConfirm({
                                  title: `Reset 2FA for ${name(u)}?`, label: 'Reset 2FA',
                                  body: 'Their authenticator is removed and they must re-enroll at next sign-in.',
                                  run: () => run('/api/admin/reset-mfa', { user_id: u.id }, `2FA reset for ${name(u)}.`),
                                })}
                                className="text-xs text-gray-600 hover:text-gray-900"
                              >
                                Reset 2FA
                              </button>
                            </>
                          )}
                          {organizations && !pending && (
                            <button onClick={() => { setMoving(u); setMoveTo('') }} className="text-xs text-gray-600 hover:text-gray-900">
                              Move
                            </button>
                          )}
                          <button
                            onClick={() => setConfirm({
                              title: `Permanently delete ${name(u)}?`, label: 'Delete user', danger: true,
                              body: 'This cannot be undone. Users who created patients or surveys usually can\'t be deleted; deactivate them instead.',
                              run: () => run('/api/admin/delete-user', { user_id: u.id }, `${name(u)} deleted.`),
                            })}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.label}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => { await confirm.run(); setConfirm(null) }}
        />
      )}

      {moving && organizations && (
        <ConfirmDialog
          title={`Move ${name(moving)} to another organization`}
          confirmLabel="Move user"
          body={
            <>
              <p>They keep their login and role, lose access to this organization&apos;s patients, and are signed out.</p>
              <select className="input mt-2" value={moveTo} onChange={e => setMoveTo(e.target.value)}>
                <option value="">Choose an organization…</option>
                {organizations.filter(o => o.id !== orgId && o.status === 'active').map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </>
          }
          onCancel={() => setMoving(null)}
          onConfirm={async () => {
            if (!moveTo) return
            await run('/api/admin/users/update', { user_id: moving.id, organization_id: moveTo }, `${name(moving)} moved.`)
            setMoving(null)
          }}
        />
      )}
    </div>
  )
}
