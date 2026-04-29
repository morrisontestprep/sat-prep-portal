'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import type { WorksheetItemRaw, AssignmentRaw, StudentAnswerRaw } from './page'
import DesmosCalculator from '@/components/DesmosCalculator'
import ExplanationEditor from '@/components/ExplanationEditor'

// ── Types ────────────────────────────────────────────────────────────────────
type Question = {
  id: string; subject: string; domain: string; skill: string; difficulty: string
  question_image_url: string; answer_image_url: string; correct_answer: string
}
type Student = { id: string; full_name: string | null; email: string | null }

type Block =
  | { type: 'question';        localId: string; dbId: string | null; question: Question }
  | { type: 'section_header';  localId: string; dbId: string | null; content: string }
  | { type: 'note';            localId: string; dbId: string | null; content: string }

function makeLid() { return Math.random().toString(36).slice(2) }

function rawToBlock(item: WorksheetItemRaw): Block {
  if (item.type === 'question' && item.questions) {
    return { type: 'question', localId: makeLid(), dbId: item.id, question: item.questions as Question }
  }
  return { type: item.type as 'section_header' | 'note', localId: makeLid(), dbId: item.id, content: item.content ?? '' }
}

// ── Difficulty badge colours ──────────────────────────────────────────────────
const diffBg   = (d: string) => d === 'Easy' ? '#f0fdf4' : d === 'Medium' ? '#fffbeb' : d === 'Hard' ? '#fef2f2' : '#f3f4f6'
const diffCol  = (d: string) => d === 'Easy' ? '#16a34a' : d === 'Medium' ? '#d97706' : d === 'Hard' ? '#dc2626' : '#6b7280'
const diffLabel = (d: string) => d || 'Unrated'

