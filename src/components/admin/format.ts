import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'

export function fmtDate(iso: string | null | undefined, pattern = 'MMM d, yyyy') {
  return iso ? format(parseISO(iso), pattern) : '—'
}

export function fmtAgo(iso: string | null | undefined) {
  return iso ? `${formatDistanceToNowStrict(parseISO(iso))} ago` : 'Never'
}

export const ROLE_LABELS: Record<string, string> = {
  app_admin:     'App Admin',
  org_admin:     'Org Admin',
  clinical_user: 'Clinical User',
  read_only:     'Read Only',
}

export const PLAN_LABELS: Record<string, string> = {
  trial: 'Trial', standard: 'Standard', enterprise: 'Enterprise', internal: 'Internal',
}

export const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:           { label: 'Active',           cls: 'bg-green-100 text-green-700' },
  deactivated:      { label: 'Deactivated',      cls: 'bg-gray-200 text-gray-600' },
  pending_deletion: { label: 'Pending deletion', cls: 'bg-red-100 text-red-700' },
}
