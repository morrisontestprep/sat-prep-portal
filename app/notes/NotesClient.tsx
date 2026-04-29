'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { NoteComment } from './page'

type SelectionInfo = { text: string; x: number; y: number }

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
  const commentInputRef = useRef<HTMLTextAreaElement>(null)

  const [content, setContent]       = useState(initialContent)
  const [comments, setComments]     = useState<NoteComment[]>(initialComments)
  const [newComment, setNewComment] = useState('')
  const [quotedText, setQuotedText] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null)

  // -- Live note updates from teacher ------------------------------------------
  useEffect(() => {
    const ch = supabase
      .channel(`student-notes-${studentId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'student_notes', filter: `student_id=eq.${studentId}` },
        p => {
          const row = p.new as { content: string; updated_at: string }
          setContent(row.content ?? '')
          setLastUpdated(row.updated_at)
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [studentId, supabase])

  // -- Live new comments -------------------------------------------------------
  useEffect(() => {
    const ch = supabase
      .channel(`student-comments-${studentId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'student_note_comments', filter: `student_id=eq.${studentId}` },
        p => setComments(prev => [...prev, p.new as NoteComment]))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [studentId, supabase])

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  // -- Text selection → floating "Add Comment" button -------------------------
  const handleMouseUp = () => {
    const sel = window.getSelection()
    const text = sel?.toString().trim() ?? ''
    if (!text || text.length < 2) { setSelectionInfo(null); return }

    const range = sel!.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setSelectionInfo({ text, x: rect.left + rect.width / 2, y: rect.top - 4 })
  }

  const startCommentFromSelection = () => {
    if (!selectionInfo) return
    setQuotedText(selectionInfo.text)
    setSelectionInfo(null)
    setTimeout(() => commentInputRef.current?.focus(), 50)
  }

  // Dismiss the floating button when clicking elsewhere
  useEffect(() => {
    const handler = () => setSelectionInfo(null)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // -- Submit comment ----------------------------------------------------------
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
      quoted_text: quotedText || null,
    })

    // Notify teacher (fire-and-forget)
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'student_comment',
        studentName,
        commentText: text,
        quotedText: quotedText || null,
      }),
    }).catch(console.error)

    setNewComment('')
    setQuotedText(null)
    setSubmitting(false)
  }

  const isEmpty = !content || content === '<br>' || content.trim() === ''

  return (
    <div className="flex flex-col gap-4">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Notes from Teacher</h1>
        {lastUpdated && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Updated {new Date(lastUpdated).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        )}
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Select any text in the notes to leave an inline comment.
        </p>
      </div>

      {/* Two-column layout: notes content + comments */}
      <div className="flex gap-5 items-start">

        {/* Left: note content (read-only) */}
        <div
          className="flex-1 min-w-0 rounded-2xl border"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          <div className="p-8" onMouseUp={handleMouseUp}>
            {isEmpty ? (
              <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Your teacher hasn&apos;t added any notes yet — check back later!
              </p>
            ) : (
              <div
                className="master-file-content select-text"
                style={{ color: 'var(--foreground)', fontSize: '15px', lineHeight: '1.75' }}
                dangerouslySetInnerHTML={{ __html: content }}
              />
            )}
          </div>
        </div>

        {/* Right: comments panel */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-3">

          {/* New comment box */}
          <div className="rounded-2xl border overflow-hidden"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Add a comment</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Select text in the notes to reference it
              </p>
            </div>
            <div className="p-4">
              {quotedText && (
                <div className="mb-3 flex items-start gap-2">
                  <div className="flex-1 text-xs italic pl-2 border-l-2 rounded"
                    style={{ borderColor: 'var(--accent)', color: 'var(--text-muted)', background: 'var(--accent-light)', padding: '4px 8px' }}>
                    &ldquo;{quotedText.length > 100 ? quotedText.slice(0, 100) + '...' : quotedText}&rdquo;
                  </div>
                  <button onClick={() => setQuotedText(null)} className="flex-shrink-0 text-xs mt-0.5"
                    style={{ color: 'var(--text-muted)' }}>✕</button>
                </div>
              )}
              <textarea
                ref={commentInputRef}
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }}
                placeholder={quotedText ? 'Comment on selection...' : 'Ask a question or leave a note...'}
                rows={3}
                className="w-full text-sm px-3 py-2 rounded-xl border resize-none outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
              />
              <button
                onClick={submitComment}
                disabled={submitting || !newComment.trim()}
                className="w-full mt-2 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {submitting ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>

          {/* Comment history */}
          {comments.length > 0 && (
            <div className="rounded-2xl border overflow-hidden"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                  Comment history ({comments.length})
                </p>
              </div>
              <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                {comments.map(c => {
                  const isTeacher = c.author_name === 'Teacher'
                  return (
                    <div key={c.id}
                      className={`rounded-xl p-3 space-y-1.5 ${isTeacher ? 'ml-2' : ''}`}
                      style={{ background: isTeacher ? 'var(--accent-light)' : 'var(--background)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold"
                          style={{ color: isTeacher ? 'var(--accent)' : 'var(--foreground)' }}>
                          {isTeacher ? 'Teacher' : 'You'}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      {c.quoted_text && (
                        <div className="text-xs italic pl-2 border-l-2"
                          style={{ borderColor: 'var(--accent)', color: 'var(--text-muted)' }}>
                          &ldquo;{c.quoted_text.length > 60 ? c.quoted_text.slice(0, 60) + '...' : c.quoted_text}&rdquo;
                        </div>
                      )}
                      <p className="text-sm leading-snug" style={{ color: 'var(--foreground)' }}>{c.content}</p>
                    </div>
                  )
                })}
                <div ref={commentsEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating "Add Comment" button on text selection */}
      {selectionInfo && (
        <button
          onMouseDown={e => { e.preventDefault(); startCommentFromSelection() }}
          className="fixed z-50 text-xs font-semibold text-white px-3 py-1.5 rounded-full shadow-lg transition-all"
          style={{
            top: selectionInfo.y - 36,
            left: selectionInfo.x - 52,
            background: 'var(--accent)',
            transform: 'translateX(-50%)',
          }}
        >
          Add Comment
        </button>
      )}
    </div>
  )
}
