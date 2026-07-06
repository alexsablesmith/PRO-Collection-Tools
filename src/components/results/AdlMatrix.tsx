import { useMemo } from 'react'
import type { Item } from '@/types/database'
import { computeAdlMatrix, impairmentBucket } from '@/lib/adl'

const BUCKET_CLS: Record<string, string> = {
  none:     'bg-green-50 text-green-800',
  mild:     'bg-yellow-50 text-yellow-800',
  moderate: 'bg-orange-100 text-orange-800',
  severe:   'bg-red-100 text-red-800',
}

/**
 * ADL impact matrix for medical-legal evaluation: mean item-level impairment
 * per ADL category × body region, with a callout for ICF domains affected by
 * more than one body region.
 */
export default function AdlMatrix({
  items,
  answers,
}: {
  items:   Item[]
  answers: Record<string, number>
}) {
  const matrix = useMemo(() => computeAdlMatrix(items, answers), [items, answers])

  if (matrix.nAnswered === 0) {
    return (
      <div className="card text-center py-10 text-gray-500 text-sm">
        No item-level responses could be mapped to ADL categories for this visit.
        <br />
        <span className="text-xs text-gray-400">
          The item bank migrations must be applied, and the visit must include instruments with ICF-tagged questions.
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Multi-region findings */}
      {matrix.multiRegion.length > 0 && (
        <div className="card border-l-4 border-amber-400">
          <h3 className="font-semibold text-gray-800 mb-2">Activities affected by multiple body regions</h3>
          <ul className="space-y-1.5">
            {matrix.multiRegion.map(f => (
              <li key={f.code} className="text-sm text-gray-700">
                <span className="font-medium">{f.label}</span>
                <span className="text-xs text-gray-400 ml-1">({f.code})</span>
                {' — '}
                {f.regions.map((r, i) => (
                  <span key={r.region}>
                    {i > 0 && ', '}
                    {r.region} <span className="text-xs text-gray-500">({r.impairmentPct}%)</span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Matrix */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-hdrbg">
              <tr>
                <th className="text-left px-3 py-3 font-semibold text-navy-DEFAULT">ADL Category</th>
                {matrix.regions.map(r => (
                  <th key={r} className="text-center px-2 py-3 font-semibold text-navy-DEFAULT text-xs whitespace-nowrap">{r}</th>
                ))}
                <th className="text-center px-2 py-3 font-semibold text-navy-DEFAULT text-xs">Overall</th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row, i) => (
                <tr key={row.category} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2.5 text-gray-800 font-medium whitespace-nowrap">{row.category}</td>
                  {matrix.regions.map(region => {
                    const cell = row.cells[region]
                    if (!cell) return <td key={region} className="px-2 py-2.5 text-center text-gray-300">—</td>
                    return (
                      <td key={region} className="px-2 py-2.5 text-center">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${BUCKET_CLS[impairmentBucket(cell.impairmentPct)]}`}
                          title={`${cell.nItems} item${cell.nItems === 1 ? '' : 's'}`}
                        >
                          {cell.impairmentPct}%
                        </span>
                        <div className="text-[10px] text-gray-400">n={cell.nItems}</div>
                      </td>
                    )
                  })}
                  <td className="px-2 py-2.5 text-center">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${BUCKET_CLS[impairmentBucket(row.overall.impairmentPct)]}`}>
                      {row.overall.impairmentPct}%
                    </span>
                    <div className="text-[10px] text-gray-400">n={row.overall.nItems}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Cells show mean item-level impairment (0% = no reported difficulty, 100% = maximal) across all ICF-tagged
        questions answered at this visit, grouped into ADL categories aligned with the AMA Guides (5th ed., Table 1-2).
        Items tagged with two body regions contribute to both columns. n = number of contributing items.
        <span className="ml-2">
          <span className="inline-block rounded px-1 bg-green-50 text-green-800">&lt;25%</span>{' '}
          <span className="inline-block rounded px-1 bg-yellow-50 text-yellow-800">25–49%</span>{' '}
          <span className="inline-block rounded px-1 bg-orange-100 text-orange-800">50–74%</span>{' '}
          <span className="inline-block rounded px-1 bg-red-100 text-red-800">≥75%</span>
        </span>
      </p>
    </div>
  )
}
