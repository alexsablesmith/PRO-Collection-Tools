import { useEffect, useState } from 'react'
import AdminShell from '@/components/admin/AdminShell'
import Flash, { FlashMessage } from '@/components/admin/Flash'
import { adminFetch } from '@/lib/adminClient'
import { fmtDate } from '@/components/admin/format'
import type { NoticeSeverity, PlatformNotice } from '@/types/database'

const SEVERITY_BADGE: Record<NoticeSeverity, string> = {
  info: 'bg-blue-100 text-blue-700', warning: 'bg-amber-100 text-amber-800', critical: 'bg-red-100 text-red-700',
}

/** datetime-local value <-> ISO */
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null)

function noticeState(n: PlatformNotice) {
  const now = new Date().toISOString()
  if (!n.is_active) return 'Turned off'
  if (n.starts_at > now) return `Scheduled for ${fmtDate(n.starts_at, 'MMM d, h:mm a')}`
  if (n.ends_at && n.ends_at <= now) return 'Ended'
  return 'Showing now'
}

export default function NoticesPage() {
  const [notices, setNotices] = useState<PlatformNotice[]>([])
  const [loading, setLoading] = useState(true)
  const [flash,   setFlash]   = useState<FlashMessage>(null)
  const [form, setForm] = useState({ message: '', severity: 'info' as NoticeSeverity, starts_at: '', ends_at: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setNotices((await adminFetch<{ notices: PlatformNotice[] }>('/api/admin/notices')).notices)
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
    }
    setLoading(false)
  }

  async function create() {
    setSaving(true); setFlash(null)
    try {
      await adminFetch('/api/admin/notices', {
        body: { message: form.message, severity: form.severity, starts_at: fromLocal(form.starts_at), ends_at: fromLocal(form.ends_at) },
      })
      setForm({ message: '', severity: 'info', starts_at: '', ends_at: '' })
      setFlash({ type: 'success', text: 'Notice published. It can take up to a minute to appear everywhere.' })
      await load()
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
    }
    setSaving(false)
  }

  async function update(method: 'PATCH' | 'DELETE', n: PlatformNotice, body?: Partial<PlatformNotice>) {
    setFlash(null)
    try {
      await adminFetch(method === 'DELETE' ? `/api/admin/notices?id=${n.id}` : '/api/admin/notices', { method, body: method === 'PATCH' ? { id: n.id, ...body } : undefined })
      await load()
    } catch (e: any) {
      setFlash({ type: 'error', text: e.message })
    }
  }

  return (
    <AdminShell title="Notices" subtitle="Banners shown to every signed-in user and on the sign-in page, e.g. for maintenance windows">
      <Flash message={flash} onClose={() => setFlash(null)} />

      <div className="card mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">New notice</h2>
        <div className="space-y-3">
          <div>
            <label className="label">Message</label>
            <textarea className="input" rows={2} maxLength={500} value={form.message}
              placeholder="Prolix Health will be unavailable Saturday 10pm–11pm PT for scheduled maintenance."
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Severity</label>
              <select className="input" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value as NoticeSeverity }))}>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical (can&apos;t be dismissed)</option>
              </select>
            </div>
            <div>
              <label className="label">Show from</label>
              <input className="input" type="datetime-local" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} />
              <p className="text-xs text-gray-400 mt-1">Blank = now</p>
            </div>
            <div>
              <label className="label">Show until</label>
              <input className="input" type="datetime-local" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} />
              <p className="text-xs text-gray-400 mt-1">Blank = until turned off</p>
            </div>
          </div>
        </div>
        <button onClick={create} disabled={saving || !form.message.trim()} className="btn-primary text-sm mt-4">
          {saving ? 'Publishing…' : 'Publish notice'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : notices.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">No notices yet.</div>
      ) : (
        <div className="space-y-2">
          {notices.map(n => (
            <div key={n.id} className="card py-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${SEVERITY_BADGE[n.severity]}`}>{n.severity}</span>
                  <span className="text-xs text-gray-500">{noticeState(n)}</span>
                </div>
                <p className="text-sm text-gray-900">{n.message}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {fmtDate(n.starts_at, 'MMM d, yyyy h:mm a')} → {n.ends_at ? fmtDate(n.ends_at, 'MMM d, yyyy h:mm a') : 'no end'}
                </p>
              </div>
              <div className="flex gap-3 text-xs">
                <button onClick={() => update('PATCH', n, { is_active: !n.is_active })} className="text-gray-600 hover:text-gray-900">
                  {n.is_active ? 'Turn off' : 'Turn on'}
                </button>
                <button onClick={() => update('DELETE', n)} className="text-red-500 hover:text-red-700">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  )
}
