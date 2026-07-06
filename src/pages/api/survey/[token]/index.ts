import type { NextApiRequest, NextApiResponse } from 'next'
import { validateSurveyToken, isTokenFailure } from '@/lib/surveyToken'

/**
 * GET /api/survey/[token]
 * Loads everything the survey page needs. The browser never talks to the
 * database directly — the token is validated here and only the fields the
 * patient needs are returned (no patient_id, no internal ids beyond what
 * the UI requires).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const v = await validateSurveyToken(req.query.token)
  if (isTokenFailure(v)) return res.status(v.status).json({ error: v.error })
  const { request, admin } = v

  const [{ data: battery }, { data: instruments }] = await Promise.all([
    admin.from('batteries').select('id, name, instrument_ids').eq('id', request.battery_id).single(),
    admin.from('instruments').select('id, code, name, type, scoring_config_key, scoring_config, questions').eq('is_active', true),
  ])

  if (!battery) return res.status(404).json({ error: 'This survey is no longer available.' })

  const ordered = battery.instrument_ids
    .map(iid => (instruments ?? []).find(i => i.id === iid))
    .filter(Boolean)

  return res.status(200).json({
    language:           request.language,
    demographics_entry: request.demographics_entry,
    battery_name:       battery.name,
    instruments:        ordered,
    progress:           request.partial_responses ?? null,
  })
}
