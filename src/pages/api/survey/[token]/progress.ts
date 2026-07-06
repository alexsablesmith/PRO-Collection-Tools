import type { NextApiRequest, NextApiResponse } from 'next'
import { validateSurveyToken, isTokenFailure } from '@/lib/surveyToken'
import type { SurveyProgress } from '@/types/database'

/**
 * POST /api/survey/[token]/progress
 * Saves in-progress answers so the patient can close the tab and resume
 * later from the same link.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const v = await validateSurveyToken(req.query.token)
  if (isTokenFailure(v)) return res.status(v.status).json({ error: v.error })
  const { request, admin } = v

  const { responses, step, demographics } = req.body as Partial<SurveyProgress>
  if (typeof responses !== 'object' || responses === null || typeof step !== 'number') {
    return res.status(400).json({ error: 'responses and step are required' })
  }

  const progress: SurveyProgress = {
    responses,
    step,
    demographics: demographics ?? null,
    saved_at: new Date().toISOString(),
  }

  const { error } = await admin
    .from('survey_requests')
    .update({ partial_responses: progress })
    .eq('id', request.id)

  if (error) return res.status(500).json({ error: 'Failed to save progress' })
  return res.status(200).json({ saved_at: progress.saved_at })
}
