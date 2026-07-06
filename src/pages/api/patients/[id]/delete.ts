import type { NextApiRequest, NextApiResponse } from 'next'
import { authenticateRequest, isAuthFailure } from '@/lib/serverAuth'

/**
 * POST /api/patients/[id]/delete
 * Deletes a patient and all dependent data atomically via the
 * delete_patient() Postgres function. app_admin can delete any patient;
 * org_admin only patients in their own organization.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticateRequest(req, ['app_admin', 'org_admin'])
  if (isAuthFailure(auth)) return res.status(auth.status).json({ error: auth.error })
  const { profile, admin } = auth

  const patientId = req.query.id
  if (!patientId || typeof patientId !== 'string') {
    return res.status(400).json({ error: 'Patient id is required' })
  }

  const { data: patient } = await admin
    .from('patients')
    .select('id, organization_id')
    .eq('id', patientId)
    .maybeSingle()

  if (!patient) return res.status(404).json({ error: 'Patient not found' })

  if (profile.role !== 'app_admin' && patient.organization_id !== profile.organization_id) {
    return res.status(403).json({ error: 'Patient belongs to a different organization' })
  }

  const { error: rpcError } = await admin.rpc('delete_patient', { p_patient_id: patientId })

  if (rpcError) {
    // Migration not applied yet — sequential fallback; remove once
    // delete_patient() is deployed.
    if (rpcError.code === 'PGRST202') {
      const { data: requests } = await admin.from('survey_requests').select('id').eq('patient_id', patientId)
      if (requests && requests.length > 0) {
        await admin.from('survey_responses').delete().in('survey_request_id', requests.map(r => r.id))
      }
      await admin.from('survey_requests').delete().eq('patient_id', patientId)
      await admin.from('report_audit_log').delete().eq('patient_id', patientId)
      const { error } = await admin.from('patients').delete().eq('id', patientId)
      if (error) return res.status(500).json({ error: 'Failed to delete patient' })
    } else {
      console.error('delete_patient RPC failed:', rpcError)
      return res.status(500).json({ error: 'Failed to delete patient' })
    }
  }

  return res.status(200).json({ ok: true })
}
