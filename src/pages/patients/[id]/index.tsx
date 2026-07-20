import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { format, parseISO } from 'date-fns'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Patient, SurveyRequest, SurveyResponse, Instrument, Item, ClinicalEvent, ClinicalEventType } from '@/types/database'
import { INSTRUMENT_META } from '@/config/scoring'
import { SURVEY_QUESTIONS } from '@/config/surveyQuestions'
import PromisScoreChart, { type PromisDomain, type PromisVisit } from '@/components/results/PromisScoreChart'
import AdlMatrix from '@/components/results/AdlMatrix'

interface VisitData {
  request:   SurveyRequest
  responses: (SurveyResponse & { instrument: Instrument })[]
}

export default function PatientDetailPage() {
  const router  = useRouter()
  const { profile } = useAuth()
  const { id }  = router.query as { id: string }

  const [patient,         setPatient]         = useState<Patient | null>(null)
  const [visits,          setVisits]          = useState<VisitData[]>([])
  const [loading,         setLoading]         = useState(true)
  const [activeTab,       setActiveTab]       = useState<'history'|'charts'|'adl'|'events'>('history')
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null)
  const [items,           setItems]           = useState<Item[]>([])
  const [adlVisitId,      setAdlVisitId]      = useState<string | null>(null)
  const [events,          setEvents]          = useState<ClinicalEvent[]>([])
  const [compareEventId,  setCompareEventId]  = useState<string | null>(null)
  const [showEventForm,   setShowEventForm]   = useState(false)
  const [eventForm,       setEventForm]       = useState({ event_type: 'surgery' as ClinicalEventType, label: '', event_date: '', notes: '' })

  const canSend   = ['app_admin','org_admin','clinical_user'].includes(profile?.role ?? '')
  const canReport = ['app_admin','org_admin','clinical_user','read_only'].includes(profile?.role ?? '')
  const canDelete = ['app_admin','org_admin'].includes(profile?.role ?? '')

  async function deletePatient() {
    if (!confirm('Are you sure you want to delete this patient and all their survey data? This cannot be undone.')) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/patients/${id}/delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      alert(json.error ?? 'Failed to delete patient.')
      return
    }
    router.push('/patients')
  }

  useEffect(() => {
    if (id) loadData()
  }, [id])

  async function loadData() {
    setLoading(true)

    const [{ data: patientData }, { data: requestData }, { data: itemData }, { data: eventData }] = await Promise.all([
      supabase.from('patients').select('*').eq('id', id).single(),
      supabase.from('survey_requests').select('*').eq('patient_id', id).eq('status', 'completed').order('completed_at', { ascending: true }),
      supabase.from('items').select('*').limit(1000),
      supabase.from('clinical_events').select('*').eq('patient_id', id).order('event_date', { ascending: true }),
    ])
    setItems(itemData ?? [])
    setEvents(eventData ?? [])

    if (!patientData) { setLoading(false); return }
    setPatient(patientData)

    if (!requestData || requestData.length === 0) { setVisits([]); setLoading(false); return }

    const requestIds = requestData.map(r => r.id)
    const [{ data: responses }, { data: instruments }] = await Promise.all([
      supabase.from('survey_responses').select('*').in('survey_request_id', requestIds),
      supabase.from('instruments').select('*'),
    ])

    const instrumentMap = Object.fromEntries((instruments ?? []).map(i => [i.id, i]))

    const visitData: VisitData[] = requestData.map(req => ({
      request:   req,
      responses: (responses ?? [])
        .filter(r => r.survey_request_id === req.id)
        .map(r => ({ ...r, instrument: instrumentMap[r.instrument_id] }))
        .filter(r => r.instrument),
    }))

    setVisits(visitData)
    setLoading(false)
  }

  // Build chart data for longitudinal view
  function buildChartData(configKey: string) {
    return visits.map(v => {
      const resp = v.responses.find(r => r.instrument?.scoring_config_key === configKey)
      const meta = INSTRUMENT_META[configKey]
      return {
        date:  v.request.completed_at ? format(parseISO(v.request.completed_at), 'MM/dd/yy') : '',
        score: meta?.isPromis ? resp?.t_score : resp?.total_score,
      }
    }).filter(d => d.score != null)
  }

  const OTHER_KEYS = ['phq9','gad7','tsk11','pcs','odi','ndi','dash','quickdash','koos','hoos','womac','lefs','faam','haq_di','uw_pain']

  // Map scoring_config_key → PromisDomain for the band chart
  const PROMIS_DOMAIN_MAP: Record<string, PromisDomain> = {
    'promis_physical_function_4a_v2': 'physical_function',
    'promis_anxiety_4a_v1':           'anxiety',
    'promis_depression_4a_v1':        'depression',
    'promis_fatigue_4a_v1':           'fatigue',
    'promis_sleep_4a_v1':             'sleep_disturbance',
    'promis_social_4a_v1':            'social_roles',
    'promis_pain_interference_4a_v1': 'pain_interference',
  }

  // Build PromisVisit[] for the band chart — use most recent 3 visits
  const promisVisits: PromisVisit[] = visits.slice(-3).map(v => {
    const scores: Partial<Record<PromisDomain, number>> = {}
    v.responses.forEach(r => {
      const domain = r.instrument?.scoring_config_key
        ? PROMIS_DOMAIN_MAP[r.instrument.scoring_config_key]
        : undefined
      if (domain && r.t_score != null) scores[domain] = r.t_score
    })
    return {
      date: v.request.completed_at ? format(parseISO(v.request.completed_at), 'MMM d, yyyy') : '',
      scores,
    }
  })

  // ── Clinical events ─────────────────────────────────────────
  async function addEvent() {
    if (!eventForm.label.trim() || !eventForm.event_date || !patient) return
    const { error } = await supabase.from('clinical_events').insert({
      patient_id:      patient.id,
      organization_id: patient.organization_id,
      event_type:      eventForm.event_type,
      label:           eventForm.label.trim(),
      event_date:      eventForm.event_date,
      notes:           eventForm.notes.trim() || null,
      created_by:      profile?.id ?? null,
    })
    if (error) { alert(error.message); return }
    setEventForm({ event_type: 'surgery', label: '', event_date: '', notes: '' })
    setShowEventForm(false)
    loadData()
  }

  async function deleteEvent(eventId: string) {
    if (!confirm('Remove this event?')) return
    await supabase.from('clinical_events').delete().eq('id', eventId)
    loadData()
  }

  /**
   * Pre/post comparison anchored to a clinical event: for every instrument,
   * the closest completed score before the event vs the first score after.
   */
  function buildPrePost(eventDate: string) {
    const keys = Array.from(new Set(
      visits.flatMap(v => v.responses.map(r => r.instrument?.scoring_config_key).filter(Boolean))
    )) as string[]

    return keys.map(key => {
      const meta = INSTRUMENT_META[key]
      const scored = visits
        .map(v => {
          const resp = v.responses.find(r => r.instrument?.scoring_config_key === key)
          const score = meta?.isPromis ? resp?.t_score : resp?.total_score
          return { date: v.request.completed_at, score }
        })
        .filter(d => d.date && d.score != null) as { date: string; score: number }[]

      const before = [...scored].reverse().find(d => d.date < eventDate)
      const after  = scored.find(d => d.date >= eventDate)
      if (!before || !after) return null

      const delta = Math.round((after.score - before.score) * 10) / 10
      const improved = delta === 0 ? null : (meta?.higherIsBetter ?? false) ? delta > 0 : delta < 0
      return {
        key,
        name: meta?.displayName ?? key,
        isPromis: meta?.isPromis ?? false,
        before, after, delta, improved,
      }
    }).filter(Boolean) as {
      key: string; name: string; isPromis: boolean
      before: { date: string; score: number }; after: { date: string; score: number }
      delta: number; improved: boolean | null
    }[]
  }

  function severityColor(label: string | null) {
    if (!label) return 'text-gray-500'
    const s = label.toLowerCase()
    if (s.includes('normal') || s.includes('minimal') || s.includes('none') || s.includes('below') || s.includes('improved')) return 'badge-wnl'
    if (s.includes('mild')) return 'badge-mild'
    if (s.includes('moderate')) return 'badge-mod'
    if (s.includes('no change')) return 'text-gray-500'
    return 'badge-sev'
  }

  function buildResponseMatrix(instrument: Instrument, rawResponses: Record<string, number>) {
    // Clinician-facing views are always English, regardless of the
    // language the survey was administered in.
    const lang = 'en'
    const qDef = (instrument.questions as any)?.[lang]
      ?? SURVEY_QUESTIONS[instrument.scoring_config_key]?.[lang]
    if (!qDef) return null
    return {
      title:     qDef.title as string,
      timeframe: (qDef.timeframe ?? null) as string | null,
      items: (qDef.items as any[]).map(item => ({
        text:     item.text as string,
        options:  (item.options ?? qDef.options) as { value: number; label: string }[],
        selected: rawResponses[item.id] ?? null,
      })),
    }
  }

  if (loading) return <div className="p-12 text-center text-gray-400">Loading patient...</div>
  if (!patient) return <div className="p-12 text-center text-gray-500">Patient not found.</div>

  const dob = patient.date_of_birth ? format(parseISO(patient.date_of_birth), 'MMMM d, yyyy') : '—'

  return (
    <>
      <Head><title>{patient.last_name}, {patient.first_name} — Prolix Health</title></Head>
      <div>
        {/* Back */}
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1 mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          All Patients
        </button>

        {/* Patient header */}
        <div className="card mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-hdrbg text-navy-DEFAULT flex items-center justify-center text-xl font-bold flex-shrink-0">
                {patient.first_name[0]}{patient.last_name[0]}
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{patient.first_name} {patient.last_name}</h1>
                <div className="text-sm text-gray-500 flex flex-wrap gap-3 mt-0.5">
                  <span>DOB: {dob}</span>
                  {patient.gender && <span>Gender: {patient.gender}</span>}
                  <span>Language: {patient.preferred_language === 'es' ? 'Spanish' : 'English'}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {canSend && (
                <Link href={`/patients/${id}/survey`} className="btn-primary text-sm">
                  Send Survey
                </Link>
              )}
              {canReport && visits.length > 0 && (
                <Link href={`/patients/${id}/report`} className="btn-secondary text-sm">
                  Generate Report
                </Link>
              )}
              {canDelete && (
                <button onClick={deletePatient} className="btn-danger text-sm">
                  Delete Patient
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
          {([
            ['history', 'Survey History'],
            ['charts',  'Score Trends'],
            ['adl',     'ADL Impact'],
            ['events',  'Events & Pre/Post'],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                activeTab === tab
                  ? 'border-navy-DEFAULT text-navy-DEFAULT'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Survey History Tab */}
        {activeTab === 'history' && (
          <div>
            {visits.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-gray-500">No completed surveys yet.</p>
                {canSend && (
                  <Link href={`/patients/${id}/survey`} className="text-blue-600 hover:underline text-sm mt-2 inline-block">
                    Send first survey →
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {[...visits].reverse().map((visit, i) => (
                  <div key={visit.request.id} className="card">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <span className="font-semibold text-gray-800">
                          {visit.request.completed_at
                            ? format(parseISO(visit.request.completed_at), 'MMMM d, yyyy')
                            : 'Unknown date'}
                        </span>
                        <span className="text-gray-400 text-sm ml-2">Visit {visits.length - i}</span>
                      </div>
                      <button
                        onClick={() => setExpandedVisitId(v => v === visit.request.id ? null : visit.request.id)}
                        className="text-xs text-blue-600 hover:underline flex-shrink-0"
                      >
                        {expandedVisitId === visit.request.id ? '▲ Hide Responses' : '▼ View Responses'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {visit.responses.map(r => {
                        const meta = r.instrument ? INSTRUMENT_META[r.instrument.scoring_config_key] : null
                        const noScore = r.instrument?.scoring_config?.type === 'none'
                        const score = meta?.isPromis ? r.t_score : r.total_score
                        return (
                          <div key={r.id} className="bg-gray-50 rounded-lg p-3">
                            <div className="text-xs text-gray-500 mb-1">{meta?.shortName ?? r.instrument?.name}</div>
                            {noScore ? (
                              <div className="text-xs text-gray-400 italic mt-1.5">
                                No composite score — see individual responses
                              </div>
                            ) : (
                              <div className="text-lg font-bold text-gray-900">
                                {score != null ? (meta?.isPromis ? `T=${score.toFixed(1)}` : score) : '—'}
                              </div>
                            )}
                            {r.severity_label && (
                              <span className={`text-xs mt-1 inline-block ${severityColor(r.severity_label)}`}>
                                {r.severity_label}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Expandable individual response matrix */}
                    {expandedVisitId === visit.request.id && (
                      <div className="mt-5 space-y-6 border-t border-gray-100 pt-5">
                        {visit.responses.map(r => {
                          const key = r.instrument?.scoring_config_key
                          const raw = r.raw_responses as Record<string, number> | null

                          // Pain NRS: single value, show inline
                          if (key === 'pain_nrs') {
                            const val = raw?.['nrs']
                            return (
                              <div key={r.id}>
                                <p className="text-xs font-semibold text-gray-700 mb-1">Pain Intensity (NRS)</p>
                                <p className="text-sm text-gray-600">
                                  Reported pain: <strong>{val != null ? `${val} / 10` : '—'}</strong>
                                </p>
                              </div>
                            )
                          }

                          if (!raw || !r.instrument) return null
                          const matrix = buildResponseMatrix(r.instrument, raw)
                          if (!matrix) return null

                          // Custom surveys mix response scales, so a shared-column
                          // matrix doesn't fit. Render each question like a paper
                          // multiple-choice survey: its own options, selected one marked.
                          if (r.instrument.scoring_config?.type === 'none') {
                            return (
                              <div key={r.id}>
                                <p className="text-xs font-semibold text-gray-700">{matrix.title}</p>
                                <p className="text-xs italic text-gray-400 mb-3">Custom survey — individual responses (no composite score)</p>
                                <ol className="space-y-3">
                                  {matrix.items.map((item, qi) => (
                                    <li key={qi} className="text-sm">
                                      <p className="text-gray-800 mb-1.5">
                                        <span className="text-gray-400 mr-1">{qi + 1}.</span>{item.text}
                                      </p>
                                      <div className="flex flex-wrap gap-1.5 pl-5">
                                        {item.options.map(opt => (
                                          <span
                                            key={opt.value}
                                            className={`text-xs rounded-full px-2.5 py-1 border ${
                                              item.selected === opt.value
                                                ? 'bg-navy-DEFAULT text-white border-navy-DEFAULT font-semibold'
                                                : 'bg-white text-gray-500 border-gray-200'
                                            }`}
                                          >
                                            {opt.label}
                                          </span>
                                        ))}
                                        {item.selected === null && (
                                          <span className="text-xs italic text-gray-400 py-1">No response</span>
                                        )}
                                      </div>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            )
                          }

                          return (
                            <div key={r.id}>
                              <p className="text-xs font-semibold text-gray-700">{matrix.title}</p>
                              {matrix.timeframe && (
                                <p className="text-xs italic text-gray-400 mb-2">{matrix.timeframe}</p>
                              )}
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-hdrbg">
                                      <th className="text-left py-1.5 pr-3 font-normal text-gray-400 w-1/2"></th>
                                      {matrix.items[0].options.map(opt => (
                                        <th key={opt.value} className="text-center py-1.5 px-2 font-semibold text-navy-DEFAULT leading-tight min-w-[52px]">
                                          {opt.label}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {matrix.items.map((item, qi) => {
                                      const prevOptions = qi > 0 ? matrix.items[qi - 1].options : null
                                      const optionsChanged = prevOptions !== null &&
                                        prevOptions.map(o => o.label).join('|') !== item.options.map(o => o.label).join('|')
                                      return (
                                        <>
                                          {optionsChanged && (
                                            <tr key={`hdr-${qi}`} className="bg-hdrbg">
                                              <th className="py-1.5 pr-3"></th>
                                              {item.options.map(opt => (
                                                <th key={opt.value} className="text-center py-1.5 px-2 font-semibold text-navy-DEFAULT leading-tight min-w-[52px]">
                                                  {opt.label}
                                                </th>
                                              ))}
                                            </tr>
                                          )}
                                          <tr key={qi} className={qi % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            <td className="py-2 pr-3 text-gray-700 align-middle">
                                              <span className="text-gray-400 mr-1">{qi + 1}.</span>{item.text}
                                            </td>
                                            {item.options.map(opt => (
                                              <td key={opt.value} className="text-center py-2 px-2 align-middle">
                                                {item.selected === opt.value
                                                  ? <span className="text-[#1F4E79] font-bold text-base leading-none">●</span>
                                                  : <span className="text-gray-300 text-base leading-none">○</span>
                                                }
                                              </td>
                                            ))}
                                          </tr>
                                        </>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ADL Impact Tab (medical-legal view) */}
        {activeTab === 'adl' && (
          <div>
            {visits.length === 0 ? (
              <div className="card text-center py-12"><p className="text-gray-500">No completed surveys yet.</p></div>
            ) : (() => {
              const visit = visits.find(v => v.request.id === adlVisitId) ?? visits[visits.length - 1]
              const answers: Record<string, number> = {}
              visit.responses.forEach(r => Object.assign(answers, r.raw_responses ?? {}))
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-600">Evaluation date:</label>
                    <select
                      className="input w-auto"
                      value={visit.request.id}
                      onChange={e => setAdlVisitId(e.target.value)}
                    >
                      {[...visits].reverse().map(v => (
                        <option key={v.request.id} value={v.request.id}>
                          {v.request.completed_at ? format(parseISO(v.request.completed_at), 'MMMM d, yyyy') : 'Unknown date'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <AdlMatrix items={items} answers={answers} />
                </div>
              )
            })()}
          </div>
        )}

        {/* Events & Pre/Post Tab */}
        {activeTab === 'events' && (
          <div className="space-y-6">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">Clinical Events</h3>
                {canSend && (
                  <button onClick={() => setShowEventForm(v => !v)} className="btn-primary text-sm">
                    {showEventForm ? 'Cancel' : '+ Add Event'}
                  </button>
                )}
              </div>

              {showEventForm && (
                <div className="border border-blue-200 rounded-lg p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Type</label>
                    <select className="input" value={eventForm.event_type} onChange={e => setEventForm(f => ({ ...f, event_type: e.target.value as ClinicalEventType }))}>
                      <option value="surgery">Surgery</option>
                      <option value="injury">Injury</option>
                      <option value="treatment_start">Treatment start</option>
                      <option value="treatment_end">Treatment end</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Date *</label>
                    <input type="date" className="input" value={eventForm.event_date} onChange={e => setEventForm(f => ({ ...f, event_date: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Label *</label>
                    <input className="input" placeholder="e.g. L4-L5 fusion" value={eventForm.label} onChange={e => setEventForm(f => ({ ...f, label: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Notes</label>
                    <input className="input" value={eventForm.notes} onChange={e => setEventForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <div>
                    <button onClick={addEvent} disabled={!eventForm.label.trim() || !eventForm.event_date} className="btn-primary text-sm">Save Event</button>
                  </div>
                </div>
              )}

              {events.length === 0 ? (
                <p className="text-sm text-gray-500">No events recorded. Add a surgery, injury, or treatment milestone to unlock pre/post comparisons.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {events.map(ev => (
                    <li key={ev.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs uppercase tracking-wide text-gray-400 mr-2">{ev.event_type.replace('_', ' ')}</span>
                        <span className="font-medium text-gray-800">{ev.label}</span>
                        <span className="text-sm text-gray-500 ml-2">{format(parseISO(ev.event_date), 'MMM d, yyyy')}</span>
                        {ev.notes && <div className="text-xs text-gray-400 mt-0.5">{ev.notes}</div>}
                      </div>
                      <div className="flex gap-3 flex-shrink-0">
                        <button
                          onClick={() => setCompareEventId(c => c === ev.id ? null : ev.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {compareEventId === ev.id ? 'Hide comparison' : 'Compare pre/post'}
                        </button>
                        {canSend && (
                          <button onClick={() => deleteEvent(ev.id)} className="text-xs text-gray-400 hover:text-red-600">Remove</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {compareEventId && (() => {
              const ev = events.find(e => e.id === compareEventId)
              if (!ev) return null
              const rows = buildPrePost(ev.event_date)
              return (
                <div className="card">
                  <h3 className="font-semibold text-gray-800 mb-1">
                    Before vs. after: {ev.label}
                    <span className="text-sm font-normal text-gray-500 ml-2">{format(parseISO(ev.event_date), 'MMMM d, yyyy')}</span>
                  </h3>
                  {rows.length === 0 ? (
                    <p className="text-sm text-gray-500 mt-2">
                      No instrument has a completed score both before and after this event.
                    </p>
                  ) : (
                    <div className="overflow-x-auto mt-3">
                      <table className="w-full text-sm">
                        <thead className="bg-hdrbg">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-navy-DEFAULT">Instrument</th>
                            <th className="text-center px-3 py-2 font-semibold text-navy-DEFAULT">Before</th>
                            <th className="text-center px-3 py-2 font-semibold text-navy-DEFAULT">After</th>
                            <th className="text-center px-3 py-2 font-semibold text-navy-DEFAULT">Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, i) => (
                            <tr key={row.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-3 py-2.5 text-gray-800">{row.name}</td>
                              <td className="px-3 py-2.5 text-center">
                                <div className="font-semibold">{row.isPromis ? `T=${row.before.score.toFixed(1)}` : row.before.score}</div>
                                <div className="text-xs text-gray-400">{format(parseISO(row.before.date), 'MM/dd/yy')}</div>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <div className="font-semibold">{row.isPromis ? `T=${row.after.score.toFixed(1)}` : row.after.score}</div>
                                <div className="text-xs text-gray-400">{format(parseISO(row.after.date), 'MM/dd/yy')}</div>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  row.improved === null ? 'bg-gray-100 text-gray-500'
                                  : row.improved ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                                }`}>
                                  {row.delta > 0 ? '+' : ''}{row.delta}
                                  {row.improved === null ? '' : row.improved ? ' improved' : ' worse'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-xs text-gray-400 mt-2">
                        Before = most recent completed score prior to the event date; After = first completed score on or after it.
                        Improvement direction accounts for each instrument&apos;s orientation.
                      </p>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* Charts Tab */}
        {activeTab === 'charts' && (
          <div>
            {visits.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-gray-500">No completed surveys yet.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* PROMIS band chart — works with 1 or more visits */}
                <div className="card">
                  <h3 className="font-semibold text-gray-800 mb-1">PROMIS T-Scores</h3>
                  <p className="text-xs text-gray-400 mb-4">
                    T-scores normed to US general population (mean=50, SD=10). Green = Within Normal Limits.
                    For Physical Function and Social Roles &amp; Activities, higher T = better. For all other domains, higher T = more symptoms.
                    {visits.length > 3 && ' Showing most recent 3 visits.'}
                  </p>
                  <PromisScoreChart visits={promisVisits} />
                </div>

                {/* Other scales — require 2 visits for a trend line */}
                {visits.length >= 2 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {OTHER_KEYS.map(key => {
                      const data = buildChartData(key)
                      const meta = INSTRUMENT_META[key]
                      if (data.length < 2) return null
                      return (
                        <div key={key} className="card">
                          <h3 className="font-semibold text-gray-800 mb-3">{meta?.displayName}</h3>
                          <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                              <YAxis domain={[0, meta?.maxScore ?? 'auto']} tick={{ fontSize: 10 }} />
                              <Tooltip />
                              <Line type="monotone" dataKey="score" stroke="#1F4E79" strokeWidth={2} dot={{ r: 4 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
