export type PromisDomain =
  | 'physical_function'
  | 'anxiety'
  | 'depression'
  | 'fatigue'
  | 'sleep_disturbance'
  | 'social_roles'
  | 'pain_interference'

export interface PromisVisit {
  date: string
  scores: Partial<Record<PromisDomain, number>>
}

interface Props {
  visits: PromisVisit[]
}

// ── Layout constants ────────────────────────────────────────
const W      = 560
const LBL_W  = 158
const AX_X   = 166  // axis start x (LBL_W + 8px gap)
const AX_W   = W - AX_X
const TICK_H = 20
const ROW_H  = 22
const ROW_GAP = 12
const T_MIN  = 20
const T_MAX  = 80
const TICKS  = [20, 30, 40, 45, 50, 55, 60, 70, 80]

// ── Colors ──────────────────────────────────────────────────
const BAND = {
  wnl:  '#2ecc71',
  mild: '#f1c40f',
  mod:  '#f39c12',
  sev:  '#e74c3c',
} as const

const VISIT_COLORS = ['#1F4E79', '#2E75B6', '#E74C3C'] as const
const BAND_OPACITY = 0.38

// ── Domain definitions ───────────────────────────────────────
const DOMAINS = [
  { key: 'physical_function'  as PromisDomain, label: 'Physical Function',         hib: true  },
  { key: 'anxiety'            as PromisDomain, label: 'Anxiety',                   hib: false },
  { key: 'depression'         as PromisDomain, label: 'Depression',                hib: false },
  { key: 'fatigue'            as PromisDomain, label: 'Fatigue',                   hib: false },
  { key: 'sleep_disturbance'  as PromisDomain, label: 'Sleep Disturbance',         hib: false },
  { key: 'social_roles'       as PromisDomain, label: 'Social Roles & Activities', hib: true  },
  { key: 'pain_interference'  as PromisDomain, label: 'Pain Interference',         hib: false },
]

// Band legend items with fixed x offsets (relative to AX_X)
const BAND_ITEMS = [
  { c: 'wnl'  as const, label: 'Within Normal Limits', dx: 0   },
  { c: 'mild' as const, label: 'Mild',                  dx: 128 },
  { c: 'mod'  as const, label: 'Moderate',              dx: 162 },
  { c: 'sev'  as const, label: 'Severe',                dx: 228 },
]

// ── Helpers ─────────────────────────────────────────────────
function tX(t: number): number {
  const clamped = Math.min(T_MAX, Math.max(T_MIN, t))
  return AX_X + ((clamped - T_MIN) / (T_MAX - T_MIN)) * AX_W
}

function getBands(hib: boolean) {
  return hib
    ? [
        { t1: T_MIN, t2: 30,    c: 'sev'  as const },
        { t1: 30,    t2: 40,    c: 'mod'  as const },
        { t1: 40,    t2: 45,    c: 'mild' as const },
        { t1: 45,    t2: T_MAX, c: 'wnl'  as const },
      ]
    : [
        { t1: T_MIN, t2: 55,    c: 'wnl'  as const },
        { t1: 55,    t2: 60,    c: 'mild' as const },
        { t1: 60,    t2: 70,    c: 'mod'  as const },
        { t1: 70,    t2: T_MAX, c: 'sev'  as const },
      ]
}

// ── Visit marker shapes ──────────────────────────────────────
// Shape encodes visit order so the chart is readable in B&W print.
// Visit 0 (oldest)  → circle
// Visit 1 (middle)  → square
// Visit 2 (newest)  → upward triangle
function VisitMarker({ cx, cy, vi }: { cx: number; cy: number; vi: number }) {
  const fill   = VISIT_COLORS[vi] ?? '#888'
  const stroke = 'white'
  const sw     = 1.5
  const r      = 5.5

  if (vi === 0) {
    return <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={sw} />
  }
  if (vi === 1) {
    return (
      <rect
        x={cx - r} y={cy - r}
        width={r * 2} height={r * 2}
        fill={fill} stroke={stroke} strokeWidth={sw}
      />
    )
  }
  // Equilateral triangle, point up, circumradius ≈ r*1.3
  const R   = r * 1.3
  const pts = `${cx},${cy - R} ${cx - R * 0.866},${cy + R * 0.5} ${cx + R * 0.866},${cy + R * 0.5}`
  return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />
}

