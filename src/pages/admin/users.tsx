import { useEffect, useState } from 'react'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { UserProfile } from '@/types/database'
import { format, parseISO } from 'date-fns'

export default function UsersPage() {
  const { profile } = useAuth()
  const [users,   setUsers]   = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole,  setInviteRole]  = useState<'clinician'|'reviewer'>('clinician')
  const [inviting,    setInviting]    = useState(false)
  const [inviteMsg,   setInviteMsg]   = useState('')
  const [error,       setError]       = useState('')

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('organization_id', profile?.organization_id)
      .order('created_at')
    setUsers(data ?? [])
    setLoading(false)
  }

  async function inviteUser(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setInviteMsg(''); setInviting(true)
    // In production this would call a server-side function to send an invitation email
    // For now, we create the auth user via admin API (requires service role key on server)
    setInviteMsg(`Invitation feature requires server-side setup. Please manually create user ${inviteEmail} in Supabase Auth dashboard, then assign them to this organization with role: ${inviteRole}.`)
    setInviting(false)
  }

  async function updateRole(userId: string, newRole: string) {
    await supabase.from('user_profiles').update({ role: newRole }).eq('id', userId)
    loadUsers()
  }

  async function toggleActive(user: UserProfile) {
    await supabase.from('user_profiles').update({ is_active: !user.is_active }).eq('id', user.id)
    loadUsers()
  }

  const ROLE_COLORS: Record<string, string> = {
    admin:     'bg-purple-100 text-purple-700',
    clinician: 'bg-blue-100 text-blue-700',
    reviewer:  'bg-gray-100 text-gray-600',
  }

  return (
    <>
      <Head><title>Users — MDE Platform</title></Head>
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage staff access to the MDE Platform</p>
        </div>

        {/* Invite */}
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-800 mb-4">Invite New User</h2>
          <form onSubmit={inviteUser} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email" required placeholder="Email address" value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)} className="input flex-1"
            />
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as any)} className="input sm:w-40">
              <option value="clinician">Clinician</option>
              <option value="reviewer">Reviewer</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" disabled={inviting} className="btn-primary whitespace-nowrap">
              {inviting ? 'Inviting...' : 'Send Invite'}
            </button>
          </form>
          {inviteMsg && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">{inviteMsg}</p>}
          {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-3">{error}</p>}
        </div>

        {/* Users list */}
        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-hdrbg border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">User</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Role</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT hidden sm:table-cell">Joined</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{u.full_name || 'Unnamed User'}</div>
                      <div className="text-xs text-gray-400">{u.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      {u.id === profile?.id ? (
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[u.role]}`}>{u.role}</span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={e => updateRole(u.id, e.target.value)}
                          className="text-xs border border-gray-200 rounded-md px-2 py-1"
                        >
                          <option value="admin">Admin</option>
                          <option value="clinician">Clinician</option>
                          <option value="reviewer">Reviewer</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell text-xs">
                      {u.created_at ? format(parseISO(u.created_at), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.id !== profile?.id && (
                        <button onClick={() => toggleActive(u)} className="text-xs text-gray-400 hover:text-gray-600">
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
