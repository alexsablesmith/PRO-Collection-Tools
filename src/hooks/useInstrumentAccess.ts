import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/**
 * Which instruments the signed-in user's organization may use: global
 * instruments the App Admin enabled for the org, plus the org's own custom
 * instruments. The database enforces the same rule on batteries and survey
 * requests; this lets the UI hide what would be rejected.
 */
export function useInstrumentAccess() {
  const { profile } = useAuth()
  const [allowed, setAllowed] = useState<Set<string> | null>(null)
  const [ready,   setReady]   = useState(false)

  useEffect(() => {
    const orgId = profile?.organization_id
    if (!orgId) return
    Promise.all([
      supabase.from('organization_instruments').select('instrument_id').eq('organization_id', orgId).eq('enabled', true),
      supabase.from('instruments').select('id').eq('organization_id', orgId),
    ]).then(([access, custom]) => {
      // Before the admin-dashboard migration is applied these queries fail;
      // fall back to allowing everything, as before.
      if (access.error || custom.error) setAllowed(null)
      else setAllowed(new Set([...(access.data ?? []).map(a => a.instrument_id), ...(custom.data ?? []).map(c => c.id)]))
      setReady(true)
    })
  }, [profile?.organization_id])

  const canUse = useCallback((instrumentId: string) => allowed === null || allowed.has(instrumentId), [allowed])

  return { ready, canUse }
}
