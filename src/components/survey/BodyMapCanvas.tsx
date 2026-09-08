import { useRef, useState } from 'react'
import type { DrawingStroke, PainDrawing, PainQuality } from '@/types/database'

/**
 * Free-hand pain drawing over front/back body outlines.
 *
 * The outline is an original SVG silhouette (the paper form's image comes
 * from a published article and can't be redistributed). Strokes are stored
 * as polylines in viewBox coordinates, tagged with the selected pain
 * quality, so they can be re-rendered at any size on screen and in PDFs.
 */

export const BODY_VIEWBOX = { w: 200, h: 430 }

/**
 * Gender-neutral human silhouette (front and back share the outline),
 * centered on x=100 in a 200x430 viewBox.
 */
export const BODY_OUTLINE_PATH =
  // head
  'M100,10 C114,10 123,21 123,35 C123,44 119,52 113,57 ' +
  // neck right
  'L112,68 ' +
  // right shoulder + arm outer edge
  'C130,72 146,78 152,86 C158,94 160,110 161,128 L164,170 L166,205 L168,232 ' +
  // right hand
  'C173,240 174,248 172,252 C169,257 163,258 160,252 C158,257 152,258 150,251 L148,238 ' +
  // right arm inner edge up to armpit
  'L150,205 L148,170 L144,132 L140,110 ' +
  // right torso: chest -> waist -> hip
  'C141,128 142,150 140,168 C138,186 138,204 142,222 ' +
  // right leg outer edge
  'C146,244 144,268 141,292 L137,330 L134,362 L132,392 ' +
  // right foot
  'C138,400 140,408 138,412 L120,412 C117,406 117,398 118,392 ' +
  // right leg inner edge up to crotch
  'L116,362 L114,330 L112,296 C111,280 108,262 106,252 L100,240 ' +
  // left leg (mirror)
  'L94,252 C92,262 89,280 88,296 L86,330 L84,362 L82,392 ' +
  'C83,398 83,406 80,412 L62,412 C60,408 62,400 68,392 ' +
  'L66,362 L63,330 L59,292 C56,268 54,244 58,222 ' +
  // left torso up
  'C62,204 62,186 60,168 C58,150 59,128 60,110 ' +
  // left arm inner edge down
  'L56,132 L52,170 L50,205 L52,238 ' +
  // left hand
  'C50,258 44,257 42,251 C40,258 34,257 31,252 C29,248 30,240 32,232 ' +
  // left arm outer edge up to shoulder
  'L34,205 L36,170 L39,128 C40,110 42,94 48,86 C54,78 70,72 88,68 ' +
  // neck left, close at head
  'L87,57 C81,52 77,44 77,35 C77,21 86,10 100,10 Z'

interface Props {
  qualities: PainQuality[]
  value:     PainDrawing | undefined
  onChange:  (d: PainDrawing) => void
  lang:      'en' | 'es'
}

const VIEW_LABELS = {
  en: { front: 'Front', back: 'Back', right: 'Right', left: 'Left', undo: 'Undo', clear: 'Clear all', pen: 'Select the type of pain, then draw where it hurts:' },
  es: { front: 'Frente', back: 'Espalda', right: 'Derecha', left: 'Izquierda', undo: 'Deshacer', clear: 'Borrar todo', pen: 'Selecciona el tipo de dolor y luego dibuja donde te duele:' },
}

