'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'

type Student = { id: string; full_name: string | null; email: string | null }
type Comment = {
  id: string
  author_id: string
  author_name: string
  content: string
  created_at: string
}

function ToolbarBtn({
  onMouseDown,
  title,
  children,
  active = false,
}: {
  onMouseDown: () => void
  title: string
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onMouseDown() }}
      title={title}
      className="w-7 h-7 rounded flex items-center justify-center text-xs font-medium transition-colors"
      style={{
        background: active ? 'var(--accent-light)' : 'var(--background)',
        color: active ? 'var(--accent)' : 'var(--foreground)',
        border: '1px solid var(--border)',
      }}
    >
      {children}
    </button>
  )
}

export default function MasterFileModal({
  student,
  onClose,
}: {
  student: Student
  onClose: () => void
}) {
  const supabase = createClient()
  const editorRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // -- Load note content --------------------------------------------------------
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('student_notes')
        .select('content')
        .eq('student_id', student.id)
        .maybeSingle()

      if (editorRef.current) {
        editorRef.current.innerHTML = data?.content ?? ''
      }
      setLoaded(true)
    })()
  }, [student.id, supabase])

  // -- Load comments ------------------------------------------------------------
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('student_note_comments')
        .select('*')
        .eq('student_id', student.id)
        .order('created_at', { ascending: true })
      setComments(data ?? [])
    })()
  }, [student.id, supabase])

  // -- Auto-scroll comments to bottom on new message ----------------------------
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  // -- Realtime: new comments ---------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel(`master-comments-${student.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'student_note_comments', filter: `student_id=eq.${student.id}` },
        payload => setComments(prev => [...prev, payload.new as Comment])
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [student.id, supabase])

  // -- Auto-save ----------------------------------------------------------------
  const save = useCallback(async () => {
    if (!editorRef.current) return
    setSaveStatus('saving')
    const content = editorRef.current.innerHTML
    await supabase
      .from('student_notes')
      .upsert({ student_id: student.id, content, updated_at: new Date().toISOString() }, { onConflict: 'student_id' })
    setSaveStatus('saved')
  }, [student.id, supabase])

  const scheduleAutoSave = useCallback(() => {
    setSaveStatus('unsaved')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(save, 1500)
  }, [save])

  // Save on close if dirty
  useEffect(() => {
    return () => { if (debounceRef.current) { clearTimeout(debounceRef.current); save() } }
  }, [save])

  // -- Editor events ------------------------------------------------------------
  const handleInput = () => scheduleAutoSave()

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(item => item.type.startsWith('image/'))
    if (!imageItem) return
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      document.execCommand('insertImage', false, reader.result as string)
      scheduleAutoSave()
    }
    reader.readAsDataURL(file)
  }

  const execCmd = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
    scheduleAutoSave()
  }

  // -- Comments -----------------------------------------------------------------
  const submitComment = async () => {
    const text = newComment.trim()
    if (!text) return
    setSubmittingComment(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmittingComment(false); return }
    await supabase.from('student_note_comments').insert({
      student_id: student.id,
      author_id: user.id,
      author_name: 'Teacher',
      content: text,
    })
    setNewComment('')
    setSubmittingComment(false)
  }

  // -- Keyboard shortcut to close -----------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex-1 flex rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--background)', minHeight: 0 }}
      >

        {/* -- Editor pane ------------------------------------------------------ */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Header */}
          <div className="px-5 py-3 border-b flex items-center justify-between flex-shrink-0"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                style={{ background: 'var(--accent)' }}
              >
                {(student.full_name || student.email || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                  {student.full_name || student.email}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Master File</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs" style={{ color: saveStatus === 'unsaved' ? 'var(--warning)' : 'var(--text-muted)' }}>
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'unsaved' ? 'Unsaved changes' : 'Saved'}
              </span>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{ color: 'var(--text-muted)' }}
                title="Close (Esc)"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <div
            className="px-5 py-2 border-b flex items-center gap-1 flex-wrap flex-shrink-0"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            <ToolbarBtn onMouseDown={() => execCmd('bold')} title="Bold"><strong>B</strong></ToolbarBtn>
            <ToolbarBtn onMouseDown={() => execCmd('italic')} title="Italic"><em>I</em></ToolbarBtn>
            <ToolbarBtn onMouseDown={() => execCmd('underline')} title="Underline"><u>U</u></ToolbarBtn>
            <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: 'var(--border)' }} />
            <ToolbarBtn onMouseDown={() => execCmd('formatBlock', 'h1')} title="Heading 1">
              <span className="font-bold">H1</span>
            </ToolbarBtn>
            <ToolbarBtn onMouseDown={() => execCmd('formatBlock', 'h2')} title="Heading 2">
              <span className="font-bold">H2</span>
            </ToolbarBtn>
            <ToolbarBtn onMouseDown={() => execCmd('formatBlock', 'p')} title="Normal text">
              <span style={{ fontSize: 11 }}>P</span>
            </ToolbarBtn>
            <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: 'var(--border)' }} />
            <ToolbarBtn onMouseDown={() => execCmd('insertUnorderedList')} title="Bullet list">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </ToolbarBtn>
            <ToolbarBtn onMouseDown={() => execCmd('insertOrderedList')} title="Numbered list">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h10M7 16h10M3 8h.01M3 12h.01M3 16h.01" />
              </svg>
            </ToolbarBtn>
            <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: 'var(--border)' }} />
            <ToolbarBtn onMouseDown={() => execCmd('removeFormat')} title="Clear formatting">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </ToolbarBtn>
            <span className="ml-auto text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
              Paste screenshots directly into the document
            </span>
          </div>

          {/* Editor body */}
          <div className="flex-1 overflow-y-auto px-12 py-8">
            <div
              ref={editorRef}
              contentEditable={loaded}
              suppressContentEditableWarning
              onInput={handleInput}
              onPaste={handlePaste}
              className="master-file-editor master-file-content outline-none min-h-[60vh] max-w-3xl mx-auto"
              data-placeholder="Start typing notes for this student..."
              style={{ color: 'var(--foreground)', fontSize: '15px', lineHeight: '1.75' }}
            />
          </div>
        </div>

        {/* -- Comments sidebar ------------------------------------------------- */}
        <div
          className="w-72 flex-shrink-0 border-l flex flex-col"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          <div className="px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
              Comments
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Student comments appear here live
            </p>
          </div>

          {/* Comment list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {comments.length === 0 && (
              <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                No comments yet.<br />Students can leave comments from their Notes page.
              </p>
            )}
            {comments.map(c => {
              const isTeacher = c.author_name === 'Teacher'
              return (
                <div
                  key={c.id}
                  className="rounded-xl p-3"
                  style={{ background: isTeacher ? 'var(--accent-light)' : 'var(--background)' }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: isTeacher ? 'var(--accent)' : 'var(--foreground)' }}
                    >
                      {c.author_name}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-sm leading-snug" style={{ color: 'var(--foreground)' }}>{c.content}</p>
                </div>
              )
            })}
            <div ref={commentsEndRef} />
          </div>

          {/* Teacher comment input */}
          <div className="p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment() }}
              placeholder="Reply to student... (Cmd+Enter to send)"
              rows={3}
              className="w-full text-sm px-3 py-2 rounded-lg border resize-none outline-none mb-2"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--background)',
                color: 'var(--foreground)',
              }}
            />
            <button
              onClick={submitComment}
              disabled={submittingComment || !newComment.trim()}
              className="w-full py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-opacity"
              style={{ background: 'var(--accent)' }}
            >
              {submittingComment ? 'Sending...' : 'Add Comment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
