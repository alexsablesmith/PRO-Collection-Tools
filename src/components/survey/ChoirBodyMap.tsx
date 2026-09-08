import { useState } from 'react'
import type { ChoirBodyMap as ChoirBodyMapValue, PainQuality } from '@/types/database'
import {
  CHOIR_VIEWBOX, choirRegions, isFrontRegion,
  type ChoirSex, type ChoirView,
} from './choirBodyMapData'

/**
 * Segmented CHOIR body map. The patient taps anatomical regions to endorse
 * pain, rather than free-hand drawing (see BodyMapCanvas for that). Region
 * geometry is ported from the CHOIRBM R package; a selection is stored as a
 * map of region id -> pain-quality id and serialises to a CHOIR-DB id string.
 */

const DEFAULT_QUALITY: PainQuality = { id: 'pain', label: 'Pain', color: '#dc2626' }

interface Props {
  value:      ChoirBodyMapValue | undefined
  onChange:   (v: ChoirBodyMapValue) => void
  lang:       'en' | 'es'
  sex?:       ChoirSex
  qualities?: PainQuality[]
}

const VIEW_LABELS = {
  en: { front: 'Front', back: 'Back', right: 'R', left: 'L', clear: 'Clear all', count: (n: number) => `${n} area${n === 1 ? '' : 's'} selected`, pick: 'Select the type of pain, then tap the areas where it hurts:', tap: 'Tap the areas of your body where you feel pain:' },
  es: { front: 'Frente', back: 'Espalda', right: 'D', left: 'I', clear: 'Borrar todo', count: (n: number) => `${n} zona${n === 1 ? '' : 's'} seleccionada${n === 1 ? '' : 's'}`, pick: 'Selecciona el tipo de dolor y luego toca las zonas donde te duele:', tap: 'Toca las zonas de tu cuerpo donde sientes dolor:' },
}

