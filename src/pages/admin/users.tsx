import { useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '@/hooks/useAuth'
import OrgUsersPanel from '@/components/admin/OrgUsersPanel'

export default function UsersPage() {
  const { profile, organization } = useAuth()
  const router = useRouter()
  const canManage = profile?.role === 'app_admin' || profile?.role === 'org_admin'

  useEffect(() => {
    if (profile && !canManage) router.replace('/patients')
  }, [profile])

  // Old links pointed App Admins here with ?org_id=; that now lives on the org page.
  useEffect(() => {
    const orgId = router.query.org_id as string | undefined
    if (profile?.role === 'app_admin' && orgId) router.replace(`/admin/organizations/${orgId}?tab=users`)
  }, [profile, router.query.org_id])

  if (!profile || !canManage) return null

  return (
    <>
      <Head><title>Users — Prolix Health</title></Head>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Users</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Manage users in {organization?.name ?? 'your organization'}
            </p>
          </div>
          {profile.role === 'app_admin' && (
            <Link href="/admin" className="btn-secondary text-sm">All organizations</Link>
          )}
        </div>
        <OrgUsersPanel orgId={profile.organization_id} />
      </div>
    </>
  )
}
