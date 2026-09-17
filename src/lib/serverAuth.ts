import type { NextApiRequest } from 'next'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Database, UserProfile, Role } from '@/types/database'

export interface AuthedRequest {
  profile: UserProfile
  admin:   SupabaseClient<Database>
}

export interface AuthFailure {
  status: number
  error:  string
}

const MFA_REQUIRED = process.env.NEXT_PUBLIC_MFA_REQUIRED === 'true'

// Supabase encodes the session's authenticator assurance level ("aal1" or
// "aal2") directly in the access token's JWT payload. The token was already
// verified by admin.auth.getUser() below, so decoding it here (no signature
// check) just reads a claim off an already-trusted token.
function getAal(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1]
    const json = Buffer.from(payload, 'base64url').toString('utf8')
    return JSON.parse(json).aal ?? null
  } catch {
    return null
  }
}

/**
 * Validates the caller's Supabase session from the Authorization header
 * and loads their user profile. All authenticated API routes go through
 * this — API routes use the service role key, so every route MUST call
 * this (or validate a survey token) before touching data.
 */
export async function authenticateRequest(
  req: NextApiRequest,
  allowedRoles?: Role[]
): Promise<AuthedRequest | AuthFailure> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return { status: 401, error: 'Not authenticated' }
  }

  const accessToken = authHeader.slice(7)

  if (MFA_REQUIRED && getAal(accessToken) !== 'aal2') {
    return { status: 403, error: 'Two-factor authentication required' }
  }

  const admin = getSupabaseAdmin()
  const { data: { user }, error } = await admin.auth.getUser(accessToken)
  if (error || !user) {
    return { status: 401, error: 'Invalid or expired session' }
  }

  const { data: profile } = await admin
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !profile.is_active) {
    return { status: 403, error: 'No active user profile' }
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return { status: 403, error: 'Insufficient permissions' }
  }

  return { profile: profile as UserProfile, admin }
}

export function isAuthFailure(r: AuthedRequest | AuthFailure): r is AuthFailure {
  return 'error' in r
}
