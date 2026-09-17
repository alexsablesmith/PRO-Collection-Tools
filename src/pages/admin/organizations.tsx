import { useEffect } from 'react'
import { useRouter } from 'next/router'

/** The organization list moved to the App Admin dashboard. */
export default function OrganizationsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin') }, [])
  return null
}
