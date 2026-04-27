'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import StepCanvas, { type StepCanvasRef } from './StepCanvas'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Step {
  id:          string
  text:        string
  canvasData?: string  // saved data URL, used for initial load only
}

interface SavedExplanation {
  id:         string
  steps:      Array<{ text: string; canvasData?: string }>
  sent_at:    string | null
  created_at: string
  profiles:   { full_name: string | null; email: string | null } | null
}

interface Props {
  questionId:     string
  assignmentId:   string
  studentId:      string
  studentName:    string
  worksheetTitle: string
  /** Called after a successful send */
  onSent?: () => void
  /** Called to close the editor */
  onClose?: () => void
}

function makeId() { return Math.random().toString(36).slice(2) }

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
  const [steps, setSteps] = useState<Step[]>([{ id: makeId(), text: '' }])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [savedExplanations, setSavedExplanations] = useState<SavedExplanation[]>([])
  const [showReusePicker, setShowReusePicker] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(true)
  const [alreadySent, setAlreadySent] = useState(false)

  // Map from step id → canvas ref
  const canvasRefs = useRef<Map<string, StepCanvasRef>>(new Map())

  const setCanvasRef = useCallback((id: string, ref: StepCanvasRef | null) => {
    if (ref) canvasRefs.current.set(id, ref)
    else     canvasRefs.current.delete(id)
  }, [])

  // ── Load existing explanations for this question (for reuse) ──────────────
  useEffect(() => {
    fetch(`/api/explanations?questionId=${encodeURIComponent(questionId)}`)
      .then(r => r.json())
      .then(({ explanations }) => {
        if (!Array.isArray(explanations)) return
        setSavedExplanations(explanations)

        // Check if there's already a sent explanation for this specific assignment
        const existing = explanations.find((e: SavedExplanation) => e.sent_at)
        if (existing) {
          setAlreadySent(true)
          // Pre-load steps from the most recent sent explanation
          setSteps((existing.steps as Step[]).map((s: Step) => ({
            id:         makeId(),
            text:       s.text || '',
            canvasData: s.canvasData,
          })) || [{ id: makeId(), text: '' }])
        }
      })
      .catch(console.error)
      .finally(() => setLoadingExisting(false))
  }, [questionId])

  // ── Step management ────────────────────────────────────────────────────────

  const addStep = () => setSteps(prev => [...prev, { id: makeId(), text: '' }])

  const removeStep = (id: string) => {
    canvasRefs.current.delete(id)
    setSteps(prev => prev.filter(s => s.id !== id))
  }

  const updateText = (id: string, text: string) =>
    setSteps(prev => prev.map(s => s.id === id ? { ...s, text } : s))

  // ── Load a saved explanation ───────────────────────────────────────────────

  const loadExplanation = (explanation: SavedExplanation) => {
    canvasRefs.current.clear()
    setSteps((explanation.steps || []).map(s => ({
      id:         makeId(),
      text:       s.text || '',
      canvasData: s.canvasData,
    })))
    setShowReusePicker(false)
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    setSending(true)

    // Collect steps with canvas data URLs
    const stepsData = steps.map(step => ({
      text:        step.text,
      canvasData:  canvasRefs.current.get(step.id)?.getDataUrl() ?? null,
    }))

    // Skip entirely empty steps
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
        body:    JSON.stringify({
          questionId,
          assignmentId,
          studentId,
          steps:          nonEmpty,
          worksheetTitle,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to send')
      }
      setSent(true)
      setAlreadySent(true)
      onSent?.()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to send explanation.')
    } finally {
      setSending(false)
    }
  }

  if (loadingExisting) {
    return (
      <div className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        Loading…
      </div>
    )
  }

  return (
    <div className="border-t" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
            Instructor Explanation
          </span>
          {alreadySent && !sent && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: '#f0fdf4', color: '#16a34a' }}>
              Previously sent
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {savedExplanations.length > 0 && (
            <button
              onClick={() => setShowReusePicker(v => !v)}
              className="text-xs px-2.5 py-1 rounded-lg border"
              style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>
              {showReusePicker ? 'Cancel' : `Use saved (${savedExplanations.length})`}
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="w-5 h-5 flex items-center justify-center"
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
        <div className="px-4 py-3 border-b space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Saved explanations for this question
          </p>
          {savedExplanations.map(exp => (
            <div key={exp.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border"
              style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
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
                    To: {exp.profiles.full_name || exp.profiles.email}
                  </p>
                )}
              </div>
              <button
                onClick={() => loadExplanation(exp)}
                className="text-xs px-2.5 py-1 rounded-lg font-medium text-white"
                style={{ background: 'var(--accent)' }}>
                Load
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Steps */}
      <div className="px-4 py-4 space-y-5">
        {steps.map((step, idx) => (
          <div key={step.id} className="space-y-2">
            {/* Step header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md"
                style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                Step {idx + 1}
              </span>
              {steps.length > 1 && (
                <button
                  onClick={() => removeStep(step.id)}
                  className="text-xs"
                  style={{ color: '#ef4444' }}>
                  Remove
                </button>
              )}
            </div>

            {/* Text input */}
            <textarea
              value={step.text}
              onChange={e => updateText(step.id, e.target.value)}
              placeholder={`Explain step ${idx + 1}…`}
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border text-sm resize-none outline-none"
              style={{
                borderColor: 'var(--border)',
                background:  'var(--card)',
                color:       'var(--foreground)',
              }}
            />

            {/* Canvas */}
            <StepCanvas
              ref={r => setCanvasRef(step.id, r)}
              initialData={step.canvasData}
            />
          </div>
        ))}

        {/* Add step */}
        <button
          onClick={addStep}
          className="w-full py-2 rounded-xl border text-sm border-dashed"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          + Add Step
        </button>

        {/* Send button */}
        <div className="flex items-center gap-3 pt-1">
          {sent ? (
            <span className="text-sm font-medium" style={{ color: '#16a34a' }}>
              ✓ Explanation sent to {studentName}
            </span>
          ) : (
            <button
              onClick={handleSend}
              disabled={sending}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-60"
              style={{ background: 'var(--accent)' }}>
              {sending ? 'Sending…' : `Send to ${studentName}`}
            </button>
          )}
          {alreadySent && !sent && (
            <button
              onClick={handleSend}
              disabled={sending}
              className="px-4 py-2.5 rounded-xl text-sm border"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              {sending ? 'Updating…' : 'Update & resend'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
