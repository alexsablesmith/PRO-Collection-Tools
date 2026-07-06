import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Battery, Instrument, SurveyTemplate } from '@/types/database'
import { format, parseISO } from 'date-fns'
import InstrumentPreviewModal from '@/components/InstrumentPreviewModal'

// Badge config per instrument type
const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  standard:    { label: 'Standard',     cls: 'bg-gray-100 text-gray-600'    },
  promis_cat:  { label: 'PROMIS CAT',   cls: 'bg-blue-100 text-blue-700'    },
  promis_fixed:{ label: 'PROMIS Fixed', cls: 'bg-indigo-100 text-indigo-700'},
  freeform:    { label: 'Freeform',     cls: 'bg-purple-100 text-purple-700' },
}

export default function BatteriesPage() {
  const { profile } = useAuth()
  const [batteries,   setBatteries]   = useState<Battery[]>([])
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [templates,   setTemplates]   = useState<SurveyTemplate[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showNew,     setShowNew]     = useState(false)
  const [newName,     setNewName]     = useState('')
  const [selected,    setSelected]    = useState<string[]>([])
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [preview,     setPreview]     = useState<Instrument | null>(null)

  useEffect(() => { loadData() }, [profile?.organization_id])

  async function loadData() {
    if (!profile?.organization_id) return
    const [{ data: bats }, { data: insts }, { data: tmpls }] = await Promise.all([
      supabase.from('batteries').select('*').eq('organization_id', profile.organization_id).order('created_at'),
      supabase.from('instruments').select('*').eq('is_active', true),
      supabase.from('survey_templates').select('*').eq('organization_id', profile.organization_id).eq('is_active', true),
    ])
    setBatteries(bats ?? [])
    setInstruments(insts ?? [])
    setTemplates(tmpls ?? [])
    setLoading(false)
  }

  function toggleInstrument(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  // For freeform templates: find or create an instrument row, then return its ID
  async function resolveTemplateInstrumentId(tmpl: SurveyTemplate): Promise<string | null> {
    // Check for an existing instrument row linked to this template
    const existing = instruments.find(i => i.template_id === tmpl.id)
    if (existing) return existing.id

    // Create a new instruments row for this template
    const { data, error } = await supabase.from('instruments').insert({
      code:               `freeform_${tmpl.id}`,
      name:               tmpl.name,
      version:            null,
      type:               'freeform',
      template_id:        tmpl.id,
      scoring_config_key: 'freeform',
      languages:          ['en'],
      is_active:          true,
    }).select('id').single()

    if (error || !data) { console.error('Failed to create instrument row for template', error); return null }
    return data.id
  }

  async function createBattery() {
    if (!newName.trim() || selected.length === 0) return
    setError(''); setSaving(true)

    // Resolve template-backed instruments
    const resolvedIds: string[] = []
    for (const id of selected) {
      const tmpl = templates.find(t => `tmpl_${t.id}` === id)
      if (tmpl) {
        const instrId = await resolveTemplateInstrumentId(tmpl)
        if (!instrId) { setError('Failed to link one or more freeform surveys'); setSaving(false); return }
        resolvedIds.push(instrId)
      } else {
        resolvedIds.push(id)
      }
    }

    const { error } = await supabase.from('batteries').insert({
      name:            newName.trim(),
      instrument_ids:  resolvedIds,
      organization_id: profile!.organization_id,
      created_by:      profile!.id,
    })
    if (error) { setError(error.message); setSaving(false); return }
    setNewName(''); setSelected([]); setShowNew(false)
    loadData()
    setSaving(false)
  }

  async function toggleActive(bat: Battery) {
    await supabase.from('batteries').update({ is_active: !bat.is_active }).eq('id', bat.id)
    loadData()
  }

  // Group instruments for the picker
  const standardInstruments  = instruments.filter(i => i.type === 'standard')
  const catInstruments        = instruments.filter(i => i.type === 'promis_cat')
  const freeformInstruments   = instruments.filter(i => i.type === 'freeform')

  // All selectable items: instrument IDs for DB instruments, 'tmpl_<id>' for templates not yet in instruments
  const linkedTemplateIds = new Set(freeformInstruments.map(i => i.template_id).filter(Boolean))
  const unlinkedTemplates = templates.filter(t => t.type === 'freeform' && !linkedTemplateIds.has(t.id))

  return (
    <>
      <Head><title>Batteries — Prolix Health</title></Head>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Survey Batteries</h1>
            <p className="text-gray-500 text-sm mt-0.5">Manage instrument collections for survey delivery</p>
          </div>
          <div className="flex gap-2">
            <Link href="/surveys" className="btn-secondary text-sm">Manage Surveys</Link>
            {['app_admin','org_admin'].includes(profile?.role ?? '') && (
              <button onClick={() => setShowNew(true)} className="btn-primary text-sm">+ New Battery</button>
            )}
          </div>
        </div>

        {showNew && (
          <div className="card mb-6 border-2 border-blue-200">
            <h2 className="font-semibold text-gray-800 mb-4">Create New Battery</h2>
            <div className="mb-4">
              <label className="label">Battery Name</label>
              <input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Standard Intake Battery" />
            </div>
            <div className="mb-4">
              <label className="label">Select Instruments &amp; Surveys (in order)</label>
              <div className="space-y-4">

                {/* Standard instruments */}
                <InstrumentGroup
                  label="Standard Instruments"
                  items={standardInstruments.map(i => ({ id: i.id, name: i.name, sub: `${i.version ?? ''} · ${i.languages.join(', ')}`, type: i.type, instrument: i }))}
                  selected={selected}
                  onToggle={toggleInstrument}
                  onPreview={inst => setPreview(inst)}
                />

                {/* Freeform templates (already linked as instruments + unlinked templates) */}
                {(freeformInstruments.length > 0 || unlinkedTemplates.length > 0) && (
                  <InstrumentGroup
                    label="Freeform Surveys"
                    items={[
                      ...freeformInstruments.map(i => ({ id: i.id, name: i.name, sub: 'Custom survey · no scoring', type: i.type })),
                      ...unlinkedTemplates.map(t => ({ id: `tmpl_${t.id}`, name: t.name, sub: t.description ?? 'Custom survey · no scoring', type: 'freeform' })),
                    ]}
                    selected={selected}
                    onToggle={toggleInstrument}
                  />
                )}

                {(freeformInstruments.length === 0 && unlinkedTemplates.length === 0) && (
                  <p className="text-sm text-gray-400">
                    No freeform surveys yet.{' '}
                    <Link href="/surveys/freeform/new" className="text-blue-600 hover:underline">Create one</Link>.
                  </p>
                )}
              </div>
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{error}</div>}
            <div className="flex gap-2">
              <button onClick={createBattery} disabled={saving || !newName.trim() || selected.length === 0} className="btn-primary text-sm">
                {saving ? 'Creating…' : 'Create Battery'}
              </button>
              <button onClick={() => { setShowNew(false); setNewName(''); setSelected([]) }} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : batteries.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500">No batteries yet. Create one to start sending surveys.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {batteries.map(bat => {
              const batInstruments = bat.instrument_ids
                .map(iid => instruments.find(i => i.id === iid))
                .filter(Boolean) as Instrument[]
              return (
                <div key={bat.id} className={`card ${!bat.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{bat.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bat.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {bat.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Created {bat.created_at ? format(parseISO(bat.created_at), 'MMM d, yyyy') : ''}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {batInstruments.map((inst, i) => {
                          const badge = TYPE_BADGE[inst.type] ?? TYPE_BADGE.standard
                          return (
                            <span key={inst.id} className="text-xs bg-hdrbg text-navy-DEFAULT px-2 py-0.5 rounded flex items-center gap-1">
                              {i + 1}. {inst.name}
                              <span className={`px-1.5 py-0 rounded text-[10px] font-medium ${badge.cls}`}>{badge.label}</span>
                            </span>
                          )
                        })}
                      </div>
                    </div>
                    <button onClick={() => toggleActive(bat)} className="text-sm text-gray-500 hover:text-gray-700 ml-4 flex-shrink-0">
                      {bat.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {preview && <InstrumentPreviewModal instrument={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

function InstrumentGroup({
  label, items, selected, onToggle, onPreview,
}: {
  label: string
  items: { id: string; name: string; sub: string; type: string; instrument?: Instrument }[]
  selected: string[]
  onToggle: (id: string) => void
  onPreview?: (inst: Instrument) => void
}) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="space-y-1.5">
        {items.map(item => {
          const badge = TYPE_BADGE[item.type] ?? TYPE_BADGE.standard
          const isSelected = selected.includes(item.id)
          const position = isSelected ? selected.indexOf(item.id) + 1 : null
          return (
            <label
              key={item.id}
              className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-colors ${isSelected ? 'border-navy-DEFAULT bg-ltblue' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              <input type="checkbox" checked={isSelected} onChange={() => onToggle(item.id)} className="rounded" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className={`text-[10px] px-1.5 py-0 rounded font-medium ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className="text-xs text-gray-400">{item.sub}</div>
              </div>
              {onPreview && item.instrument && (
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); onPreview(item.instrument!) }}
                  className="text-xs text-blue-600 hover:underline flex-shrink-0"
                >
                  Preview
                </button>
              )}
              {isSelected && (
                <span className="text-xs font-mono text-navy-DEFAULT flex-shrink-0">#{position}</span>
              )}
            </label>
          )
        })}
      </div>
    </div>
  )
}