// ── Main component ────────────────────────────────────────────────────────────
export default function WorksheetView({
  worksheetId,
  initialTitle,
  initialItems,
  students,
  assignments: initialAssignments,
  studentAnswers: initialStudentAnswers,
}: {
  worksheetId: string
  initialTitle: string
  initialItems: WorksheetItemRaw[]
  students: Student[]
  assignments: AssignmentRaw[]
  studentAnswers: StudentAnswerRaw[]
}) {
  const supabase = createClient()
  const router = useRouter()

  const [title, setTitle]         = useState(initialTitle)
  const [blocks, setBlocks]       = useState<Block[]>(initialItems.map(rawToBlock))
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [showAnswers, setShowAnswers] = useState<Set<string>>(new Set())

  // Assign modal
  const [showAssign, setShowAssign] = useState(false)
  const [assignments, setAssignments] = useState<AssignmentRaw[]>(initialAssignments)
  const [studentAnswers] = useState<StudentAnswerRaw[]>(initialStudentAnswers)
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set())
  const [dueDate, setDueDate]     = useState('')
  const [assigning, setAssigning] = useState(false)
  const [expandedAssignment, setExpandedAssignment] = useState<string | null>(null)
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null)
  // Track which question has the explanation editor open (by question dbId)
  const [explanationOpenFor, setExplanationOpenFor] = useState<string | null>(null)
  const [sentExplanations, setSentExplanations] = useState<Set<string>>(new Set())

  // ── Overlay filter state (only meaningful when a student is overlaid) ────────
  const [filterCorrectness, setFilterCorrectness]   = useState<'all' | 'correct' | 'wrong'>('all')
  const [filterDifficulties, setFilterDifficulties] = useState<Set<string>>(new Set())
  const [filterTime, setFilterTime] = useState<{ enabled: boolean; direction: 'gt' | 'lt'; seconds: number }>(
    { enabled: false, direction: 'gt', seconds: 60 }
  )

  // Reset filters whenever the student overlay changes
  useEffect(() => {
    setFilterCorrectness('all')
    setFilterDifficulties(new Set())
    setFilterTime({ enabled: false, direction: 'gt', seconds: 60 })
  }, [selectedAssignmentId])

  // Refs for scrolling worksheet to the active question
  const questionRefs       = useRef<Map<string, HTMLDivElement>>(new Map())
  const worksheetScrollRef = useRef<HTMLDivElement>(null)

  // Left-panel spacer height — set to the active question's offsetTop so the editor
  // sits at exactly the same vertical position as the question in the center panel.
  const [editorTopOffset, setEditorTopOffset]   = useState(0)
  const pendingLeftScrollRef = useRef<number | null>(null)

  // Stage 1: measure question position, set spacer, scroll center
  useEffect(() => {
    if (!explanationOpenFor) { setEditorTopOffset(0); return }
    requestAnimationFrame(() => {
      const el        = questionRefs.current.get(explanationOpenFor)
      const center    = worksheetScrollRef.current
      if (!el || !center) return
      const OFFSET = 60  // height of sticky toolbar + breathing room
      const rect  = el.getBoundingClientRect()
      const cRect = center.getBoundingClientRect()
      const absTop = rect.top - cRect.top + center.scrollTop
      pendingLeftScrollRef.current = Math.max(0, absTop - OFFSET)
      setEditorTopOffset(absTop)
      center.scrollTo({ top: Math.max(0, absTop - OFFSET), behavior: 'smooth' })
    })
  }, [explanationOpenFor])

  // Stage 2: after spacer renders, scroll left panel to match
  useEffect(() => {
    if (pendingLeftScrollRef.current === null) return
    const target = pendingLeftScrollRef.current
    pendingLeftScrollRef.current = null
    const left = leftPanelRef.current
    if (left) requestAnimationFrame(() => left.scrollTo({ top: target, behavior: 'smooth' }))
  }, [editorTopOffset])

  // ── Resizable columns + right-panel collapse ─────────────────────────────
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [leftW,  setLeftW]  = useState(320)
  const [rightW, setRightW] = useState(240)
  const leftWRef  = useRef(320)
  const rightWRef = useRef(240)
  const leftPanelRef  = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const resizingCol   = useRef<'left' | 'right' | null>(null)
  const resizeStartX  = useRef(0)
  const resizeStartW  = useRef(0)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingCol.current) return
      const dx = e.clientX - resizeStartX.current
      if (resizingCol.current === 'left') {
        const w = Math.max(240, Math.min(700, resizeStartW.current + dx))
        leftWRef.current = w
        if (leftPanelRef.current) leftPanelRef.current.style.width = `${w}px`
      } else {
        const w = Math.max(160, Math.min(420, resizeStartW.current - dx))
        rightWRef.current = w
        if (rightPanelRef.current) rightPanelRef.current.style.width = `${w}px`
      }
    }
    const onUp = () => {
      if (!resizingCol.current) return
      if (resizingCol.current === 'left') setLeftW(leftWRef.current)
      else setRightW(rightWRef.current)
      resizingCol.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [])

  // Build a lookup for the selected student's answers
  const selectedAnswersMap: Record<string, StudentAnswerRaw> = {}
  if (selectedAssignmentId) {
    studentAnswers.filter(sa => sa.assignment_id === selectedAssignmentId).forEach(sa => {
      selectedAnswersMap[sa.question_id] = sa
    })
  }

  // ── Filter helper ────────────────────────────────────────────────────────────
  const blockPassesFilter = (block: Block): boolean => {
    if (!selectedAssignmentId) return true
    if (block.type !== 'question') return true
    const sa = selectedAnswersMap[block.question.id]
    if (filterCorrectness === 'correct' && (!sa || !sa.is_correct)) return false
    if (filterCorrectness === 'wrong'   && (!sa ||  sa.is_correct)) return false
    if (filterDifficulties.size > 0 && !filterDifficulties.has(block.question.difficulty)) return false
    if (filterTime.enabled) {
      const t = sa?.time_spent_seconds ?? null
      if (t === null) return false
      if (filterTime.direction === 'gt' && t <= filterTime.seconds) return false
      if (filterTime.direction === 'lt' && t >= filterTime.seconds) return false
    }
    return true
  }

  const anyFilterActive = !!selectedAssignmentId && (
    filterCorrectness !== 'all' || filterDifficulties.size > 0 || filterTime.enabled
  )
  const filteredQuestionCount = blocks.filter(b => b.type === 'question' && blockPassesFilter(b)).length

  // Inline "add block" picker state
  const [addMenu, setAddMenu]     = useState<string | null>(null) // localId of block to insert after, or 'top'

  // ── Block manipulation ────────────────────────────────────────────────────
  const moveBlock = (localId: string, dir: -1 | 1) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.localId === localId)
      if (idx < 0) return prev
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  const removeBlock = (localId: string) =>
    setBlocks(prev => prev.filter(b => b.localId !== localId))

  const updateContent = (localId: string, content: string) =>
    setBlocks(prev => prev.map(b => b.localId === localId ? { ...b, content } as Block : b))

  const insertBlock = (afterLocalId: string | 'top', type: 'section_header' | 'note') => {
    const newBlock: Block = { type, localId: makeLid(), dbId: null, content: '' }
    setBlocks(prev => {
      if (afterLocalId === 'top') return [newBlock, ...prev]
      const idx = prev.findIndex(b => b.localId === afterLocalId)
      return [...prev.slice(0, idx + 1), newBlock, ...prev.slice(idx + 1)]
    })
    setAddMenu(null)
  }

  const toggleAnswer = (localId: string) =>
    setShowAnswers(prev => {
      const next = new Set(prev)
      if (next.has(localId)) { next.delete(localId) } else { next.add(localId) }
      return next
    })

  // ── Save (full replace of worksheet_items) ────────────────────────────────
  const save = useCallback(async () => {
    setSaving(true)
    setSaved(false)

    // 1. Update worksheet title + updated_at
    const { error: titleErr } = await supabase
      .from('worksheets')
      .update({ title: title.trim() || 'Untitled Worksheet', updated_at: new Date().toISOString() })
      .eq('id', worksheetId)

    if (titleErr) {
      alert('Failed to save worksheet. Please try again.')
      setSaving(false)
      return
    }

    // 2. Build the new rows first, then delete + insert atomically
    const rows = blocks.map((b, i) => ({
      worksheet_id: worksheetId,
      position: i,
      type: b.type,
      question_id: b.type === 'question' ? b.question.id : null,
      content: b.type !== 'question' ? b.content : null,
    }))

    const { error: deleteErr } = await supabase
      .from('worksheet_items')
      .delete()
      .eq('worksheet_id', worksheetId)

    if (deleteErr) {
      alert('Failed to save worksheet. Please try again.')
      setSaving(false)
      return
    }

    if (rows.length > 0) {
      const { error: insertErr } = await supabase.from('worksheet_items').insert(rows)
      if (insertErr) {
        alert('Failed to save worksheet items. Your worksheet may be empty — please refresh and try again.')
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }, [supabase, worksheetId, title, blocks])

  // ── Assign ───────────────────────────────────────────────────────────────
  const handleAssign = async () => {
    setAssigning(true)
    await save() // save current state first
    const rows = Array.from(selectedStudents).map(sid => ({
      worksheet_id: worksheetId,
      student_id: sid,
      due_date: dueDate || null,
    }))
    // Insert with ignoreDuplicates — if a student already has attempt 1, skip
    await supabase.from('student_assignments').upsert(rows, { onConflict: 'worksheet_id,student_id,attempt_number', ignoreDuplicates: true })

    // Refresh assignments list
    const { data, error: refreshErr } = await supabase
      .from('student_assignments')
      .select('id, assigned_at, due_date, status, student_id, attempt_number, profiles(id, full_name, email)')
      .eq('worksheet_id', worksheetId)
      .order('assigned_at', { ascending: false })
    if (refreshErr) {
      // Fallback without attempt_number
      const { data: fallback } = await supabase
        .from('student_assignments')
        .select('id, assigned_at, due_date, status, student_id, profiles(id, full_name, email)')
        .eq('worksheet_id', worksheetId)
        .order('assigned_at', { ascending: false })
      setAssignments(((fallback ?? []) as any[]).map(a => ({ ...a, attempt_number: 1 })) as AssignmentRaw[])
    } else {
      setAssignments(((data ?? []) as any[]).map(a => ({ ...a, attempt_number: a.attempt_number ?? 1 })) as AssignmentRaw[])
    }

    // Notify each newly assigned student (fire-and-forget)
    const newAssignmentsList = data ?? []
    const notifications = Array.from(selectedStudents).map(sid => {
      const studentProfile = students.find(s => s.id === sid)
      // Find the newly created assignment for this student
      const newAssignment = (newAssignmentsList as any[]).find(
        (a: any) => a.student_id === sid && a.attempt_number === 1
      )
      return {
        studentEmail: studentProfile?.email ?? '',
        studentName: studentProfile?.full_name ?? '',
        worksheetTitle: title,
        dueDate: dueDate || null,
        assignmentId: newAssignment?.id ?? '',
      }
    }).filter(n => n.studentEmail && n.assignmentId)

    if (notifications.length > 0) {
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'assignment', assignments: notifications }),
      }).catch(console.error)
    }

    setAssigning(false)
    setShowAssign(false)
    setSelectedStudents(new Set())
    setDueDate('')
  }

  const questionCount = blocks.filter(b => b.type === 'question').length

  // Derived data for the active explanation panel
  const selAssignment = assignments.find(a => a.id === selectedAssignmentId)
  const selStudent    = students.find(s => s.id === selAssignment?.student_id)
  const activeQBlock  = explanationOpenFor
    ? blocks.find(b => b.type === 'question' && b.question.id === explanationOpenFor)
    : null
  const activeQNum = explanationOpenFor
    ? blocks.filter(b => b.type === 'question').findIndex(b => b.type === 'question' && b.question.id === explanationOpenFor) + 1
    : 0

  return (
    <div className="flex-1 flex overflow-hidden">

      {/* ── LEFT: Explanation panel ─────────────────────────────────────── */}
      {/* overflow-y-auto so the spacer can push the editor to the right vertical
          position, then sticky top-0 keeps the editor visible while scrolling.  */}
      <div
        ref={leftPanelRef}
        className="flex-shrink-0 overflow-y-auto"
        style={{ width: leftW, background: 'var(--background)' }}>

        {(!selectedAssignmentId || !explanationOpenFor) ? (
          /* Placeholder — vertically centred in the panel */
          <div className="flex items-center justify-center p-6 text-center"
            style={{ height: '100vh' }}>
            {!selectedAssignmentId ? (
              <div>
                <svg className="w-8 h-8 mx-auto mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Select a student</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Click "Show on worksheet" in the sidebar, then click 💡 on any question.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Click 💡 on any question</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  The explanation editor will appear here alongside the question.
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Spacer — pushes editor to match the question's Y position */}
            <div style={{ height: editorTopOffset }} />

            {/* Sticky block: indicator strip + editor
                Sticks to top-0 of THIS scroll container once the user has
                scrolled past the spacer, so the editor stays visible.       */}
            <div className="sticky top-0" style={{ zIndex: 10 }}>
              {/* Active question indicator */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b"
                style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                  Q{activeQNum}
                </span>
                {activeQBlock?.type === 'question' && (
                  <span className="text-xs truncate flex-1" style={{ color: 'var(--text-muted)' }}>
                    {activeQBlock.question.skill}
                  </span>
                )}
                <button onClick={() => setExplanationOpenFor(null)}
                  className="w-5 h-5 flex items-center justify-center flex-shrink-0"
                  style={{ color: 'var(--text-muted)' }}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Editor — give it a defined height so its internal scroll works */}
              {selStudent && selAssignment && (
                <div className="flex flex-col" style={{ height: 'calc(100vh - 88px)' }}>
                  <ExplanationEditor
                    questionId={explanationOpenFor}
                    assignmentId={selectedAssignmentId!}
                    studentId={selStudent.id}
                    studentName={selStudent.full_name || selStudent.email || 'student'}
                    worksheetTitle={title}
                    onSent={() => setSentExplanations(prev => new Set([...prev, explanationOpenFor!]))}
                    onClose={() => setExplanationOpenFor(null)}
                  />
                </div>
              )}
            </div>

            {/* Bottom spacer so the panel can scroll far enough */}
            <div style={{ height: '100vh' }} />
          </>
        )}
      </div>

      {/* ── Drag handle: left ↔ center ──────────────────────────────────── */}
      <div
        onMouseDown={e => {
          resizingCol.current  = 'left'
          resizeStartX.current = e.clientX
          resizeStartW.current = leftWRef.current
          document.body.style.cursor     = 'col-resize'
          document.body.style.userSelect = 'none'
          e.preventDefault()
        }}
        className="w-1.5 flex-shrink-0 hover:bg-blue-400 transition-colors cursor-col-resize"
        style={{ background: 'var(--border)' }}
        title="Drag to resize"
      />

      {/* ── CENTER: Worksheet document ──────────────────────────────────── */}
      <div ref={worksheetScrollRef} className="flex-1 overflow-y-auto">
        {/* Sticky toolbar */}
        <div className="sticky top-0 z-10 border-b flex flex-col"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

          {/* Row 1: breadcrumb + actions */}
          <div className="px-6 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <Link href="/worksheets" className="hover:underline">Worksheets</Link>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="truncate max-w-48" style={{ color: 'var(--foreground)' }}>{title || 'Untitled'}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{questionCount} question{questionCount !== 1 ? 's' : ''}</span>
              {saved && <span className="text-xs" style={{ color: '#16a34a' }}>Saved ✓</span>}
              <button onClick={save} disabled={saving}
                className="px-3 py-1.5 rounded-lg text-sm border disabled:opacity-50"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setShowAssign(true)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-white flex items-center gap-1.5"
                style={{ background: 'var(--accent)' }}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Assign
              </button>
            </div>
          </div>

          {/* Row 2: Filter bar — only when a student overlay is active */}
          {selectedAssignmentId && (
            <div className="px-4 pb-2.5 pt-1 flex items-center gap-2 flex-wrap border-t"
              style={{ borderColor: 'var(--border)' }}>

              {/* Correctness filter */}
              <div className="flex items-center gap-1">
                {(['all', 'correct', 'wrong'] as const).map(f => (
                  <button key={f}
                    onClick={() => setFilterCorrectness(f)}
                    className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
                    style={{
                      borderColor: filterCorrectness === f ? 'var(--accent)' : 'var(--border)',
                      color:       filterCorrectness === f ? 'var(--accent)' : 'var(--text-muted)',
                      background:  filterCorrectness === f ? 'var(--accent-light)' : 'transparent',
                      fontWeight:  filterCorrectness === f ? 600 : 400,
                    }}>
                    {f === 'all' ? 'All' : f === 'correct' ? '✓ Correct' : '✗ Wrong'}
                  </button>
                ))}
              </div>

              <div className="w-px h-4 flex-shrink-0" style={{ background: 'var(--border)' }} />

              {/* Difficulty filter */}
              <div className="flex items-center gap-1">
                {(['Easy', 'Medium', 'Hard'] as const).map(d => {
                  const active = filterDifficulties.has(d)
                  return (
                    <button key={d}
                      onClick={() => setFilterDifficulties(prev => {
                        const next = new Set(prev)
                        if (next.has(d)) next.delete(d); else next.add(d)
                        return next
                      })}
                      className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
                      style={{
                        borderColor: active ? diffCol(d) : 'var(--border)',
                        color:       active ? diffCol(d) : 'var(--text-muted)',
                        background:  active ? diffBg(d)  : 'transparent',
                        fontWeight:  active ? 600 : 400,
                      }}>
                      {d}
                    </button>
                  )
                })}
              </div>

              <div className="w-px h-4 flex-shrink-0" style={{ background: 'var(--border)' }} />

              {/* Time filter */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filterTime.enabled}
                    onChange={e => setFilterTime(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="w-3.5 h-3.5"
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>⏱ Time</span>
                </label>
                {filterTime.enabled && (
                  <>
                    <button
                      onClick={() => setFilterTime(prev => ({ ...prev, direction: prev.direction === 'gt' ? 'lt' : 'gt' }))}
                      className="text-xs px-2 py-0.5 rounded border font-mono font-bold flex-shrink-0"
                      style={{ borderColor: 'var(--border)', color: 'var(--accent)', background: 'var(--accent-light)', minWidth: 26 }}>
                      {filterTime.direction === 'gt' ? '>' : '<'}
                    </button>
                    <input
                      type="range"
                      min={5} max={300} step={5}
                      value={filterTime.seconds}
                      onChange={e => setFilterTime(prev => ({ ...prev, seconds: Number(e.target.value) }))}
                      className="w-24"
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    <span className="text-xs font-mono w-10 flex-shrink-0" style={{ color: 'var(--foreground)' }}>
                      {filterTime.seconds}s
                    </span>
                  </>
                )}
              </div>

              {/* Count + reset */}
              {anyFilterActive && (
                <>
                  <div className="w-px h-4 flex-shrink-0" style={{ background: 'var(--border)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {filteredQuestionCount} of {questionCount} shown
                  </span>
                  <button
                    onClick={() => {
                      setFilterCorrectness('all')
                      setFilterDifficulties(new Set())
                      setFilterTime({ enabled: false, direction: 'gt', seconds: 60 })
                    }}
                    className="text-xs px-2 py-0.5 rounded border"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    Reset
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Document */}
        <div className="px-5 py-8 max-w-2xl">
          {/* Editable title */}
          <div
            contentEditable
            suppressContentEditableWarning
            onBlur={e => setTitle(e.currentTarget.textContent?.trim() ?? '')}
            className="text-3xl font-bold outline-none mb-1 empty:before:content-['Untitled_Worksheet'] empty:before:opacity-30"
            style={{ color: 'var(--foreground)', minHeight: '1.2em' }}
          >
            {title}
          </div>
          <p className="text-xs mb-8" style={{ color: 'var(--text-muted)' }}>
            {questionCount} question{questionCount !== 1 ? 's' : ''}
            {assignments.length > 0 && (() => {
              const distinctCount = new Set(assignments.map(a => a.student_id)).size
              return ` · Assigned to ${distinctCount} student${distinctCount !== 1 ? 's' : ''}`
            })()}
          </p>

          {/* Add block at the top */}
          <AddBlockButton onInsert={type => insertBlock('top', type)} />

          {/* Blocks */}
          <div className="space-y-1">
            {blocks.map((block, idx) => {
              const isFirst = idx === 0
              const isLast  = idx === blocks.length - 1
              const qNum    = blocks.slice(0, idx + 1).filter(b => b.type === 'question').length

              // Hide question blocks that don't pass the active overlay filters
              if (block.type === 'question' && !blockPassesFilter(block)) return null

              return (
                <div key={block.localId} className="group relative">
                  {/* ── Section header ────────────────────────────────── */}
                  {block.type === 'section_header' && (
                    <div className="flex items-center gap-3 py-3">
                      <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={e => updateContent(block.localId, e.currentTarget.textContent ?? '')}
                        className="flex-1 text-lg font-semibold outline-none empty:before:content-['Section_title…'] empty:before:opacity-30"
                        style={{ color: 'var(--foreground)' }}
                      >
                        {block.content}
                      </div>
                      <BlockActions localId={block.localId} isFirst={isFirst} isLast={isLast} onMove={moveBlock} onRemove={removeBlock} />
                    </div>
                  )}

                  {/* ── Note / instruction ────────────────────────────── */}
                  {block.type === 'note' && (
                    <div className="flex items-start gap-3 px-4 py-3 rounded-xl my-1" style={{ background: '#fefce8', border: '1px solid #fde68a' }}>
                      <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="#ca8a04">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={e => updateContent(block.localId, e.currentTarget.textContent ?? '')}
                        className="flex-1 text-sm outline-none empty:before:content-['Add_instructions_or_notes…'] empty:before:opacity-40"
                        style={{ color: '#713f12' }}
                      >
                        {block.content}
                      </div>
                      <BlockActions localId={block.localId} isFirst={isFirst} isLast={isLast} onMove={moveBlock} onRemove={removeBlock} />
                    </div>
                  )}

                  {/* ── Question ──────────────────────────────────────── */}
                  {block.type === 'question' && (
                    <div
                      ref={el => {
                        if (el) questionRefs.current.set(block.question.id, el)
                        else    questionRefs.current.delete(block.question.id)
                      }}
                      className="rounded-2xl border overflow-hidden my-2 transition-all"
                      style={{
                        background:  'var(--card)',
                        borderColor: explanationOpenFor === block.question.id ? 'var(--accent)' : 'var(--border)',
                        boxShadow:   explanationOpenFor === block.question.id ? '0 0 0 2px var(--accent)' : 'none',
                      }}>
                      {/* Question header */}
                      <div className="flex items-center gap-3 px-4 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
                        <span className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold"
                          style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                          {qNum}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: block.question.subject === 'english' ? '#fdf4ff' : '#eff6ff', color: block.question.subject === 'english' ? '#7e22ce' : '#1d4ed8' }}>
                          {block.question.subject === 'english' ? 'English' : 'Math'}
                        </span>
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{block.question.domain}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>·</span>
                        <span className="text-xs truncate flex-1" style={{ color: 'var(--text-muted)' }}>{block.question.skill}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: diffBg(block.question.difficulty), color: diffCol(block.question.difficulty) }}>
                          {diffLabel(block.question.difficulty)}
                        </span>
                        <BlockActions localId={block.localId} isFirst={isFirst} isLast={isLast} onMove={moveBlock} onRemove={removeBlock} />
                      </div>

                      {/* Question image */}
                      <div className="px-4 pt-4 pb-2">
                        <Image
                          src={block.question.question_image_url}
                          alt={`Question ${qNum}`}
                          width={700} height={700}
                          className="w-full rounded-lg object-contain"
                          unoptimized
                        />
                      </div>

                      {/* Student answer overlay (when a student is selected in sidebar) */}
                      {selectedAssignmentId && block.type === 'question' && (() => {
                        const sa = selectedAnswersMap[block.question.id]
                        if (!sa) return (
                          <div className="mx-4 mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: '#f8f8f8', color: 'var(--text-muted)' }}>
                            No answer recorded
                          </div>
                        )
                        return (
                          <div className="mx-4 mb-3 rounded-lg overflow-hidden text-xs"
                            style={{ border: `1px solid ${sa.is_correct ? '#bbf7d0' : '#fecaca'}` }}>
                            {/* Answer row */}
                            <div className="px-3 py-2 flex items-center gap-3"
                              style={{ background: sa.is_correct ? '#f0fdf4' : '#fef2f2' }}>
                              <span className="w-5 h-5 rounded-full flex items-center justify-center font-bold flex-shrink-0"
                                style={{ background: sa.is_correct ? '#16a34a' : '#dc2626', color: 'white' }}>
                                {sa.is_correct ? '✓' : '✗'}
                              </span>
                              <span style={{ color: sa.is_correct ? '#16a34a' : '#dc2626' }}>
                                Answered <strong>{sa.selected_answer}</strong>
                                {!sa.is_correct && <> (correct: <strong style={{ color: '#16a34a' }}>{block.question.correct_answer}</strong>)</>}
                              </span>
                              {sa.confidence_level != null && (
                                <span className="ml-auto flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                                  Confidence: <strong style={{ color: 'var(--foreground)' }}>{sa.confidence_level}/5</strong>
                                </span>
                              )}
                              <span style={{ color: 'var(--text-muted)' }}>{sa.time_spent_seconds}s</span>
                            </div>
                            {/* Notes row */}
                            {sa.student_notes && (
                              <div className="px-3 py-2 border-t" style={{ background: '#fefce8', borderColor: '#fde68a' }}>
                                <span className="font-medium" style={{ color: '#92400e' }}>Note: </span>
                                <span style={{ color: '#713f12' }}>{sa.student_notes}</span>
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {/* Answer toggle */}
                      <div className="px-4 pb-3 flex items-center gap-3">
                        <button
                          onClick={() => toggleAnswer(block.localId)}
                          className="text-xs px-3 py-1 rounded-lg border transition-colors"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                          {showAnswers.has(block.localId) ? 'Hide answer' : 'Show answer'}
                        </button>
                        {showAnswers.has(block.localId) && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Correct: <strong style={{ color: 'var(--foreground)' }}>{block.question.correct_answer}</strong>
                          </span>
                        )}
                      </div>

                      {/* Answer image */}
                      {showAnswers.has(block.localId) && block.question.answer_image_url && (
                        <div className="px-4 pb-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Answer</p>
                          <Image
                            src={block.question.answer_image_url}
                            alt={`Answer ${qNum}`}
                            width={700} height={350}
                            className="w-full rounded-lg object-contain"
                            style={{ maxHeight: 400 }}
                            unoptimized
                          />
                        </div>
                      )}

                      {/* Explain button — opens left panel */}
                      {selectedAssignmentId && (() => {
                        const isActive = explanationOpenFor === block.question.id
                        const hasSent  = sentExplanations.has(block.question.id)
                        return (
                          <div className="px-4 pb-3 border-t pt-3 flex items-center gap-2"
                            style={{ borderColor: 'var(--border)' }}>
                            <button
                              onClick={() => setExplanationOpenFor(isActive ? null : block.question.id)}
                              className="text-xs px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors"
                              style={{
                                borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                                color:       isActive ? 'var(--accent)' : 'var(--text-muted)',
                                background:  isActive ? 'var(--accent-light)' : 'transparent',
                              }}>
                              💡 {isActive ? 'Editing ←' : hasSent ? 'Edit explanation' : 'Add explanation'}
                            </button>
                            {hasSent && !isActive && (
                              <span className="text-xs px-2 py-0.5 rounded-full"
                                style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                Sent ✓
                              </span>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {/* Add block below */}
                  <AddBlockButton onInsert={type => insertBlock(block.localId, type)} />
                </div>
              )
            })}
          </div>

          {blocks.length === 0 && (
            <div className="text-center py-16 rounded-2xl border-2 border-dashed"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <p className="text-sm">This worksheet is empty.</p>
              <p className="text-xs mt-1">Go to the Question Bank to add questions.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Drag handle: center ↔ right (hidden when collapsed) ────────── */}
      {!rightCollapsed && (
        <div
          onMouseDown={e => {
            resizingCol.current  = 'right'
            resizeStartX.current = e.clientX
            resizeStartW.current = rightWRef.current
            document.body.style.cursor     = 'col-resize'
            document.body.style.userSelect = 'none'
            e.preventDefault()
          }}
          className="w-1.5 flex-shrink-0 hover:bg-blue-400 transition-colors cursor-col-resize"
          style={{ background: 'var(--border)' }}
          title="Drag to resize"
        />
      )}

      {/* ── RIGHT: Assignments sidebar ──────────────────────────────────── */}
      {rightCollapsed ? (
        /* Collapsed strip — click to expand */
        <div
          className="flex-shrink-0 flex flex-col items-center justify-start pt-3 border-l cursor-pointer select-none"
          style={{ width: 32, background: 'var(--card)', borderColor: 'var(--border)' }}
          onClick={() => setRightCollapsed(false)}
          title="Expand Assigned To">
          <div className="text-xs font-semibold mt-2"
            style={{ writingMode: 'vertical-rl', color: 'var(--text-muted)', transform: 'rotate(180deg)', letterSpacing: '0.05em' }}>
            Assigned to ▸
          </div>
        </div>
      ) : (
      <aside
        ref={rightPanelRef}
        className="flex-shrink-0 overflow-y-auto p-4"
        style={{ width: rightW, background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Assigned to
          </h2>
          <button
            onClick={() => setRightCollapsed(true)}
            title="Collapse sidebar"
            className="w-5 h-5 flex items-center justify-center rounded hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {selectedAssignmentId && (
          <button
            onClick={() => setSelectedAssignmentId(null)}
            className="w-full text-left text-xs mb-3 px-2 py-1.5 rounded-lg border flex items-center gap-1.5"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-light)' }}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear overlay
          </button>
        )}

        {assignments.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Not assigned yet.</p>
        ) : (
          <div className="space-y-2">
            {assignments.map(a => {
              const p = a.profiles as { id: string; full_name: string | null; email: string | null } | null
              const isExpanded = expandedAssignment === a.id
              const isSelected = selectedAssignmentId === a.id
              const aAnswers = studentAnswers.filter(sa => sa.assignment_id === a.id)
              const correctCount = aAnswers.filter(sa => sa.is_correct).length
              const totalAnswered = aAnswers.length
              const totalTime = aAnswers.reduce((sum, sa) => sum + sa.time_spent_seconds, 0)
              const questionBlocks = blocks.filter(b => b.type === 'question')
              const totalQuestions = questionBlocks.length

              return (
                <div key={a.id} className="rounded-lg border overflow-hidden"
                  style={{
                    borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                    background: isSelected ? 'var(--accent-light)' : 'var(--background)',
                    boxShadow: isSelected ? '0 0 0 1px var(--accent)' : 'none',
                  }}>
                  <div className="p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--foreground)' }}>
                        {p?.full_name || p?.email || 'Unknown'}
                        {(a.attempt_number ?? 1) > 1 && (
                          <span className="ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>
                            #{a.attempt_number}
                          </span>
                        )}
                      </p>
                      {a.status === 'complete' && totalQuestions > 0 && (
                        <span className="text-xs font-bold" style={{ color: correctCount / totalQuestions >= 0.7 ? '#16a34a' : correctCount / totalQuestions >= 0.5 ? '#d97706' : '#dc2626' }}>
                          {Math.round((correctCount / totalQuestions) * 100)}%
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {a.status === 'complete' ? `${correctCount}/${totalQuestions} correct` : 'Pending'}
                      {a.status === 'complete' && totalTime > 0 && ` · ${Math.floor(totalTime / 60)}m ${totalTime % 60}s`}
                    </p>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 mt-2">
                      {a.status === 'complete' && totalAnswered > 0 && (
                        <button
                          onClick={() => setSelectedAssignmentId(isSelected ? null : a.id)}
                          className="text-xs px-2 py-1 rounded border font-medium"
                          style={{
                            borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                            color: isSelected ? 'var(--accent)' : 'var(--foreground)',
                            background: isSelected ? 'white' : 'transparent',
                          }}>
                          {isSelected ? 'Hide' : 'Show'} on worksheet
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedAssignment(isExpanded ? null : a.id)}
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                        {isExpanded ? 'Less' : 'Details'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded: per-question results */}
                  {isExpanded && a.status === 'complete' && totalAnswered > 0 && (
                    <div className="border-t px-2.5 py-2 space-y-2" style={{ borderColor: 'var(--border)' }}>
                      {questionBlocks.map((block, qIdx) => {
                        if (block.type !== 'question') return null
                        const ans = aAnswers.find(sa => sa.question_id === block.question.id)
                        return (
                          <div key={block.localId} className="text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                                style={{
                                  background: ans?.is_correct ? '#f0fdf4' : ans ? '#fef2f2' : 'var(--border)',
                                  color: ans?.is_correct ? '#16a34a' : ans ? '#dc2626' : 'var(--text-muted)',
                                }}>
                                {ans?.is_correct ? '✓' : ans ? '✗' : '–'}
                              </span>
                              <span style={{ color: 'var(--text-muted)' }}>Q{qIdx + 1}</span>
                              {ans && (
                                <>
                                  <span style={{ color: 'var(--foreground)' }}>{ans.selected_answer}</span>
                                  {!ans.is_correct && (
                                    <span style={{ color: '#16a34a' }}>({block.question.correct_answer})</span>
                                  )}
                                  {ans.confidence_level != null && (
                                    <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>
                                      {ans.confidence_level}/5 · {ans.time_spent_seconds}s
                                    </span>
                                  )}
                                  {ans.confidence_level == null && (
                                    <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>{ans.time_spent_seconds}s</span>
                                  )}
                                </>
                              )}
                            </div>
                            {ans?.student_notes && (
                              <div className="mt-1 ml-6 px-2 py-1 rounded text-xs italic"
                                style={{ background: '#fefce8', color: '#713f12' }}>
                                "{ans.student_notes}"
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {isExpanded && a.status !== 'complete' && (
                    <div className="border-t px-2.5 py-2" style={{ borderColor: 'var(--border)' }}>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Not yet submitted.</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={() => setShowAssign(true)}
          className="mt-4 w-full py-2 rounded-lg text-xs font-medium text-white"
          style={{ background: 'var(--accent)' }}>
          + Assign to student
        </button>
      </aside>
      )} {/* end rightCollapsed else */}

      {/* ── Assign modal ───────────────────────────────────────────────────── */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Assign to Students</h2>
              <button onClick={() => setShowAssign(false)} style={{ color: 'var(--text-muted)' }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {students.length === 0 ? (
              <div className="text-center py-5 rounded-xl border-2 border-dashed mb-4"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                <p className="text-sm font-medium">No students yet</p>
                <p className="text-xs mt-1">Students appear here once they sign up and are assigned the student role.</p>
              </div>
            ) : (
              <div className="space-y-1 mb-4 max-h-48 overflow-y-auto">
                {students.map(s => {
                  const checked = selectedStudents.has(s.id)
                  return (
                    <label key={s.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer"
                      style={{ background: checked ? 'var(--accent-light)' : 'transparent' }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => setSelectedStudents(prev => {
                          const next = new Set(prev)
                          if (next.has(s.id)) { next.delete(s.id) } else { next.add(s.id) }
                          return next
                        })}
                        className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent)' }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{s.full_name || s.email}</p>
                        {s.full_name && s.email && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{s.email}</p>}
                      </div>
                    </label>
                  )
                })}
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Due date (optional)</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} />
            </div>

            <button onClick={handleAssign} disabled={assigning || selectedStudents.size === 0}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}>
              {assigning ? 'Assigning…' : `Assign to ${selectedStudents.size || 0} student${selectedStudents.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      <DesmosCalculator />
    </div>
  )
}

// ── Add block button (shows on hover between blocks) ─────────────────────────
function AddBlockButton({ onInsert }: { onInsert: (type: 'section_header' | 'note') => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex items-center justify-center my-0.5 h-5 group/add">
      <div className="absolute inset-x-0 h-px opacity-0 group-hover/add:opacity-100 transition-opacity"
        style={{ background: 'var(--border)' }} />
      <button
        onClick={() => setOpen(o => !o)}
        className="relative z-10 w-5 h-5 rounded-full border flex items-center justify-center opacity-0 group-hover/add:opacity-100 transition-opacity text-xs"
        style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        +
      </button>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-20 rounded-xl border shadow-lg overflow-hidden w-44"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <button onMouseDown={() => { onInsert('section_header'); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:opacity-80"
            style={{ color: 'var(--foreground)' }}>
            <span className="w-4 h-4 rounded flex items-center justify-center text-white text-xs flex-shrink-0" style={{ background: 'var(--accent)' }}>H</span>
            Section header
          </button>
          <button onMouseDown={() => { onInsert('note'); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:opacity-80 border-t"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
            <span className="w-4 h-4 rounded flex items-center justify-center text-xs flex-shrink-0" style={{ background: '#fef9c3', color: '#ca8a04' }}>✎</span>
            Note / instructions
          </button>
        </div>
      )}
    </div>
  )
}

// ── Block action buttons (up, down, delete) ──────────────────────────────────
function BlockActions({
  localId, isFirst, isLast, onMove, onRemove
}: {
  localId: string; isFirst: boolean; isLast: boolean
  onMove: (id: string, dir: -1 | 1) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
      <button onClick={() => onMove(localId, -1)} disabled={isFirst}
        className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-20"
        style={{ color: 'var(--text-muted)' }} title="Move up">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>
      <button onClick={() => onMove(localId, 1)} disabled={isLast}
        className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-20"
        style={{ color: 'var(--text-muted)' }} title="Move down">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <button onClick={() => onRemove(localId)}
        className="w-6 h-6 rounded flex items-center justify-center"
        style={{ color: '#ef4444' }} title="Remove">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  )
}
