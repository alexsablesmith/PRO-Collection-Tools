import { useState } from 'react'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { format, parseISO } from 'date-fns'
import * as XLSX from 'xlsx'

export default function ExportPage() {
  const { profile } = useAuth()
  const [loading,    setLoading]    = useState(false)
  const [exportType, setExportType] = useState<'excel'|'csv'>('excel')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [status,     setStatus]     = useState('')

  async function handleExport() {
    setLoading(true)
    setStatus('Fetching data...')

    // Load patients
    const { data: patients } = await supabase
      .from('patients')
      .select('*')
      .eq('organization_id', profile?.organization_id)
      .eq('is_active', true)

    if (!patients || patients.length === 0) {
      setStatus('No patients found.')
      setLoading(false)
      return
    }

    // Load survey requests
    let reqQuery = supabase
      .from('survey_requests')
      .select('*')
      .eq('status', 'completed')
      .in('patient_id', patients.map(p => p.id))

    if (dateFrom) reqQuery = reqQuery.gte('completed_at', dateFrom)
    if (dateTo)   reqQuery = reqQuery.lte('completed_at', dateTo + 'T23:59:59')

    const { data: requests } = await reqQuery

    // Load responses
    const { data: responses } = requests && requests.length > 0
      ? await supabase.from('survey_responses').select('*, instruments(*)').in('survey_request_id', requests.map(r => r.id))
      : { data: [] }

    // Build export rows
    const patientMap = Object.fromEntries(patients.map(p => [p.id, p]))
    const responseMap: Record<string, any[]> = {}
    ;(responses ?? []).forEach(r => {
      if (!responseMap[r.survey_request_id]) responseMap[r.survey_request_id] = []
      responseMap[r.survey_request_id].push(r)
    })

    setStatus('Building export...')

    const rows = (requests ?? []).map(req => {
      const patient = patientMap[req.patient_id]
      const resps   = responseMap[req.id] ?? []
      const row: Record<string, any> = {
        'Patient ID':   patient?.id ?? '',
        'Last Name':    patient?.last_name ?? '',
        'First Name':   patient?.first_name ?? '',
        'Date of Birth': patient?.date_of_birth ?? '',
        'Gender':       patient?.gender ?? '',
        'Language':     patient?.preferred_language ?? '',
        'Survey Date':  req.completed_at ? format(parseISO(req.completed_at), 'MM/dd/yyyy') : '',
      }
      resps.forEach(r => {
        const name = r.instruments?.name ?? r.instrument_id
        if (r.t_score   != null) row[`${name} T-Score`]    = r.t_score
        if (r.raw_score != null) row[`${name} Raw Score`]  = r.raw_score
        if (r.total_score != null) row[`${name} Score`]    = r.total_score
        if (r.severity_label)    row[`${name} Severity`]   = r.severity_label
      })
      return row
    })

    if (rows.length === 0) {
      setStatus('No survey data found for the selected filters.')
      setLoading(false)
      return
    }

    // Log export
    await supabase.from('export_audit_log').insert({
      exported_by: profile!.id,
      export_type: exportType,
      filters: { dateFrom, dateTo },
      row_count: rows.length,
    })

    // Generate file
    const ws   = XLSX.utils.json_to_sheet(rows)
    const wb   = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Survey Data')
    const today = format(new Date(), 'yyyyMMdd')

    if (exportType === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url  = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `MDE_Export_${today}.csv`; a.click()
    } else {
      XLSX.writeFile(wb, `MDE_Export_${today}.xlsx`)
    }

    setStatus(`Done. Exported ${rows.length} survey record${rows.length !== 1 ? 's' : ''}.`)
    setLoading(false)
  }

  return (
    <>
      <Head><title>Export Data — MDE Platform</title></Head>
      <div className="max-w-xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Export Patient Data</h1>
          <p className="text-gray-500 text-sm mt-1">Export all patients and their survey scores. All exports are logged for compliance.</p>
        </div>

        <div className="card space-y-5">
          <div>
            <label className="label">Export Format</label>
            <div className="grid grid-cols-2 gap-2">
              {[['excel','Excel (.xlsx)'],['csv','CSV (.csv)']].map(([val, label]) => (
                <label key={val} className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer ${exportType === val ? 'border-navy-DEFAULT bg-ltblue' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input type="radio" checked={exportType === val} onChange={() => setExportType(val as any)} className="sr-only" />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${exportType === val ? 'border-navy-DEFAULT' : 'border-gray-300'}`}>
                    {exportType === val && <div className="w-2 h-2 rounded-full bg-navy-DEFAULT" />}
                  </div>
                  <span className="text-sm font-medium">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date From (optional)</label>
              <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Date To (optional)</label>
              <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>

          {status && (
            <div className={`text-sm rounded-lg px-3 py-2 ${status.startsWith('Done') ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
              {status}
            </div>
          )}

          <button onClick={handleExport} disabled={loading} className="btn-primary w-full">
            {loading ? 'Exporting...' : `Export to ${exportType === 'excel' ? 'Excel' : 'CSV'}`}
          </button>
        </div>
      </div>
    </>
  )
}
