import { useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/hooks/useAuth'
import Head from 'next/head'

export default function LoginPage() {
  const { signIn } = useAuth()
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) { setError(error); setLoading(false) }
    else router.replace('/patients')
  }

  return (
    <>
      <Head><title>Sign In — Prolix Health</title></Head>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 px-4">
        <div className="w-full max-w-md">
          {/* Logo / title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-navy-DEFAULT text-white text-2xl font-bold mb-4">
              Px
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Prolix Health</h1>
            <p className="text-gray-500 text-sm mt-1">Patient-Reported Outcomes Platform</p>
          </div>

          {/* Form */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-6">Sign in to your account</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Email address</label>
                <input
                  type="email" required autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@clinic.com"
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password" required autoComplete="current-password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full bg-navy-DEFAULT text-white font-semibold py-2.5 rounded-lg
                           hover:bg-navy-light transition-colors disabled:opacity-50 mt-2"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            For authorized clinical staff only. All access is logged.
          </p>
        </div>
      </div>
    </>
  )
}
