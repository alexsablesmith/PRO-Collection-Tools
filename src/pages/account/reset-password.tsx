import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Step = 'loading' | 'expired' | 'mfa' | 'password'

/**
 * Landing page for password reset emails. The link signs the user in with a
 * one-time recovery session; if they have 2FA, they must enter a code before
 * choosing a new password, so access to their email alone isn't enough.
 */
export default function ResetPasswordPage() {
  const [step,     setStep]     = useState<Step>('loading')
  const [factorId, setFactorId] = useState('')
  const [code,     setCode]     = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState('')
  const [busy,     setBusy]     = useState(false)

  useEffect(() => {
    // Supabase puts ?error / #error in the URL when the link is expired or already used
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search)
    if (params.get('error')) { setStep('expired'); return }

    let settled = false
    const begin = async () => {
      if (settled) return
      settled = true
      const { data } = await supabase.auth.mfa.listFactors()
      const totp = data?.totp?.find(f => f.status === 'verified')
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (totp && aal?.currentLevel !== 'aal2') {
        setFactorId(totp.id)
        setStep('mfa')
      } else {
        setStep('password')
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) begin()
    })
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) begin() })
    const timeout = setTimeout(() => { if (!settled) setStep('expired') }, 8000)

    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  async function verifyCode() {
    if (code.length !== 6) return
    setBusy(true); setError('')
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
    if (cErr) { setError(cErr.message); setBusy(false); return }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
    if (vErr) { setError('Invalid code. Please try again.'); setBusy(false); return }
    setBusy(false)
    setStep('password')
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setBusy(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) { setError(updateErr.message); setBusy(false); return }

    // Anyone else signed in to this account (e.g. with the old password) is signed out
    await supabase.auth.signOut({ scope: 'others' })
    window.location.replace('/patients')
  }

  return (
    <>
      <Head><title>Choose a New Password — Prolix Health</title></Head>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold" style={{ color: '#1F4E79' }}>Prolix Health</h1>
            <p className="text-gray-500 mt-1">Choose a new password</p>
          </div>

          {step === 'loading' && (
            <div className="card text-center py-10">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-[#1F4E79] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Verifying your reset link…</p>
            </div>
          )}

          {step === 'expired' && (
            <div className="card text-center">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">This link has expired</h2>
              <p className="text-sm text-gray-500 mb-6">Reset links work once and expire after 1 hour. Request a new one to continue.</p>
              <Link href="/forgot-password" className="btn-primary text-sm inline-block">Request a new link</Link>
            </div>
          )}

          {step === 'mfa' && (
            <div className="card text-center">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Confirm it&apos;s you</h2>
              <p className="text-sm text-gray-500 mb-6">Enter the 6-digit code from your authenticator app.</p>
              <input
                type="text" inputMode="numeric" maxLength={6} autoFocus
                className="input text-center text-xl tracking-widest mb-3" placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && verifyCode()}
              />
              {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
              <button onClick={verifyCode} disabled={busy || code.length !== 6} className="btn-primary w-full">
                {busy ? 'Verifying…' : 'Continue'}
              </button>
              <p className="text-xs text-gray-400 mt-4">Lost your authenticator? Ask your organization&apos;s administrator to reset your 2FA.</p>
            </div>
          )}

          {step === 'password' && (
            <div className="card">
              <form onSubmit={savePassword} className="space-y-4">
                <div>
                  <label className="label">New password</label>
                  <input type="password" className="input" autoComplete="new-password" autoFocus
                    placeholder="At least 8 characters" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                <div>
                  <label className="label">Confirm new password</label>
                  <input type="password" className="input" autoComplete="new-password"
                    value={confirm} onChange={e => setConfirm(e.target.value)} />
                </div>
                {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
                <button type="submit" disabled={busy} className="btn-primary w-full">
                  {busy ? 'Saving…' : 'Save password & sign in'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
