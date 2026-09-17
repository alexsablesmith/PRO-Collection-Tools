import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('')
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState('')
  const [error,   setError]   = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true); setError('')
    try {
      const res = await fetch('/api/account/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const json = await res.json()
      if (!res.ok) setError(json.error ?? 'Something went wrong. Please try again.')
      else setSent(json.message)
    } catch {
      setError('Network error. Please try again.')
    }
    setSending(false)
  }

  return (
    <>
      <Head><title>Reset Password — Prolix Health</title></Head>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Prolix Health</h1>
            <p className="text-gray-500 text-sm mt-1">Reset your password</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            {sent ? (
              <>
                <p className="text-sm text-gray-700 mb-2">{sent}</p>
                <p className="text-sm text-gray-500 mb-6">
                  The link expires in 1 hour. If nothing arrives, check your spam folder or ask your organization&apos;s administrator.
                </p>
                <Link href="/login" className="btn-secondary text-sm inline-block">Back to sign in</Link>
              </>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-gray-600">
                  Enter the email you sign in with and we&apos;ll send you a link to choose a new password.
                </p>
                <div>
                  <label className="label">Email address</label>
                  <input
                    type="email" required autoComplete="email" autoFocus
                    value={email} onChange={e => setEmail(e.target.value)}
                    className="input" placeholder="you@clinic.com"
                  />
                </div>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
                )}
                <button type="submit" disabled={sending || !email.trim()} className="btn-primary w-full">
                  {sending ? 'Sending…' : 'Send reset link'}
                </button>
                <div className="text-center">
                  <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700">Back to sign in</Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