// ── Component ────────────────────────────────────────────────
export default function PromisScoreChart({ visits }: Props) {
  const vSlice = visits.slice(0, 3)
  const n      = vSlice.length
  if (n === 0) return null

  const vOffsets: number[] = n === 1 ? [0] : n === 2 ? [-4, 4] : [-4, 0, 4]
  const chartH    = TICK_H + DOMAINS.length * (ROW_H + ROW_GAP) - ROW_GAP
  const bandLegY  = chartH + 12
  const visitLegY = bandLegY + 22
  const totalH    = (n > 1 ? visitLegY + 18 : bandLegY + 18) + 4

  // Evenly space visit legend entries across the axis width
  const visitSpacing = Math.floor(AX_W / Math.max(n, 2))

  return (
    <svg
      viewBox={`0 0 ${W} ${totalH}`}
      width="100%"
      style={{ display: 'block' }}
      aria-label="PROMIS T-score band chart"
    >
      {/* ── Axis ticks + grid ─────────────────────────────── */}
      {TICKS.map(t => (
        <g key={t}>
          <line
            x1={tX(t)} y1={TICK_H}
            x2={tX(t)} y2={chartH}
            stroke="#e0e0e0" strokeWidth={0.5}
          />
          <text x={tX(t)} y={TICK_H - 5} textAnchor="middle" fontSize={8.5} fill="#999">
            {t}
          </text>
        </g>
      ))}

      {/* T=50 reference dashed line */}
      <line
        x1={tX(50)} y1={TICK_H}
        x2={tX(50)} y2={chartH}
        stroke="#bbb" strokeWidth={1} strokeDasharray="4 3"
      />

      {/* ── Domain rows ───────────────────────────────────── */}
      {DOMAINS.map((dom, di) => {
        const rowY = TICK_H + di * (ROW_H + ROW_GAP)
        return (
          <g key={dom.key}>
            {/* Domain label (right-aligned into label area) */}
            <text
              x={LBL_W} y={rowY + ROW_H * 0.72}
              textAnchor="end" fontSize={9.5} fill="#333"
            >
              {dom.label}
            </text>

            {/* Color bands */}
            {getBands(dom.hib).map(({ t1, t2, c }) => (
              <rect
                key={c}
                x={tX(t1)} y={rowY}
                width={tX(t2) - tX(t1)} height={ROW_H}
                fill={BAND[c]} opacity={BAND_OPACITY}
              />
            ))}

            {/* Visit markers */}
            {vSlice.map((visit, vi) => {
              const score = visit.scores[dom.key]
              if (score == null) return null
              const mx = tX(score)
              const my = rowY + ROW_H / 2 + vOffsets[vi]
              return (
                <g key={vi}>
                  <VisitMarker cx={mx} cy={my} vi={vi} />
                  {/* T-score label above most recent visit's marker only */}
                  {vi === n - 1 && (
                    <text
                      x={mx} y={rowY - 2}
                      textAnchor="middle" fontSize={7.5} fontWeight="bold"
                      fill={VISIT_COLORS[vi]}
                    >
                      {score.toFixed(1)}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}

      {/* ── Band legend ───────────────────────────────────── */}
      <g>
        {BAND_ITEMS.map(({ c, label, dx }) => (
          <g key={c} transform={`translate(${AX_X + dx}, ${bandLegY})`}>
            <rect x={0} y={0} width={11} height={9} fill={BAND[c]} opacity={0.6} />
            <text x={14} y={8.5} fontSize={8} fill="#666">{label}</text>
          </g>
        ))}
      </g>

      {/* ── Visit shape + date legend (only when multiple visits) ── */}
      {n > 1 && (
        <g>
          {vSlice.map((visit, vi) => (
            <g key={vi} transform={`translate(${AX_X + vi * visitSpacing}, ${visitLegY})`}>
              <VisitMarker cx={5} cy={5} vi={vi} />
              <text x={14} y={9} fontSize={8} fill="#555">{visit.date}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  )
}
