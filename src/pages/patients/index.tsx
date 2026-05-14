import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { PatientWithHistory } from '@/types/database'
import { format, parseISO } from 'date-fns'

export default function PatientsPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const [patients, setPatients] = useState<PatientWithHistory[]>([])
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)

  useEffect(() => { loadPatients() }, [])

async function loadPatients() {
    setLoading(true)
    const { data, error } = await supabase
      .from('patients')
      .select('*, survey_requests(completed_at)')
      .eq('organization_id', profile?.organization_id)
      .eq('is_active', true)
      .order('last_name', { ascending: true })
    if (!error && data) setPatients((data ?? []).map((p: any) => ({
      ...p,
      last_survey_date: p.survey_requests?.length > 0
        ? p.survey_requests.sort((a: any, b: any) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())[0].completed_at
        : null,
      completed_surveys: p.survey_requests?.filter((r: any) => r.completed_at).length ?? 0
    })) as PatientWithHistory[])
    setLoading(false)
  }

  const filtered = patients.filter(p => {
    const q = search.toLowerCase()
    return (
      p.first_name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q)  ||
      (p.date_of_birth && p.date_of_birth.includes(q))
    )
  })

  const canCreate = profile?.role === 'admin' || profile?.role === 'clinician'

  return (
    <>
      <Head><title>Patients — MDE Platform</title></Head>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
            <p className="text-gray-500 text-sm mt-0.5">{patients.length} patient{patients.length !== 1 ? 's' : ''} in your organization</p>
          </div>
          {canCreate && (
            <Link href="/patients/new" className="btn-primary flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
              New Patient
            </Link>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
          </svg>
          <input
            type="text"
            placeholder="Search by name or date of birth..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading patients...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500">{search ? 'No patients match your search.' : 'No patients yet.'}</p>
              {canCreate && !search && (
                <Link href="/patients/new" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
                  Add your first patient →
                </Link>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-hdrbg border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT hidden sm:table-cell">Date of Birth</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT hidden md:table-cell">Last Survey</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-DEFAULT hidden md:table-cell">Surveys</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/patients/${p.id}`)}
                    className={`cursor-pointer hover:bg-blue-50 transition-colors border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-hdrbg text-navy-DEFAULT flex items-center justify-center font-bold text-sm flex-shrink-0">
                          {p.first_name[0]}{p.last_name[0]}
                        </div>
                        <span className="font-medium text-gray-900">{p.last_name}, {p.first_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">
                      {p.date_of_birth ? format(parseISO(p.date_of_birth), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                      {p.last_survey_date ? format(parseISO(p.last_survey_date), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-gray-600">{p.completed_surveys ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <svg className="w-4 h-4 text-gray-400 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
