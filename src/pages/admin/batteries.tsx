import { useEffect, useState } from 'react'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Battery, Instrument } from '@/types/database'
import { format, parseISO } from 'date-fns'
import InstrumentPreviewModal from '@/components/InstrumentPreviewModal'

export default function BatteriesPage() {
  const { profile } = useAuth()
  const [batteries,   setBatteries]   = useState<Battery[]>([])
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showNew,     setShowNew]     = useState(false)
  const [newName,     setNewName]     = useState('')
  const [selected,    setSelected]    = useState<string[]>([])
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [preview,     setPreview]     = useState<Instrument | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: bats }, { data: insts }] = await Promise.all([
      supabase.from('batteries').select('*').eq('organization_id', profile?.organization_id).order('created_at'),
      supabase.from('instruments').select('*').eq('is_active', true),
    ])
    setBatteries(bats ?? [])
    setInstruments(insts ?? [])
    setLoading(false)
  }

  function toggleInstrument(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  async function createBattery() {
    if (!newName.trim() || selected.length === 0) return
    setError(''); setSaving(true)
    const { error } = await supabase.from('batteries').insert({
      name: newName.trim(),
      instrument_ids: selected,
      organization_id: profile!.organization_id,
      created_by: profile!.id,
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

  return (
    <>
      <Head><title>Batteries — MDE Platform</title></Head>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Survey Batteries</h1>
            <p className="text-gray-500 text-sm mt-0.5">Manage instrument collections for survey delivery</p>
          </div>
          <button onClick={() => setShowNew(true)} className="btn-primary text-sm">+ New Battery</button>
        </div>

        {showNew && (
          <div className="card mb-6 border-2 border-blue-200">
            <h2 className="font-semibold text-gray-800 mb-4">Create New Battery</h2>
            <div className="mb-4">
              <label className="label">Battery Name</label>
              <input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Standard MDE Battery" />
            </div>
            <div className="mb-4">
              <label className="label">Select Instruments (in order)</label>
              <div className="space-y-2">
                {instruments.map(inst => (
                  <label key={inst.id} className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-colors ${selected.includes(inst.id) ? 'border-navy-DEFAULT bg-ltblue' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={selected.includes(inst.id)} onChange={() => toggleInstrument(inst.id)} className="rounded" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{inst.name}</div>
                      <div className="text-xs text-gray-400">{inst.version} · {inst.languages.join(', ')}</div>
                    </div>
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); setPreview(inst) }}
                      className="text-xs text-blue-600 hover:underline flex-shrink-0"
                    >
                      Preview
                    </button>
                    {selected.includes(inst.id) && (
                      <span className="text-xs font-mono text-navy-DEFAULT">#{selected.indexOf(inst.id) + 1}</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{error}</div>}
            <div className="flex gap-2">
              <button onClick={createBattery} disabled={saving || !newName.trim() || selected.length === 0} className="btn-primary text-sm">
                {saving ? 'Creating...' : 'Create Battery'}
              </button>
              <button onClick={() => { setShowNew(false); setNewName(''); setSelected([]) }} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
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
                        {batInstruments.map((inst, i) => (
                          <span key={inst.id} className="text-xs bg-hdrbg text-navy-DEFAULT px-2 py-0.5 rounded">
                            {i+1}. {inst.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleActive(bat)}
                      className="text-sm text-gray-500 hover:text-gray-700 ml-4 flex-shrink-0"
                    >
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
