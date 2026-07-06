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

  const admin = getSupabaseAdmin()
  const { data: { user }, error } = await admin.auth.getUser(authHeader.slice(7))
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
