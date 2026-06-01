import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export default function MfaVerifyPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [factorId,  setFactorId]  = useState('')
  const [code,      setCode]      = useState('')
  const [error,     setError]     = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const totp = data?.totp?.find(f => f.status === 'verified')
      if (totp) setFactorId(totp.id)
    })
  }, [user])

  async function verify() {
    if (code.length !== 6 || !factorId) return
    setVerifying(true); setError('')
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
    if (cErr) { setError(cErr.message); setVerifying(false); return }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
    if (vErr) { setError('Invalid code. Please try again.'); setVerifying(false); return }
    router.replace('/')
  }

  return (
    <>
      <Head><title>Two-Factor Verification</title></Head>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full card text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Two-Factor Verification</h1>
          <p className="text-sm text-gray-500 mb-6">
            Open your authenticator app and enter the 6-digit code.
          </p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            className="input text-center text-xl tracking-widest mb-3"
            placeholder="000000"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && verify()}
            autoFocus
          />
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <button
            onClick={verify}
            disabled={verifying || code.length !== 6}
            className="btn-primary w-full"
          >
            {verifying ? 'Verifying...' : 'Verify'}
          </button>
        </div>
      </div>
    </>
  )
}
