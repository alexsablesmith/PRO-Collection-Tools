import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Patient, Battery } from '@/types/database'
import { format, parseISO } from 'date-fns'

export default function SendSurveyPage() {
  const router = useRouter()
  const { profile } = useAuth()
  const { id } = router.query as { id: string }

  const [patient,   setPatient]   = useState<Patient | null>(null)
  const [batteries, setBatteries] = useState<Battery[]>([])
  const [loading,   setLoading]   = useState(true)
  const [sending,   setSending]   = useState(false)
  const [done,      setDone]      = useState<{ token: string; url: string } | null>(null)
  const [error,     setError]     = useState('')

  const [form, setForm] = useState({
    battery_id:          '',
    language:            'en' as 'en' | 'es',
    delivery_method:     'manual' as 'email' | 'sms' | 'manual',
    demographics_entry:  'clinician' as 'clinician' | 'patient',
  })

  useEffect(() => {
    if (id) loadData()
  }, [id])

  async function loadData() {
    const [{ data: pat }, { data: bats }] = await Promise.all([
      supabase.from('patients').select('*').eq('id', id).single(),
      supabase.from('batteries').select('*').eq('organization_id', profile?.organization_id).eq('is_active', true),
    ])
    setPatient(pat)
    setBatteries(bats ?? [])
    if (bats && bats.length > 0) setForm(f => ({ ...f, battery_id: bats[0].id }))
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSending(true)

    const { data, error } = await supabase
      .from('survey_requests')
      .insert({
        patient_id:         id,
        battery_id:         form.battery_id,
        created_by:         profile!.id,
        language:           form.language,
        delivery_method:    form.delivery_method,
        demographics_entry: form.demographics_entry,
        status:             'sent',
        sent_at:            new Date().toISOString(),
      })
      .select()
      .single()

    if (error) { setError(error.message); setSending(false); return }

    const surveyUrl = `${window.location.origin}/survey/${data.token}`
    setDone({ token: data.token, url: surveyUrl })
    setSending(false)
  }

  if (loading) return <div className="p-12 text-center text-gray-400">Loading...</div>
  if (!patient) return <div className="p-12 text-center text-gray-500">Patient not found.</div>

  return (
    <>
      <Head><title>Send Survey — MDE Platform</title></Head>
      <div className="max-w-xl">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1 mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          Back
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Send Survey</h1>
        <p className="text-gray-500 text-sm mb-6">
          {patient.first_name} {patient.last_name} — DOB: {patient.date_of_birth ? format(parseISO(patient.date_of_birth), 'MMM d, yyyy') : '—'}
        </p>

        {done ? (
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <div>
                <div className="font-semibold text-gray-900">Survey link created</div>
                <div className="text-sm text-gray-500">Share this link with the patient</div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs break-all text-gray-700 mb-4">
              {done.url}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { navigator.clipboard.writeText(done.url) }}
                className="btn-primary text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
                Copy Link
              </button>
              <button onClick={() => router.push(`/patients/${id}`)} className="btn-secondary text-sm">
                Back to Patient
              </button>
            </div>
          </div>
        ) : (
          <div className="card">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label">Battery</label>
                {batteries.length === 0 ? (
                  <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    No batteries configured yet. Ask your admin to set up a battery first.
                  </p>
                ) : (
                  <select className="input" value={form.battery_id} onChange={e => setForm(f => ({ ...f, battery_id: e.target.value }))}>
                    {batteries.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
              </div>

              <div>
                <label className="label">Survey Language</label>
                <div className="grid grid-cols-2 gap-2">
                  {[['en','English'],['es','Spanish']].map(([val, label]) => (
                    <label key={val} className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${form.language === val ? 'border-navy-DEFAULT bg-ltblue' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="radio" name="language" value={val} checked={form.language === val} onChange={() => setForm(f => ({ ...f, language: val as any }))} className="sr-only" />
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.language === val ? 'border-navy-DEFAULT' : 'border-gray-300'}`}>
                        {form.language === val && <div className="w-2 h-2 rounded-full bg-navy-DEFAULT" />}
                      </div>
                      <span className="text-sm font-medium">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Demographics Entry</label>
                <div className="space-y-2">
                  {[
                    ['clinician', "I'll enter demographics now", "Patient goes straight to the survey"],
                    ['patient',   "Patient will enter demographics", "Survey starts with a demographics screen"],
                  ].map(([val, title, sub]) => (
                    <label key={val} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${form.demographics_entry === val ? 'border-navy-DEFAULT bg-ltblue' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="radio" name="demo" value={val} checked={form.demographics_entry === val} onChange={() => setForm(f => ({ ...f, demographics_entry: val as any }))} className="sr-only" />
                      <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${form.demographics_entry === val ? 'border-navy-DEFAULT' : 'border-gray-300'}`}>
                        {form.demographics_entry === val && <div className="w-2 h-2 rounded-full bg-navy-DEFAULT" />}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{title}</div>
                        <div className="text-xs text-gray-500">{sub}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Delivery Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {[['manual','Manual / In-Person'],['email','Email'],['sms','SMS']].map(([val, label]) => (
                    <label key={val} className={`flex items-center gap-2 p-2.5 border rounded-lg cursor-pointer transition-colors text-center justify-center ${form.delivery_method === val ? 'border-navy-DEFAULT bg-ltblue' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="radio" name="delivery" value={val} checked={form.delivery_method === val} onChange={() => setForm(f => ({ ...f, delivery_method: val as any }))} className="sr-only" />
                      <span className="text-xs font-medium">{label}</span>
                    </label>
                  ))}
                </div>
                {form.delivery_method !== 'manual' && (
                  <p className="text-xs text-amber-600 mt-1">
                    Email/SMS delivery requires Twilio and Resend configuration. Until configured, use Manual.
                  </p>
                )}
              </div>

              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={sending || !form.battery_id} className="btn-primary">
                  {sending ? 'Creating...' : 'Create Survey Link'}
                </button>
                <button type="button" onClick={() => router.back()} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </>
  )
}
