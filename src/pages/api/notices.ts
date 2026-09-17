import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase'

/** GET — platform notices currently in effect. Public: shown on the login page too. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const now = new Date().toISOString()
  const { data, error } = await getSupabaseAdmin()
    .from('platform_notices')
    .select('id, message, severity, starts_at, ends_at')
    .eq('is_active', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order('starts_at', { ascending: false })

  if (error) return res.status(200).json({ notices: [] })
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60')
  return res.status(200).json({ notices: data ?? [] })
}
