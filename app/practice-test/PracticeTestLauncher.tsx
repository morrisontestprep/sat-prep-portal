'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type TestRecord = {
  id: string
  created_at: string
  completed_at: string | null
  status: string
  rw_scaled_score: number | null
  math_scaled_score: number | null
  total_scaled_score: number | null
  rw_m1_correct: number | null
  rw_m2_correct: number | null
  math_m1_correct: number | null
  math_m2_correct: number | null
  retake_of: string | null
}

type Props = { tests: TestRecord[] }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    completed:     { label: 'Completed',   bg: '#f0fdf4', color: '#16a34a' },
    active:        { label: 'In Progress', bg: '#eff6ff', color: '#1d4ed8' },
    rw_m2_ready:   { label: 'In Progress', bg: '#eff6ff', color: '#1d4ed8' },
    break:         { label: 'In Progress', bg: '#eff6ff', color: '#1d4ed8' },
    math_m2_ready: { label: 'In Progress', bg: '#eff6ff', color: '#1d4ed8' },
    abandoned:     { label: 'Abandoned',   bg: 'var(--border)', color: 'var(--text-muted)' },
  }
  const s = map[status] ?? map.abandoned
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function DeleteButton({
  id, confirmDeleteId, deletingId, setConfirmDeleteId, onDelete,
}: {
  id: string
  confirmDeleteId: string | null
  deletingId: string | null
  setConfirmDeleteId: (id: string | null) => void
  onDelete: (id: string) => void
}) {
  if (confirmDeleteId === id) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Delete this test?</span>
        <button
          onClick={() => onDelete(id)}
          disabled={deletingId === id}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
          style={{ background: '#dc2626' }}>
          {deletingId === id ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          onClick={() => setConfirmDeleteId(null)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          Cancel
        </button>
      </div>
    )
  }
  return (
    <button
      onClick={() => setConfirmDeleteId(id)}
      className="px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5"
      style={{ borderColor: '#fca5a5', color: '#dc2626', background: '#fff1f2' }}
      title="Delete test">
      🗑 Delete
    </button>
  )
}

export default function PracticeTestLauncher({ tests }: Props) {
  const router = useRouter()
  const [starting,       setStarting]       = useState(false)
  const [deletingId,     setDeletingId]     = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function deleteTest(id: string) {
    setDeletingId(id)
    try {
      await fetch(`/api/practice-test/${id}`, { method: 'DELETE' })
      router.refresh()
    } catch (e) {
      console.error(e)
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  async function startNewTest() {
    setStarting(true)
    try {
      const res = await fetch('/api/practice-test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.testId) router.push(`/practice-test/${data.testId}`)
    } catch (e) {
      console.error(e)
    } finally {
      setStarting(false)
    }
  }

  const inProgress = tests.filter(t => t.status !== 'completed' && t.status !== 'abandoned')
  const completed  = tests.filter(t => t.status === 'completed')

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Practice Tests</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Full adaptive SAT practice — 4 modules, ~2h 25min
        </p>
      </div>

      {/* In-progress tests */}
      {inProgress.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>IN PROGRESS</h2>
          {inProgress.map(t => (
            <div
              key={t.id}
              className="rounded-2xl border p-4 flex items-center justify-between gap-4"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                  Practice Test — {fmtDate(t.created_at)}
                  {t.retake_of && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(Retake)</span>}
                </p>
                <StatusBadge status={t.status} />
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                  href={`/practice-test/${t.id}`}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{ background: 'var(--accent)' }}>
                  Continue →
                </Link>
                <DeleteButton id={t.id} confirmDeleteId={confirmDeleteId} deletingId={deletingId}
                  setConfirmDeleteId={setConfirmDeleteId} onDelete={deleteTest} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Start new test */}
      <div
        className="rounded-2xl border p-6 flex flex-col gap-4"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>Start a New Practice Test</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Reading &amp; Writing (2 × 32 min) + 10-min break + Math (2 × 35 min)
          </p>
          <div className="flex gap-6 mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>📖 54 Reading &amp; Writing questions</span>
            <span>➕ 44 Math questions</span>
            <span>🔀 Adaptive difficulty</span>
            <span>📊 Scored 400–1600</span>
          </div>
        </div>
        <button
          onClick={startNewTest}
          disabled={starting}
          className="px-6 py-3 rounded-xl font-semibold text-sm text-white self-start disabled:opacity-60 transition-opacity"
          style={{ background: 'var(--accent)' }}>
          {starting ? 'Setting up test…' : 'Start Practice Test →'}
        </button>
      </div>

      {/* Completed tests */}
      {completed.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>COMPLETED TESTS</h2>
          {completed.map(t => (
            <div
              key={t.id}
              className="rounded-2xl border p-4 flex items-center gap-4 flex-wrap"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              {/* Date + retake badge */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                  {fmtDate(t.created_at)}
                  {t.retake_of && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(Retake)</span>}
                </p>
                {t.completed_at && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Completed {fmtDate(t.completed_at)}
                  </p>
                )}
              </div>

              {/* Scores */}
              <div className="flex gap-5 items-baseline">
                <div className="text-center">
                  <p className="text-xl font-bold" style={{ color: 'var(--accent)' }}>{t.total_scaled_score ?? '—'}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total</p>
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>{t.rw_scaled_score ?? '—'}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>R&amp;W</p>
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>{t.math_scaled_score ?? '—'}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Math</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-shrink-0">
                <Link
                  href={`/practice-test/${t.id}/results`}
                  className="px-3 py-2 rounded-xl text-sm font-medium border"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                  Review
                </Link>
                <Link
                  href={`/practice-test/${t.id}/retake`}
                  className="px-3 py-2 rounded-xl text-sm font-medium text-white"
                  style={{ background: 'var(--accent)' }}>
                  Retake
                </Link>
                <DeleteButton id={t.id} confirmDeleteId={confirmDeleteId} deletingId={deletingId}
                  setConfirmDeleteId={setConfirmDeleteId} onDelete={deleteTest} />
              </div>
            </div>
          ))}
        </div>
      )}

      {tests.length === 0 && (
        <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
          No tests yet — start your first practice test above!
        </p>
      )}
    </div>
  )
}
