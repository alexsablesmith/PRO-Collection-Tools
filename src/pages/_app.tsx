import type { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import Layout from '@/components/layout/Layout'
import MfaGuard from '@/components/MfaGuard'
import '@/styles/globals.css'
import { useEffect } from 'react'

const PUBLIC_ROUTES = ['/login', '/survey/[token]']

function AppContent({ Component, pageProps }: AppProps) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const isPublic = PUBLIC_ROUTES.includes(router.pathname)

  useEffect(() => {
    if (!loading && !user && !isPublic) {
      router.replace('/login')
    }
  }, [user, loading, isPublic, router])

  // Don't get stuck — if loading takes more than 3 seconds, proceed anyway
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-[#1F4E79] rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (isPublic) return <Component {...pageProps} />
  if (!user) return null

  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  )
}

export default function App(props: AppProps) {
  return (
    <AuthProvider>
      <MfaGuard>
        <AppContent {...props} />
      </MfaGuard>
    </AuthProvider>
  )
}