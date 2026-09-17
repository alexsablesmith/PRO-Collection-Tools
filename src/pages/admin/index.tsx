import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import AdminShell from '@/components/admin/AdminShell'
import Flash, { FlashMessage } from '@/components/admin/Flash'
import { adminFetch } from '@/lib/adminClient'
import { fmtAgo, fmtDate, PLAN_LABELS, STATUS_BADGE } from '@/components/admin/format'
import type { Organization, OrgPlan, OrgStats } from '@/types/database'

type OrgRow = Organization & {
  stats: OrgStats | null
  unlicensed_instruments: string[]
  email_failures_30d: number
}

type Issue = { orgId: string; orgName: string; severity: 'high' | 'medium' | 'low'; text: string }

function issuesFor(o: OrgRow): Issue[] {
  const issues: Issue[] = []
  const add = (severity: Issue['severity'], text: string) => issues.push({ orgId: o.id, orgName: o.name, severity, text })
  const s = o.stats

  if (o.status === 'pending_deletion' && o.deletion_scheduled_for) {
    const days = differenceInCalendarDays(parseISO(o.deletion_scheduled_for), new Date())
    add('high', days <= 0 ? 'Deletion grace period is over; ready to purge' : `Scheduled for deletion in ${days} days`)
  }
  if (o.status !== 'active') return issues

  if (o.unlicensed_instruments.length > 0) {
    add('high', `Enabled without a valid license: ${o.unlicensed_instruments.join(', ')}`)
  }
  if (o.seat_limit != null && s) {
    const used = s.active_users + s.pending_invites
    if (used > o.seat_limit) add('medium', `Over seat limit (${used} of ${o.seat_limit})`)
    else if (used === o.seat_limit) add('low', `All ${o.seat_limit} seats in use`)
  }
  if (o.plan === 'trial' && o.trial_ends_at) {
    const days = differenceInCalendarDays(parseISO(o.trial_ends_at), new Date())
    if (days < 0) add('high', `Trial ended ${fmtDate(o.trial_ends_at)}`)
    else if (days <= 14) add('medium', `Trial ends in ${days} day${days === 1 ? '' : 's'}`)
  }
  if (o.email_failures_30d > 0) {
    add('medium', `${o.email_failures_30d} email${o.email_failures_30d === 1 ? '' : 's'} bounced or failed in the last 30 days`)
  }
  if (s && s.active_users > 0 && s.surveys_sent_30d === 0) {
    add('low', `No surveys sent in 30 days (last activity ${fmtAgo(s.last_survey_at ?? s.last_sign_in_at)})`)
  }
  return issues
}