export default function BodyMapCanvas({ qualities, value, onChange, lang }: Props) {
  const [activeQuality, setActiveQuality] = useState(qualities[0]?.id ?? '')
  const strokes = value?.strokes ?? []
  const labels = VIEW_LABELS[lang]

  function commit(next: DrawingStroke[]) {
    onChange({ strokes: next })
  }

  return (
    <div>
      <p className="text-sm text-gray-700 mb-2">{labels.pen}</p>

      {/* Pain-quality pen selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {qualities.map(q => (
          <button
            key={q.id}
            type="button"
            onClick={() => setActiveQuality(q.id)}
            className={`flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 border transition-colors ${
              activeQuality === q.id ? 'border-gray-800 bg-gray-100 font-semibold' : 'border-gray-200 bg-white'
            }`}
          >
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: q.color }} />
            {q.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        {(['front', 'back'] as const).map(view => (
          <BodyView
            key={view}
            view={view}
            strokes={strokes}
            qualities={qualities}
            activeQuality={activeQuality}
            labels={labels}
            onStroke={s => commit([...strokes, s])}
          />
        ))}
      </div>

      <div className="flex gap-2 justify-center mt-3">
        <button
          type="button"
          onClick={() => commit(strokes.slice(0, -1))}
          disabled={strokes.length === 0}
          className="btn-secondary text-xs disabled:opacity-40"
        >
          {labels.undo}
        </button>
        <button
          type="button"
          onClick={() => commit([])}
          disabled={strokes.length === 0}
          className="btn-secondary text-xs disabled:opacity-40"
        >
          {labels.clear}
        </button>
      </div>
    </div>
  )
}

function BodyView({
  view, strokes, qualities, activeQuality, labels, onStroke,
}: {
  view: 'front' | 'back'
  strokes: DrawingStroke[]
  qualities: PainQuality[]
  activeQuality: string
  labels: typeof VIEW_LABELS['en']
  onStroke: (s: DrawingStroke) => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [draft, setDraft] = useState<[number, number][] | null>(null)

  const colorOf = (qid: string) => qualities.find(q => q.id === qid)?.color ?? '#333'

  function toViewBox(e: React.PointerEvent): [number, number] | null {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * BODY_VIEWBOX.w
    const y = ((e.clientY - rect.top) / rect.height) * BODY_VIEWBOX.h
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
  }

  function handleDown(e: React.PointerEvent) {
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const p = toViewBox(e)
    if (p) setDraft([p])
  }

  function handleMove(e: React.PointerEvent) {
    if (!draft) return
    const p = toViewBox(e)
    if (!p) return
    const last = draft[draft.length - 1]
    const dx = p[0] - last[0]; const dy = p[1] - last[1]
    if (dx * dx + dy * dy < 4) return
    setDraft(d => (d ? [...d, p] : d))
  }

  function handleUp() {
    if (!draft) return
    // A tap becomes a visible dot: duplicate the point so the polyline renders
    const pts = draft.length === 1 ? [draft[0], draft[0]] : draft
    onStroke({ q: activeQuality, view, pts })
    setDraft(null)
  }

  // On the front view the patient's right is the viewer's left; on the back it flips.
  const leftLabel  = view === 'front' ? labels.right : labels.left
  const rightLabel = view === 'front' ? labels.left  : labels.right

  return (
    <div className="text-center">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${BODY_VIEWBOX.w} ${BODY_VIEWBOX.h}`}
        className="w-44 sm:w-52 mx-auto border border-gray-200 rounded-xl bg-white select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={handleUp}
      >
        <path d={BODY_OUTLINE_PATH} fill="#f3f4f6" stroke="#9ca3af" strokeWidth="1.5" />
        <text x="14" y="420" fontSize="11" fill="#9ca3af">{leftLabel[0]}</text>
        <text x="180" y="420" fontSize="11" fill="#9ca3af">{rightLabel[0]}</text>
        {strokes.filter(s => s.view === view).map((s, i) => (
          <polyline
            key={i}
            points={s.pts.map(p => p.join(',')).join(' ')}
            fill="none"
            stroke={colorOf(s.q)}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.75"
          />
        ))}
        {draft && (
          <polyline
            points={(draft.length === 1 ? [draft[0], draft[0]] : draft).map(p => p.join(',')).join(' ')}
            fill="none"
            stroke={colorOf(activeQuality)}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.75"
          />
        )}
      </svg>
      <p className="text-xs text-gray-500 mt-1">{view === 'front' ? labels.front : labels.back}</p>
    </div>
  )
}

/** Read-only rendering of a saved drawing (clinician views) */
export function PainDrawingView({ drawing, qualities }: { drawing: PainDrawing; qualities: PainQuality[] }) {
  const colorOf = (qid: string) => qualities.find(q => q.id === qid)?.color ?? '#333'
  return (
    <div>
      <div className="flex gap-6 justify-start">
        {(['front', 'back'] as const).map(view => (
          <div key={view} className="text-center">
            <svg viewBox={`0 0 ${BODY_VIEWBOX.w} ${BODY_VIEWBOX.h}`} className="w-36 border border-gray-100 rounded-lg bg-white">
              <path d={BODY_OUTLINE_PATH} fill="#f3f4f6" stroke="#9ca3af" strokeWidth="1.5" />
              {drawing.strokes.filter(s => s.view === view).map((s, i) => (
                <polyline
                  key={i}
                  points={s.pts.map(p => p.join(',')).join(' ')}
                  fill="none"
                  stroke={colorOf(s.q)}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.75"
                />
              ))}
            </svg>
            <p className="text-xs text-gray-400 mt-0.5">{view === 'front' ? 'Front' : 'Back'}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-2">
        {qualities.map(q => (
          <span key={q.id} className="flex items-center gap-1 text-xs text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: q.color }} />
            {q.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Render a saved drawing to a PNG data URL (used by the PDF generator).
 * Draws both views side by side on an offscreen canvas.
 */
export function renderDrawingToDataUrl(drawing: PainDrawing, qualities: PainQuality[]): string {
  const scale = 2
  const gap = 40
  const w = (BODY_VIEWBOX.w * 2 + gap) * scale
  const h = BODY_VIEWBOX.h * scale
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)

  const outline = new Path2D(BODY_OUTLINE_PATH)
  const colorOf = (qid: string) => qualities.find(q => q.id === qid)?.color ?? '#333'

  ;(['front', 'back'] as const).forEach((view, vi) => {
    ctx.save()
    ctx.translate(vi * (BODY_VIEWBOX.w + gap) * scale, 0)
    ctx.scale(scale, scale)
    ctx.fillStyle = '#f3f4f6'
    ctx.fill(outline)
    ctx.strokeStyle = '#9ca3af'
    ctx.lineWidth = 1.5
    ctx.stroke(outline)

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 5
    ctx.globalAlpha = 0.75
    drawing.strokes.filter(s => s.view === view).forEach(s => {
      ctx.strokeStyle = colorOf(s.q)
      ctx.beginPath()
      s.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
      if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1])
      ctx.stroke()
    })
    ctx.restore()
  })

  return canvas.toDataURL('image/png')
}
