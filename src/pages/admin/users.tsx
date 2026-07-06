import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { UserProfile, Role } from '@/types/database'
import { format, parseISO } from 'date-fns'

const ROLE_LABELS: Record<string, string> = {
  app_admin:     'App Admin',
  org_admin:     'Org Admin',
  clinical_user: 'Clinical User',
  read_only:     'Read Only',
}

const ASSIGNABLE_ROLES = ['org_admin', 'clinical_user', 'read_only'] as const

export default function UsersPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const [users,      setUsers]      = useState<UserProfile[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole,  setInviteRole]  = useState<typeof ASSIGNABLE_ROLES[number]>('clinical_user')
  const [sending,    setSending]    = useState(false)
  const [inviteMsg,  setInviteMsg]  = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const canManage = profile?.role === 'app_admin' || profile?.role === 'org_admin'

  // app_admin can view any org's users via ?org_id= query param
  const targetOrgId   = (router.query.org_id as string)   ?? profile?.organization_id
  const targetOrgName = (router.query.org_name as string) ?? null

  useEffect(() => {
    if (profile && !canManage) { router.replace('/patients'); return }
    if (profile && router.isReady) loadUsers()
  }, [profile, router.isReady, targetOrgId])

  async function loadUsers() {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('organization_id', targetOrgId)
      .order('created_at')
    setUsers(data ?? [])
    setLoading(false)
  }

  async function updateRole(userId: string, role: string) {
    await supabase.from('user_profiles').update({ role: role as Role }).eq('id', userId)
    loadUsers()
  }

  async function toggleActive(user: UserProfile) {
    await supabase.from('user_profiles').update({ is_active: !user.is_active }).eq('id', user.id)
    loadUsers()
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return
    setSending(true); setInviteMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/invite-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          org_name: targetOrgName ?? undefined,
          organization_id: targetOrgId!,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setInviteMsg({ type: 'error', text: json.error ?? 'Failed to send invite.' })
      } else {
        setInviteMsg({ type: 'success', text: `Invite sent to ${inviteEmail.trim()}.` })
        setInviteEmail(''); setInviteRole('clinical_user'); setShowInvite(false)
        loadUsers()
      }
    } catch {
      setInviteMsg({ type: 'error', text: 'Network error. Please try again.' })
    }
    setSending(false)
  }

  return (
    <>
      <Head><title>Users — Prolix Health</title></Head>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Users</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {targetOrgName ? `Managing: ${targetOrgName}` : 'Manage users in your organization'}
            </p>
          </div>
          {targetOrgName && (
            <button onClick={() => router.push('/admin/organizations')} className="btn-secondary text-sm">
              ← Back to Organizations
            </button>
          )}
          <button onClick={() => { setShowInvite(true); setInviteMsg(null) }} className="btn-primary text-sm">
            + Invite User
          </button>
        </div>

        {inviteMsg && (
          <div className={`rounded-lg px-4 py-3 text-sm mb-4 ${inviteMsg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {inviteMsg.text}
          </div>
        )}

        {showInvite && (
          <div className="card mb-6 border-2 border-blue-200">
            <h2 className="font-semibold text-gray-800 mb-4">Invite New User</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="label">Email address</label>
                <input
                  type="email"
                  className="input"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendInvite()}
                />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value as any)}>
                  {ASSIGNABLE_ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={sendInvite} disabled={sending || !inviteEmail.trim()} className="btn-primary text-sm">
                {sending ? 'Sending...' : 'Send Invite'}
              </button>
              <button onClick={() => { setShowInvite(false); setInviteMsg(null) }} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-hdrbg">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">User</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Role</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Joined</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{u.full_name || '—'}</div>
                      <div className="text-xs text-gray-400 font-mono">{u.id.slice(0, 8)}…</div>
                    </td>
                    <td className="px-4 py-3">
                      {u.role === 'app_admin' ? (
                        <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                          App Admin
                        </span>
                      ) : (
                        <select
                          className="text-sm border border-gray-200 rounded px-2 py-1"
                          value={u.role}
                          onChange={e => updateRole(u.id, e.target.value)}
                          disabled={u.id === profile?.id}
                        >
                          {ASSIGNABLE_ROLES.map(r => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {u.created_at ? format(parseISO(u.created_at), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.is_active ? 'Active' : 'Pending / Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.id !== profile?.id && u.role !== 'app_admin' && (
                        <button onClick={() => toggleActive(u)} className="text-xs text-gray-500 hover:text-gray-700">
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
