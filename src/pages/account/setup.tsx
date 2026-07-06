import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'

export default function AccountSetupPage() {
  const router = useRouter()

  const [fullName,  setFullName]  = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [error,     setError]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [ready,     setReady]     = useState(false)

  useEffect(() => {
    // Supabase exchanges the token from the URL hash and fires onAuthStateChange.
    // We just need to wait for a session to exist before rendering the form.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setReady(true)
      } else {
        // Listen for the SIGNED_IN event fired after the token is exchanged
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (session) { setReady(true); subscription.unsubscribe() }
        })
      }
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!fullName.trim()) { setError('Please enter your full name.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setSaving(true)

    const { error: updateErr } = await supabase.auth.updateUser({
      password,
      data: { full_name: fullName.trim() },
    })

    if (updateErr) { setError(updateErr.message); setSaving(false); return }

    // Mark profile active and set full_name
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('user_profiles').update({
        full_name: fullName.trim(),
        is_active: true,
      }).eq('id', user.id)
    }

    router.replace('/patients')
  }

  return (
    <>
      <Head><title>Set Up Your Account — Prolix Health</title></Head>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900" style={{ color: '#1F4E79' }}>
              Prolix Health
            </h1>
            <p className="text-gray-500 mt-1">Set up your account to get started</p>
          </div>

          {!ready ? (
            <div className="card text-center py-10">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-[#1F4E79] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Verifying your invite link…</p>
            </div>
          ) : (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-5">Create your credentials</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Full Name</label>
                  <input
                    className="input"
                    placeholder="Jane Smith"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Confirm Password</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="Repeat your password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                  />
                </div>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary w-full"
                >
                  {saving ? 'Setting up…' : 'Create Account & Sign In'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
