import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { EmailStatus } from '@/types/database'

// Svix signatures cover the exact bytes Resend sent, so read the raw body.
export const config = { api: { bodyParser: false } }

const EVENT_STATUS: Record<string, EmailStatus> = {
  'email.delivered':        'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced':          'bounced',
  'email.complained':       'complained',
  'email.failed':           'failed',
}

// A late "delivered" or "delayed" event must not hide an earlier bounce.
const RANK: Record<EmailStatus, number> = {
  sent: 0, delivery_delayed: 1, delivered: 2, bounced: 3, complained: 3, failed: 3,
}

async function readRawBody(req: NextApiRequest) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function verifySignature(secret: string, id: string, timestamp: string, body: string, header: string) {
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest()

  return header.split(' ').some(part => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig) return false
    const given = Buffer.from(sig, 'base64')
    return given.length === expected.length && crypto.timingSafeEqual(given, expected)
  })
}

/** POST — Resend delivery events (configure in Resend → Webhooks). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return res.status(500).json({ error: 'RESEND_WEBHOOK_SECRET is not configured' })

  const body = await readRawBody(req)
  const id = req.headers['svix-id'] as string | undefined
  const timestamp = req.headers['svix-timestamp'] as string | undefined
  const signature = req.headers['svix-signature'] as string | undefined
  if (!id || !timestamp || !signature || !verifySignature(secret, id, timestamp, body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  let event: { type?: string; data?: { email_id?: string; bounce?: { message?: string; subType?: string } } }
  try { event = JSON.parse(body) } catch { return res.status(400).json({ error: 'Invalid JSON' }) }

  const status = event.type ? EVENT_STATUS[event.type] : undefined
  const messageId = event.data?.email_id
  if (!status || !messageId) return res.status(200).json({ ignored: true })

  const admin = getSupabaseAdmin()
  const { data: row } = await admin.from('email_log').select('id, status').eq('provider_message_id', messageId).maybeSingle()
  if (!row) return res.status(200).json({ ignored: true })

  if (RANK[status] >= RANK[row.status]) {
    await admin.from('email_log').update({
      status,
      status_detail: event.data?.bounce?.message ?? event.data?.bounce?.subType ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
  }

  return res.status(200).json({ ok: true })
}
