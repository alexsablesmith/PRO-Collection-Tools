import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface SendEmailOptions {
  to:                         string
  subject:                    string
  html:                       string
  email_type:                 string
  organization_id?:           string | null
  related_user_id?:           string | null
  related_survey_request_id?: string | null
}

/**
 * Sends an email through Resend and records it in email_log, so delivery
 * status (updated later by /api/webhooks/resend) shows up in the admin
 * dashboard. Returns an error message, or null on success.
 */
export async function sendEmail(admin: SupabaseClient<Database>, opts: SendEmailOptions): Promise<string | null> {
  const resendKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL
  if (!resendKey) return 'RESEND_API_KEY is not configured'
  if (!fromEmail) return 'RESEND_FROM_EMAIL is not configured'

  let messageId: string | null = null
  let failure: string | null = null

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: opts.to, subject: opts.subject, html: opts.html }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok) messageId = json.id ?? null
    else failure = json.message ?? `Resend returned ${res.status}`
  } catch (err: any) {
    failure = err.message ?? 'Network error'
  }

  const { error: logError } = await admin.from('email_log').insert({
    organization_id:           opts.organization_id ?? null,
    provider_message_id:       messageId,
    email_type:                opts.email_type,
    recipient:                 opts.to,
    subject:                   opts.subject,
    status:                    failure ? 'failed' : 'sent',
    status_detail:             failure,
    related_user_id:           opts.related_user_id ?? null,
    related_survey_request_id: opts.related_survey_request_id ?? null,
  })
  if (logError) console.error('[email] failed to log email:', logError.message)

  return failure
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
