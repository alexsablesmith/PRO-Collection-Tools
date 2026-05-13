import Head from 'next/head'
import { INSTRUMENT_META } from '@/config/scoring'

export default function ScoringRulesPage() {
  const instruments = Object.entries(INSTRUMENT_META)

  return (
    <>
      <Head><title>Scoring Rules — MDE Platform</title></Head>
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Scoring Rules</h1>
          <p className="text-gray-500 text-sm mt-1">
            All scoring logic is defined in <code className="bg-gray-100 px-1 rounded text-xs">src/config/scoring.ts</code> in the GitHub repository.
            Every change is tracked with a timestamp and author.
          </p>
        </div>

        {/* PROMIS section */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-navy-DEFAULT mb-1">PROMIS-29 Profile v2.1</h2>
          <p className="text-sm text-gray-500 mb-4">
            Source: HealthMeasures PROMIS Adult Profile Instruments Scoring Manual, April 9, 2021.
            T-scores are normed to the US general population (mean=50, SD=10).
            Scores are calculated using raw score lookup tables from the official scoring manual.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-hdrbg">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-navy-DEFAULT">Domain</th>
                  <th className="text-left px-4 py-2 font-semibold text-navy-DEFAULT">Short Form</th>
                  <th className="text-left px-4 py-2 font-semibold text-navy-DEFAULT">Direction</th>
                  <th className="text-left px-4 py-2 font-semibold text-navy-DEFAULT">Items</th>
                  <th className="text-left px-4 py-2 font-semibold text-navy-DEFAULT">Raw Range</th>
                </tr>
              </thead>
              <tbody>
                {instruments.filter(([k]) => k.startsWith('promis')).map(([key, meta], i) => (
                  <tr key={key} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                    <td className="px-4 py-2 font-medium">{meta.displayName}</td>
                    <td className="px-4 py-2 text-gray-600">{meta.citation.split('—')[1]?.split('.')[0]?.trim()}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-medium ${meta.higherIsBetter ? 'text-green-700' : 'text-red-700'}`}>
                        {meta.higherIsBetter ? '↑ Higher = Better' : '↑ Higher = Worse'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-600">4</td>
                    <td className="px-4 py-2 text-gray-600">4–20</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">T-Score Severity Cut Points</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Symptom Scales (higher = worse)</p>
                <table className="w-full text-xs">
                  <tbody>
                    {[['< 55','Within Normal Limits','wnl'],['55–59.9','Mild','mild'],['60–69.9','Moderate','mod'],['≥ 70','Severe','sev']].map(([range, label, cls]) => (
                      <tr key={range}>
                        <td className="py-0.5 pr-3 text-gray-600">{range}</td>
                        <td><span className={`badge-${cls} text-xs`}>{label}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Function Scales (higher = better)</p>
                <table className="w-full text-xs">
                  <tbody>
                    {[['≥ 45','Within Normal Limits','wnl'],['40–44.9','Mild limitation','mild'],['30–39.9','Moderate limitation','mod'],['< 30','Severe limitation','sev']].map(([range, label, cls]) => (
                      <tr key={range}>
                        <td className="py-0.5 pr-3 text-gray-600">{range}</td>
                        <td><span className={`badge-${cls} text-xs`}>{label}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Other instruments */}
        {[
          { key: 'phq9', title: 'PHQ-9 — Depression Screening',
            bands: [['0–4','None–Minimal'],['5–9','Mild'],['10–14','Moderate'],['15–19','Moderately Severe'],['20–27','Severe']],
            notes: 'Items 9 (suicidal ideation): any response other than "Not at all" requires immediate clinical follow-up.' },
          { key: 'gad7', title: 'GAD-7 — Generalized Anxiety Screening',
            bands: [['0–4','Minimal'],['5–9','Mild'],['10–14','Moderate'],['15–21','Severe']],
            notes: null },
          { key: 'tsk11', title: 'Tampa Scale for Kinesiophobia (TSK-11)',
            bands: [['< 37','Within Normal Range'],['≥ 37','Elevated Kinesiophobia']],
            notes: 'Items 4 and 8 are reverse-scored (score = 5 − response). Range: 11–44.' },
          { key: 'pcs', title: 'Pain Catastrophizing Scale (PCS)',
            bands: [['< 30','Below Clinical Threshold'],['≥ 30','Clinically Significant']],
            notes: 'Subscales: Rumination (items 8–11), Magnification (items 6, 7, 13), Helplessness (items 1–5, 12). Range: 0–52.' },
        ].map(({ key, title, bands, notes }) => {
          const meta = INSTRUMENT_META[key]
          return (
            <div key={key} className="card mb-4">
              <h2 className="text-lg font-semibold text-navy-DEFAULT mb-1">{title}</h2>
              <p className="text-xs text-gray-400 mb-3 italic">{meta?.citation}</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {bands.map(([range, label]) => (
                  <div key={range} className="bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
                    <span className="text-gray-500">{range}: </span>
                    <span className="font-medium text-gray-800">{label}</span>
                  </div>
                ))}
              </div>
              {notes && <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-2">{notes}</p>}
            </div>
          )
        })}

        <div className="text-xs text-gray-400 mt-6 p-4 bg-gray-50 rounded-lg">
          <strong>Audit note:</strong> All scoring rules above are implemented exactly as shown in{' '}
          <code>src/config/scoring.ts</code>. Changes to scoring logic require a code deployment and
          appear in the Git commit history. Contact your administrator for the repository link.
        </div>
      </div>
    </>
  )
}
