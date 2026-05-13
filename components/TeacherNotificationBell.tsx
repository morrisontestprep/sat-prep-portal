'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface TeacherNotification {
  id:         string
  type:       'assignment_submitted' | 'sat_rush_started' | 'sat_rush_completed' | 'practice_completed' | 'student_signup_pending' | string
  data:       Record<string, unknown>
  read:       boolean
  created_at: string
}

const POLL_INTERVAL_MS = 20_000   // poll every 20 seconds

function notifIcon(type: string) {
  if (type === 'student_signup_pending') {
    // Person / user-add icon
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
    )
  }
  if (type === 'assignment_submitted') {
    // Clipboard / check
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    )
  }
  if (type === 'sat_rush_started' || type === 'sat_rush_completed') {
    // Lightning bolt
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    )
  }
  // Practice / analytics
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

function notifTitle(n: TeacherNotification): string {
  const name = (n.data.studentName as string | undefined) || 'A student'
  if (n.type === 'student_signup_pending') {
    return `${name} is requesting access to the portal`
  }
  if (n.type === 'assignment_submitted') {
    const ws = (n.data.worksheetTitle as string | undefined) ?? 'an assignment'
    const score = n.data.score as string | undefined
    return score ? `${name} submitted "${ws}" — ${score}` : `${name} submitted "${ws}"`
  }
  if (n.type === 'sat_rush_started') {
    return `${name} started a SAT Rush game`
  }
  if (n.type === 'sat_rush_completed') {
    const pts = n.data.totalScore as number | undefined
    const attempted = n.data.questionsAttempted as number | undefined
    return pts !== undefined
      ? `${name} finished SAT Rush — ${pts} pts (${attempted ?? '?'} Qs)`
      : `${name} finished SAT Rush`
  }
  if (n.type === 'practice_completed') {
    const qc = n.data.questionCount as number | undefined
    return qc ? `${name} completed a ${qc}-question practice set` : `${name} completed a practice set`
  }
  return `${name} completed an activity`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

// ── Approve button for pending-signup notifications ───────────────────────────
function ApproveButton({
  studentId,
  onApproved,
}: {
  studentId: string
  onApproved: () => void
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')

  const handleApprove = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setState('loading')
    try {
      const res = await fetch('/api/approve-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      })
      if (res.ok) {
        setState('done')
        onApproved()
      } else {
        setState('idle')
        alert('Could not approve student. Please try from the Students page.')
      }
    } catch {
      setState('idle')
    }
  }

  if (state === 'done') {
    return (
      <span className="text-xs px-2.5 py-1 rounded-lg font-medium"
        style={{ background: '#f0fdf4', color: '#16a34a' }}>
        Approved ✓
      </span>
    )
  }

  return (
    <button
      onClick={handleApprove}
      disabled={state === 'loading'}
      className="text-xs px-2.5 py-1 rounded-lg font-medium disabled:opacity-50 transition-colors"
      style={{ background: 'var(--accent)', color: '#fff' }}
    >
      {state === 'loading' ? 'Approving…' : 'Approve'}
    </button>
  )
}

export default function TeacherNotificationBell() {
  const [notifications, setNotifications] = useState<TeacherNotification[]>([])
  const [open, setOpen]                   = useState(false)
  const dropdownRef                       = useRef<HTMLDivElement>(null)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/teacher-notifications')
      if (!res.ok) return
      const { notifications: data } = await res.json()
      setNotifications(data ?? [])
    } catch {
      // silently fail
    }
  }, [])

  // Initial fetch + polling
  useEffect(() => {
    fetchNotifications()
    const timer = setInterval(fetchNotifications, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [fetchNotifications])

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  // Clicking the bell opens dropdown and clears the unread badge (marks all read),
  // but keeps the full log visible.
  const handleOpen = async () => {
    const wasOpen = open
    setOpen(v => !v)
    if (!wasOpen && unreadCount > 0) {
      // Optimistically clear badge
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      // Persist to DB
      await fetch('/api/teacher-notifications', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ all: true }),
      }).catch(console.error)
    }
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={handleOpen}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
        style={{
          background: open ? 'var(--accent-light)' : 'transparent',
          color: open ? 'var(--accent)' : 'var(--text-muted)',
        }}
        title="Student activity"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white font-bold"
            style={{ background: '#ef4444', fontSize: '10px' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-96 rounded-2xl shadow-xl border overflow-hidden z-50"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'var(--border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
              Student Activity
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {notifications.length === 0 ? 'No activity yet' : `${notifications.length} event${notifications.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <svg className="w-8 h-8 mx-auto mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No student activity yet</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  You'll see it here when a student submits work
                </p>
              </div>
            ) : (
              notifications.map(n => {
                const isPending = n.type === 'student_signup_pending'
                const studentId = n.data.studentId as string | undefined

                return (
                  <div
                    key={n.id}
                    className="px-4 py-3 border-b"
                    style={{
                      borderColor: 'var(--border)',
                      background: isPending ? 'rgba(99,102,241,0.04)' : 'transparent',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{
                          background: isPending ? '#ede9fe' : 'var(--accent-light)',
                          color:      isPending ? '#7c3aed' : 'var(--accent)',
                        }}>
                        {notifIcon(n.type)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium leading-snug" style={{ color: 'var(--foreground)' }}>
                          {notifTitle(n)}
                        </p>
                        {typeof n.data.studentEmail === 'string' && (
                          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {n.data.studentEmail}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {fmtTime(n.created_at)}
                          </p>
                          {/* Inline approve button for pending-signup notifications */}
                          {isPending && studentId && (
                            <ApproveButton
                              studentId={studentId}
                              onApproved={fetchNotifications}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
