import { useEffect, useState } from 'react'
import AdminShell from '@/components/admin/AdminShell'
import Flash, { FlashMessage } from '@/components/admin/Flash'
import { adminFetch } from '@/lib/adminClient'
import { fmtDate } from '@/components/admin/format'
import type { EmailLog, Organization } from '@/types/database'

const STATUS_BADGE: Record<string, string> = {
  sent:             'bg-gray-100 text-gray-600',
  delivered:        'bg-green-100 text-green-700',
  delivery_delayed: 'bg-amber-100 text-amber-800',
  bounced:          'bg-red-100 text-red-700',
  complained:       'bg-red-100 text-red-700',
  failed:           'bg-red-100 text-red-700',
}

export default function EmailDeliveryPage() {
  const [emails,   setEmails]   = useState<EmailLog[]>([])
  const [orgs,     setOrgs]     = useState<Pick<Organization, 'id' | 'name'>[]>([])
  const [total,    setTotal]    = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [page,     setPage]     = useState(0)
  const [orgId,    setOrgId]    = useState('')
  const [problems, setProblems] = useState(false)
  const [webhook,  setWebhook]  = useState(true)
  const [loading,  setLoading]  = useState(true)
  const [flash,    setFlash]    = useState<FlashMessage>(null)

  useEffect(() => { load() }, [page, orgId, problems])

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (orgId) params.set('org_id', orgId)
    if (problems) params.set('problems', '1')
    try {
      const j = await adminFetch<{ emails: EmailLog[]; total: number; page_size: number; webhook_configured: boolean; organizations: Pick<Organization, 'id' | 'name'>[] }>(
        `/api/admin/email-log?${params}`
      )
      setEmails(j.emails); setTotal(j.total); setPageSize(j.page_size); setWebhook(j.webhook_configured); setOrgs(j.organizations)
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
    }
    setLoading(false)
  }

  const orgName = (id: string | null) => orgs.find(o => o.id === id)?.name ?? '—'
  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <AdminShell title="Email Delivery" subtitle="Invites and other emails sent through Resend, with delivery status">
      <Flash message={flash} onClose={() => setFlash(null)} />

      {!webhook && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-3 mb-4">
          Delivery tracking isn&apos;t connected, so emails will stay at &ldquo;sent&rdquo;. In Resend → Webhooks, add
          <code className="mx-1 bg-white px-1 rounded">/api/webhooks/resend</code>
          on your site URL with the delivered, delayed, bounced, and complained events, then set
          <code className="mx-1 bg-white px-1 rounded">RESEND_WEBHOOK_SECRET</code> in Vercel.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <select className="input w-auto" value={orgId} onChange={e => { setOrgId(e.target.value); setPage(0) }}>
          <option value="">All organizations</option>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" className="rounded" checked={problems} onChange={e => { setProblems(e.target.checked); setPage(0) }} />
          Only problems
        </label>
        <span className="text-sm text-gray-500">{total.toLocaleString()} emails</span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : emails.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">No emails match.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-hdrbg">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Sent</th>
                <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Recipient</th>
                <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Type</th>
                <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Organization</th>
                <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Status</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((e, i) => (
                <tr key={e.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(e.created_at, 'MMM d, yyyy h:mm a')}</td>
                  <td className="px-4 py-2.5 text-gray-900">{e.recipient}</td>
                  <td className="px-4 py-2.5 text-gray-700 capitalize">{e.email_type}</td>
                  <td className="px-4 py-2.5 text-gray-700">{orgName(e.organization_id)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[e.status]}`}>{e.status.replace('_', ' ')}</span>
                    {e.status_detail && <div className="text-xs text-gray-500 mt-0.5 max-w-xs">{e.status_detail}</div>}
                  </td>
                </tr>
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
    </AdminShell>
  )
}
