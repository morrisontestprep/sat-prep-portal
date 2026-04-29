'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'

type Student = { id: string; full_name: string | null; email: string | null }
type Comment = {
  id: string
  author_id: string
  author_name: string
  content: string
  quoted_text: string | null
  created_at: string
  resolved?: boolean
}
type SelectedImg = { el: HTMLImageElement; rect: DOMRect }

// -- Highlight colours -------------------------------------------------------
const HIGHLIGHT_COLORS = [
  { label: 'Yellow',  value: '#fef08a' },
  { label: 'Green',   value: '#bbf7d0' },
  { label: 'Blue',    value: '#bfdbfe' },
  { label: 'Pink',    value: '#fbcfe8' },
  { label: 'Orange',  value: '#fed7aa' },
  { label: 'None',    value: 'transparent' },
]

const TEXT_COLORS = [
  { label: 'Black',   value: '#1a202c' },
  { label: 'Blue',    value: '#1d4ed8' },
  { label: 'Red',     value: '#dc2626' },
  { label: 'Green',   value: '#16a34a' },
  { label: 'Purple',  value: '#7c3aed' },
  { label: 'Orange',  value: '#d97706' },
  { label: 'Gray',    value: '#6b7280' },
]

// -- Toolbar helpers ---------------------------------------------------------
function Divider() {
  return <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: 'var(--border)' }} />
}

function ToolbarBtn({
  onMouseDown, title, children,
}: {
  onMouseDown: () => void; title: string; children: React.ReactNode
}) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onMouseDown() }}
      title={title}
      className="w-7 h-7 rounded flex items-center justify-center text-xs font-medium transition-colors hover:opacity-80"
      style={{ background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
    >
      {children}
    </button>
  )
}

