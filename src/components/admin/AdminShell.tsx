import { ReactNode, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import clsx from 'clsx'
import { useAuth } from '@/hooks/useAuth'

const TABS = [
  { href: '/admin',           label: 'Organizations' },
  { href: '/admin/platform',  label: 'Instruments & Defaults' },
  { href: '/admin/audit-log', label: 'Audit Log' },
  { href: '/admin/email',     label: 'Email Delivery' },
  { href: '/admin/notices',   label: 'Notices' },
]

/** Page frame for App Admin pages: role gate, title, and section tabs. */
export default function AdminShell({
  title, subtitle, actions, children,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const { profile } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (profile && profile.role !== 'app_admin') router.replace('/patients')
  }, [profile])

  if (!profile || profile.role !== 'app_admin') {
    return <div className="text-center py-12 text-gray-400">Loading…</div>
  }

  const active = (href: string) =>
    href === '/admin'
      ? router.pathname === '/admin' || router.pathname.startsWith('/admin/organizations')
      : router.pathname.startsWith(href)

  return (
    <>
      <Head><title>{title} — Prolix Health Admin</title></Head>
      <div>
        <nav className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
          {TABS.map(t => (
            <Link
              key={t.href}
              href={t.href}
              className={clsx(
                'px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                active(t.href) ? 'border-navy-DEFAULT text-navy-DEFAULT' : 'border-transparent text-gray-500 hover:text-gray-800'
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            {subtitle && <div className="text-gray-500 text-sm mt-0.5">{subtitle}</div>}
          </div>
          {actions && <div className="flex gap-2 flex-shrink-0">{actions}</div>}
        </div>
        {children}
      </div>
    </>
  )
}
