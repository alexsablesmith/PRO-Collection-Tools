import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Item, InstrumentQuestionDef } from '@/types/database'

/** Instrument code as a display label: acronym in caps, PROMIS domain lowercase (e.g. PROMIS_fatigue_4a_v1) */
function formatInstrumentCode(code: string): string {
  if (code.startsWith('promis_')) return 'PROMIS_' + code.slice('promis_'.length)
  return code.toUpperCase()
}

/**
 * Item Bank browser: every question in the platform, tagged with ICF domain
 * and body region. Filter, select across instruments, and assemble a custom
 * survey. Custom surveys keep each item's canonical key, so item-level
 * responses still join back to ICF/body-region metadata (ADL matrix).
 */
export default function ItemBankPage() {
  const { profile } = useAuth()
  const [items,    setItems]    = useState<Item[]>([])
  const [loading,  setLoading]  = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search,   setSearch]   = useState('')
  const [fInst,    setFInst]    = useState('')
  const [fIcf,     setFIcf]     = useState('')
  const [fRegion,  setFRegion]  = useState('')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [showCreate, setShowCreate] = useState(false)
  const [surveyName, setSurveyName] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [message,  setMessage]  = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const canCreate = ['app_admin', 'org_admin', 'clinical_user'].includes(profile?.role ?? '')

  useEffect(() => { loadItems() }, [])

  async function loadItems() {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('instrument_code')
      .order('position')
      .limit(1000)
    if (error) { setLoadError(error.message); console.error('Failed to load item bank:', error) }
    setItems(data ?? [])
    setLoading(false)
  }

  const instruments = useMemo(
    () => Array.from(new Set(items.map(i => i.instrument_code))).sort(),
    [items])
  const icfDomains = useMemo(() => {
    const m = new Map<string, string>()
    items.forEach(i => {
      if (i.icf_primary_code) m.set(i.icf_primary_code, i.icf_primary_label ?? '')
      if (i.icf_secondary_code) m.set(i.icf_secondary_code, i.icf_secondary_label ?? '')
      if (i.mh_code) m.set(i.mh_code, i.mh_label ?? '')
    })
    return Array.from(m.entries()).sort()
  }, [items])
  const regions = useMemo(() => {
    const s = new Set<string>()
    items.forEach(i => {
      if (i.body_region_primary) s.add(i.body_region_primary)
      if (i.body_region_secondary) s.add(i.body_region_secondary)
    })
    return Array.from(s).sort()
  }, [items])

  const filtered = items.filter(i => {
    if (fInst && i.instrument_code !== fInst) return false
    if (fIcf && i.icf_primary_code !== fIcf && i.icf_secondary_code !== fIcf && i.mh_code !== fIcf) return false
    if (fRegion && i.body_region_primary !== fRegion && i.body_region_secondary !== fRegion) return false
    if (search && !i.text_en.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const selectedItems = items.filter(i => selected[i.id])

  function toggle(id: string) {
    setSelected(s => ({ ...s, [id]: !s[id] }))
  }

  async function createCustomSurvey() {
    if (!surveyName.trim() || selectedItems.length === 0) return
    setSaving(true); setMessage(null)

    const questionDef: InstrumentQuestionDef = {
      title: surveyName.trim(),
      items: selectedItems.map(it => ({
        id:      it.item_key,
        text:    it.text_en,
        options: it.options,
      })),
      options: [],
    }

    const slug = 'custom_' + surveyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)
      + '_' + Date.now().toString(36)

    const { error } = await supabase.from('instruments').insert({
      code:               slug,
      name:               surveyName.trim(),
      version:            null,
      type:               'freeform',
      scoring_config_key: slug,
      languages:          ['en'],
      is_active:          true,
      questions:          { en: questionDef },
      // Mixed items from different scales: sum is recorded but item-level
      // responses (and the ADL matrix) are the meaningful output.
      scoring_config:     { type: 'sum', severityBands: [] },
    })

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: `Custom survey "${surveyName.trim()}" created. Add it to a battery to administer it.` })
      setSelected({}); setSurveyName(''); setShowCreate(false)
    }
    setSaving(false)
  }

  return (
    <>
      <Head><title>Item Bank — Prolix Health</title></Head>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Item Bank</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {items.length} questions across {instruments.length} instruments, tagged by ICF domain and body region
            </p>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              disabled={selectedItems.length === 0}
              className="btn-primary text-sm disabled:opacity-40"
            >
              Create Custom Survey ({selectedItems.length})
            </button>
          )}
        </div>

        {message && (
          <div className={`rounded-lg px-4 py-3 text-sm mb-4 ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {message.text}
          </div>
        )}

        {showCreate && (
          <div className="card mb-6 border-2 border-blue-200">
            <h2 className="font-semibold text-gray-800 mb-3">Create Custom Survey</h2>
            <p className="text-xs text-gray-500 mb-3">
              {selectedItems.length} selected question{selectedItems.length === 1 ? '' : 's'}. Each keeps its original response options.
              Item-level responses remain linked to ICF and body-region metadata.
            </p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="label">Survey name *</label>
                <input className="input" placeholder="e.g. Upper Extremity ADL Screen" value={surveyName} onChange={e => setSurveyName(e.target.value)} />
              </div>
              <button onClick={createCustomSurvey} disabled={saving || !surveyName.trim()} className="btn-primary text-sm">
                {saving ? 'Creating…' : 'Create'}
              </button>
              <button onClick={() => setShowCreate(false)} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="card mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input className="input" placeholder="Search question text…" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="input" value={fInst} onChange={e => setFInst(e.target.value)}>
              <option value="">All instruments</option>
              {instruments.map(c => <option key={c} value={c}>{formatInstrumentCode(c)}</option>)}
            </select>
            <select className="input" value={fIcf} onChange={e => setFIcf(e.target.value)}>
              <option value="">All ICF domains</option>
              {icfDomains.map(([code, label]) => <option key={code} value={code}>{code} — {label}</option>)}
            </select>
            <select className="input" value={fRegion} onChange={e => setFRegion(e.target.value)}>
              <option value="">All body regions</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading item bank…</div>
        ) : loadError ? (
          <div className="card text-center py-12 text-red-600">
            Failed to load the item bank: {loadError}
          </div>
        ) : items.length === 0 ? (
          <div className="card text-center py-12 text-gray-500">
            The item bank is empty. Apply the item bank migrations in <code>supabase/migrations</code> to seed it.
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-hdrbg">
                  <tr>
                    {canCreate && <th className="px-3 py-3 w-8"></th>}
                    <th className="text-left px-3 py-3 font-semibold text-navy-DEFAULT">Question</th>
                    <th className="text-left px-3 py-3 font-semibold text-navy-DEFAULT">Instrument</th>
                    <th className="text-left px-3 py-3 font-semibold text-navy-DEFAULT">ICF Domain</th>
                    <th className="text-left px-3 py-3 font-semibold text-navy-DEFAULT">Body Region</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it, i) => (
                    <tr key={it.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      {canCreate && (
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={!!selected[it.id]} onChange={() => toggle(it.id)} />
                        </td>
                      )}
                      <td className="px-3 py-2 text-gray-800 max-w-md">{it.text_en}</td>
                      <td className="px-3 py-2">
                        <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{formatInstrumentCode(it.instrument_code)}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {it.icf_primary_code && (
                          <span className="inline-block bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded mr-1" title={it.icf_primary_label ?? ''}>
                            {it.icf_primary_code} {it.icf_primary_label}
                          </span>
                        )}
                        {it.icf_secondary_code && (
                          <span className="inline-block bg-blue-50/60 text-blue-600 px-1.5 py-0.5 rounded mr-1" title={it.icf_secondary_label ?? ''}>
                            {it.icf_secondary_code}
                          </span>
                        )}
                        {it.mh_code && (
                          <span className="inline-block bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded" title={it.mh_label ?? ''}>
                            {it.mh_code} {it.mh_label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {it.body_region_primary}
                        {it.body_region_secondary ? `, ${it.body_region_secondary}` : ''}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={canCreate ? 5 : 4} className="px-3 py-8 text-center text-gray-400">No items match the current filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
