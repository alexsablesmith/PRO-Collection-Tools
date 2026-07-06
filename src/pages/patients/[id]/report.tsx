import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { format, parseISO } from 'date-fns'
import type { Patient, SurveyRequest, SurveyResponse, Instrument, Item } from '@/types/database'
import { INSTRUMENT_META } from '@/config/scoring'

// Import the PDF generator we already built
// For the web app this calls the same jsPDF logic
declare const jsPDF: any

interface VisitData {
  request:   SurveyRequest
  responses: (SurveyResponse & { instrument: Instrument })[]
}

export default function ReportPage() {
  const router = useRouter()
  const { profile } = useAuth()
  const { id } = router.query as { id: string }

  const [patient,          setPatient]          = useState<Patient | null>(null)
  const [visits,           setVisits]           = useState<VisitData[]>([])
  const [selected,         setSelected]         = useState<string[]>([])
  const [loading,          setLoading]          = useState(true)
  const [generating,       setGenerating]       = useState(false)
  const [warning,          setWarning]          = useState('')
  const [includeResponses, setIncludeResponses] = useState(false)
  const [includeAdl,       setIncludeAdl]       = useState(true)
  const [items,            setItems]            = useState<Item[]>([])

  useEffect(() => { if (id) loadData() }, [id])

  async function loadData() {
    const [{ data: pat }, { data: reqs }] = await Promise.all([
      supabase.from('patients').select('*').eq('id', id).single(),
      supabase.from('survey_requests').select('*').eq('patient_id', id).eq('status', 'completed').order('completed_at'),
    ])
    setPatient(pat)
    if (!reqs) { setLoading(false); return }

    const { data: resps } = await supabase.from('survey_responses').select('*, instruments(*)').in('survey_request_id', reqs.map(r => r.id))
    const { data: insts } = await supabase.from('instruments').select('*')
    const { data: bankItems } = await supabase.from('items').select('*').limit(1000)
    setItems(bankItems ?? [])
    const instMap = Object.fromEntries((insts ?? []).map(i => [i.id, i]))

    const visitData: VisitData[] = reqs.map(req => ({
      request: req,
      responses: (resps ?? []).filter(r => r.survey_request_id === req.id).map(r => ({ ...r, instrument: instMap[r.instrument_id] })).filter(r => r.instrument),
    }))
    setVisits(visitData)
    // Pre-select all (up to 3 most recent)
    const ids = visitData.slice(-3).map(v => v.request.id)
    setSelected(ids)
    setLoading(false)
  }

  function toggleVisit(reqId: string) {
    setSelected(s => {
      if (s.includes(reqId)) return s.filter(x => x !== reqId)
      if (s.length >= 3) { setWarning('Maximum 3 visits. Deselect one first.'); return s }
      setWarning('')
      return [...s, reqId]
    })
  }

  async function generateReport() {
    if (selected.length === 0 || !patient) return
    setGenerating(true)

    // Log the report generation
    await supabase.from('report_audit_log').insert({
      generated_by:       profile!.id,
      patient_id:         patient.id,
      survey_request_ids: selected,
      report_type:        selected.length > 1 ? 'longitudinal' : 'single',
    })

    // Build the visits data for selected requests in chronological order
    const selectedVisits = selected
      .map(rid => visits.find(v => v.request.id === rid))
      .filter(Boolean)
      .sort((a, b) => new Date(a!.request.completed_at!).getTime() - new Date(b!.request.completed_at!).getTime()) as VisitData[]

    // Dynamically import jsPDF and build the PDF
    // This reuses the same PDF generation logic from our standalone app
    try {
      const { buildPatientPDF } = await import('@/lib/pdf')
      buildPatientPDF(patient, selectedVisits, { includeResponses, adlItems: includeAdl ? items : undefined })
    } catch(e) {
      console.error('PDF generation error:', e)
      alert('Error generating PDF. Please try again.')
    }

    setGenerating(false)
  }

  if (loading) return <div className="p-12 text-center text-gray-400">Loading...</div>
  if (!patient) return <div className="p-12 text-center text-gray-500">Patient not found.</div>

  return (
    <>
      <Head><title>Generate Report — Prolix Health</title></Head>
      <div className="max-w-xl">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1 mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          Back to Patient
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Generate Report</h1>
        <p className="text-gray-500 text-sm mb-6">
          {patient.first_name} {patient.last_name} — Select up to 3 visits to include
        </p>

        <div className="card mb-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Select visits (up to 3):</p>
          {visits.length === 0 ? (
            <p className="text-gray-400 text-sm">No completed surveys found.</p>
          ) : (
            <div className="space-y-2">
              {[...visits].reverse().map((v, i) => {
                const isSelected = selected.includes(v.request.id)
                const date = v.request.completed_at ? format(parseISO(v.request.completed_at), 'MMMM d, yyyy') : 'Unknown'
                const nScores = v.responses.length
                return (
                  <label
                    key={v.request.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${isSelected ? 'border-navy-DEFAULT bg-ltblue' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <input type="checkbox" checked={isSelected} onChange={() => toggleVisit(v.request.id)} className="rounded" />
                    <div className="flex-1">
                      <div className="font-medium text-sm text-gray-900">{date}</div>
                      <div className="text-xs text-gray-400">{nScores} instrument{nScores !== 1 ? 's' : ''} completed</div>
                    </div>
                    {isSelected && (
                      <span className="text-xs font-mono bg-navy-DEFAULT text-white px-1.5 py-0.5 rounded">
                        #{selected.indexOf(v.request.id) + 1}
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          )}
          {warning && <p className="text-xs text-amber-700 mt-2">{warning}</p>}
        </div>

        <label className="flex items-center gap-2 mb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeResponses}
            onChange={e => setIncludeResponses(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-gray-700">Include individual question responses</span>
        </label>

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={includeAdl}
            onChange={e => setIncludeAdl(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-gray-700">Include ADL impact matrix (medical-legal)</span>
        </label>

        <button
          onClick={generateReport}
          disabled={selected.length === 0 || generating}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          {generating ? 'Generating...' : `Download PDF Report (${selected.length} visit${selected.length !== 1 ? 's' : ''})`}
        </button>

        <p className="text-xs text-gray-400 mt-3 text-center">
          Report generation is logged for compliance purposes.
        </p>
      </div>
    </>
  )
}
