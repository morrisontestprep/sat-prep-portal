'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

type Question = { id: string; subject: string; domain: string; skill: string; difficulty: string }
type Student = { id: string; full_name: string | null; email: string | null }

type Block =
  | { type: 'question'; id: string; question: Question }
  | { type: 'section_header'; id: string; content: string }
  | { type: 'note'; id: string; content: string }

function makeId() { return Math.random().toString(36).slice(2) }

function diffBg(d: string)  { return d === 'Easy' ? '#f0fdf4' : d === 'Medium' ? '#fffbeb' : d === 'Hard' ? '#fef2f2' : '#f3f4f6' }
function diffCol(d: string) { return d === 'Easy' ? '#16a34a' : d === 'Medium' ? '#d97706' : d === 'Hard' ? '#dc2626' : '#6b7280' }

function QuestionBlock({ q }: { q: Question }) {
  const isEnglish = q.subject === 'english'
  return (
    <div className="flex items-center gap-3 py-1 min-w-0">
      <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{
        background: isEnglish ? '#fdf4ff' : '#eff6ff',
        color: isEnglish ? '#7e22ce' : '#1d4ed8',
      }}>
        {isEnglish ? 'English' : 'Math'}
      </span>
      <span className="text-xs text-gray-500 flex-shrink-0">{q.domain}</span>
      <span className="text-xs text-gray-400 flex-shrink-0">·</span>
      <span className="text-xs text-gray-500 truncate">{q.skill}</span>
      <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-auto" style={{
        background: diffBg(q.difficulty),
        color: diffCol(q.difficulty),
      }}>
        {q.difficulty || 'Unrated'}
      </span>
    </div>
  )
}

