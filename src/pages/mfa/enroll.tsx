import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export default function MfaEnrollPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [qrCode,    setQrCode]    = useState('')
  const [secret,    setSecret]    = useState('')
  const [factorId,  setFactorId]  = useState('')
  const [code,      setCode]      = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(true)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    if (!user) return
    enroll()
  }, [user])

  async function enroll() {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (error || !data) { setError(error?.message ?? 'Enrollment failed'); setLoading(false); return }
    setFactorId(data.id)
    setQrCode(data.totp.qr_code)
    setSecret(data.totp.secret)
    setLoading(false)
  }

  async function verify() {
    if (code.length !== 6) return
    setVerifying(true); setError('')
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
    if (cErr) { setError(cErr.message); setVerifying(false); return }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
    if (vErr) { setError('Invalid code. Please try again.'); setVerifying(false); return }
    router.replace('/')
  }

  return (
    <>
      <Head><title>Set Up Two-Factor Authentication</title></Head>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full card">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Set Up Two-Factor Authentication</h1>
          <p className="text-sm text-gray-500 mb-6">
            Scan the QR code with an authenticator app (Google Authenticator, Authy, or similar),
            then enter the 6-digit code to confirm.
          </p>

          {loading ? (
            <div className="text-center py-8 text-gray-400">Loading...</div>
          ) : error && !qrCode ? (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
              </div>
              <p className="text-xs text-gray-400 text-center mb-1">Or enter this key manually:</p>
              <p className="text-xs font-mono text-center bg-gray-100 rounded px-2 py-1 mb-6 break-all">{secret}</p>

              <label className="label">Verification Code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="input text-center text-xl tracking-widest mb-3"
                placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && verify()}
              />
              {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
              <button
                onClick={verify}
                disabled={verifying || code.length !== 6}
                className="btn-primary w-full"
              >
                {verifying ? 'Verifying...' : 'Confirm & Enable 2FA'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
