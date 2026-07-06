import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Database, SurveyRequest } from '@/types/database'

export interface TokenValidation {
  request: SurveyRequest
  admin:   SupabaseClient<Database>
}

export interface TokenFailure {
  status: number
  error:  string
}

/**
 * Resolves a survey token to an open survey request. The token is the
 * patient's sole credential, so every survey API route validates it here
 * before the service-role client touches any data.
 */
export async function validateSurveyToken(
  token: string | string[] | undefined
): Promise<TokenValidation | TokenFailure> {
  if (!token || typeof token !== 'string' || token.length < 8) {
    return { status: 400, error: 'Invalid survey link' }
  }

  const admin = getSupabaseAdmin()
  const { data: request, error } = await admin
    .from('survey_requests')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (error || !request) {
    return { status: 404, error: 'This survey link is invalid.' }
  }
  if (request.status === 'completed') {
    return { status: 410, error: 'This survey has already been completed.' }
  }
  if (request.status === 'expired' || new Date(request.expires_at) < new Date()) {
    return { status: 410, error: 'This survey link has expired. Please contact your clinic for a new one.' }
  }

  return { request: request as SurveyRequest, admin }
}

export function isTokenFailure(r: TokenValidation | TokenFailure): r is TokenFailure {
  return 'error' in r
}
