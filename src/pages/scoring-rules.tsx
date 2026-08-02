import { useEffect, useState } from 'react'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { INSTRUMENT_META } from '@/config/scoring'
import type { Instrument } from '@/types/database'
import InstrumentPreviewModal from '@/components/InstrumentPreviewModal'

export default function ScoringRulesPage() {
  const instruments = Object.entries(INSTRUMENT_META)
  const [dbInstruments, setDbInstruments] = useState<Instrument[]>([])
  const [preview, setPreview] = useState<Instrument | null>(null)

  useEffect(() => {
    supabase.from('instruments').select('*').eq('is_active', true).then(({ data }) => {
      setDbInstruments(data ?? [])
    })
  }, [])

  function getDbInstrument(key: string): Instrument | undefined {
    return dbInstruments.find(i => i.scoring_config_key === key)
  }

  return (
    <>
      <Head><title>Scoring Rules — Prolix Health</title></Head>
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
                  <th className="px-4 py-2"></th>
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
                    <td className="px-4 py-2 text-right">
                      {getDbInstrument(key) && (
                        <button
                          onClick={() => setPreview(getDbInstrument(key)!)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Preview
                        </button>
                      )}
                    </td>
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
          { key: 'gic', title: 'Global Impression of Change',
            bands: [['1–3','Improved'],['4','No Change'],['5–7','Worse']],
            notes: 'Single item. Score is the response value (1 = A lot better, 7 = A lot worse).' },
        ].map(({ key, title, bands, notes }) => {
          const meta = INSTRUMENT_META[key]
          const dbInst = getDbInstrument(key)
          return (
            <div key={key} className="card mb-4">
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-lg font-semibold text-navy-DEFAULT">{title}</h2>
                {dbInst && (
                  <button
                    onClick={() => setPreview(dbInst)}
                    className="text-xs text-blue-600 hover:underline flex-shrink-0 ml-4"
                  >
                    Preview Questions
                  </button>
                )}
              </div>
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

        {/* Functional & regional instruments — data-driven from INSTRUMENT_META,
            so any new instrument added there appears here automatically. */}
        {(() => {
          const COVERED = new Set(['phq9', 'gad7', 'tsk11', 'pcs', 'gic'])
          const NOTES: Record<string, string> = {
            odi:       'Score = (sum ÷ (5 × sections answered)) × 100. Skipped sections (e.g. sex life) reduce the denominator. Range 0–100%.',
            ndi:       'Sum of 10 sections, each 0–5. Range 0–50; higher = greater disability.',
            dash:      'Score = ((mean of answered items) − 1) × 25. At least 27 of 30 items must be answered. Range 0–100.',
            quickdash: 'Score = ((mean of answered items) − 1) × 25. At least 10 of 11 items must be answered. Range 0–100.',
            koos:      'Five subscales (Symptoms, Pain, ADL, Sport/Rec, QOL), each 0–100 where 100 = no problems. Reported total is the mean of subscales.',
            hoos:      'Five subscales (Symptoms, Pain, ADL, Sport/Rec, QOL), each 0–100 where 100 = no problems. Reported total is the mean of subscales.',
            womac:     'Sum 0–96; subscales Pain (0–20), Stiffness (0–8), Function (0–68). Higher = worse.',
            lefs:      'Sum of 20 items (0–4 each). Range 0–80; higher = better function. MCID ≈ 9 points.',
            faam:      'ADL subscale (21 items) and Sports subscale (8 items) each reported as % of maximum. ADL is the primary score.',
            haq_di:    'Highest score within each of 8 categories, averaged. Range 0–3; higher = greater disability.',
            uw_pain:   'UW-CAP 6-item: each item 1–5 (Never–Always). The raw sum (6–30) is converted to an IRT-based T-score (mean 50, SD 10); higher = greater pain catastrophizing. Cut points: T≥52 moderate, T≥57 high risk. Scorable with ≥4 of 6 items (pro-rated).',
            pain_nrs:  'Single 0–10 numeric rating. Mild 0–3, Moderate 4–6, Severe 7–10.',
          }
          const regional = instruments.filter(([k]) =>
            !k.startsWith('promis') && !COVERED.has(k))
          if (regional.length === 0) return null
          return (
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Functional &amp; Regional Instruments</h2>
              {regional.map(([key, meta]) => {
                const dbInst = getDbInstrument(key)
                return (
                  <div key={key} className="card mb-4">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="text-base font-semibold text-navy-DEFAULT">{meta.displayName}</h3>
                      {dbInst && (
                        <button
                          onClick={() => setPreview(dbInst)}
                          className="text-xs text-blue-600 hover:underline flex-shrink-0 ml-4"
                        >
                          Preview Questions
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mb-2 italic">{meta.citation}</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-1">Max: {meta.maxScore}</span>
                      <span className={`text-xs rounded px-2 py-1 ${meta.higherIsBetter ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {meta.higherIsBetter ? '↑ Higher = Better' : '↑ Higher = Worse'}
                      </span>
                    </div>
                    {NOTES[key] && <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-2">{NOTES[key]}</p>}
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* Custom instruments from DB */}
        {dbInstruments.filter(i => !INSTRUMENT_META[i.scoring_config_key] && i.scoring_config).length > 0 && (
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Custom Instruments</h2>
            {dbInstruments.filter(i => !INSTRUMENT_META[i.scoring_config_key] && i.scoring_config).map(inst => (
              <div key={inst.id} className="card mb-4">
                <div className="flex items-start justify-between mb-1">
                  <h3 className="text-base font-semibold text-navy-DEFAULT">{inst.name}</h3>
                  <button
                    onClick={() => setPreview(inst)}
                    className="text-xs text-blue-600 hover:underline flex-shrink-0 ml-4"
                  >
                    Preview Questions
                  </button>
                </div>
                {inst.version && <p className="text-xs text-gray-400 mb-2">{inst.version}</p>}
                {inst.scoring_config && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-1">
                      Scoring: {inst.scoring_config.type}
                    </span>
                    {inst.scoring_config.maxScore != null && (
                      <span className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-1">
                        Max: {inst.scoring_config.maxScore}
                      </span>
                    )}
                    {inst.scoring_config.higherIsBetter != null && (
                      <span className={`text-xs rounded px-2 py-1 ${inst.scoring_config.higherIsBetter ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {inst.scoring_config.higherIsBetter ? '↑ Higher = Better' : '↑ Higher = Worse'}
                      </span>
                    )}
                    {inst.scoring_config.severityBands?.map((b, i) => (
                      <span key={i} className="text-xs bg-gray-50 text-gray-700 rounded px-2 py-1">
                        {b.max != null ? `≤${b.max}` : 'else'}: {b.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="text-xs text-gray-400 mt-6 p-4 bg-gray-50 rounded-lg">
          <strong>Audit note:</strong> All scoring rules above are implemented exactly as shown in{' '}
          <code>src/config/scoring.ts</code>. Changes to scoring logic require a code deployment and
          appear in the Git commit history. Contact your administrator for the repository link.
        </div>
      </div>

      {preview && <InstrumentPreviewModal instrument={preview} onClose={() => setPreview(null)} />}
    </>
  )
}
