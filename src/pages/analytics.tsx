import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { format, parseISO } from 'date-fns'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { INSTRUMENT_META } from '@/config/scoring'
import type { SurveyRequest, SurveyResponse, Instrument } from '@/types/database'

/**
 * Organization-level population analytics: completion rates, score trends,
 * and severity distributions across all patients — for quality improvement
 * and research review.
 */
export default function AnalyticsPage() {
  const { profile } = useAuth()
  const [loading,     setLoading]     = useState(true)
  const [requests,    setRequests]    = useState<SurveyRequest[]>([])
  const [responses,   setResponses]   = useState<SurveyResponse[]>([])
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [nPatients,   setNPatients]   = useState(0)
  const [selectedKey, setSelectedKey] = useState('')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')

  useEffect(() => { if (profile?.organization_id) loadData() }, [profile?.organization_id])

  async function loadData() {
    const { data: patients } = await supabase
      .from('patients').select('id')
      .eq('organization_id', profile?.organization_id ?? '')
      .eq('is_active', true)
    const patientIds = (patients ?? []).map(p => p.id)
    setNPatients(patientIds.length)

    if (patientIds.length === 0) { setLoading(false); return }

    const [{ data: reqs }, { data: insts }] = await Promise.all([
      supabase.from('survey_requests').select('*').in('patient_id', patientIds),
      supabase.from('instruments').select('*'),
    ])
    setRequests(reqs ?? [])
    setInstruments(insts ?? [])

    const completedIds = (reqs ?? []).filter(r => r.status === 'completed').map(r => r.id)
    if (completedIds.length > 0) {
      const { data: resps } = await supabase
        .from('survey_responses').select('*').in('survey_request_id', completedIds)
      setResponses(resps ?? [])
    }
    setLoading(false)
  }

  const instrumentMap = useMemo(
    () => Object.fromEntries(instruments.map(i => [i.id, i])), [instruments])

  // Instruments that actually have data in this org
  const availableKeys = useMemo(() => {
    const keys = new Set<string>()
    responses.forEach(r => {
      const key = instrumentMap[r.instrument_id]?.scoring_config_key
      if (key && key !== 'gic') keys.add(key)
    })
    return Array.from(keys).sort()
  }, [responses, instrumentMap])

  useEffect(() => {
    if (!selectedKey && availableKeys.length > 0) setSelectedKey(availableKeys[0])
  }, [availableKeys, selectedKey])

  const inRange = (dateStr: string | null) => {
    if (!dateStr) return false
    if (dateFrom && dateStr < dateFrom) return false
    if (dateTo && dateStr > dateTo + 'T23:59:59') return false
    return true
  }

  const filteredResponses = useMemo(() =>
    responses.filter(r =>
      instrumentMap[r.instrument_id]?.scoring_config_key === selectedKey && inRange(r.completed_at)),
    [responses, selectedKey, dateFrom, dateTo, instrumentMap]) // eslint-disable-line react-hooks/exhaustive-deps

  const meta = INSTRUMENT_META[selectedKey]
  const scoreOf = (r: SurveyResponse) => meta?.isPromis ? r.t_score : r.total_score

  // Monthly mean score trend
  const monthly = useMemo(() => {
    const acc = new Map<string, { sum: number; n: number }>()
    filteredResponses.forEach(r => {
      const s = scoreOf(r)
      if (s == null || !r.completed_at) return
      const month = r.completed_at.slice(0, 7)
      const a = acc.get(month) ?? { sum: 0, n: 0 }
      a.sum += s; a.n += 1
      acc.set(month, a)
    })
    return Array.from(acc.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, a]) => ({
        month: format(parseISO(month + '-01'), 'MMM yyyy'),
        mean: Math.round((a.sum / a.n) * 10) / 10,
        n: a.n,
      }))
  }, [filteredResponses]) // eslint-disable-line react-hooks/exhaustive-deps

  // Severity distribution
  const severityDist = useMemo(() => {
    const acc = new Map<string, number>()
    filteredResponses.forEach(r => {
      const label = r.severity_label || 'Unlabeled'
      acc.set(label, (acc.get(label) ?? 0) + 1)
    })
    return Array.from(acc.entries()).map(([label, n]) => ({ label, n }))
      .sort((a, b) => b.n - a.n)
  }, [filteredResponses])

  const completed = requests.filter(r => r.status === 'completed')
  const sentOrPending = requests.length
  const completionRate = sentOrPending > 0 ? Math.round((completed.length / sentOrPending) * 100) : 0

  const scores = filteredResponses.map(scoreOf).filter((s): s is number => s != null)
  const meanScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null

  return (
    <>
      <Head><title>Analytics — Prolix Health</title></Head>
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Population Analytics</h1>
          <p className="text-gray-500 text-sm mt-0.5">Outcomes across your organization, for quality improvement and research</p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading analytics…</div>
        ) : (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                ['Active patients', String(nPatients)],
                ['Surveys sent', String(sentOrPending)],
                ['Surveys completed', String(completed.length)],
                ['Completion rate', `${completionRate}%`],
              ].map(([label, value]) => (
                <div key={label} className="card">
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="card">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Instrument</label>
                  <select className="input" value={selectedKey} onChange={e => setSelectedKey(e.target.value)}>
                    {availableKeys.map(key => (
                      <option key={key} value={key}>{INSTRUMENT_META[key]?.displayName ?? key}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">From</label>
                  <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div>
                  <label className="label">To</label>
                  <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
              </div>
            </div>

            {availableKeys.length === 0 ? (
              <div className="card text-center py-12 text-gray-500">No completed survey responses yet.</div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Trend */}
                  <div className="card">
                    <h3 className="font-semibold text-gray-800 mb-1">
                      Mean {meta?.isPromis ? 'T-score' : 'score'} by month
                    </h3>
                    <p className="text-xs text-gray-400 mb-3">
                      {scores.length} responses{meanScore != null && <> · overall mean {meta?.isPromis ? `T=${meanScore}` : meanScore}</>}
                      {meta && <> · {meta.higherIsBetter ? 'higher is better' : 'lower is better'}</>}
                    </p>
                    {monthly.length === 0 ? (
                      <p className="text-sm text-gray-400 py-8 text-center">No data in the selected range.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={monthly} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} domain={meta?.isPromis ? [20, 80] : [0, meta?.maxScore ?? 'auto']} />
                          <Tooltip formatter={(v: number, name: string) => [v, name === 'mean' ? 'Mean score' : name]} />
                          <Line type="monotone" dataKey="mean" stroke="#1F4E79" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Severity distribution */}
                  <div className="card">
                    <h3 className="font-semibold text-gray-800 mb-1">Severity distribution</h3>
                    <p className="text-xs text-gray-400 mb-3">All responses in the selected range</p>
                    {severityDist.length === 0 ? (
                      <p className="text-sm text-gray-400 py-8 text-center">No data in the selected range.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={severityDist} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} angle={-15} textAnchor="end" height={50} />
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="n" fill="#2E75B6" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <p className="text-xs text-gray-400">
                  Counts reflect completed survey responses for the selected instrument within your organization.
                  A patient with multiple visits contributes one response per visit.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
