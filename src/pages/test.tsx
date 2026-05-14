import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function TestPage() {
  const [status, setStatus] = useState('Testing...')
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setStatus('Session error: ' + error.message)
      } else if (data.session) {
        setStatus('Session found! User: ' + data.session.user.email)
        setSession(data.session)
        // Now try to load profile
        supabase.from('user_profiles').select('*').eq('id', data.session.user.id).maybeSingle().then(({ data: profile, error: profileError }) => {
          if (profileError) setStatus(prev => prev + ' | Profile error: ' + profileError.message)
          else if (profile) setStatus(prev => prev + ' | Profile loaded: ' + profile.role)
          else setStatus(prev => prev + ' | No profile found')
        })
      } else {
        setStatus('No session found - not logged in')
      }
    })
  }, [])

  return (
    <div style={{ padding: 40 }}>
      <h1>Debug Test</h1>
      <p><strong>Status:</strong> {status}</p>
      <p><strong>Supabase URL:</strong> {process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET'}</p>
    </div>
  )
}