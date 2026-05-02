'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'

export type Guide = {
  id: string
  title: string
  subject: string | null
  content: string
  created_at: string
  updated_at: string
}

const SUBJECTS = ['General Strategy', 'Math', 'English']

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

function encodeAttr(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// -- Toolbar sub-components --------------------------------------------------
function Divider() {
  return <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: 'var(--border)' }} />
}

function ToolbarBtn({
  onMouseDown, title, active, children,
}: {
  onMouseDown: () => void; title: string; active?: boolean; children: React.ReactNode
}) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onMouseDown() }}
      title={title}
      className="w-7 h-7 rounded flex items-center justify-center text-xs font-medium transition-colors hover:opacity-80"
      style={{
        background: active ? 'var(--accent-light)' : 'var(--background)',
        color: active ? 'var(--accent)' : 'var(--foreground)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      {children}
    </button>
  )
}

function ColorDropdown({ colors, onSelect, triggerLabel, triggerTitle }: {
  colors: { label: string; value: string }[]
  onSelect: (v: string) => void
  triggerLabel: React.ReactNode
  triggerTitle: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o) }}
        title={triggerTitle}
        className="h-7 px-1.5 rounded flex items-center gap-0.5 text-xs font-medium hover:opacity-80"
        style={{ background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
      >
        {triggerLabel}
        <svg className="w-2.5 h-2.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-[200] rounded-xl border shadow-xl p-2 flex flex-wrap gap-1"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', width: 140 }}>
          {colors.map(c => (
            <button key={c.value}
              onMouseDown={e => { e.preventDefault(); onSelect(c.value); setOpen(false) }}
              title={c.label}
              className="w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110"
              style={{
                background: c.value === 'transparent'
                  ? 'repeating-linear-gradient(45deg,#ccc,#ccc 2px,white 2px,white 6px)'
                  : c.value,
                borderColor: 'var(--border)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// -- Main component ----------------------------------------------------------
export default function GuideEditorModal({
  guide,
  onClose,
  onSaved,
}: {
  guide: Guide
  onClose: () => void
  onSaved: (g: Guide) => void
}) {
  const supabase = createClient()
  const editorRef     = useRef<HTMLDivElement>(null)
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleDebRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragHandleRef = useRef<HTMLDivElement>(null)
  const eqPanelRef   = useRef<HTMLDivElement>(null)

  const [title, setTitle]           = useState(guide.title)
  const [subject, setSubject]       = useState(guide.subject ?? '')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [loaded, setLoaded]         = useState(false)
  const [selectedImg, setSelectedImg] = useState<{ el: HTMLImageElement; rect: DOMRect } | null>(null)

  // Math equation state
  const [katexReady, setKatexReady] = useState(false)
  const [showEqPanel, setShowEqPanel] = useState(false)
  const [eqInput, setEqInput]       = useState('')
  const [eqDisplay, setEqDisplay]   = useState(false)
  const [eqPreview, setEqPreview]   = useState('')

  // Notify state
  const [notifyStatus, setNotifyStatus] = useState<'idle' | 'sending' | 'done'>('idle')

  // -- Load KaTeX from CDN ---------------------------------------------------
  useEffect(() => {
    if ((window as any).katex) { setKatexReady(true); return }
    if (!document.getElementById('katex-css')) {
      const link = document.createElement('link')
      link.id = 'katex-css'
      link.rel = 'stylesheet'
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css'
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js'
    script.onload = () => setKatexReady(true)
    document.head.appendChild(script)
  }, [])

  // -- Re-render stored math equations after KaTeX loads --------------------
  const rerenderMath = useCallback((el: HTMLElement) => {
    if (!(window as any).katex) return
    el.querySelectorAll('span.math-eq[data-latex]').forEach(span => {
      const latex   = span.getAttribute('data-latex') ?? ''
      const display = span.getAttribute('data-display') === 'true'
      try {
        span.innerHTML = (window as any).katex.renderToString(latex, { throwOnError: false, displayMode: display })
      } catch { /* ignore */ }
    })
  }, [])

  // -- Load content ----------------------------------------------------------
  useEffect(() => {
    if (!editorRef.current) return
    editorRef.current.innerHTML = guide.content ?? ''
    rerenderMath(editorRef.current)
    setLoaded(true)
  }, [guide.content, rerenderMath])

  // Also re-render when KaTeX finishes loading (content may already be there)
  useEffect(() => {
    if (katexReady && editorRef.current) rerenderMath(editorRef.current)
  }, [katexReady, rerenderMath])

  // -- Live equation preview -------------------------------------------------
  useEffect(() => {
    if (!eqInput.trim() || !(window as any).katex) { setEqPreview(''); return }
    try {
      setEqPreview((window as any).katex.renderToString(eqInput, { throwOnError: false, displayMode: eqDisplay }))
    } catch { setEqPreview('') }
  }, [eqInput, eqDisplay])

  // Close equation panel when clicking outside
  useEffect(() => {
    if (!showEqPanel) return
    const h = (e: MouseEvent) => {
      if (!eqPanelRef.current?.contains(e.target as Node)) setShowEqPanel(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showEqPanel])

  // -- Save content ----------------------------------------------------------
  const saveContent = useCallback(async () => {
    if (!editorRef.current) return
    setSaveStatus('saving')
    const content = editorRef.current.innerHTML
    const { data } = await supabase
      .from('instructional_guides')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', guide.id)
      .select()
      .single()
    setSaveStatus('saved')
    if (data) onSaved(data as Guide)
  }, [guide.id, supabase, onSaved])

  const scheduleAutoSave = useCallback(() => {
    setSaveStatus('unsaved')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(saveContent, 1500)
  }, [saveContent])

  // -- Save title ------------------------------------------------------------
  const saveTitle = useCallback(async (val: string) => {
    await supabase.from('instructional_guides').update({ title: val, updated_at: new Date().toISOString() }).eq('id', guide.id)
    onSaved({ ...guide, title: val })
  }, [guide, supabase, onSaved])

  const handleTitleChange = (val: string) => {
    setTitle(val)
    setSaveStatus('unsaved')
    if (titleDebRef.current) clearTimeout(titleDebRef.current)
    titleDebRef.current = setTimeout(() => saveTitle(val), 1000)
  }

  // -- Save subject ----------------------------------------------------------
  const handleSubjectChange = async (val: string) => {
    setSubject(val)
    await supabase.from('instructional_guides')
      .update({ subject: val || null, updated_at: new Date().toISOString() })
      .eq('id', guide.id)
    onSaved({ ...guide, subject: val || null })
  }

  // -- Close -----------------------------------------------------------------
  const handleClose = useCallback(async () => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); await saveContent() }
    if (titleDebRef.current) { clearTimeout(titleDebRef.current); await saveTitle(title) }
    onClose()
  }, [saveContent, saveTitle, title, onClose])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [handleClose])

  // -- Editor events ---------------------------------------------------------
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
    e.preventDefault(); e.stopPropagation()
    const img = selectedImg.el
    const startX = e.clientX
    const startW = img.offsetWidth
    const onMove = (me: MouseEvent) => {
      const newW = Math.max(80, startW + (me.clientX - startX))
      img.style.width = newW + 'px'; img.style.height = 'auto'
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

  // -- Insert math equation --------------------------------------------------
  const insertEquation = () => {
    const latex = eqInput.trim()
    if (!latex || !(window as any).katex) return
    let rendered: string
    try {
      rendered = (window as any).katex.renderToString(latex, { throwOnError: false, displayMode: eqDisplay })
    } catch {
      rendered = `<span style="color:red">${latex}</span>`
    }
    const span = `<span contenteditable="false" class="math-eq" data-latex="${encodeAttr(latex)}" data-display="${eqDisplay}" style="display:inline-block;vertical-align:middle;margin:0 2px;">${rendered}</span>`
    const html = eqDisplay
      ? `<div style="text-align:center;margin:12px 0">${span}</div>`
      : `${span}&nbsp;`
    editorRef.current?.focus()
    document.execCommand('insertHTML', false, html)
    scheduleAutoSave()
    setShowEqPanel(false)
    setEqInput('')
  }

  // -- Notify students -------------------------------------------------------
  const notifyStudents = async () => {
    setNotifyStatus('sending')
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'new_guide', guideTitle: title }),
    })
    setNotifyStatus('done')
    setTimeout(() => setNotifyStatus('idle'), 3000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) handleClose() }}
    >
      {/* Drag-to-resize handle */}
      {selectedImg && (
        <div
          ref={dragHandleRef}
          title="Drag to resize"
          className="fixed z-[300] w-3.5 h-3.5 rounded-sm cursor-se-resize shadow-md"
          style={{ top: selectedImg.rect.bottom - 6, left: selectedImg.rect.right - 6, background: 'var(--accent)', opacity: 0.85 }}
          onMouseDown={startImageDrag}
        />
      )}

      <div className="flex-1 flex flex-col rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--background)', minHeight: 0 }}>

        {/* ---- Header ---------------------------------------------------- */}
        <div className="px-6 py-3 border-b flex items-center gap-4 flex-shrink-0"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

          {/* Title */}
          <input
            value={title}
            onChange={e => handleTitleChange(e.target.value)}
            placeholder="Untitled Guide"
            className="flex-1 text-lg font-semibold bg-transparent outline-none min-w-0"
            style={{ color: 'var(--foreground)' }}
          />

          {/* Subject */}
          <select
            value={subject}
            onChange={e => handleSubjectChange(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg border outline-none"
            style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
          >
            <option value="">No subject</option>
            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Save status */}
          <span className="text-xs flex-shrink-0" style={{ color: saveStatus === 'unsaved' ? 'var(--warning)' : 'var(--text-muted)' }}>
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'unsaved' ? 'Unsaved' : 'Saved'}
          </span>

          {/* Notify button */}
          <button
            onClick={notifyStudents}
            disabled={notifyStatus !== 'idle'}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-colors"
            style={{ background: notifyStatus === 'done' ? 'var(--success)' : 'var(--accent)' }}
          >
            {notifyStatus === 'sending' ? 'Sending...' : notifyStatus === 'done' ? 'Notified!' : 'Notify Students'}
          </button>

          {/* Close */}
          <button onClick={handleClose} title="Close (Esc)"
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ---- Toolbar --------------------------------------------------- */}
        <div className="px-5 py-2 border-b flex items-center gap-1 flex-wrap flex-shrink-0 relative"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

          <ToolbarBtn onMouseDown={() => execCmd('bold')} title="Bold"><strong>B</strong></ToolbarBtn>
          <ToolbarBtn onMouseDown={() => execCmd('italic')} title="Italic"><em>I</em></ToolbarBtn>
          <ToolbarBtn onMouseDown={() => execCmd('underline')} title="Underline"><u>U</u></ToolbarBtn>
          <Divider />
          <ToolbarBtn onMouseDown={() => execCmd('formatBlock', 'h1')} title="Heading 1"><span className="font-bold">H1</span></ToolbarBtn>
          <ToolbarBtn onMouseDown={() => execCmd('formatBlock', 'h2')} title="Heading 2"><span className="font-bold">H2</span></ToolbarBtn>
          <ToolbarBtn onMouseDown={() => execCmd('formatBlock', 'p')} title="Paragraph"><span style={{ fontSize: 11 }}>P</span></ToolbarBtn>
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

          <ColorDropdown
            triggerTitle="Highlight color"
            triggerLabel={<span className="font-bold text-xs" style={{ background: '#fef08a', padding: '0 2px', borderRadius: 2 }}>A</span>}
            colors={HIGHLIGHT_COLORS}
            onSelect={color => { editorRef.current?.focus(); document.execCommand('hiliteColor', false, color); scheduleAutoSave() }}
          />
          <ColorDropdown
            triggerTitle="Text color"
            triggerLabel={
              <span className="flex flex-col items-center gap-0.5">
                <span className="font-bold text-xs" style={{ lineHeight: 1 }}>A</span>
                <span className="w-3 h-1 rounded-sm" style={{ background: 'var(--accent)' }} />
              </span>
            }
            colors={TEXT_COLORS}
            onSelect={color => { editorRef.current?.focus(); document.execCommand('foreColor', false, color); scheduleAutoSave() }}
          />
          <Divider />

          {/* Math equation button */}
          <div ref={eqPanelRef} className="relative flex-shrink-0">
            <ToolbarBtn
              onMouseDown={() => setShowEqPanel(o => !o)}
              title={katexReady ? 'Insert equation' : 'Loading math engine...'}
              active={showEqPanel}
            >
              <span style={{ fontFamily: 'serif', fontSize: 13 }}>&Sigma;</span>
            </ToolbarBtn>

            {showEqPanel && (
              <div
                className="absolute top-full left-0 mt-1 z-[200] rounded-xl border shadow-xl p-3"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', width: 320 }}
              >
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--foreground)' }}>Insert equation</p>
                <textarea
                  autoFocus
                  value={eqInput}
                  onChange={e => setEqInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); insertEquation() } }}
                  placeholder={"e.g.  \\frac{x^2+1}{2}  or  \\sqrt{3}"}
                  rows={2}
                  className="w-full text-sm px-2 py-1.5 rounded-lg border outline-none resize-none font-mono"
                  style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                />
                {/* Live preview */}
                {eqPreview ? (
                  <div
                    className="mt-2 p-2 rounded-lg border text-center overflow-x-auto"
                    style={{ borderColor: 'var(--border)', background: 'var(--background)', minHeight: 36 }}
                    dangerouslySetInnerHTML={{ __html: eqPreview }}
                  />
                ) : (
                  <div className="mt-2 p-2 rounded-lg border text-center text-xs"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', minHeight: 36, lineHeight: '20px' }}>
                    Preview
                  </div>
                )}
                <div className="flex items-center justify-between mt-2">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                    <input type="checkbox" checked={eqDisplay} onChange={e => setEqDisplay(e.target.checked)} />
                    Display (centered block)
                  </label>
                  <button
                    onMouseDown={e => { e.preventDefault(); insertEquation() }}
                    disabled={!eqInput.trim() || !katexReady}
                    className="px-3 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}
                  >
                    Insert
                  </button>
                </div>
                <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Supports standard LaTeX math. Enter to insert.
                </p>
              </div>
            )}
          </div>

          <Divider />
          <ToolbarBtn onMouseDown={() => execCmd('removeFormat')} title="Clear formatting">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </ToolbarBtn>

          <span className="ml-auto text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
            Paste images &bull; drag corner to resize &bull; &Sigma; for equations
          </span>
        </div>

        {/* ---- Editor body ----------------------------------------------- */}
        <div className="flex-1 overflow-y-auto px-12 py-8">
          <div
            ref={editorRef}
            contentEditable={loaded}
            suppressContentEditableWarning
            onInput={() => scheduleAutoSave()}
            onPaste={handlePaste}
            onClick={handleEditorClick}
            className="master-file-editor master-file-content outline-none min-h-[60vh] max-w-3xl mx-auto"
            data-placeholder="Start writing your guide..."
            style={{ color: 'var(--foreground)', fontSize: '15px', lineHeight: '1.75' }}
          />
        </div>
      </div>
    </div>
  )
}