function ColorDropdown({
  colors, onSelect, triggerLabel, triggerTitle, currentColor,
}: {
  colors: { label: string; value: string }[]
  onSelect: (v: string) => void
  triggerLabel: React.ReactNode
  triggerTitle: string
  currentColor?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o) }}
        title={triggerTitle}
        className="h-7 px-1.5 rounded flex items-center gap-0.5 text-xs font-medium transition-colors hover:opacity-80"
        style={{ background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
      >
        {triggerLabel}
        <svg className="w-2.5 h-2.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-[200] rounded-xl border shadow-xl p-2 flex flex-wrap gap-1"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', width: 140 }}
        >
          {colors.map(c => (
            <button
              key={c.value}
              onMouseDown={e => { e.preventDefault(); onSelect(c.value); setOpen(false) }}
              title={c.label}
              className="w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110"
              style={{
                background: c.value === 'transparent' ? 'repeating-linear-gradient(45deg,#ccc,#ccc 2px,white 2px,white 6px)' : c.value,
                borderColor: currentColor === c.value ? 'var(--accent)' : 'var(--border)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// -- Main component ----------------------------------------------------------
export default function MasterFileModal({
  student,
  onClose,
}: {
  student: Student
  onClose: () => void
}) {
  const supabase = createClient()
  const editorRef      = useRef<HTMLDivElement>(null)
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commentsEndRef = useRef<HTMLDivElement>(null)
  const hadEditsRef    = useRef(false)
  const dragHandleRef  = useRef<HTMLDivElement>(null)

  const [saveStatus, setSaveStatus]               = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [comments, setComments]                   = useState<Comment[]>([])
  const [newComment, setNewComment]               = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [loaded, setLoaded]                       = useState(false)
  const [selectedImg, setSelectedImg]             = useState<SelectedImg | null>(null)

  // -- Load note -------------------------------------------------------------
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('student_notes')
        .select('content')
        .eq('student_id', student.id)
        .maybeSingle()
      if (editorRef.current) editorRef.current.innerHTML = data?.content ?? ''
      setLoaded(true)
    })()
  }, [student.id, supabase])

  // -- Load comments (unresolved only) ---------------------------------------
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('student_note_comments')
        .select('*')
        .eq('student_id', student.id)
        .order('created_at', { ascending: true })
      setComments((data ?? []).filter((c: Comment) => !c.resolved))
    })()
  }, [student.id, supabase])

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  // -- Realtime: new comments + resolve updates ------------------------------
  useEffect(() => {
    const ch = supabase
      .channel(`mf-comments-${student.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'student_note_comments', filter: `student_id=eq.${student.id}` },
        p => setComments(prev => [...prev, p.new as Comment]))
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'student_note_comments', filter: `student_id=eq.${student.id}` },
        p => {
          const updated = p.new as Comment
          if (updated.resolved) {
            setComments(prev => prev.filter(c => c.id !== updated.id))
          } else {
            setComments(prev => prev.map(c => c.id === updated.id ? updated : c))
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [student.id, supabase])

  // -- Save ------------------------------------------------------------------
  const save = useCallback(async () => {
    if (!editorRef.current) return
    setSaveStatus('saving')
    const content = editorRef.current.innerHTML
    await supabase.from('student_notes').upsert(
      { student_id: student.id, content, updated_at: new Date().toISOString() },
      { onConflict: 'student_id' }
    )
    setSaveStatus('saved')
  }, [student.id, supabase])

  const scheduleAutoSave = useCallback(() => {
    hadEditsRef.current = true
    setSaveStatus('unsaved')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(save, 1500)
  }, [save])

  // -- Close: flush save + notify student if there were edits ---------------
  const handleClose = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (hadEditsRef.current) {
      await save()
      if (student.email) {
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'notes_updated',
            studentEmail: student.email,
            studentName: student.full_name || student.email,
          }),
        }).catch(console.error)
      }
    }
    onClose()
  }, [save, student, onClose])

  // Esc key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [handleClose])

  // -- Editor events ---------------------------------------------------------
  const handleInput = () => scheduleAutoSave()

  const handlePaste = (e: React.ClipboardEvent) => {
    const img = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
    if (!img) return
    e.preventDefault()
    const file = img.getAsFile()
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      document.execCommand('insertImage', false, reader.result as string)
      scheduleAutoSave()
    }
    reader.readAsDataURL(file)
  }

  // Image click -> show drag handle
  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      editorRef.current?.querySelectorAll('img.mf-selected').forEach(el => el.classList.remove('mf-selected'))
      target.classList.add('mf-selected')
      setSelectedImg({ el: target as HTMLImageElement, rect: target.getBoundingClientRect() })
    } else {
      editorRef.current?.querySelectorAll('img.mf-selected').forEach(el => el.classList.remove('mf-selected'))
      setSelectedImg(null)
    }
  }

  // -- Image drag-to-resize --------------------------------------------------
  const startImageDrag = (e: React.MouseEvent) => {
    if (!selectedImg) return
    e.preventDefault()
    e.stopPropagation()
    const img = selectedImg.el
    const startX = e.clientX
    const startW = img.offsetWidth

    const onMove = (me: MouseEvent) => {
      const newW = Math.max(80, startW + (me.clientX - startX))
      img.style.width = newW + 'px'
      img.style.height = 'auto'
      const r = img.getBoundingClientRect()
      if (dragHandleRef.current) {
        dragHandleRef.current.style.top  = (r.bottom - 6) + 'px'
        dragHandleRef.current.style.left = (r.right  - 6) + 'px'
      }
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      scheduleAutoSave()
      setSelectedImg(prev => prev ? { ...prev, rect: prev.el.getBoundingClientRect() } : null)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // -- Toolbar commands ------------------------------------------------------
  const execCmd = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
    scheduleAutoSave()
  }

  const applyHighlight = (color: string) => {
    editorRef.current?.focus()
    document.execCommand('hiliteColor', false, color)
    scheduleAutoSave()
  }

  const applyTextColor = (color: string) => {
    editorRef.current?.focus()
    document.execCommand('foreColor', false, color)
    scheduleAutoSave()
  }

  // -- Resolve comment -------------------------------------------------------
  const resolveComment = async (commentId: string) => {
    await supabase
      .from('student_note_comments')
      .update({ resolved: true })
      .eq('id', commentId)
    setComments(prev => prev.filter(c => c.id !== commentId))
  }

  // -- Teacher comment -------------------------------------------------------
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
      quoted_text: null,
    })
    setNewComment('')
    setSubmittingComment(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) handleClose() }}
    >
      {/* Drag-to-resize handle (SE corner of selected image) */}
      {selectedImg && (
        <div
          ref={dragHandleRef}
          title="Drag to resize"
          className="fixed z-[300] w-3.5 h-3.5 rounded-sm cursor-se-resize shadow-md"
          style={{
            top:  selectedImg.rect.bottom - 6,
            left: selectedImg.rect.right  - 6,
            background: 'var(--accent)',
            opacity: 0.85,
          }}
          onMouseDown={startImageDrag}
        />
      )}

      <div
        className="flex-1 flex rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--background)', minHeight: 0 }}
      >

        {/* ---- Editor pane ------------------------------------------------ */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Header */}
          <div className="px-5 py-3 border-b flex items-center justify-between flex-shrink-0"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                style={{ background: 'var(--accent)' }}>
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
              <button onClick={handleClose} title="Close (Esc)"
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ color: 'var(--text-muted)' }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="px-5 py-2 border-b flex items-center gap-1 flex-wrap flex-shrink-0"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

            <ToolbarBtn onMouseDown={() => execCmd('bold')} title="Bold"><strong>B</strong></ToolbarBtn>
            <ToolbarBtn onMouseDown={() => execCmd('italic')} title="Italic"><em>I</em></ToolbarBtn>
            <ToolbarBtn onMouseDown={() => execCmd('underline')} title="Underline"><u>U</u></ToolbarBtn>
            <Divider />
            <ToolbarBtn onMouseDown={() => execCmd('formatBlock', 'h1')} title="Heading 1"><span className="font-bold">H1</span></ToolbarBtn>
            <ToolbarBtn onMouseDown={() => execCmd('formatBlock', 'h2')} title="Heading 2"><span className="font-bold">H2</span></ToolbarBtn>
            <ToolbarBtn onMouseDown={() => execCmd('formatBlock', 'p')} title="Normal text"><span style={{ fontSize: 11 }}>P</span></ToolbarBtn>
            <Divider />
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
            <Divider />

            {/* Highlight color */}
            <ColorDropdown
              triggerTitle="Highlight color"
              triggerLabel={
                <span className="flex items-center gap-0.5">
                  <span className="font-bold text-xs" style={{ background: '#fef08a', padding: '0 2px', borderRadius: 2 }}>A</span>
                </span>
              }
              colors={HIGHLIGHT_COLORS}
              onSelect={applyHighlight}
            />

            {/* Text color */}
            <ColorDropdown
              triggerTitle="Text color"
              triggerLabel={
                <span className="flex flex-col items-center gap-0.5">
                  <span className="font-bold text-xs" style={{ lineHeight: 1 }}>A</span>
                  <span className="w-3 h-1 rounded-sm" style={{ background: 'var(--accent)' }} />
                </span>
              }
              colors={TEXT_COLORS}
              onSelect={applyTextColor}
            />

            <Divider />
            <ToolbarBtn onMouseDown={() => execCmd('removeFormat')} title="Clear formatting">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </ToolbarBtn>

            <span className="ml-auto text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
              Paste images &bull; drag corner to resize
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
              onClick={handleEditorClick}
              className="master-file-editor master-file-content outline-none min-h-[60vh] max-w-3xl mx-auto"
              data-placeholder="Start typing notes for this student..."
              style={{ color: 'var(--foreground)', fontSize: '15px', lineHeight: '1.75' }}
            />
          </div>
        </div>

        {/* ---- Comments sidebar ------------------------------------------- */}
        <div className="w-72 flex-shrink-0 border-l flex flex-col"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

          <div className="px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Comments</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Student comments appear here live</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {comments.length === 0 && (
              <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                No comments yet.
              </p>
            )}
            {comments.map(c => {
              const isTeacher = c.author_name === 'Teacher'
              return (
                <div key={c.id} className="rounded-xl p-3 space-y-1.5"
                  style={{ background: isTeacher ? 'var(--accent-light)' : 'var(--background)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold"
                      style={{ color: isTeacher ? 'var(--accent)' : 'var(--foreground)' }}>
                      {c.author_name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      {!isTeacher && (
                        <button
                          onClick={() => resolveComment(c.id)}
                          title="Resolve and dismiss"
                          className="text-xs px-1.5 py-0.5 rounded-md transition-colors hover:opacity-80"
                          style={{ background: 'var(--success)', color: '#fff', fontSize: 10, lineHeight: '1.4' }}
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                  {c.quoted_text && (
                    <div className="text-xs italic pl-2 border-l-2"
                      style={{ borderColor: 'var(--accent)', color: 'var(--text-muted)' }}>
                      &ldquo;{c.quoted_text.length > 80 ? c.quoted_text.slice(0, 80) + '...' : c.quoted_text}&rdquo;
                    </div>
                  )}
                  <p className="text-sm leading-snug" style={{ color: 'var(--foreground)' }}>{c.content}</p>
                </div>
              )
            })}
            <div ref={commentsEndRef} />
          </div>

          {/* Teacher reply */}
          <div className="p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment() }}
              placeholder="Reply to student... (Cmd+Enter)"
              rows={3}
              className="w-full text-sm px-3 py-2 rounded-lg border resize-none outline-none mb-2"
              style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
            />
            <button onClick={submitComment} disabled={submittingComment || !newComment.trim()}
              className="w-full py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}>
              {submittingComment ? 'Sending...' : 'Reply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
