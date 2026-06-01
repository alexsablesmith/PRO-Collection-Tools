import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { format, parseISO } from 'date-fns'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Patient, SurveyRequest, SurveyResponse, Instrument } from '@/types/database'
import { INSTRUMENT_META } from '@/config/scoring'
import PromisScoreChart, { type PromisDomain, type PromisVisit } from '@/components/results/PromisScoreChart'

interface VisitData {
  request:   SurveyRequest
  responses: (SurveyResponse & { instrument: Instrument })[]
}

export default function PatientDetailPage() {
  const router  = useRouter()
  const { profile } = useAuth()
  const { id }  = router.query as { id: string }

  const [patient,   setPatient]   = useState<Patient | null>(null)
  const [visits,    setVisits]    = useState<VisitData[]>([])
  const [loading,   setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState<'history'|'charts'>('history')

  const canSend = profile?.role === 'admin' || profile?.role === 'clinician'
  const canDelete = profile?.role === 'admin'

async function deletePatient() {
    if (!confirm('Are you sure you want to delete this patient and all their survey data? This cannot be undone.')) return
    const { data: requests } = await supabase.from('survey_requests').select('id').eq('patient_id', id)
    if (requests && requests.length > 0) {
      await supabase.from('survey_responses').delete().in('survey_request_id', requests.map(r => r.id))
    }
    await supabase.from('survey_requests').delete().eq('patient_id', id)
    await supabase.from('report_audit_log').delete().eq('patient_id', id)
    await supabase.from('patients').delete().eq('id', id)
    router.push('/patients')
  }

  useEffect(() => {
    if (id) loadData()
  }, [id])

  async function loadData() {
    setLoading(true)

    const [{ data: patientData }, { data: requestData }] = await Promise.all([
      supabase.from('patients').select('*').eq('id', id).single(),
      supabase.from('survey_requests').select('*').eq('patient_id', id).eq('status', 'completed').order('completed_at', { ascending: true }),
    ])

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

  const OTHER_KEYS = ['phq9','gad7','tsk11','pcs']

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

  function severityColor(label: string | null) {
    if (!label) return 'text-gray-500'
    if (label.toLowerCase().includes('normal') || label.toLowerCase().includes('minimal') || label.toLowerCase().includes('none')) return 'badge-wnl'
    if (label.toLowerCase().includes('mild')) return 'badge-mild'
    if (label.toLowerCase().includes('moderate')) return 'badge-mod'
    return 'badge-sev'
  }

  if (loading) return <div className="p-12 text-center text-gray-400">Loading patient...</div>
  if (!patient) return <div className="p-12 text-center text-gray-500">Patient not found.</div>

  const dob = patient.date_of_birth ? format(parseISO(patient.date_of_birth), 'MMMM d, yyyy') : '—'

  return (
    <>
      <Head><title>{patient.last_name}, {patient.first_name} — MDE Platform</title></Head>
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
              {canSend && visits.length > 0 && (
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
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {(['history','charts'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? 'border-navy-DEFAULT text-navy-DEFAULT'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'history' ? 'Survey History' : 'Score Trends'}
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
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {visit.responses.map(r => {
                        const meta = r.instrument ? INSTRUMENT_META[r.instrument.scoring_config_key] : null
                        const score = meta?.isPromis ? r.t_score : r.total_score
                        return (
                          <div key={r.id} className="bg-gray-50 rounded-lg p-3">
                            <div className="text-xs text-gray-500 mb-1">{meta?.shortName ?? r.instrument?.name}</div>
                            <div className="text-lg font-bold text-gray-900">
                              {score != null ? (meta?.isPromis ? `T=${score.toFixed(1)}` : score) : '—'}
                            </div>
                            {r.severity_label && (
                              <span className={`text-xs mt-1 inline-block ${severityColor(r.severity_label)}`}>
                                {r.severity_label}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
