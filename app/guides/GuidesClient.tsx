'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import GuideEditorModal, { type Guide } from '@/components/GuideEditorModal'

const SUBJECT_COLORS: Record<string, { bg: string; color: string }> = {
  'Math':             { bg: '#ede9fe', color: '#7c3aed' },
  'English':          { bg: '#dbeafe', color: '#1d4ed8' },
  'General Strategy': { bg: '#dcfce7', color: '#16a34a' },
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 2)   return 'just now'
  if (mins  < 60)  return `${mins}m ago`
  if (hours < 24)  return `${hours}h ago`
  if (days  < 7)   return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function GuidesClient({ initialGuides }: { initialGuides: Guide[] }) {
  const supabase = createClient()
  const [guides, setGuides]       = useState<Guide[]>(initialGuides)
  const [editing, setEditing]     = useState<Guide | null>(null)
  const [creating, setCreating]   = useState(false)
  const [deleting, setDeleting]   = useState<string | null>(null)

  const createGuide = async () => {
    setCreating(true)
    const { data, error } = await supabase
      .from('instructional_guides')
      .insert({ title: 'Untitled Guide', subject: null, content: '' })
      .select()
      .single()
    setCreating(false)
    if (error || !data) { console.error(error); return }
    const guide = data as Guide
    setGuides(prev => [guide, ...prev])
    setEditing(guide)
  }

  const handleSaved = (updated: Guide) => {
    setGuides(prev => prev.map(g => g.id === updated.id ? updated : g))
    if (editing?.id === updated.id) setEditing(updated)
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this guide? This cannot be undone.')) return
    setDeleting(id)
    await supabase.from('instructional_guides').delete().eq('id', id)
    setGuides(prev => prev.filter(g => g.id !== id))
    setDeleting(null)
    if (editing?.id === id) setEditing(null)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 max-w-5xl mx-auto w-full">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Instructional Guides</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {guides.length === 0 ? 'No guides yet — create your first one.' : `${guides.length} guide${guides.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={createGuide}
          disabled={creating}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--accent)' }}
        >
          {creating ? (
            <>
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
              Creating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Guide
            </>
          )}
        </button>
      </div>

      {/* Empty state */}
      {guides.length === 0 && !creating && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="text-sm">Click <strong>New Guide</strong> to get started</p>
        </div>
      )}

      {/* Guide grid */}
      {guides.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {guides.map(g => {
            const subjectStyle = g.subject ? SUBJECT_COLORS[g.subject] : null
            return (
              <div
                key={g.id}
                onClick={() => setEditing(g)}
                className="group rounded-2xl border p-5 cursor-pointer transition-shadow hover:shadow-md flex flex-col gap-3"
                style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
              >
                {/* Subject badge */}
                <div className="flex items-start justify-between gap-2">
                  {subjectStyle ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: subjectStyle.bg, color: subjectStyle.color }}>
                      {g.subject}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--background)', color: 'var(--text-muted)' }}>
                      General
                    </span>
                  )}

                  {/* Delete button */}
                  <button
                    onClick={e => handleDelete(g.id, e)}
                    disabled={deleting === g.id}
                    title="Delete guide"
                    className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center transition-opacity flex-shrink-0"
                    style={{ color: 'var(--danger)' }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Title */}
                <h3 className="font-semibold leading-snug" style={{ color: 'var(--foreground)' }}>
                  {g.title || 'Untitled Guide'}
                </h3>

                {/* Footer */}
                <p className="text-xs mt-auto" style={{ color: 'var(--text-muted)' }}>
                  Updated {timeAgo(g.updated_at)}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Editor modal */}
      {editing && (
        <GuideEditorModal
          guide={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