export default function ChoirBodyMap({ value, onChange, lang, sex = 'male', qualities }: Props) {
  const pens = qualities && qualities.length ? qualities : [DEFAULT_QUALITY]
  const [activeQuality, setActiveQuality] = useState(pens[0].id)
  const regions = value?.regions ?? {}
  const labels = VIEW_LABELS[lang]
  const hasPens = Boolean(qualities && qualities.length)

  function toggle(id: string) {
    const next = { ...regions }
    if (next[id] === activeQuality) delete next[id]
    else next[id] = activeQuality
    onChange({ regions: next })
  }

  return (
    <div>
      <p className="text-sm text-gray-700 mb-2">{hasPens ? labels.pick : labels.tap}</p>

      {hasPens && (
        <div className="flex flex-wrap gap-2 mb-4">
          {pens.map(q => (
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
      )}

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        {(['front', 'back'] as const).map(view => (
          <ChoirView
            key={view}
            view={view}
            sex={sex}
            regions={regions}
            pens={pens}
            labels={labels}
            onToggle={toggle}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 justify-center mt-3">
        <span className="text-xs text-gray-500">{labels.count(Object.keys(regions).length)}</span>
        <button
          type="button"
          onClick={() => onChange({ regions: {} })}
          disabled={Object.keys(regions).length === 0}
          className="btn-secondary text-xs disabled:opacity-40"
        >
          {labels.clear}
        </button>
      </div>
    </div>
  )
}

const colorOf = (pens: PainQuality[], qid: string) => pens.find(p => p.id === qid)?.color ?? DEFAULT_QUALITY.color

function ChoirView({
  view, sex, regions, pens, labels, onToggle,
}: {
  view: ChoirView
  sex: ChoirSex
  regions: Record<string, string>
  pens: PainQuality[]
  labels: typeof VIEW_LABELS['en']
  onToggle: (id: string) => void
}) {
  const geo = choirRegions(sex, view)
  // On the front view the patient's right is the viewer's left; back flips.
  const leftLabel  = view === 'front' ? labels.right : labels.left
  const rightLabel = view === 'front' ? labels.left  : labels.right

  return (
    <div className="text-center">
      <svg
        viewBox={`0 0 ${CHOIR_VIEWBOX.w} ${CHOIR_VIEWBOX.h}`}
        className="w-44 sm:w-52 mx-auto border border-gray-200 rounded-xl bg-white select-none"
        style={{ touchAction: 'manipulation' }}
      >
        {Object.entries(geo).map(([id, points]) => {
          const on = Boolean(regions[id])
          return (
            <polygon
              key={id}
              points={points}
              onClick={() => onToggle(id)}
              fill={on ? colorOf(pens, regions[id]) : '#f3f4f6'}
              fillOpacity={on ? 0.8 : 1}
              stroke="#9ca3af"
              strokeWidth={0.6}
              className="cursor-pointer hover:fill-gray-200"
              style={{ transition: 'fill 0.1s' }}
            />
          )
        })}
        <text x="10" y="572" fontSize="11" fill="#9ca3af">{leftLabel}</text>
        <text x="272" y="572" fontSize="11" fill="#9ca3af">{rightLabel}</text>
      </svg>
      <p className="text-xs text-gray-500 mt-1">{view === 'front' ? labels.front : labels.back}</p>
    </div>
  )
}

/** Read-only rendering of a saved CHOIR map (clinician views). */
export function ChoirBodyMapView({
  value, sex = 'male', qualities,
}: {
  value: ChoirBodyMapValue
  sex?: ChoirSex
  qualities?: PainQuality[]
}) {
  const pens = qualities && qualities.length ? qualities : [DEFAULT_QUALITY]
  const regions = value.regions ?? {}
  const hasPens = Boolean(qualities && qualities.length)

  return (
    <div>
      <div className="flex gap-6 justify-start">
        {(['front', 'back'] as const).map(view => {
          const geo = choirRegions(sex, view)
          return (
            <div key={view} className="text-center">
              <svg viewBox={`0 0 ${CHOIR_VIEWBOX.w} ${CHOIR_VIEWBOX.h}`} className="w-36 border border-gray-100 rounded-lg bg-white">
                {Object.entries(geo).map(([id, points]) => {
                  const on = Boolean(regions[id])
                  return (
                    <polygon
                      key={id}
                      points={points}
                      fill={on ? colorOf(pens, regions[id]) : '#f3f4f6'}
                      fillOpacity={on ? 0.8 : 1}
                      stroke="#d1d5db"
                      strokeWidth={0.6}
                    />
                  )
                })}
              </svg>
              <p className="text-xs text-gray-400 mt-0.5">{view === 'front' ? 'Front' : 'Back'}</p>
            </div>
          )
        })}
      </div>
      {hasPens && (
        <div className="flex flex-wrap gap-3 mt-2">
          {pens.map(q => (
            <span key={q.id} className="flex items-center gap-1 text-xs text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: q.color }} />
              {q.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Render a saved CHOIR map to a PNG data URL (used by the PDF generator).
 * Draws both views side by side on an offscreen canvas.
 */
export function renderChoirMapToDataUrl(
  value: ChoirBodyMapValue,
  sex: ChoirSex = 'male',
  qualities?: PainQuality[],
): string {
  const pens = qualities && qualities.length ? qualities : [DEFAULT_QUALITY]
  const regions = value.regions ?? {}
  const scale = 2
  const gap = 40
  const w = (CHOIR_VIEWBOX.w * 2 + gap) * scale
  const h = CHOIR_VIEWBOX.h * scale
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)

  const parse = (pts: string) => pts.split(' ').map(p => p.split(',').map(Number) as [number, number])

  ;(['front', 'back'] as const).forEach((view, vi) => {
    const geo = choirRegions(sex, view)
    ctx.save()
    ctx.translate(vi * (CHOIR_VIEWBOX.w + gap) * scale, 0)
    ctx.scale(scale, scale)
    ctx.lineJoin = 'round'
    ctx.lineWidth = 0.6
    Object.entries(geo).forEach(([id, points]) => {
      const on = Boolean(regions[id])
      ctx.beginPath()
      parse(points).forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
      ctx.closePath()
      ctx.fillStyle = on ? colorOf(pens, regions[id]) : '#f3f4f6'
      ctx.globalAlpha = on ? 0.8 : 1
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = '#9ca3af'
      ctx.stroke()
    })
    ctx.restore()
  })

  return canvas.toDataURL('image/png')
}
