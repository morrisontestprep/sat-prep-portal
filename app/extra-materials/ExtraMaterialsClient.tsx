'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { SharedGuide } from './page'

const SUBJECTS = ['All', 'General Strategy', 'Math', 'English']

const SUBJECT_COLORS: Record<string, { bg: string; color: string }> = {
  'Math':             { bg: '#ede9fe', color: '#7c3aed' },
  'English':          { bg: '#dbeafe', color: '#1d4ed8' },
  'General Strategy': { bg: '#dcfce7', color: '#16a34a' },
}

function timeAgo(dateStr: string) {
  const diff  = Date.now() - new Date(dateStr).getTime()
  const days  = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  const mins  = Math.floor(diff / 60000)
  if (mins  < 2)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// -- Read-only guide viewer modal ------------------------------------------
function GuideViewer({ guide, onClose }: { guide: SharedGuide; onClose: () => void }) {
  const contentRef  = useRef<HTMLDivElement>(null)
  const [katexReady, setKatexReady] = useState(false)

  // Load KaTeX from CDN
  useEffect(() => {
    if ((window as any).katex) { setKatexReady(true); return }
    if (!document.getElementById('katex-css')) {
      const link = document.createElement('link')
      link.id = 'katex-css'; link.rel = 'stylesheet'
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css'
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js'
    script.onload = () => setKatexReady(true)
    document.head.appendChild(script)
  }, [])

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

  // Set content + render math
  useEffect(() => {
    if (!contentRef.current) return
    contentRef.current.innerHTML = guide.content ?? ''
    rerenderMath(contentRef.current)
  }, [guide.content, rerenderMath])

  useEffect(() => {
    if (katexReady && contentRef.current) rerenderMath(contentRef.current)
  }, [katexReady, rerenderMath])

  // Esc to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const subStyle = guide.subject ? SUBJECT_COLORS[guide.subject] : null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex-1 flex flex-col rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--background)', minHeight: 0 }}>

        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center gap-4 flex-shrink-0"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              {subStyle && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: subStyle.bg, color: subStyle.color }}>
                  {guide.subject}
                </span>
              )}
              {guide.domain && (
                <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: 'var(--background)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  {guide.domain}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold mt-1 truncate" style={{ color: 'var(--foreground)' }}>
              {guide.title}
            </h1>
          </div>
          <button onClick={onClose} title="Close (Esc)"
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-12 py-8">
          {!guide.content || guide.content === '<br>' || guide.content.trim() === '' ? (
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>This guide has no content yet.</p>
          ) : (
            <div
              ref={contentRef}
              className="master-file-content max-w-3xl mx-auto"
              style={{ color: 'var(--foreground)', fontSize: '15px', lineHeight: '1.75' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// -- Main component ---------------------------------------------------------
export default function ExtraMaterialsClient({ guides }: { guides: SharedGuide[] }) {
  const [activeSubject, setActiveSubject] = useState('All')
  const [viewing, setViewing]             = useState<SharedGuide | null>(null)

  const filtered = activeSubject === 'All'
    ? guides
    : guides.filter(g => g.subject === activeSubject)

  // Subjects that actually have guides (for showing/hiding filter pills)
  const presentSubjects = SUBJECTS.filter(s =>
    s === 'All' || guides.some(g => g.subject === s)
  )

  return (
    <div className="flex-1 flex flex-col p-6 max-w-5xl mx-auto w-full">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Extra Materials</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Instructional guides shared with you by your tutor
        </p>
      </div>

      {guides.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="text-sm font-medium">No guides yet</p>
          <p className="text-xs">Your tutor will share guides here as your sessions progress.</p>
        </div>
      ) : (
        <>
          {/* Subject filter pills */}
          {presentSubjects.length > 2 && (
            <div className="flex items-center gap-2 flex-wrap mb-5">
              {presentSubjects.map(s => {
                const active = activeSubject === s
                const style  = s !== 'All' ? SUBJECT_COLORS[s] : null
                return (
                  <button
                    key={s}
                    onClick={() => setActiveSubject(s)}
                    className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={active ? {
                      background: style?.bg ?? 'var(--accent)',
                      color: style?.color ?? '#fff',
                      outline: `2px solid ${style?.color ?? 'var(--accent)'}`,
                      outlineOffset: 2,
                    } : {
                      background: 'var(--card)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {s}
                    {s !== 'All' && (
                      <span className="ml-1.5 text-xs opacity-70">
                        {guides.filter(g => g.subject === s).length}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Guide grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(g => {
              const subStyle = g.subject ? SUBJECT_COLORS[g.subject] : null
              return (
                <button
                  key={g.id}
                  onClick={() => setViewing(g)}
                  className="text-left rounded-2xl border p-5 flex flex-col gap-3 transition-shadow hover:shadow-md"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                >
                  {subStyle ? (
                    <span className="self-start text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: subStyle.bg, color: subStyle.color }}>
                      {g.subject}
                    </span>
                  ) : (
                    <span className="self-start text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--background)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      General
                    </span>
                  )}

                  <div className="flex-1">
                    <h3 className="font-semibold leading-snug" style={{ color: 'var(--foreground)' }}>
                      {g.title}
                    </h3>
                    {g.domain && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{g.domain}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Updated {timeAgo(g.updated_at)}
                    </p>
                    <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                      Read &rarr;
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Viewer modal */}
      {viewing && <GuideViewer guide={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
