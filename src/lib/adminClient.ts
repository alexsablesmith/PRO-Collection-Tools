import { supabase } from '@/lib/supabase'

/**
 * Browser helper for /api/admin/* routes: attaches the session token, sends
 * JSON, and throws the route's error message on a non-2xx response.
 */
export async function adminFetch<T = any>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown } = {}
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(path, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json as T
}
