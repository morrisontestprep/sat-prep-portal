'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export default function PendingApprovalPage() {
  const [userName, setUserName] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    const checkStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // Not signed in — send to login
        window.location.href = '/login'
        return
      }

      setUserName(user.user_metadata?.full_name || user.user_metadata?.name || null)
      setUserEmail(user.email ?? null)
      setChecking(false)

      // Check if approved yet
      const { data: profile } = await supabase
        .from('profiles')
        .select('approved')
        .eq('id', user.id)
        .single()

      if (profile?.approved) {
        // Approved! Head to the portal.
        window.location.href = '/my-assignments'
      }
    }

    checkStatus()
    // Poll every 15 seconds so the student is redirected promptly after approval
    interval = setInterval(checkStatus, 15_000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--background)' }}
    >
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-6"
          style={{ background: 'var(--accent)' }}>
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl shadow-sm border p-8"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          {/* Pending icon */}
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4"
            style={{ background: '#fef9c3' }}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#ca8a04">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
            Account Pending Review
          </h1>

          {checking ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Loading…
            </p>
          ) : (
            <>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                {userName ? `Hi ${userName.split(' ')[0]}! ` : ''}
                Ari will review your account shortly.
              </p>

              {userEmail && (
                <div
                  className="rounded-xl px-4 py-3 text-sm mb-4 text-left"
                  style={{ background: 'var(--background)', borderColor: 'var(--border)', border: '1px solid var(--border)' }}
                >
                  <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>
                    Signed in as
                  </p>
                  <p style={{ color: 'var(--foreground)' }}>{userEmail}</p>
                </div>
              )}

              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                This page will automatically redirect you once your account is approved. You can keep this tab open.
              </p>

              <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut()
                    window.location.href = '/login'
                  }}
                  className="text-sm w-full py-2 rounded-xl border transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--background)' }}
                >
                  Sign in with a different account
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
          Morrison Test Prep · SAT Prep Portal
        </p>
      </div>
    </div>
  )
}
