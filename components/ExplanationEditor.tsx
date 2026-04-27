'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import StepCanvas, { type StepCanvasRef } from './StepCanvas'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Step {
  id:          string
  text:        string
  canvasOpen:  boolean   // collapsed by default
  canvasData?: string
}

interface SavedExplanation {
  id:            string
  assignment_id: string | null
  steps:         Array<{ text: string; canvasData?: string }>
  sent_at:       string | null
  created_at:    string
  profiles:      { full_name: string | null; email: string | null } | null
}

interface Props {
  questionId:     string
  assignmentId:   string
  studentId:      string
  studentName:    string
  worksheetTitle: string
  onSent?:  () => void
  onClose?: () => void
}

function makeId() { return Math.random().toString(36).slice(2) }
function makeStep(canvasOpen = false): Step {
  return { id: makeId(), text: '', canvasOpen }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExplanationEditor({
  questionId,
  assignmentId,
  studentId,
  studentName,
  worksheetTitle,
  onSent,
  onClose,
}: Props) {
  const [steps, setSteps] = useState<Step[]>([makeStep()])
  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savedExplanations, setSavedExplanations] = useState<SavedExplanation[]>([])
  const [showReusePicker, setShowReusePicker] = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [alreadySent, setAlreadySent] = useState(false)
  const [currentExplanationId, setCurrentExplanationId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showClearConfirm,  setShowClearConfirm]  = useState(false)

  const canvasRefs = useRef<Map<string, StepCanvasRef>>(new Map())

  const setCanvasRef = useCallback((id: string, r: StepCanvasRef | null) => {
    if (r) canvasRefs.current.set(id, r)
    else   canvasRefs.current.delete(id)
  }, [])

  // ── Load existing explanations ────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/explanations?questionId=${encodeURIComponent(questionId)}`)
      .then(r => r.json())
      .then(({ explanations }) => {
        if (!Array.isArray(explanations)) return
        setSavedExplanations(explanations)
        // Find the explanation for this specific assignment
        const existing = explanations.find(
          (e: SavedExplanation) => e.assignment_id === assignmentId && e.sent_at
        )
        if (existing) {
          setAlreadySent(true)
          setCurrentExplanationId(existing.id)
          setSteps(
            (existing.steps || []).map((s: { text: string; canvasData?: string }) => ({
              id:          makeId(),
              text:        s.text || '',
              canvasOpen:  false,
              canvasData:  s.canvasData,
            })) || [makeStep()]
          )
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [questionId, assignmentId])

  // ── Step management ────────────────────────────────────────────────────────
  const addStep    = () => setSteps(prev => [...prev, makeStep()])
  const removeStep = (id: string) => {
    canvasRefs.current.delete(id)
    setSteps(prev => prev.filter(s => s.id !== id))
  }
  const updateText = (id: string, text: string) =>
    setSteps(prev => prev.map(s => s.id === id ? { ...s, text } : s))
  const toggleCanvas = (id: string) =>
    setSteps(prev => prev.map(s => {
      if (s.id !== id) return s
      if (s.canvasOpen) {
        // Closing — snapshot current canvas data so it survives unmount
        const dataUrl = canvasRefs.current.get(id)?.getDataUrl() ?? undefined
        return { ...s, canvasOpen: false, canvasData: dataUrl ?? s.canvasData }
      }
      return { ...s, canvasOpen: true }
    }))

  // ── Reuse ─────────────────────────────────────────────────────────────────
  const loadExplanation = (exp: SavedExplanation) => {
    canvasRefs.current.clear()
    setSteps((exp.steps || []).map(s => ({
      id:         makeId(),
      text:       s.text || '',
      canvasOpen: false,
      canvasData: s.canvasData,
    })))
    setShowReusePicker(false)
  }

  // ── Send / Update ─────────────────────────────────────────────────────────
  const handleSend = async () => {
    setSending(true)
    const stepsData = steps.map(step => ({
      text:       step.text,
      // If canvas is open use live data; if closed use snapshot saved when it was closed
      canvasData: canvasRefs.current.get(step.id)?.getDataUrl() ?? step.canvasData ?? null,
    }))
    const nonEmpty = stepsData.filter(s => s.text.trim() || s.canvasData)
    if (nonEmpty.length === 0) {
      alert('Please add at least one step with text or a drawing.')
      setSending(false)
      return
    }
    try {
      const res = await fetch('/api/explanations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, assignmentId, studentId, steps: nonEmpty, worksheetTitle }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to send')
      const { explanationId } = await res.json()
      setCurrentExplanationId(explanationId)
      setSent(true)
      setAlreadySent(true)
      onSent?.()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to send explanation.')
    } finally {
      setSending(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!currentExplanationId) return
    setDeleting(true)
    try {
      const res = await fetch('/api/explanations', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ explanationId: currentExplanationId }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete')
      setSteps([makeStep()])
      setSent(false)
      setAlreadySent(false)
      setCurrentExplanationId(null)
      setShowDeleteConfirm(false)
      canvasRefs.current.clear()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete explanation.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <div className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</div>
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
            Explanation for {studentName}
          </span>
          {alreadySent && !sent && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: '#f0fdf4', color: '#16a34a' }}>
              Sent ✓
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {savedExplanations.length > 0 && (
            <button onClick={() => setShowReusePicker(v => !v)}
              className="text-xs px-2 py-1 rounded-lg border"
              style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>
              {showReusePicker ? 'Cancel' : `Reuse (${savedExplanations.length})`}
            </button>
          )}
          <button onClick={() => setShowClearConfirm(true)}
            className="text-xs px-2 py-1 rounded-lg border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            Clear
          </button>
          {alreadySent && currentExplanationId && (
            <button onClick={() => setShowDeleteConfirm(true)}
              className="text-xs px-2 py-1 rounded-lg border"
              style={{ borderColor: '#fca5a5', color: '#dc2626', background: '#fef2f2' }}>
              Delete
            </button>
          )}
          {onClose && (
            <button onClick={onClose}
              className="w-5 h-5 flex items-center justify-center"
              style={{ color: 'var(--text-muted)' }}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Reuse picker */}
      {showReusePicker && (
        <div className="px-4 py-3 border-b space-y-2 flex-shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Previously saved for this question
          </p>
          {savedExplanations.map(exp => (
            <div key={exp.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                  {exp.steps?.length ?? 0} step{exp.steps?.length !== 1 ? 's' : ''}
                  {exp.sent_at && (
                    <span className="ml-2 font-normal" style={{ color: 'var(--text-muted)' }}>
                      · sent {new Date(exp.sent_at).toLocaleDateString()}
                    </span>
                  )}
                </p>
                {exp.profiles && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {exp.profiles.full_name || exp.profiles.email}
                  </p>
                )}
              </div>
              <button onClick={() => loadExplanation(exp)}
                className="text-xs px-2.5 py-1 rounded-lg font-medium text-white flex-shrink-0"
                style={{ background: 'var(--accent)' }}>
                Load
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Steps — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {steps.map((step, idx) => (
          <div key={step.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md"
                style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                Step {idx + 1}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleCanvas(step.id)}
                  className="text-xs px-2 py-0.5 rounded border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  {step.canvasOpen ? 'Hide drawing' : '📐 Add drawing'}
                </button>
                {steps.length > 1 && (
                  <button onClick={() => removeStep(step.id)}
                    className="text-xs" style={{ color: '#ef4444' }}>
                    Remove
                  </button>
                )}
              </div>
            </div>

            <textarea
              value={step.text}
              onChange={e => updateText(step.id, e.target.value)}
              placeholder={`Explain step ${idx + 1}…`}
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border text-sm resize-none outline-none"
              style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
            />

            {step.canvasOpen && (
              <StepCanvas
                ref={r => setCanvasRef(step.id, r)}
                initialData={step.canvasData}
              />
            )}
          </div>
        ))}

        <button onClick={addStep}
          className="w-full py-2 rounded-xl border text-sm border-dashed"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          + Add Step
        </button>

        {/* Send actions */}
        <div className="flex items-center gap-3 pt-1 pb-2">
          {sent ? (
            <span className="text-sm font-medium" style={{ color: '#16a34a' }}>
              ✓ Sent to {studentName}
            </span>
          ) : (
            <button onClick={handleSend} disabled={sending}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-60"
              style={{ background: 'var(--accent)' }}>
              {sending ? 'Sending…' : alreadySent ? 'Update & resend' : `Send to ${studentName}`}
            </button>
          )}
          {sent && (
            <button onClick={handleSend} disabled={sending}
              className="px-3 py-2.5 rounded-xl text-sm border"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              {sending ? 'Updating…' : 'Update & resend'}
            </button>
          )}
        </div>
      </div>

      {/* Clear confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6"
            style={{ background: 'var(--card)' }}>
            <h2 className="font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
              Clear and start over?
            </h2>
            <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
              This clears your current work in the editor. Any previously sent explanation will remain
              unless you also press Delete.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                Cancel
              </button>
              <button
                onClick={() => {
                  canvasRefs.current.clear()
                  setSteps([makeStep()])
                  setSent(false)
                  setShowClearConfirm(false)
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ background: 'var(--accent)' }}>
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6"
            style={{ background: 'var(--card)' }}>
            <h2 className="font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
              Delete explanation?
            </h2>
            <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
              This will remove the explanation sent to {studentName}. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border disabled:opacity-50"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ background: '#ef4444' }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
