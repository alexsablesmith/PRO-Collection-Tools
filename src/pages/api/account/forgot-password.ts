import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sendPasswordReset } from '@/lib/passwordReset'

/**
 * POST { email } — public. Always returns the same response whether or not
 * the email has an account, so it can't be used to discover accounts.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const email = String((req.body as { email?: string })?.email ?? '')
  try {
    const outcome = await sendPasswordReset(getSupabaseAdmin(), email, { enforceCooldown: true })
    if (!outcome.sent && outcome.reason === 'error') console.error('[forgot-password]', outcome.detail)
  } catch (err: any) {
    console.error('[forgot-password]', err.message)
  }

  return res.status(200).json({
    message: "If that email belongs to an active account, we've sent a link to reset the password.",
  })
}
