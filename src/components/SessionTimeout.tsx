import { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/hooks/useAuth'

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const
const STORAGE_KEY = 'prolix:last-activity'

/**
 * Signs the user out after their organization's idle timeout. Activity is
 * shared across tabs through localStorage so a busy tab keeps the others alive.
 */
export default function SessionTimeout() {
  const { user, organization, signOut } = useAuth()
  const router = useRouter()
  const minutes = organization?.session_timeout_minutes ?? null
  const lastWrite = useRef(0)

  useEffect(() => {
    if (!user || !minutes) return
    const limitMs = minutes * 60_000

    const touch = () => {
      const now = Date.now()
      if (now - lastWrite.current < 15_000) return
      lastWrite.current = now
      try { localStorage.setItem(STORAGE_KEY, String(now)) } catch {}
    }
    const lastActivity = () => {
      try { return Number(localStorage.getItem(STORAGE_KEY)) || lastWrite.current } catch { return lastWrite.current }
    }

    lastWrite.current = 0
    touch()
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, touch, { passive: true }))
    const timer = setInterval(async () => {
      if (Date.now() - lastActivity() > limitMs) {
        clearInterval(timer)
        await signOut()
        router.replace('/login?reason=timeout')
      }
    }, 30_000)

    return () => {
      clearInterval(timer)
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, touch))
    }
  }, [user, minutes])

  return null
}
