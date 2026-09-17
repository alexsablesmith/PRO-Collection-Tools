import { Fragment, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminClient'
import type { AdminAuditLog } from '@/types/database'
import Flash, { FlashMessage } from '@/components/admin/Flash'
import { fmtDate } from '@/components/admin/format'

const ACTION_GROUPS = [
  { value: '',              label: 'All actions' },
  { value: 'organization.', label: 'Organizations' },
  { value: 'user.',         label: 'Users' },
  { value: 'instrument.',   label: 'Instruments' },
  { value: 'battery_template.', label: 'Default batteries' },
  { value: 'notice.',       label: 'Notices' },
]

function describe(e: AdminAuditLog) {
  const d = e.details as Record<string, any>
  const who = d.full_name || d.email || d.instrument || d.name || d.message
  return [e.action.replace(/[._]/g, ' '), who].filter(Boolean).join(' — ')
}

/** Paginated admin audit trail; `orgId` narrows it to one organization. */
export default function AuditLogTable({ orgId }: { orgId?: string }) {
  const [entries, setEntries] = useState<AdminAuditLog[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [action,  setAction]  = useState('')
  const [from,    setFrom]    = useState('')
  const [to,      setTo]      = useState('')
  const [open,    setOpen]    = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [flash,   setFlash]   = useState<FlashMessage>(null)

  useEffect(() => { load() }, [page, action, from, to, orgId])

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (orgId)  params.set('org_id', orgId)
    if (action) params.set('action', action)
    if (from)   params.set('from', from)
    if (to)     params.set('to', to)
    try {
      const json = await adminFetch<{ entries: AdminAuditLog[]; total: number; page_size: number }>(`/api/admin/audit-log?${params}`)
      setEntries(json.entries); setTotal(json.total); setPageSize(json.page_size)
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
    }
    setLoading(false)
  }

  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div>
      <Flash message={flash} onClose={() => setFlash(null)} />
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <label className="label">Action</label>
          <select className="input w-auto" value={action} onChange={e => { setAction(e.target.value); setPage(0) }}>
            {ACTION_GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input className="input w-auto" type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(0) }} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input w-auto" type="date" value={to} onChange={e => { setTo(e.target.value); setPage(0) }} />
        </div>
        <div className="text-sm text-gray-500 pb-2">{total.toLocaleString()} entries</div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">No audit entries match.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-hdrbg">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">When</th>
                <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Who</th>
                <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">What</th>
                {!orgId && <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Organization</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <Fragment key={e.id}>
                  <tr onClick={() => setOpen(open === e.id ? null : e.id)} className={`cursor-pointer hover:bg-ltblue ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(e.created_at, 'MMM d, yyyy h:mm a')}</td>
                    <td className="px-4 py-2.5 text-gray-700">{e.actor_email ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-900">{describe(e)}</td>
                    {!orgId && <td className="px-4 py-2.5 text-gray-700">{e.organization_name ?? '—'}</td>}
                  </tr>
                  {open === e.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={orgId ? 3 : 4} className="px-4 py-3">
                        <pre className="text-xs text-gray-700 whitespace-pre-wrap break-all">
                          {JSON.stringify({ action: e.action, target: `${e.target_type ?? ''} ${e.target_id ?? ''}`.trim(), ip: e.ip_address, details: e.details }, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-3 text-sm">
          <button className="btn-secondary text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span className="text-gray-500">Page {page + 1} of {pages}</span>
          <button className="btn-secondary text-xs" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  )
}