export default function WorksheetEditor({
  initialQuestions,
  students,
}: {
  initialQuestions: Question[]
  students: Student[]
}) {
  const router = useRouter()
  const supabase = createClient()

  const [title, setTitle] = useState('')
  const [blocks, setBlocks] = useState<Block[]>(
    initialQuestions.map(q => ({ type: 'question', id: makeId(), question: q }))
  )
  const [saving, setSaving] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  // Assign modal state
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set())
  const [dueDate, setDueDate] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignDone, setAssignDone] = useState(false)

  // Block manipulation
  const moveBlock = (idx: number, dir: -1 | 1) => {
    const next = [...blocks]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setBlocks(next)
  }

  const removeBlock = (idx: number) => setBlocks(b => b.filter((_, i) => i !== idx))

  const updateContent = (idx: number, content: string) => {
    setBlocks(b => b.map((block, i) => i === idx ? { ...block, content } : block))
  }

  const insertAfter = (idx: number, type: 'section_header' | 'note') => {
    const newBlock: Block = { type, id: makeId(), content: '' }
    setBlocks(b => [...b.slice(0, idx + 1), newBlock, ...b.slice(idx + 1)])
  }

  const addAtEnd = (type: 'section_header' | 'note') => {
    setBlocks(b => [...b, { type, id: makeId(), content: '' }])
  }

  // Save worksheet — inserts on first save, updates on subsequent saves
  const save = async (): Promise<string | null> => {
    setSaving(true)
    const worksheetTitle = title.trim() || 'Untitled Worksheet'

    let wsId = savedId

    if (!wsId) {
      // First save: create the worksheet
      const { data: ws, error: wsErr } = await supabase
        .from('worksheets')
        .insert({ title: worksheetTitle })
        .select('id')
        .single()

      if (wsErr || !ws) { setSaving(false); alert('Failed to save worksheet'); return null }
      wsId = ws.id
      setSavedId(wsId)
    } else {
      // Subsequent save: update title and delete+reinsert items
      const { error: titleErr } = await supabase
        .from('worksheets')
        .update({ title: worksheetTitle, updated_at: new Date().toISOString() })
        .eq('id', wsId)

      if (titleErr) { setSaving(false); alert('Failed to save worksheet'); return null }

      const { error: deleteErr } = await supabase
        .from('worksheet_items')
        .delete()
        .eq('worksheet_id', wsId)

      if (deleteErr) { setSaving(false); alert('Failed to save worksheet'); return null }
    }

    const items = blocks.map((block, i) => ({
      worksheet_id: wsId,
      position: i,
      type: block.type,
      question_id: block.type === 'question' ? block.question.id : null,
      content: block.type !== 'question' ? block.content : null,
    }))

    if (items.length > 0) {
      const { error: itemErr } = await supabase.from('worksheet_items').insert(items)
      if (itemErr) { setSaving(false); alert('Failed to save items'); return null }
    }

    setSaving(false)
    return wsId
  }

  const handleSave = async () => {
    const id = await save()
    if (id) router.push(`/worksheets/${id}`)
  }

  const handleSaveAndAssign = async () => {
    // Always save so any recent edits are persisted before assigning
    const id = await save()
    if (!id) return
    setShowAssign(true)
  }

  const handleAssign = async () => {
    let wsId = savedId
    if (!wsId) wsId = await save()
    if (!wsId) return

    setAssigning(true)
    const rows = Array.from(selectedStudents).map(studentId => ({
      worksheet_id: wsId,
      student_id: studentId,
      due_date: dueDate || null,
    }))
    const { error: assignErr } = await supabase.from('student_assignments').insert(rows)
    setAssigning(false)
    if (assignErr) {
      alert('Failed to assign worksheet. Please try again.')
      return
    }
    setAssignDone(true)
    setTimeout(() => router.push('/worksheets'), 1500)
  }

  const questionCount = blocks.filter(b => b.type === 'question').length

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--background)' }}>
      {/* Top toolbar */}
      <div className="border-b px-6 py-3 flex items-center justify-between gap-4 flex-shrink-0"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button onClick={() => router.back()}
            className="text-sm flex items-center gap-1 flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Worksheet title…"
            className="flex-1 text-lg font-semibold bg-transparent outline-none min-w-0"
            style={{ color: 'var(--foreground)' }}
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {questionCount} question{questionCount !== 1 ? 's' : ''}
          </span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm border disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={handleSaveAndAssign}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 flex items-center gap-1.5"
            style={{ background: 'var(--accent)' }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Save &amp; Assign
          </button>
        </div>
      </div>

      {/* Editor body */}
      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto w-full">
        {/* Add controls above the list */}
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => addAtEnd('section_header')}
            className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add section header
          </button>
          <button onClick={() => addAtEnd('note')}
            className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add note
          </button>
        </div>

        {/* Block list */}
        {blocks.length === 0 && (
          <div className="text-center py-16 rounded-xl border-2 border-dashed"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            <p className="text-sm">No questions yet.</p>
            <p className="text-xs mt-1">Go to the Question Bank to select questions.</p>
          </div>
        )}

        <div className="space-y-2">
          {blocks.map((block, idx) => (
            <div key={block.id} className="group relative">
              {/* Section header block */}
              {block.type === 'section_header' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
                  <input
                    value={block.content}
                    onChange={e => updateContent(idx, e.target.value)}
                    placeholder="Section title…"
                    className="flex-1 text-sm font-semibold bg-transparent outline-none"
                    style={{ color: 'var(--foreground)' }}
                  />
                  <BlockControls idx={idx} total={blocks.length} onMove={moveBlock} onRemove={removeBlock} onInsert={insertAfter} />
                </div>
              )}

              {/* Note block */}
              {block.type === 'note' && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl border"
                  style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
                  <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="#d97706">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <textarea
                    value={block.content}
                    onChange={e => updateContent(idx, e.target.value)}
                    placeholder="Add instructions or notes…"
                    rows={2}
                    className="flex-1 text-xs bg-transparent outline-none resize-none"
                    style={{ color: '#92400e' }}
                  />
                  <BlockControls idx={idx} total={blocks.length} onMove={moveBlock} onRemove={removeBlock} onInsert={insertAfter} />
                </div>
              )}

              {/* Question block */}
              {block.type === 'question' && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  {/* Position number */}
                  <span className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-medium"
                    style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                    {blocks.slice(0, idx).filter(b => b.type === 'question').length + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <QuestionBlock q={block.question} />
                  </div>
                  <BlockControls idx={idx} total={blocks.length} onMove={moveBlock} onRemove={removeBlock} onInsert={insertAfter} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Assign modal */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-md p-6"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            {assignDone ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                  style={{ background: '#f0fdf4' }}>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#16a34a">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="font-semibold" style={{ color: 'var(--foreground)' }}>Assigned!</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Redirecting to worksheets…</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Assign to Students</h2>
                  <button onClick={() => setShowAssign(false)} style={{ color: 'var(--text-muted)' }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {students.length === 0 ? (
                  <div className="text-center py-6 rounded-xl border-2 border-dashed mb-4"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    <p className="text-sm font-medium">No students yet</p>
                    <p className="text-xs mt-1">Students will appear here once they sign up and you mark them as a student in the database.</p>
                  </div>
                ) : (
                  <div className="space-y-1 mb-4 max-h-52 overflow-y-auto">
                    {students.map(s => {
                      const checked = selectedStudents.has(s.id)
                      return (
                        <label key={s.id}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                          style={{ background: checked ? 'var(--accent-light)' : 'transparent' }}>
                          <input type="checkbox" checked={checked}
                            onChange={() => setSelectedStudents(prev => {
                              const next = new Set(prev)
                              if (next.has(s.id)) next.delete(s.id)
                              else next.add(s.id)
                              return next
                            })}
                            className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent)' }}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                              {s.full_name || s.email}
                            </p>
                            {s.full_name && s.email && (
                              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{s.email}</p>
                            )}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}

                <div className="mb-4">
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
                    Due date (optional)
                  </label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                  />
                </div>

                <button
                  onClick={handleAssign}
                  disabled={assigning || selectedStudents.size === 0}
                  className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}>
                  {assigning ? 'Assigning…' : `Assign to ${selectedStudents.size} student${selectedStudents.size !== 1 ? 's' : ''}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Reusable block controls (move up/down, remove, insert below)
function BlockControls({
  idx, total, onMove, onRemove, onInsert
}: {
  idx: number
  total: number
  onMove: (idx: number, dir: -1 | 1) => void
  onRemove: (idx: number) => void
  onInsert: (idx: number, type: 'section_header' | 'note') => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
      <button onClick={() => onMove(idx, -1)} disabled={idx === 0}
        className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-30"
        style={{ color: 'var(--text-muted)' }} title="Move up">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>
      <button onClick={() => onMove(idx, 1)} disabled={idx === total - 1}
        className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-30"
        style={{ color: 'var(--text-muted)' }} title="Move down">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className="relative">
        <button onClick={() => setMenuOpen(o => !o)}
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{ color: 'var(--text-muted)' }} title="Insert below">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m7-7H5" />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-20 rounded-lg border shadow-md overflow-hidden w-40"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <button onMouseDown={() => { onInsert(idx, 'section_header'); setMenuOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs hover:opacity-80"
              style={{ color: 'var(--foreground)' }}>
              Insert section header
            </button>
            <button onMouseDown={() => { onInsert(idx, 'note'); setMenuOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs hover:opacity-80 border-t"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              Insert note
            </button>
          </div>
        )}
      </div>
      <button onClick={() => onRemove(idx)}
        className="w-6 h-6 rounded flex items-center justify-center"
        style={{ color: '#ef4444' }} title="Remove">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
