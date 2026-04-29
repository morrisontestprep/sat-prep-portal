'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { NoteComment } from './page'

export default function NotesClient({
  studentId,
  studentName,
  initialContent,
  initialComments,
}: {
  studentId: string
  studentName: string
  initialContent: string
  initialComments: NoteComment[]
}) {
  const supabase = createClient()
  const commentsEndRef = useRef<HTMLDivElement>(null)

  const [content, setContent] = useState(initialContent)
  const [comments, setComments] = useState<NoteComment[]>(initialComments)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  // -- Live note updates from teacher -------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel(`student-notes-${studentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_notes',
          filter: `student_id=eq.${studentId}`,
        },
        payload => {
          const row = payload.new as { content: string; updated_at: string }
          setContent(row.content ?? '')
          setLastUpdated(row.updated_at)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [studentId, supabase])

  // -- Live new comments --------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel(`student-comments-${studentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'student_note_comments',
          filter: `student_id=eq.${studentId}`,
        },
        payload => setComments(prev => [...prev, payload.new as NoteComment])
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [studentId, supabase])

  // -- Auto-scroll on new comments ----------------------------------------------
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  // -- Submit student comment ---------------------------------------------------
  const submitComment = async () => {
    const text = newComment.trim()
    if (!text) return
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmitting(false); return }

    await supabase.from('student_note_comments').insert({
      student_id: studentId,
      author_id: user.id,
      author_name: studentName,
      content: text,
    })
    setNewComment('')
    setSubmitting(false)
  }

  const isEmpty = !content || content === '<br>' || content.trim() === ''

  return (
    <div className="flex flex-col gap-6">

      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Notes from Teacher</h1>
        {lastUpdated && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Last updated {new Date(lastUpdated).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Note content (read-only) */}
      <div
        className="rounded-2xl border p-8 min-h-48"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      >
        {isEmpty ? (
          <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Your teacher hasn&apos;t added any notes yet. Check back later!
          </p>
        ) : (
          <div
            className="master-file-content"
            style={{ color: 'var(--foreground)', fontSize: '15px', lineHeight: '1.75' }}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </div>

      {/* Comments section */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Comments</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Leave questions or notes for your teacher — they&apos;ll see them in real time.
          </p>
        </div>

        {/* Comment list */}
        <div className="px-6 py-4 space-y-3 max-h-96 overflow-y-auto">
          {comments.length === 0 && (
            <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>
              No comments yet. Ask a question below!
            </p>
          )}
          {comments.map(c => {
            const isTeacher = c.author_name === 'Teacher'
            return (
              <div
                key={c.id}
                className={`flex ${isTeacher ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className="max-w-md rounded-2xl px-4 py-3"
                  style={{
                    background: isTeacher ? 'var(--accent-light)' : 'var(--background)',
                    border: `1px solid ${isTeacher ? 'transparent' : 'var(--border)'}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: isTeacher ? 'var(--accent)' : 'var(--foreground)' }}
                    >
                      {c.author_name}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm leading-snug" style={{ color: 'var(--foreground)' }}>{c.content}</p>
                </div>
              </div>
            )
          })}
          <div ref={commentsEndRef} />
        </div>

        {/* Comment input */}
        <div className="px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex gap-3">
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }}
              placeholder="Add a comment or question for your teacher... (Enter to send)"
              rows={2}
              className="flex-1 text-sm px-4 py-2.5 rounded-xl border resize-none outline-none"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--background)',
                color: 'var(--foreground)',
              }}
            />
            <button
              onClick={submitComment}
              disabled={submitting || !newComment.trim()}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 self-end"
              style={{ background: 'var(--accent)' }}
            >
              {submitting ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
