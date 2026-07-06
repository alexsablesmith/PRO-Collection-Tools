import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase'
import { scoreInstrument } from '@/config/scoring'
import type { SurveyDemographics, SurveyRequest } from '@/types/database'

interface SubmitBody {
  responses:    Record<string, Record<string, number>>
  demographics: SurveyDemographics | null
}

/**
 * POST /api/survey/[token]/submit
 * Scores every instrument server-side, then commits everything atomically
 * via the submit_survey() Postgres function. Idempotent: re-submitting a
 * completed survey returns success without writing anything.
 *
 * A scoring failure aborts the whole submit with 422 — the patient sees an
 * error instead of a false "thank you" over silently dropped data.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.query.token
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Invalid survey link' })

  const admin = getSupabaseAdmin()
  const { data: request } = await admin
    .from('survey_requests')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (!request) return res.status(404).json({ error: 'This survey link is invalid.' })
  if (request.status === 'completed') return res.status(200).json({ already_completed: true })
  if (request.status === 'expired' || new Date(request.expires_at) < new Date()) {
    return res.status(410).json({ error: 'This survey link has expired.' })
  }

  const { responses, demographics } = req.body as SubmitBody
  if (typeof responses !== 'object' || responses === null) {
    return res.status(400).json({ error: 'responses are required' })
  }

  const { data: battery } = await admin
    .from('batteries').select('instrument_ids').eq('id', request.battery_id).single()
  if (!battery) return res.status(404).json({ error: 'This survey is no longer available.' })

  const { data: instruments } = await admin
    .from('instruments').select('*').in('id', battery.instrument_ids)

  const ordered = battery.instrument_ids
    .map(iid => (instruments ?? []).find(i => i.id === iid))
    .filter(Boolean)

  // Score everything first — any failure aborts before we write a single row
  const rows: Record<string, unknown>[] = []
  const failures: string[] = []
  for (const inst of ordered) {
    const key = inst!.scoring_config_key
    const instResp = responses[key] ?? {}
    try {
      const scored = scoreInstrument(key, instResp, inst!)
      rows.push({
        instrument_id:   inst!.id,
        raw_responses:   instResp,
        raw_score:       scored.rawScore,
        t_score:         scored.tScore ?? null,
        standard_error:  scored.standardError ?? null,
        total_score:     scored.totalScore ?? null,
        severity_label:  scored.severityLabel,
        subscale_scores: scored.subscaleScores ?? null,
      })
    } catch (e) {
      failures.push(`${inst!.name}: ${e instanceof Error ? e.message : 'scoring failed'}`)
    }
  }

  if (failures.length > 0) {
    return res.status(422).json({
      error: 'Some answers could not be processed. Please review your responses and try again.',
      details: failures,
    })
  }

  const demographicsPayload =
    request.demographics_entry === 'patient' && demographics ? demographics : null

  // Atomic commit via Postgres function (see supabase/migrations)
  const { error: rpcError } = await admin.rpc('submit_survey', {
    p_request_id:   request.id,
    p_demographics: demographicsPayload,
    p_responses:    rows,
  })

  if (rpcError) {
    // Migration not applied yet — fall back to sequential writes so the
    // platform keeps working; remove once submit_survey() is deployed.
    if (rpcError.code === 'PGRST202') {
      const fallback = await sequentialSubmit(admin, request as SurveyRequest, demographicsPayload, rows)
      if (fallback) return res.status(500).json({ error: fallback })
    } else {
      console.error('submit_survey RPC failed:', rpcError)
      return res.status(500).json({ error: 'Failed to save your survey. Please try again.' })
    }
  }

  return res.status(200).json({ ok: true })
}

async function sequentialSubmit(
  admin: ReturnType<typeof getSupabaseAdmin>,
  request: SurveyRequest,
  demographics: SurveyDemographics | null,
  rows: Record<string, unknown>[]
): Promise<string | null> {
  if (demographics) {
    const { error } = await admin.from('patients').update({
      first_name:         demographics.first_name,
      last_name:          demographics.last_name,
      date_of_birth:      demographics.date_of_birth,
      gender:             demographics.gender || null,
      preferred_language: demographics.preferred_language as 'en' | 'es',
    }).eq('id', request.patient_id)
    if (error) return 'Failed to save your information. Please try again.'
  }

  for (const row of rows) {
    const { error } = await admin.from('survey_responses').insert({
      ...row,
      survey_request_id: request.id,
      patient_id:        request.patient_id,
    })
    if (error) return 'Failed to save your survey. Please try again.'
  }

  const { error } = await admin.from('survey_requests').update({
    status:            'completed',
    completed_at:      new Date().toISOString(),
    partial_responses: null,
  }).eq('id', request.id)
  if (error) return 'Failed to finalize your survey. Please try again.'

  return null
}
