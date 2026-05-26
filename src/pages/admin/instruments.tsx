import { useEffect, useState } from 'react'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { SURVEY_QUESTIONS } from '@/config/surveyQuestions'
import { INSTRUMENT_META } from '@/config/scoring'
import type { Instrument, InstrumentScoringConfig } from '@/types/database'

interface SeverityBand {
  max: string
  label: string
  interpretation: string
}

interface OptionRow {
  value: string
  enLabel: string
  esLabel: string
}

interface ItemRow {
  id: string
  enText: string
  esText: string
}

const EMPTY_FORM = {
  name: '',
  code: '',
  version: '',
  hasEs: false,
  enTitle: '',
  enTimeframe: '',
  esTitle: '',
  esTimeframe: '',
  items: [{ id: 'q1', enText: '', esText: '' }] as ItemRow[],
  options: [{ value: '0', enLabel: '', esLabel: '' }] as OptionRow[],
  higherIsBetter: false,
  maxScore: '',
  bands: [{ max: '', label: '', interpretation: '' }] as SeverityBand[],
}

export default function InstrumentsPage() {
  const { profile } = useAuth()
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadInstruments() }, [])

  async function loadInstruments() {
    const { data } = await supabase.from('instruments').select('*').order('name')
    setInstruments(data ?? [])
    setLoading(false)
  }

  function setField<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function updateItem(i: number, field: keyof ItemRow, value: string) {
    setForm(f => {
      const items = [...f.items]
      items[i] = { ...items[i], [field]: value }
      return { ...f, items }
    })
  }

  function addItem() {
    setForm(f => ({
      ...f,
      items: [...f.items, { id: `q${f.items.length + 1}`, enText: '', esText: '' }],
    }))
  }

  function removeItem(i: number) {
    setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  }

  function updateOption(i: number, field: keyof OptionRow, value: string) {
    setForm(f => {
      const options = [...f.options]
      options[i] = { ...options[i], [field]: value }
      return { ...f, options }
    })
  }

  function addOption() {
    setForm(f => ({
      ...f,
      options: [...f.options, { value: String(f.options.length), enLabel: '', esLabel: '' }],
    }))
  }

  function removeOption(i: number) {
    setForm(f => ({ ...f, options: f.options.filter((_, idx) => idx !== i) }))
  }

  function updateBand(i: number, field: keyof SeverityBand, value: string) {
    setForm(f => {
      const bands = [...f.bands]
      bands[i] = { ...bands[i], [field]: value }
      return { ...f, bands }
    })
  }

  function addBand() {
    setForm(f => ({ ...f, bands: [...f.bands, { max: '', label: '', interpretation: '' }] }))
  }

  function removeBand(i: number) {
    setForm(f => ({ ...f, bands: f.bands.filter((_, idx) => idx !== i) }))
  }

  async function handleSave() {
    setError('')
    if (!form.name.trim() || !form.code.trim()) { setError('Name and Code are required.'); return }
    if (form.items.some(it => !it.enText.trim())) { setError('All items must have English text.'); return }
    if (form.options.some(o => !o.enLabel.trim())) { setError('All options must have English labels.'); return }

    const langs = ['en', ...(form.hasEs ? ['es'] : [])]
    const questions: Record<string, any> = {
      en: {
        title: form.enTitle.trim() || form.name.trim(),
        ...(form.enTimeframe ? { timeframe: form.enTimeframe.trim() } : {}),
        items: form.items.map(it => ({ id: it.id, text: it.enText.trim() })),
        options: form.options.map(o => ({ value: Number(o.value), label: o.enLabel.trim() })),
      },
    }
    if (form.hasEs) {
      questions.es = {
        title: form.esTitle.trim() || form.name.trim(),
        ...(form.esTimeframe ? { timeframe: form.esTimeframe.trim() } : {}),
        items: form.items.map(it => ({ id: it.id, text: it.esText.trim() || it.enText.trim() })),
        options: form.options.map(o => ({ value: Number(o.value), label: o.esLabel.trim() || o.enLabel.trim() })),
      }
    }

    const scoring_config: InstrumentScoringConfig = {
      type: 'sum',
      higherIsBetter: form.higherIsBetter,
      ...(form.maxScore ? { maxScore: Number(form.maxScore) } : {}),
      severityBands: form.bands
        .filter(b => b.label.trim())
        .map(b => ({
          ...(b.max !== '' ? { max: Number(b.max) } : {}),
          label: b.label.trim(),
          interpretation: b.interpretation.trim(),
        })),
    }

    setSaving(true)
    const { error: dbError } = await supabase.from('instruments').insert({
      name: form.name.trim(),
      scoring_config_key: form.code.trim(),
      version: form.version.trim() || null,
      languages: langs,
      is_active: true,
      questions,
      scoring_config,
    })
    setSaving(false)

    if (dbError) { setError(dbError.message); return }
    setForm({ ...EMPTY_FORM })
    setShowForm(false)
    loadInstruments()
  }

  async function toggleActive(inst: Instrument) {
    await supabase.from('instruments').update({ is_active: !inst.is_active }).eq('id', inst.id)
    loadInstruments()
  }

  const isHardcoded = (inst: Instrument) =>
    !!INSTRUMENT_META[inst.scoring_config_key] || !!SURVEY_QUESTIONS[inst.scoring_config_key]

  return (
    <>
      <Head><title>Instruments — MDE Platform</title></Head>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Survey Instruments</h1>
            <p className="text-gray-500 text-sm mt-0.5">Manage available survey instruments and create new ones</p>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ New Instrument</button>
        </div>

        {showForm && (
          <div className="card mb-8 border-2 border-blue-200">
            <h2 className="font-semibold text-gray-800 mb-5">Create New Instrument</h2>

            {/* Basic info */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="col-span-2">
                <label className="label">Instrument Name *</label>
                <input className="input" placeholder="e.g. Brief Pain Inventory" value={form.name} onChange={e => setField('name', e.target.value)} />
              </div>
              <div>
                <label className="label">Code (slug) *</label>
                <input className="input" placeholder="e.g. bpi_short" value={form.code} onChange={e => setField('code', e.target.value.toLowerCase().replace(/\s/g, '_'))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="label">Version</label>
                <input className="input" placeholder="e.g. v1.0" value={form.version} onChange={e => setField('version', e.target.value)} />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.hasEs} onChange={e => setField('hasEs', e.target.checked)} className="rounded" />
                  <span className="text-sm font-medium text-gray-700">Include Spanish translation</span>
                </label>
              </div>
            </div>

            {/* Per-language content */}
            <div className={`grid gap-6 mb-5 ${form.hasEs ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">English</p>
                <div className="mb-3">
                  <label className="label">Title</label>
                  <input className="input" placeholder="Title shown to patient" value={form.enTitle} onChange={e => setField('enTitle', e.target.value)} />
                </div>
                <div>
                  <label className="label">Timeframe / Instructions (optional)</label>
                  <input className="input" placeholder="e.g. In the past 7 days..." value={form.enTimeframe} onChange={e => setField('enTimeframe', e.target.value)} />
                </div>
              </div>
              {form.hasEs && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Spanish</p>
                  <div className="mb-3">
                    <label className="label">Title</label>
                    <input className="input" placeholder="Título para el paciente" value={form.esTitle} onChange={e => setField('esTitle', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Timeframe / Instructions (optional)</label>
                    <input className="input" placeholder="e.g. En los últimos 7 días..." value={form.esTimeframe} onChange={e => setField('esTimeframe', e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {/* Items */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Question Items *</label>
                <button type="button" onClick={addItem} className="text-xs text-blue-600 hover:underline">+ Add Item</button>
              </div>
              <div className="space-y-2">
                {form.items.map((item, i) => (
                  <div key={i} className={`grid gap-2 items-start ${form.hasEs ? 'grid-cols-[1.5rem_1fr_1fr_1.5rem]' : 'grid-cols-[1.5rem_1fr_1.5rem]'}`}>
                    <span className="text-xs text-gray-400 font-medium pt-2.5 text-right">{i + 1}.</span>
                    <input
                      className="input text-sm"
                      placeholder="English text"
                      value={item.enText}
                      onChange={e => updateItem(i, 'enText', e.target.value)}
                    />
                    {form.hasEs && (
                      <input
                        className="input text-sm"
                        placeholder="Spanish text"
                        value={item.esText}
                        onChange={e => updateItem(i, 'esText', e.target.value)}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      disabled={form.items.length === 1}
                      className="text-gray-300 hover:text-red-400 disabled:opacity-20 pt-2 text-lg leading-none"
                    >×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Response Options *</label>
                <button type="button" onClick={addOption} className="text-xs text-blue-600 hover:underline">+ Add Option</button>
              </div>
              <div className="space-y-2">
                {form.options.map((opt, i) => (
                  <div key={i} className={`grid gap-2 items-center ${form.hasEs ? 'grid-cols-[3rem_1fr_1fr_1.5rem]' : 'grid-cols-[3rem_1fr_1.5rem]'}`}>
                    <div>
                      <label className="label text-xs mb-0.5">Value</label>
                      <input
                        className="input text-sm text-center"
                        value={opt.value}
                        onChange={e => updateOption(i, 'value', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label text-xs mb-0.5">English label</label>
                      <input
                        className="input text-sm"
                        placeholder="e.g. Not at all"
                        value={opt.enLabel}
                        onChange={e => updateOption(i, 'enLabel', e.target.value)}
                      />
                    </div>
                    {form.hasEs && (
                      <div>
                        <label className="label text-xs mb-0.5">Spanish label</label>
                        <input
                          className="input text-sm"
                          placeholder="e.g. Para nada"
                          value={opt.esLabel}
                          onChange={e => updateOption(i, 'esLabel', e.target.value)}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      disabled={form.options.length === 1}
                      className="text-gray-300 hover:text-red-400 disabled:opacity-20 text-lg leading-none mt-5"
                    >×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Scoring config */}
            <div className="border-t border-gray-100 pt-5 mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Scoring Configuration (Sum)</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="label">Max Possible Score</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="e.g. 27"
                    value={form.maxScore}
                    onChange={e => setField('maxScore', e.target.value)}
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.higherIsBetter}
                      onChange={e => setField('higherIsBetter', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Higher score = better outcome</span>
                  </label>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Severity Bands</label>
                  <button type="button" onClick={addBand} className="text-xs text-blue-600 hover:underline">+ Add Band</button>
                </div>
                <div className="space-y-2">
                  {form.bands.map((band, i) => (
                    <div key={i} className="grid grid-cols-[5rem_1fr_1fr_1.5rem] gap-2 items-end">
                      <div>
                        <label className="label text-xs mb-0.5">Max score</label>
                        <input
                          className="input text-sm"
                          placeholder="leave blank for else"
                          value={band.max}
                          onChange={e => updateBand(i, 'max', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label text-xs mb-0.5">Label</label>
                        <input
                          className="input text-sm"
                          placeholder="e.g. Mild"
                          value={band.label}
                          onChange={e => updateBand(i, 'label', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label text-xs mb-0.5">Interpretation</label>
                        <input
                          className="input text-sm"
                          placeholder="e.g. Mild symptoms"
                          value={band.interpretation}
                          onChange={e => updateBand(i, 'interpretation', e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeBand(i)}
                        disabled={form.bands.length === 1}
                        className="text-gray-300 hover:text-red-400 disabled:opacity-20 text-lg leading-none mb-1"
                      >×</button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">Bands are evaluated in order. Leave Max score blank on the last band to catch all remaining scores.</p>
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-4">{error}</div>}
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
                {saving ? 'Saving...' : 'Save Instrument'}
              </button>
              <button onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }); setError('') }} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : (
          <div className="space-y-3">
            {instruments.map(inst => {
              const hardcoded = isHardcoded(inst)
              return (
                <div key={inst.id} className={`card flex items-start justify-between ${!inst.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{inst.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inst.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {inst.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {hardcoded ? 'Built-in' : 'Custom'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span className="font-mono">{inst.scoring_config_key}</span>
                      {inst.version && <span>{inst.version}</span>}
                      <span>{inst.languages.join(', ')}</span>
                    </div>
                    {!hardcoded && inst.scoring_config && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="text-xs bg-gray-50 text-gray-600 rounded px-2 py-0.5">sum scoring</span>
                        {inst.scoring_config.maxScore != null && (
                          <span className="text-xs bg-gray-50 text-gray-600 rounded px-2 py-0.5">max {inst.scoring_config.maxScore}</span>
                        )}
                        {inst.scoring_config.severityBands?.map((b, i) => (
                          <span key={i} className="text-xs bg-gray-50 text-gray-600 rounded px-2 py-0.5">
                            {b.max != null ? `≤${b.max}` : 'else'}: {b.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {!hardcoded && (
                    <button
                      onClick={() => toggleActive(inst)}
                      className="text-sm text-gray-500 hover:text-gray-700 ml-4 flex-shrink-0"
                    >
                      {inst.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
