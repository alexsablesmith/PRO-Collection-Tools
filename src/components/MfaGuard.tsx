import { useEffect, ReactNode } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const MFA_REQUIRED = process.env.NEXT_PUBLIC_MFA_REQUIRED === 'true'

const PUBLIC_PATHS = ['/login', '/mfa/enroll', '/mfa/verify', '/survey']

interface Props { children: ReactNode }

export default function MfaGuard({ children }: Props) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!MFA_REQUIRED) return
    if (loading) return
    if (!user) return
    const path = router.pathname
    if (PUBLIC_PATHS.some(p => path.startsWith(p))) return

    async function checkMfa() {
      const { data } = await supabase.auth.mfa.listFactors()
      const verified = data?.totp?.some(f => f.status === 'verified')
      if (!verified) {
        router.replace('/mfa/enroll')
        return
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.currentLevel !== 'aal2') {
        router.replace('/mfa/verify')
      }
    }

    checkMfa()
  }, [user, loading, router.pathname])

  return <>{children}</>
}
