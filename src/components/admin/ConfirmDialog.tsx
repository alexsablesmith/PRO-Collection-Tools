import { ReactNode, useState } from 'react'

/**
 * Modal confirmation. When `confirmText` is set, the user must type it
 * exactly (e.g. the organization name) before the action is enabled.
 */
export default function ConfirmDialog({
  title, body, confirmLabel, confirmText, danger, onConfirm, onCancel,
}: {
  title: string
  body: ReactNode
  confirmLabel: string
  confirmText?: string
  danger?: boolean
  onConfirm: (typed: string) => Promise<void> | void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = !confirmText || typed.trim() === confirmText

  async function confirm() {
    setBusy(true)
    try { await onConfirm(typed) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
        <div className="text-sm text-gray-600 space-y-2 mb-4">{body}</div>
        {confirmText && (
          <div className="mb-4">
            <label className="label">Type <span className="font-mono text-gray-900">{confirmText}</span> to confirm</label>
            <input className="input" value={typed} onChange={e => setTyped(e.target.value)} autoFocus />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary text-sm" disabled={busy}>Cancel</button>
          <button
            onClick={confirm}
            disabled={!ok || busy}
            className={`${danger ? 'btn-danger' : 'btn-primary'} text-sm disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
