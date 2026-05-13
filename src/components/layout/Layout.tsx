import { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '@/hooks/useAuth'
import clsx from 'clsx'

const NAV_ITEMS = [
  { href: '/patients',       label: 'Patients',      roles: ['admin','clinician','reviewer'] },
  { href: '/scoring-rules',  label: 'Scoring Rules', roles: ['admin','clinician','reviewer'] },
  { href: '/admin/export',   label: 'Export Data',   roles: ['admin'] },
  { href: '/admin/batteries',label: 'Batteries',     roles: ['admin'] },
  { href: '/admin/users',    label: 'Users',         roles: ['admin'] },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const router = useRouter()

  const visibleNav = NAV_ITEMS.filter(item =>
    profile && item.roles.includes(profile.role)
  )

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header className="bg-navy-DEFAULT text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/patients" className="text-white font-bold text-lg tracking-tight">
                MDE Platform
              </Link>
              <nav className="hidden md:flex items-center gap-1">
                {visibleNav.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      router.pathname.startsWith(item.href)
                        ? 'bg-white/20 text-white'
                        : 'text-blue-100 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-blue-200 text-sm hidden sm:block">
                {profile?.full_name || 'User'}
                <span className="ml-1 text-xs opacity-60 capitalize">({profile?.role})</span>
              </span>
              <button
                onClick={() => signOut()}
                className="text-blue-100 hover:text-white text-sm font-medium transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="border-t border-gray-100 py-4 text-center text-xs text-gray-400">
        MDE Clinical Survey Platform — For authorized clinical use only
      </footer>
    </div>
  )
}