const SEVERITY_DOT = { high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-gray-400' }

export default function AdminDashboard() {
  const router = useRouter()
  const [orgs,    setOrgs]    = useState<OrgRow[]>([])
  const [loading, setLoading] = useState(true)
  const [flash,   setFlash]   = useState<FlashMessage>(null)
  const [search,  setSearch]  = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | Organization['status']>('active')

  const [showNew, setShowNew] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [form, setForm] = useState({ name: '', plan: 'trial' as OrgPlan, trial_ends_at: '', seat_limit: '' })

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const json = await adminFetch<{ organizations: OrgRow[] }>('/api/admin/organizations')
      setOrgs(json.organizations)
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
    }
    setLoading(false)
  }

  async function createOrg() {
    setSaving(true); setFlash(null)
    try {
      const { organization } = await adminFetch<{ organization: Organization }>('/api/admin/organizations', {
        body: {
          name: form.name,
          plan: form.plan,
          trial_ends_at: form.trial_ends_at || null,
          seat_limit: form.seat_limit ? Number(form.seat_limit) : null,
        },
      })
      router.push(`/admin/organizations/${organization.id}?created=1`)
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
      setSaving(false)
    }
  }

  const issues = useMemo(() => {
    const rank = { high: 0, medium: 1, low: 2 }
    return orgs.flatMap(issuesFor).sort((a, b) => rank[a.severity] - rank[b.severity])
  }, [orgs])

  const totals = useMemo(() => {
    const active = orgs.filter(o => o.status === 'active')
    const sum = (k: keyof OrgStats) => active.reduce((n, o) => n + (Number(o.stats?.[k]) || 0), 0)
    return {
      orgs: active.length,
      users: sum('active_users'),
      pending: sum('pending_invites'),
      sent30: sum('surveys_sent_30d'),
      completed30: sum('surveys_completed_30d'),
    }
  }, [orgs])

  const visible = orgs.filter(o =>
    (statusFilter === 'all' || o.status === statusFilter) &&
    (!search || o.name.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <AdminShell
      title="Organizations"
      subtitle="Every organization on the platform, with usage and anything that needs attention"
      actions={<button onClick={() => setShowNew(true)} className="btn-primary text-sm">+ New Organization</button>}
    >
      <Flash message={flash} onClose={() => setFlash(null)} />

      {showNew && (
        <div className="card mb-6 border-2 border-blue-200">
          <h2 className="font-semibold text-gray-800 mb-1">Create New Organization</h2>
          <p className="text-xs text-gray-500 mb-4">
            Default instruments and default batteries (set under Instruments &amp; Defaults) are added automatically.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="sm:col-span-2">
              <label className="label">Organization name</label>
              <input className="input" placeholder="e.g. Riverside Pain Clinic" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
            <div>
              <label className="label">Plan</label>
              <select className="input" value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value as OrgPlan }))}>
                {Object.entries(PLAN_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Seat limit</label>
              <input className="input" type="number" min={1} placeholder="Unlimited" value={form.seat_limit}
                onChange={e => setForm(f => ({ ...f, seat_limit: e.target.value }))} />
            </div>
            {form.plan === 'trial' && (
              <div>
                <label className="label">Trial ends</label>
                <input className="input" type="date" value={form.trial_ends_at}
                  onChange={e => setForm(f => ({ ...f, trial_ends_at: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">Defaults to 30 days from today</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={createOrg} disabled={saving || !form.name.trim()} className="btn-primary text-sm">
              {saving ? 'Creating...' : 'Create Organization'}
            </button>
            <button onClick={() => setShowNew(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Stat label="Active organizations" value={totals.orgs} />
            <Stat label="Active users" value={totals.users} sub={totals.pending ? `${totals.pending} invites pending` : undefined} />
            <Stat label="Surveys sent, 30 days" value={totals.sent30} />
            <Stat
              label="Completed, 30 days" value={totals.completed30}
              sub={totals.sent30 ? `${Math.round((totals.completed30 / totals.sent30) * 100)}% of sent` : undefined}
            />
          </div>

          {issues.length > 0 && (
            <div className="card mb-6 p-0">
              <h2 className="font-semibold text-gray-800 px-5 pt-4 pb-2">Needs attention</h2>
              <ul className="divide-y divide-gray-100">
                {issues.map((issue, i) => (
                  <li key={i}>
                    <Link href={`/admin/organizations/${issue.orgId}`} className="flex items-start gap-3 px-5 py-2.5 hover:bg-gray-50 text-sm">
                      <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${SEVERITY_DOT[issue.severity]}`} />
                      <span className="font-medium text-gray-900 flex-shrink-0">{issue.orgName}</span>
                      <span className="text-gray-600">{issue.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mb-3">
            <input className="input max-w-xs" placeholder="Search organizations" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="input w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
              <option value="active">Active</option>
              <option value="deactivated">Deactivated</option>
              <option value="pending_deletion">Pending deletion</option>
              <option value="all">All statuses</option>
            </select>
          </div>

          {visible.length === 0 ? (
            <div className="card text-center py-12 text-gray-500">No organizations match.</div>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-hdrbg">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Organization</th>
                    <th className="text-right px-4 py-3 font-semibold text-navy-DEFAULT">Users</th>
                    <th className="text-right px-4 py-3 font-semibold text-navy-DEFAULT">Patients</th>
                    <th className="text-right px-4 py-3 font-semibold text-navy-DEFAULT">Surveys (30d)</th>
                    <th className="text-right px-4 py-3 font-semibold text-navy-DEFAULT">Completion</th>
                    <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((o, i) => {
                    const s = o.stats
                    const badge = STATUS_BADGE[o.status]
                    const lastActivity = [s?.last_survey_at, s?.last_sign_in_at].filter(Boolean).sort().pop() ?? null
                    return (
                      <tr
                        key={o.id}
                        onClick={() => router.push(`/admin/organizations/${o.id}`)}
                        className={`cursor-pointer hover:bg-ltblue ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{o.name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {o.status !== 'active' && <span className={`text-[11px] px-1.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>}
                            <span className="text-xs text-gray-400">
                              {PLAN_LABELS[o.plan]}{o.plan === 'trial' && o.trial_ends_at ? ` until ${fmtDate(o.trial_ends_at)}` : ''}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {s?.active_users ?? 0}{o.seat_limit != null ? <span className="text-gray-400"> / {o.seat_limit}</span> : ''}
                          {!!s?.pending_invites && <div className="text-xs text-gray-400">+{s.pending_invites} invited</div>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{s?.patients ?? 0}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {s?.surveys_sent_30d ?? 0}
                          <div className="text-xs text-gray-400">{s?.surveys_completed_30d ?? 0} completed</div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {s && s.surveys_sent > 0 ? `${Math.round((s.surveys_completed / s.surveys_sent) * 100)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{fmtAgo(lastActivity)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </AdminShell>
  )
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="card py-4">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{value.toLocaleString()}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}
