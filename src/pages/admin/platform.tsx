import { useEffect, useState } from 'react'
import clsx from 'clsx'
import AdminShell from '@/components/admin/AdminShell'
import Flash, { FlashMessage, resultFlash } from '@/components/admin/Flash'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { adminFetch } from '@/lib/adminClient'
import type { BatteryTemplate, Instrument, Organization } from '@/types/database'

type InstrumentRow = Pick<Instrument, 'id' | 'code' | 'name' | 'version' | 'type' | 'is_active' | 'organization_id' | 'license_required' | 'license_notes' | 'default_enabled'> & {
  enabled_org_count: number
}

export default function PlatformPage() {
  const [instruments, setInstruments] = useState<InstrumentRow[]>([])
  const [orgs,        setOrgs]        = useState<Pick<Organization, 'id' | 'name'>[]>([])
  const [templates,   setTemplates]   = useState<BatteryTemplate[]>([])
  const [loading,     setLoading]     = useState(true)
  const [flash,       setFlash]       = useState<FlashMessage>(null)
  const [licenseEdit, setLicenseEdit] = useState<InstrumentRow | null>(null)
  const [bulk,        setBulk]        = useState<{ row: InstrumentRow; action: 'enable_all' | 'disable_all' } | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<Partial<BatteryTemplate> | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [inst, tmpl] = await Promise.all([
        adminFetch<{ instruments: InstrumentRow[]; organizations: Pick<Organization, 'id' | 'name'>[] }>('/api/admin/instruments'),
        adminFetch<{ templates: BatteryTemplate[] }>('/api/admin/battery-templates'),
      ])
      setInstruments(inst.instruments); setOrgs(inst.organizations); setTemplates(tmpl.templates)
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
    }
    setLoading(false)
  }

  async function call(path: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown, fallback: string) {
    setFlash(null)
    try {
      const r = await adminFetch(path, { method, body })
      setFlash(resultFlash(r, fallback))
      await load()
      return true
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
      return false
    }
  }

  const global = instruments.filter(i => i.organization_id === null)
  const custom = instruments.filter(i => i.organization_id !== null)
  const orgName = (id: string | null) => orgs.find(o => o.id === id)?.name ?? 'Unknown'
  const instName = (id: string) => instruments.find(i => i.id === id)?.name ?? 'Unknown instrument'

  return (
    <AdminShell title="Instruments & Defaults" subtitle="Licensing requirements, what new organizations start with, and ownership of custom instruments">
      <Flash message={flash} onClose={() => setFlash(null)} />

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="font-semibold text-gray-800 mb-1">Library instruments</h2>
            <p className="text-sm text-gray-500 mb-3">
              Mark an instrument as license-required if its copyright holder requires a license for your use.
              Each organization&apos;s license is then tracked on its Instruments tab, and the dashboard flags any organization using it without one.
            </p>
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-hdrbg">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Instrument</th>
                    <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">License required</th>
                    <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">New orgs</th>
                    <th className="text-right px-4 py-3 font-semibold text-navy-DEFAULT">Enabled for</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {global.map((r, i) => (
                    <tr key={r.id} className={clsx(i % 2 === 0 ? 'bg-white' : 'bg-gray-50', !r.is_active && 'opacity-60')}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{r.name}</div>
                        <div className="text-xs text-gray-400">{r.code}{r.version ? ` · ${r.version}` : ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" className="rounded" checked={r.license_required}
                            onChange={e => call('/api/admin/instruments', 'PATCH', { instrument_id: r.id, license_required: e.target.checked }, 'Saved.')} />
                          <button onClick={() => setLicenseEdit(r)} className="text-xs text-blue-600 hover:text-blue-800">
                            {r.license_notes ? 'Edit notes' : 'Add notes'}
                          </button>
                        </label>
                      </td>
                      <td className="px-4 py-3">
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          <input type="checkbox" className="rounded" checked={r.default_enabled}
                            onChange={e => call('/api/admin/instruments', 'PATCH', { instrument_id: r.id, default_enabled: e.target.checked }, 'Saved.')} />
                          Enabled by default
                        </label>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.enabled_org_count} of {orgs.length}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => setBulk({ row: r, action: 'enable_all' })} className="text-xs text-blue-600 hover:text-blue-800 mr-3">Enable all</button>
                        <button onClick={() => setBulk({ row: r, action: 'disable_all' })} className="text-xs text-gray-500 hover:text-gray-800">Disable all</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-800">Default batteries</h2>
              <button onClick={() => setEditingTemplate({ name: '', instrument_ids: [] })} className="btn-primary text-sm">+ New default battery</button>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              Copied into every new organization when it&apos;s created. You can also save any organization&apos;s battery as a default from its Batteries tab.
            </p>
            {templates.length === 0 ? (
              <div className="card text-center py-8 text-gray-500 text-sm">No default batteries yet.</div>
            ) : (
              <div className="space-y-2">
                {templates.map(t => (
                  <div key={t.id} className={clsx('card py-4 flex flex-wrap items-start justify-between gap-3', !t.is_default && 'opacity-60')}>
                    <div>
                      <div className="font-medium text-gray-900">{t.name}{!t.is_default && <span className="text-xs text-gray-500 ml-2">(paused)</span>}</div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {t.instrument_ids.map((iid, i) => (
                          <span key={iid + i} className="text-xs bg-hdrbg text-navy-DEFAULT px-2 py-0.5 rounded">{i + 1}. {instName(iid)}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <button onClick={() => setEditingTemplate(t)} className="text-blue-600 hover:text-blue-800">Edit</button>
                      <button onClick={() => call('/api/admin/battery-templates', 'PATCH', { id: t.id, is_default: !t.is_default }, 'Saved.')} className="text-gray-600 hover:text-gray-900">
                        {t.is_default ? 'Pause' : 'Resume'}
                      </button>
                      <button onClick={() => call(`/api/admin/battery-templates?id=${t.id}`, 'DELETE', undefined, 'Deleted.')} className="text-red-500 hover:text-red-700">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="font-semibold text-gray-800 mb-1">Custom instruments</h2>
            <p className="text-sm text-gray-500 mb-3">
              Surveys built by organizations are private to their owner. Anything created before organization scoping that couldn&apos;t be matched to a single organization is listed under &ldquo;Global&rdquo; in the library above; assign it here if it belongs to one organization.
            </p>
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-hdrbg">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Instrument</th>
                    <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {[...custom, ...global.filter(g => /^(custom|freeform)_/.test(g.code))].map((r, i) => (
                    <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{r.name}</div>
                        <div className="text-xs text-gray-400">{r.code}</div>
                      </td>
                      <td className="px-4 py-3">
                        <select className="input w-auto" value={r.organization_id ?? ''}
                          onChange={e => call('/api/admin/instruments', 'PATCH', { instrument_id: r.id, organization_id: e.target.value || null },
                            e.target.value ? `${r.name} assigned to ${orgName(e.target.value)}.` : `${r.name} is now a global library instrument.`)}>
                          <option value="">Global (all organizations)</option>
                          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {licenseEdit && <LicenseNotesDialog row={licenseEdit} onCancel={() => setLicenseEdit(null)}
        onSave={async notes => { if (await call('/api/admin/instruments', 'PATCH', { instrument_id: licenseEdit.id, license_notes: notes }, 'Notes saved.')) setLicenseEdit(null) }} />}

      {bulk && (
        <ConfirmDialog
          title={`${bulk.action === 'enable_all' ? 'Enable' : 'Disable'} ${bulk.row.name} for every organization?`}
          confirmLabel={bulk.action === 'enable_all' ? 'Enable for all' : 'Disable for all'}
          danger={bulk.action === 'disable_all'}
          body={bulk.action === 'disable_all'
            ? 'Batteries that include it can no longer be sent until it is re-enabled. Surveys already sent can still be completed.'
            : bulk.row.license_required ? 'This instrument requires a license. Organizations without one will be flagged on the dashboard.' : 'Every organization will be able to add it to batteries.'}
          onCancel={() => setBulk(null)}
          onConfirm={async () => { await call('/api/admin/instruments', 'POST', { instrument_id: bulk.row.id, action: bulk.action }, 'Done.'); setBulk(null) }}
        />
      )}

      {editingTemplate && (
        <TemplateDialog
          template={editingTemplate}
          instruments={global.filter(i => i.is_active)}
          onCancel={() => setEditingTemplate(null)}
          onSave={async (name, ids) => {
            const ok = editingTemplate.id
              ? await call('/api/admin/battery-templates', 'PATCH', { id: editingTemplate.id, name, instrument_ids: ids }, 'Default battery saved.')
              : await call('/api/admin/battery-templates', 'POST', { name, instrument_ids: ids }, 'Default battery created.')
            if (ok) setEditingTemplate(null)
          }}
        />
      )}
    </AdminShell>
  )
}

function LicenseNotesDialog({ row, onCancel, onSave }: { row: InstrumentRow; onCancel: () => void; onSave: (notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState(row.license_notes ?? '')
  return (
    <ConfirmDialog
      title={`${row.name}: licensing notes`}
      confirmLabel="Save"
      body={
        <>
          <p>Who grants the license, fees, and how to request one. Shown when editing an organization&apos;s license.</p>
          <textarea className="input" rows={5} value={notes} onChange={e => setNotes(e.target.value)} />
        </>
      }
      onCancel={onCancel}
      onConfirm={() => onSave(notes)}
    />
  )
}

function TemplateDialog({ template, instruments, onCancel, onSave }: {
  template: Partial<BatteryTemplate>
  instruments: InstrumentRow[]
  onCancel: () => void
  onSave: (name: string, ids: string[]) => Promise<void>
}) {
  const [name, setName] = useState(template.name ?? '')
  const [ids,  setIds]  = useState<string[]>(template.instrument_ids ?? [])
  const toggle = (id: string) => setIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  return (
    <ConfirmDialog
      title={template.id ? 'Edit default battery' : 'New default battery'}
      confirmLabel="Save"
      body={
        <>
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Spine Intake" />
          </div>
          <label className="label mt-3">Instruments (in order selected)</label>
          <div className="max-h-64 overflow-y-auto space-y-1 border border-gray-100 rounded-lg p-2">
            {instruments.map(i => (
              <label key={i.id} className="flex items-center gap-2 text-sm py-0.5">
                <input type="checkbox" className="rounded" checked={ids.includes(i.id)} onChange={() => toggle(i.id)} />
                <span className="flex-1">{i.name}</span>
                {ids.includes(i.id) && <span className="text-xs font-mono text-navy-DEFAULT">#{ids.indexOf(i.id) + 1}</span>}
              </label>
            ))}
          </div>
        </>
      }
      onCancel={onCancel}
      onConfirm={() => onSave(name, ids)}
    />
  )
}
