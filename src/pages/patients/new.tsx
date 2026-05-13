import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export default function NewPatientPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const [form, setForm] = useState({
    first_name: '', last_name: '', date_of_birth: '',
    gender: '', preferred_language: 'en', phone: '', email: '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { data, error } = await supabase.from('patients').insert({
      ...form,
      organization_id: profile!.organization_id,
      created_by:      profile!.id,
    }).select().single()
    if (error) { setError(error.message); setLoading(false) }
    else router.push(`/patients/${data.id}`)
  }

  return (
    <>
      <Head><title>New Patient — MDE Platform</title></Head>
      <div className="max-w-2xl">
        <div className="mb-6">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1 mb-3">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">New Patient</h1>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">First Name *</label>
                <input className="input" required value={form.first_name} onChange={e => set('first_name', e.target.value)} />
              </div>
              <div>
                <label className="label">Last Name *</label>
                <input className="input" required value={form.last_name} onChange={e => set('last_name', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Date of Birth *</label>
                <input type="date" className="input" required value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
              </div>
              <div>
                <label className="label">Gender</label>
                <select className="input" value={form.gender} onChange={e => set('gender', e.target.value)}>
                  <option value="">Select...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Preferred Language</label>
                <select className="input" value={form.preferred_language} onChange={e => set('preferred_language', e.target.value)}>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                </select>
              </div>
              <div>
                <label className="label">Phone</label>
                <input type="tel" className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 (555) 000-0000" />
              </div>
            </div>

            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} placeholder="patient@email.com" />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Creating...' : 'Create Patient'}
              </button>
              <button type="button" onClick={() => router.back()} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
