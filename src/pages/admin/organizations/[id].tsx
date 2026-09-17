import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import clsx from 'clsx'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import AdminShell from '@/components/admin/AdminShell'
import Flash, { FlashMessage, resultFlash } from '@/components/admin/Flash'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import OrgUsersPanel from '@/components/admin/OrgUsersPanel'
import AuditLogTable from '@/components/admin/AuditLogTable'
import { adminFetch } from '@/lib/adminClient'
import { fmtAgo, fmtDate, PLAN_LABELS, STATUS_BADGE } from '@/components/admin/format'
import type { Instrument, LicenseStatus, Organization, OrganizationInstrument, OrgStats } from '@/types/database'

const TABS = [
  { key: 'overview',    label: 'Overview' },
  { key: 'users',       label: 'Users' },
  { key: 'instruments', label: 'Instruments' },
  { key: 'batteries',   label: 'Batteries' },
  { key: 'settings',    label: 'Settings' },
  { key: 'data',        label: 'Data & Lifecycle' },
  { key: 'activity',    label: 'Activity' },
] as const
type TabKey = typeof TABS[number]['key']

export default function OrganizationDetailPage() {
  const router = useRouter()
  const id = router.query.id as string | undefined
  const tab = ((router.query.tab as TabKey) || 'overview')

  const [org,      setOrg]      = useState<Organization | null>(null)
  const [stats,    setStats]    = useState<OrgStats | null>(null)
  const [isOwnOrg, setIsOwnOrg] = useState(false)
  const [allOrgs,  setAllOrgs]  = useState<Pick<Organization, 'id' | 'name' | 'status'>[]>([])
  const [flash,    setFlash]    = useState<FlashMessage>(null)
  const [loading,  setLoading]  = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [newName,  setNewName]  = useState('')

  useEffect(() => {
    if (!id) return
    load()
    adminFetch<{ organizations: Organization[] }>('/api/admin/organizations')
      .then(j => setAllOrgs(j.organizations))
      .catch(() => {})
    if (router.query.created) setFlash({ type: 'success', text: 'Organization created. Invite its first user from the Users tab.' })
  }, [id])

  async function load() {
    try {
      const json = await adminFetch<{ organization: Organization; stats: OrgStats | null; is_own_org: boolean }>(
        `/api/admin/organizations/${id}`
      )
      setOrg(json.organization); setStats(json.stats); setIsOwnOrg(json.is_own_org)
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
    }
    setLoading(false)
  }

  async function rename() {
    setFlash(null)
    try {
      const { organization } = await adminFetch<{ organization: Organization }>(
        `/api/admin/organizations/${id}`, { method: 'PATCH', body: { name: newName } }
      )
      setOrg(organization)
      setFlash({ type: 'success', text: `Renamed to ${organization.name}.` })
      setRenaming(false)
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
    }
  }

  function setTab(key: TabKey) {
    router.replace({ pathname: router.pathname, query: { id, tab: key } }, undefined, { shallow: true })
  }

  if (loading || !id) return <AdminShell title="Organization"><div className="text-center py-12 text-gray-400">Loading...</div></AdminShell>
  if (!org) return <AdminShell title="Organization"><Flash message={flash} /></AdminShell>

  const badge = STATUS_BADGE[org.status]

  return (
    <AdminShell
      title={org.name}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
          <span>{PLAN_LABELS[org.plan]} plan</span>
          <span>· Created {fmtDate(org.created_at)}</span>
          {isOwnOrg && <span className="text-purple-700">· Your organization</span>}
        </span>
      }
      actions={
        <>
          <button onClick={() => { setNewName(org.name); setRenaming(true) }} className="btn-secondary text-sm">Rename</button>
          <Link href="/admin" className="btn-secondary text-sm">← All organizations</Link>
        </>
      }
    >
      <Flash message={flash} onClose={() => setFlash(null)} />

      {org.status !== 'active' && (
        <div className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700 mb-4">
          {org.status === 'deactivated'
            ? `Deactivated ${fmtDate(org.deactivated_at)}. Users can't sign in and survey links are paused.`
            : `Scheduled for permanent deletion on ${fmtDate(org.deletion_scheduled_for)}.`}
        </div>
      )}

      <div className="flex gap-1 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap',
              tab === t.key ? 'bg-navy-DEFAULT text-white' : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview'    && <OverviewTab org={org} stats={stats} />}
      {tab === 'users'       && <OrgUsersPanel orgId={org.id} organizations={allOrgs} />}
      {tab === 'instruments' && <InstrumentsTab orgId={org.id} />}
      {tab === 'batteries'   && <BatteriesTab orgId={org.id} />}
      {tab === 'settings'    && <SettingsTab key={org.name} org={org} onSaved={o => { setOrg(o); setFlash({ type: 'success', text: 'Settings saved.' }) }} onError={t => setFlash({ type: 'error', text: t })} />}
      {tab === 'data'        && <DataTab org={org} isOwnOrg={isOwnOrg} stats={stats} onChanged={load} setFlash={setFlash} />}
      {tab === 'activity'    && <AuditLogTable orgId={org.id} />}

      {renaming && (
        <ConfirmDialog
          title="Rename organization"
          confirmLabel="Save name"
          body={
            <>
              <input
                className="input" value={newName} autoFocus
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && newName.trim() && rename()}
              />
              <p className="text-xs text-gray-400">
                Patients see the patient-facing name from Settings if one is set; otherwise they see this name.
              </p>
            </>
          }
          onCancel={() => setRenaming(false)}
          onConfirm={rename}
        />
      )}
    </AdminShell>
  )
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewTab({ org, stats }: { org: Organization; stats: OrgStats | null }) {
  const s = stats
  const rows: [string, React.ReactNode][] = [
    ['Active users', `${s?.active_users ?? 0}${org.seat_limit != null ? ` of ${org.seat_limit} seats` : ''}`],
    ['Pending invites', s?.pending_invites ?? 0],
    ['Deactivated users', s?.deactivated_users ?? 0],
    ['Patients', s?.patients ?? 0],
    ['Surveys sent', `${s?.surveys_sent ?? 0} total · ${s?.surveys_sent_30d ?? 0} in last 30 days`],
    ['Surveys completed', `${s?.surveys_completed ?? 0} total · ${s?.surveys_completed_30d ?? 0} in last 30 days`],
    ['Completion rate', s && s.surveys_sent > 0 ? `${Math.round((s.surveys_completed / s.surveys_sent) * 100)}%` : '—'],
    ['Last survey activity', fmtAgo(s?.last_survey_at)],
    ['Last user sign-in', fmtAgo(s?.last_sign_in_at)],
  ]
  const trialDays = org.plan === 'trial' && org.trial_ends_at
    ? differenceInCalendarDays(parseISO(org.trial_ends_at), new Date())
    : null

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="card lg:col-span-2 p-0">
        <h2 className="font-semibold text-gray-800 px-5 pt-4 pb-2">Usage</h2>
        <dl className="divide-y divide-gray-100 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between px-5 py-2.5">
              <dt className="text-gray-500">{k}</dt>
              <dd className="text-gray-900 font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="space-y-4">
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-3">Plan</h2>
          <div className="text-sm space-y-1">
            <div>{PLAN_LABELS[org.plan]}</div>
            {trialDays !== null && (
              <div className={trialDays < 0 ? 'text-red-600' : trialDays <= 14 ? 'text-amber-700' : 'text-gray-500'}>
                {trialDays < 0 ? `Trial ended ${fmtDate(org.trial_ends_at)}` : `Trial ends ${fmtDate(org.trial_ends_at)} (${trialDays} days)`}
              </div>
            )}
            {org.billing_notes && <p className="text-gray-500 whitespace-pre-line">{org.billing_notes}</p>}
          </div>
        </div>
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-3">Contact</h2>
          <div className="text-sm space-y-1 text-gray-700">
            <div>{org.contact_name || <span className="text-gray-400">No contact on file</span>}</div>
            {org.contact_email && <div><a className="text-blue-600 hover:underline" href={`mailto:${org.contact_email}`}>{org.contact_email}</a></div>}
            {org.contact_phone && <div>{org.contact_phone}</div>}
          </div>
        </div>
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-3">Security</h2>
          <ul className="text-sm space-y-1 text-gray-700">
            <li>2FA {org.require_mfa ? 'required' : 'not required'}</li>
            <li>{org.session_timeout_minutes ? `Signs out after ${org.session_timeout_minutes} min idle` : 'No idle timeout'}</li>
            <li>{org.allowed_email_domains.length ? `Invites limited to ${org.allowed_email_domains.map(d => '@' + d).join(', ')}` : 'Invites to any email domain'}</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

// ── Instruments ───────────────────────────────────────────────────────────────

type InstrumentRow = Pick<Instrument, 'id' | 'code' | 'name' | 'version' | 'type' | 'is_active' | 'organization_id' | 'license_required' | 'license_notes' | 'default_enabled'> & {
  access: OrganizationInstrument | null
}

function InstrumentsTab({ orgId }: { orgId: string }) {
  const [rows,    setRows]    = useState<InstrumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [flash,   setFlash]   = useState<FlashMessage>(null)
  const [editing, setEditing] = useState<InstrumentRow | null>(null)

  useEffect(() => { load() }, [orgId])

  async function load() {
    try {
      const json = await adminFetch<{ instruments: InstrumentRow[] }>(`/api/admin/organizations/${orgId}/instruments`)
      setRows(json.instruments)
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
    }
    setLoading(false)
  }

  async function save(instrument_id: string, patch: Partial<OrganizationInstrument>) {
    setFlash(null)
    try {
      await adminFetch(`/api/admin/organizations/${orgId}/instruments`, { method: 'PUT', body: { instrument_id, ...patch } })
      await load()
      return true
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
      return false
    }
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const licenseProblem = (r: InstrumentRow) =>
    r.license_required && r.access?.enabled &&
    !(r.access.license_status === 'licensed' && (!r.access.license_expires_on || r.access.license_expires_on >= today))

  const custom = rows.filter(r => r.organization_id === orgId)
  const global = rows.filter(r => r.organization_id === null)

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>

  return (
    <div>
      <Flash message={flash} onClose={() => setFlash(null)} />
      <p className="text-sm text-gray-500 mb-4">
        Only enabled instruments can be added to this organization&apos;s batteries or sent to patients. Surveys already sent can still be completed.
      </p>

      <div className="card overflow-x-auto p-0 mb-6">
        <table className="w-full text-sm">
          <thead className="bg-hdrbg">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Enabled</th>
              <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Instrument</th>
              <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">License</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {global.map((r, i) => (
              <tr key={r.id} className={clsx(i % 2 === 0 ? 'bg-white' : 'bg-gray-50', !r.is_active && 'opacity-60')}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox" className="rounded w-4 h-4"
                    checked={!!r.access?.enabled}
                    onChange={e => save(r.id, { enabled: e.target.checked })}
                    aria-label={`Enable ${r.name}`}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{r.name}</div>
                  <div className="text-xs text-gray-400">{r.code}{r.version ? ` · ${r.version}` : ''}{!r.is_active ? ' · retired platform-wide' : ''}</div>
                </td>
                <td className="px-4 py-3">
                  {r.license_required ? (
                    <div>
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium',
                        licenseProblem(r) ? 'bg-red-100 text-red-700'
                          : r.access?.license_status === 'licensed' ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600')}>
                        {r.access?.license_status === 'licensed'
                          ? (r.access.license_expires_on && r.access.license_expires_on < today ? 'License expired' : 'Licensed')
                          : r.access?.license_status === 'pending' ? 'License pending' : 'No license on file'}
                      </span>
                      {r.access?.license_expires_on && <div className="text-xs text-gray-400 mt-0.5">Expires {fmtDate(r.access.license_expires_on)}</div>}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Not required</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.license_required && (
                    <button onClick={() => setEditing(r)} className="text-xs text-blue-600 hover:text-blue-800">Edit license</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="font-semibold text-gray-800 mb-2">Custom instruments</h3>
      {custom.length === 0 ? (
        <p className="text-sm text-gray-500">This organization hasn&apos;t built any custom surveys.</p>
      ) : (
        <ul className="card p-0 divide-y divide-gray-100 text-sm">
          {custom.map(r => (
            <li key={r.id} className="px-4 py-2.5 flex justify-between">
              <span className="font-medium text-gray-900">{r.name}</span>
              <span className="text-xs text-gray-400">Private to this organization · always available</span>
            </li>
          ))}
        </ul>
      )}

      {editing && <LicenseDialog row={editing} onCancel={() => setEditing(null)} onSave={async patch => { if (await save(editing.id, patch)) setEditing(null) }} />}
    </div>
  )
}

function LicenseDialog({ row, onCancel, onSave }: {
  row: InstrumentRow
  onCancel: () => void
  onSave: (patch: Partial<OrganizationInstrument>) => Promise<void>
}) {
  const [status,    setStatus]    = useState<LicenseStatus>(row.access?.license_status ?? 'none')
  const [reference, setReference] = useState(row.access?.license_reference ?? '')
  const [expires,   setExpires]   = useState(row.access?.license_expires_on ?? '')

  return (
    <ConfirmDialog
      title={`${row.name} license`}
      confirmLabel="Save"
      body={
        <div className="space-y-3">
          {row.license_notes && <p className="text-xs bg-gray-50 rounded p-2 whitespace-pre-line">{row.license_notes}</p>}
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={e => setStatus(e.target.value as LicenseStatus)}>
              <option value="none">No license on file</option>
              <option value="pending">Requested / pending</option>
              <option value="licensed">Licensed</option>
            </select>
          </div>
          <div>
            <label className="label">Agreement reference</label>
            <input className="input" placeholder="e.g. Mapi agreement #12345" value={reference} onChange={e => setReference(e.target.value)} />
          </div>
          <div>
            <label className="label">Expires</label>
            <input className="input" type="date" value={expires} onChange={e => setExpires(e.target.value)} />
          </div>
        </div>
      }
      onCancel={onCancel}
      onConfirm={() => onSave({ license_status: status, license_reference: reference, license_expires_on: expires || null })}
    />
  )
}

// ── Batteries ─────────────────────────────────────────────────────────────────

type BatteryRow = {
  id: string; name: string; is_active: boolean; created_at: string
  instruments: { id: string; name: string; available: boolean }[]
}

function BatteriesTab({ orgId }: { orgId: string }) {
  const [rows,    setRows]    = useState<BatteryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [flash,   setFlash]   = useState<FlashMessage>(null)

  useEffect(() => {
    adminFetch<{ batteries: BatteryRow[] }>(`/api/admin/organizations/${orgId}/batteries`)
      .then(j => setRows(j.batteries))
      .catch(e => setFlash({ type: 'error', text: e.message }))
      .finally(() => setLoading(false))
  }, [orgId])

  async function saveAsDefault(b: BatteryRow) {
    setFlash(null)
    try {
      const r = await adminFetch(`/api/admin/organizations/${orgId}/batteries`, { body: { battery_id: b.id } })
      setFlash(resultFlash(r, 'Saved as a platform default.'))
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>

  return (
    <div>
      <Flash message={flash} onClose={() => setFlash(null)} />
      <p className="text-sm text-gray-500 mb-4">
        Read-only view of this organization&apos;s batteries. Org admins create and edit batteries from their own Batteries page.
      </p>
      {rows.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">No batteries yet.</div>
      ) : (
        <div className="space-y-3">
          {rows.map(b => {
            const blocked = b.instruments.filter(i => !i.available)
            return (
              <div key={b.id} className={clsx('card', !b.is_active && 'opacity-60')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{b.name}</h3>
                      {!b.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {b.instruments.map((inst, i) => (
                        <span key={inst.id + i} className={clsx('text-xs px-2 py-0.5 rounded', inst.available ? 'bg-hdrbg text-navy-DEFAULT' : 'bg-red-50 text-red-700 line-through')}>
                          {i + 1}. {inst.name}
                        </span>
                      ))}
                    </div>
                    {b.is_active && blocked.length > 0 && (
                      <p className="text-xs text-red-700 mt-2">Can&apos;t be sent: {blocked.map(i => i.name).join(', ')} not enabled.</p>
                    )}
                  </div>
                  <button onClick={() => saveAsDefault(b)} className="btn-secondary text-xs">Save as platform default</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Settings ──────────────────────────────────────────────────────────────────

const TIMEZONES = [
  'America/Los_Angeles', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/New_York',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Puerto_Rico',
]

function SettingsTab({ org, onSaved, onError }: {
  org: Organization
  onSaved: (o: Organization) => void
  onError: (text: string) => void
}) {
  const [form, setForm] = useState({
    name:                    org.name,
    display_name:            org.display_name ?? '',
    logo_url:                org.logo_url ?? '',
    contact_name:            org.contact_name ?? '',
    contact_email:           org.contact_email ?? '',
    contact_phone:           org.contact_phone ?? '',
    timezone:                org.timezone,
    default_language:        org.default_language,
    require_mfa:             org.require_mfa,
    session_timeout_minutes: org.session_timeout_minutes?.toString() ?? '',
    allowed_email_domains:   org.allowed_email_domains.join(', '),
    plan:                    org.plan,
    trial_ends_at:           org.trial_ends_at ?? '',
    seat_limit:              org.seat_limit?.toString() ?? '',
    billing_notes:           org.billing_notes ?? '',
  })
  const [saving, setSaving] = useState<string | null>(null)
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  async function save(section: string, keys: (keyof typeof form)[]) {
    setSaving(section)
    const body: Record<string, unknown> = {}
    for (const k of keys) body[k] = form[k]
    if ('allowed_email_domains' in body) {
      body.allowed_email_domains = form.allowed_email_domains.split(/[\s,]+/).filter(Boolean)
    }
    try {
      const { organization } = await adminFetch<{ organization: Organization }>(`/api/admin/organizations/${org.id}`, { method: 'PATCH', body })
      onSaved(organization)
    } catch (e: any) {
      onError(e.message)
    }
    setSaving(null)
  }

  const SaveButton = ({ section, keys }: { section: string; keys: (keyof typeof form)[] }) => (
    <button onClick={() => save(section, keys)} disabled={saving !== null} className="btn-primary text-sm mt-4">
      {saving === section ? 'Saving…' : 'Save'}
    </button>
  )

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <section className="card">
        <h2 className="font-semibold text-gray-800 mb-4">Profile &amp; branding</h2>
        <div className="space-y-3">
          <Field label="Organization name" hint="Internal name, shown to staff and in the admin dashboard">
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="Patient-facing name" hint="Shown on survey pages and PDF reports. Defaults to the organization name.">
            <input className="input" value={form.display_name} placeholder={form.name} onChange={e => set('display_name', e.target.value)} />
          </Field>
          <Field label="Logo URL" hint="An https:// link to a small PNG or SVG, shown on survey pages">
            <input className="input" value={form.logo_url} placeholder="https://" onChange={e => set('logo_url', e.target.value)} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Time zone">
              <select className="input" value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                {Array.from(new Set([form.timezone, ...TIMEZONES])).map(tz => <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Default survey language">
              <select className="input" value={form.default_language} onChange={e => set('default_language', e.target.value)}>
                <option value="en">English</option>
                <option value="es">Spanish</option>
              </select>
            </Field>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Contact name"><input className="input" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} /></Field>
            <Field label="Contact email"><input className="input" type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} /></Field>
            <Field label="Contact phone"><input className="input" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} /></Field>
          </div>
        </div>
        <SaveButton section="profile" keys={['name', 'display_name', 'logo_url', 'timezone', 'default_language', 'contact_name', 'contact_email', 'contact_phone']} />
      </section>

      <div className="space-y-4">
        <section className="card">
          <h2 className="font-semibold text-gray-800 mb-4">Security policy</h2>
          <div className="space-y-3">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="rounded mt-0.5" checked={form.require_mfa} onChange={e => set('require_mfa', e.target.checked)} />
              <span>
                <span className="font-medium text-gray-800">Require two-factor authentication</span>
                <span className="block text-xs text-gray-500">Users without 2FA are sent to enrollment and can&apos;t read data until they finish.</span>
              </span>
            </label>
            <Field label="Idle timeout (minutes)" hint="Sign users out after this long without activity. Leave blank for no timeout. HIPAA guidance suggests 15–30.">
              <input className="input" type="number" min={5} max={1440} value={form.session_timeout_minutes} onChange={e => set('session_timeout_minutes', e.target.value)} />
            </Field>
            <Field label="Allowed email domains" hint="Comma-separated, e.g. riversidepain.com. Leave blank to allow any domain.">
              <input className="input" value={form.allowed_email_domains} onChange={e => set('allowed_email_domains', e.target.value)} />
            </Field>
          </div>
          <SaveButton section="security" keys={['require_mfa', 'session_timeout_minutes', 'allowed_email_domains']} />
        </section>

        <section className="card">
          <h2 className="font-semibold text-gray-800 mb-4">Plan</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Plan">
              <select className="input" value={form.plan} onChange={e => set('plan', e.target.value)}>
                {Object.entries(PLAN_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Trial ends">
              <input className="input" type="date" value={form.trial_ends_at} disabled={form.plan !== 'trial'} onChange={e => set('trial_ends_at', e.target.value)} />
            </Field>
            <Field label="Seat limit">
              <input className="input" type="number" min={1} placeholder="Unlimited" value={form.seat_limit} onChange={e => set('seat_limit', e.target.value)} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Billing notes">
              <textarea className="input" rows={3} value={form.billing_notes} onChange={e => set('billing_notes', e.target.value)} />
            </Field>
          </div>
          <SaveButton section="plan" keys={['plan', 'trial_ends_at', 'seat_limit', 'billing_notes']} />
        </section>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

// ── Data & lifecycle ──────────────────────────────────────────────────────────

const EXPORT_TABLES = [
  'organization', 'users', 'patients', 'clinical_events', 'batteries', 'custom_instruments',
  'instrument_access', 'survey_requests', 'survey_responses', 'report_audit_log',
]

function DataTab({ org, isOwnOrg, stats, onChanged, setFlash }: {
  org: Organization
  isOwnOrg: boolean
  stats: OrgStats | null
  onChanged: () => Promise<void>
  setFlash: (f: FlashMessage) => void
}) {
  const [exporting, setExporting] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'deactivate' | 'schedule' | 'purge' | null>(null)

  async function lifecycle(action: string, confirm_name?: string) {
    setFlash(null)
    try {
      const r = await adminFetch(`/api/admin/organizations/${org.id}/lifecycle`, { body: { action, confirm_name } })
      setFlash(resultFlash(r, 'Done.'))
      if (action === 'purge') { window.location.href = '/admin'; return }
      await onChanged()
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
    }
    setDialog(null)
  }

  async function exportAll() {
    setFlash(null)
    const data: Record<string, unknown[]> = {}
    try {
      for (const table of EXPORT_TABLES) {
        data[table] = []
        let offset: number | null = 0
        while (offset !== null) {
          setExporting(`${table.replace(/_/g, ' ')} (${data[table].length})`)
          const page: { rows: unknown[]; next_offset: number | null } =
            await adminFetch(`/api/admin/organizations/${org.id}/export?table=${table}&offset=${offset}`)
          data[table].push(...page.rows)
          offset = page.next_offset
        }
      }

      const slug = org.name.replace(/[^a-z0-9]+/gi, '_')
      const stamp = format(new Date(), 'yyyyMMdd')

      // Lossless JSON (item-level answers, pain drawings, etc.)
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = `${slug}_export_${stamp}.json`; a.click()

      // Human-readable workbook, one sheet per table
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      for (const [table, rows] of Object.entries(data)) {
        const flat = (rows as Record<string, unknown>[]).map(r => Object.fromEntries(
          Object.entries(r).map(([k, v]) => {
            if (v === null || typeof v !== 'object') return [k, v]
            const s = JSON.stringify(v)
            return [k, s.length > 32000 ? s.slice(0, 32000) + '… [truncated, see JSON export]' : s]
          })
        ))
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat.length ? flat : [{}]), table.slice(0, 31))
      }
      XLSX.writeFile(wb, `${slug}_export_${stamp}.xlsx`)

      setFlash({ type: 'success', text: 'Export downloaded (JSON with complete data, plus an Excel workbook). This export was recorded in the audit log.' })
    } catch (e: any) {
      setFlash({ type: 'error', text: `Export failed: ${e.message}` })
    }
    setExporting(null)
  }

  const graceOver = org.deletion_scheduled_for ? new Date(org.deletion_scheduled_for) <= new Date() : false
  const patients = stats?.patients ?? 0

  return (
    <div className="space-y-4 max-w-3xl">
      <section className="card">
        <h2 className="font-semibold text-gray-800 mb-1">Export all data</h2>
        <p className="text-sm text-gray-500 mb-4">
          Everything this organization owns: users, patients, surveys, item-level responses, batteries, and custom instruments.
          Use this when an organization leaves or for a records request. Downloads contain PHI; store them securely.
        </p>
        <button onClick={exportAll} disabled={exporting !== null} className="btn-primary text-sm">
          {exporting ? `Exporting ${exporting}…` : 'Export organization data'}
        </button>
      </section>

      <section className="card border-red-100">
        <h2 className="font-semibold text-gray-800 mb-1">Status</h2>

        {org.status === 'active' && (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Deactivating signs out every user immediately, blocks sign-in, and pauses outstanding survey links. Nothing is deleted, and you can reactivate at any time.
            </p>
            <button onClick={() => setDialog('deactivate')} disabled={isOwnOrg} className="btn-danger text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title={isOwnOrg ? "You can't deactivate your own organization" : undefined}>
              Deactivate organization
            </button>
          </>
        )}

        {org.status === 'deactivated' && (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Reactivate to restore access, or schedule permanent deletion.
              {patients > 0
                ? ` Deletion has a 30-day grace period because this organization has ${patients} patient${patients === 1 ? '' : 's'}. Export the data first.`
                : ' This organization has no patients, so it can be purged immediately after scheduling.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => lifecycle('reactivate')} className="btn-primary text-sm">Reactivate</button>
              <button onClick={() => setDialog('schedule')} className="btn-danger text-sm">Schedule deletion</button>
            </div>
          </>
        )}

        {org.status === 'pending_deletion' && (
          <>
            <p className="text-sm text-gray-500 mb-4">
              {graceOver
                ? 'The grace period is over. Purging permanently deletes all of this organization\'s data and user accounts. The admin audit log is kept.'
                : `Data can be purged after ${fmtDate(org.deletion_scheduled_for, 'MMM d, yyyy h:mm a')}. Until then you can cancel.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => lifecycle('cancel_deletion')} className="btn-secondary text-sm">Cancel deletion</button>
              <button onClick={() => lifecycle('reactivate')} className="btn-primary text-sm">Reactivate</button>
              <button onClick={() => setDialog('purge')} disabled={!graceOver} className="btn-danger text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                Purge permanently
              </button>
            </div>
          </>
        )}
      </section>

      {dialog === 'deactivate' && (
        <ConfirmDialog
          title={`Deactivate ${org.name}?`} confirmLabel="Deactivate" danger
          body={<p>All {stats?.active_users ?? 0} active users are signed out now and can&apos;t sign back in. Patients with open survey links will see that the survey is unavailable.</p>}
          onCancel={() => setDialog(null)} onConfirm={() => lifecycle('deactivate')}
        />
      )}
      {dialog === 'schedule' && (
        <ConfirmDialog
          title={`Schedule deletion of ${org.name}?`} confirmLabel="Schedule deletion" danger confirmText={org.name}
          body={<p>{patients > 0 ? 'After 30 days you will be able to purge all data. You can cancel any time before purging.' : 'You will be able to purge right away.'}</p>}
          onCancel={() => setDialog(null)} onConfirm={typed => lifecycle('schedule_deletion', typed)}
        />
      )}
      {dialog === 'purge' && (
        <ConfirmDialog
          title={`Permanently delete ${org.name}?`} confirmLabel="Purge all data" danger confirmText={org.name}
          body={<p>This deletes {patients} patient{patients === 1 ? '' : 's'}, all survey data, batteries, custom instruments, and every user account in the organization. <strong>This cannot be undone.</strong></p>}
          onCancel={() => setDialog(null)} onConfirm={typed => lifecycle('purge', typed)}
        />
      )}
    </div>
  )
}
