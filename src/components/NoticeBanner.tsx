import { useEffect, useState } from 'react'
import type { PlatformNotice } from '@/types/database'

const STYLES: Record<PlatformNotice['severity'], string> = {
  info:     'bg-blue-50 border-blue-200 text-blue-900',
  warning:  'bg-amber-50 border-amber-200 text-amber-900',
  critical: 'bg-red-50 border-red-200 text-red-900',
}

/** Platform-wide notices (maintenance windows etc.) set by the App Admin. */
export default function NoticeBanner() {
  const [notices, setNotices] = useState<PlatformNotice[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])

  useEffect(() => {
    try { setDismissed(JSON.parse(sessionStorage.getItem('prolix:dismissed-notices') ?? '[]')) } catch {}
    fetch('/api/notices')
      .then(r => r.json())
      .then(j => setNotices(j.notices ?? []))
      .catch(() => {})
  }, [])

  function dismiss(id: string) {
    const next = [...dismissed, id]
    setDismissed(next)
    try { sessionStorage.setItem('prolix:dismissed-notices', JSON.stringify(next)) } catch {}
  }

  const visible = notices.filter(n => n.severity === 'critical' || !dismissed.includes(n.id))
  if (visible.length === 0) return null

  return (
    <div>
      {visible.map(n => (
        <div key={n.id} className={`border-b px-4 py-2 text-sm ${STYLES[n.severity]}`}>
          <div className="max-w-7xl mx-auto flex items-start justify-between gap-4">
            <span>{n.message}</span>
            {n.severity !== 'critical' && (
              <button onClick={() => dismiss(n.id)} className="opacity-60 hover:opacity-100 text-xs flex-shrink-0" aria-label="Dismiss">
                Dismiss
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
