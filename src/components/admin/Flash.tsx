export type FlashMessage = { type: 'success' | 'error' | 'warning'; text: string } | null

const STYLES = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error:   'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
}

export default function Flash({ message, onClose }: { message: FlashMessage; onClose?: () => void }) {
  if (!message) return null
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm mb-4 flex items-start justify-between gap-4 ${STYLES[message.type]}`}>
      <span>{message.text}</span>
      {onClose && <button onClick={onClose} className="opacity-60 hover:opacity-100 text-xs">Dismiss</button>}
    </div>
  )
}

/** Turns an API result (which may carry a non-fatal warning) into a flash message. */
export function resultFlash(result: { message?: string; warning?: string }, fallback: string): FlashMessage {
  return result.warning
    ? { type: 'warning', text: result.warning }
    : { type: 'success', text: result.message ?? fallback }
}
