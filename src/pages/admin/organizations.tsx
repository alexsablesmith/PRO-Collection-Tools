import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Organization } from '@/types/database'
import { format, parseISO } from 'date-fns'

export default function OrganizationsPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const [orgs,    setOrgs]    = useState<(Organization & { user_count: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (profile && profile.role !== 'app_admin') { router.replace('/patients'); return }
    if (profile) loadOrgs()
  }, [profile])

  async function loadOrgs() {
    const { data: orgRows } = await supabase.from('organizations').select('*').order('created_at')
    if (!orgRows) { setLoading(false); return }

    const counts = await Promise.all(
      orgRows.map(async org => {
        const { count } = await supabase
          .from('user_profiles')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', org.id)
        return { ...org, user_count: count ?? 0 }
      })
    )
    setOrgs(counts)
    setLoading(false)
  }

  async function createOrg() {
    if (!newName.trim()) return
    setError(''); setSaving(true)
    const { error } = await supabase.from('organizations').insert({ name: newName.trim() })
    if (error) { setError(error.message); setSaving(false); return }
    setNewName(''); setShowNew(false)
    loadOrgs()
    setSaving(false)
  }

  return (
    <>
      <Head><title>Organizations — Prolix Health</title></Head>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
            <p className="text-gray-500 text-sm mt-0.5">Manage all organizations on the platform</p>
          </div>
          <button onClick={() => setShowNew(true)} className="btn-primary text-sm">+ New Organization</button>
        </div>

        {showNew && (
          <div className="card mb-6 border-2 border-blue-200">
            <h2 className="font-semibold text-gray-800 mb-4">Create New Organization</h2>
            <div className="mb-4">
              <label className="label">Organization Name</label>
              <input
                className="input"
                placeholder="e.g. Riverside Pain Clinic"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createOrg()}
              />
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{error}</div>}
            <div className="flex gap-2">
              <button onClick={createOrg} disabled={saving || !newName.trim()} className="btn-primary text-sm">
                {saving ? 'Creating...' : 'Create Organization'}
              </button>
              <button onClick={() => { setShowNew(false); setNewName(''); setError('') }} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : orgs.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500">No organizations yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orgs.map(org => (
              <div key={org.id} className="card flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{org.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {org.user_count} {org.user_count === 1 ? 'user' : 'users'} ·{' '}
                    Created {org.created_at ? format(parseISO(org.created_at), 'MMM d, yyyy') : ''}
                  </div>
                </div>
                <Link
                  href={`/admin/users?org_id=${org.id}&org_name=${encodeURIComponent(org.name)}`}
                  className="btn-secondary text-sm flex-shrink-0 ml-4"
                >
                  Manage Users
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
