'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

type Worksheet = {
  id: string
  title: string
  created_at: string
  updated_at: string
  question_count: number
  assign_count: number
}

export default function WorksheetsList({ worksheets: initial }: { worksheets: Worksheet[] }) {
  const supabase = createClient()
  const router = useRouter()

  const [worksheets, setWorksheets] = useState(initial)
  const [deleteTarget, setDeleteTarget] = useState<Worksheet | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('worksheets').delete().eq('id', deleteTarget.id)
    if (error) {
      alert('Failed to delete worksheet. Please try again.')
      setDeleting(false)
      return
    }
    setWorksheets(prev => prev.filter(w => w.id !== deleteTarget.id))
    setDeleteTarget(null)
    setDeleting(false)
    router.refresh()
  }

  if (worksheets.length === 0) {
    return (
      <div className="text-center py-20 rounded-2xl border-2 border-dashed"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="font-medium">No worksheets yet</p>
        <p className="text-sm mt-1">Select questions from the Question Bank to create your first worksheet.</p>
        <Link href="/questions"
          className="inline-block mt-4 px-4 py-2 rounded-xl text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}>
          Go to Question Bank
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {worksheets.map(ws => {
          const updatedAt = new Date(ws.updated_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
          })

          return (
            <div key={ws.id} className="relative group rounded-2xl border transition-shadow hover:shadow-md"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              {/* Clickable card area */}
              <Link href={`/worksheets/${ws.id}`} className="block p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2 pr-6">
                  <h2 className="font-semibold text-base leading-tight" style={{ color: 'var(--foreground)' }}>
                    {ws.title}
                  </h2>
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    style={{ color: 'var(--text-muted)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                    {ws.question_count} question{ws.question_count !== 1 ? 's' : ''}
                  </span>
                  {ws.assign_count > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: '#f0fdf4', color: '#16a34a' }}>
                      Assigned to {ws.assign_count} student{ws.assign_count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Updated {updatedAt}
                </p>
              </Link>

              {/* Delete button — appears on hover */}
              <button
                onClick={() => setDeleteTarget(ws)}
                title="Delete worksheet"
                className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: '#fef2f2', color: '#ef4444' }}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6"
            style={{ background: 'var(--card)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: '#fef2f2' }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#ef4444">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Delete worksheet?</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>This cannot be undone.</p>
              </div>
            </div>

            <p className="text-sm mb-5 rounded-lg px-3 py-2.5"
              style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
              "{deleteTarget.title}"
            </p>

            <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
              Deleting this worksheet will permanently remove all its questions and any student assignments associated with it.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border disabled:opacity-50"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ background: '#ef4444' }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
