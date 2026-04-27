'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { isFreeResponse, checkFreeResponse } from '@/utils/grading'
import type { WorksheetItem, ExistingAnswer } from './page'
import DesmosCalculator from '@/components/DesmosCalculator'
import ExplanationViewer from '@/components/ExplanationViewer'

type Props = {
  assignmentId: string
  worksheetTitle: string
  worksheetId: string
  status: string
  items: WorksheetItem[]
  existingAnswers: ExistingAnswer[]
  studentId: string
  attemptNumber: number
}

const CHOICES = ['A', 'B', 'C', 'D'] as const

export default function TakeWorksheet({
  assignmentId,
  worksheetTitle,
  worksheetId,
  status: initialStatus,
  items,
  existingAnswers,
  studentId,
  attemptNumber,
}: Props) {
  const supabase = createClient()
  const router = useRouter()

  const buildInitialAnswers = () => {
    const map: Record<string, { selected: string | null; isCorrect: boolean | null; time: number }> = {}
    existingAnswers.forEach(a => {
      map[a.question_id] = { selected: a.selected_answer, isCorrect: a.is_correct, time: a.time_spent_seconds }
    })
    return map
  }

  const buildInitialNotes = () => {
    const map: Record<string, string> = {}
    existingAnswers.forEach(a => { if (a.student_notes) map[a.question_id] = a.student_notes })
    return map
  }

  const buildInitialConfidence = () => {
    const map: Record<string, number | null> = {}
    existingAnswers.forEach(a => { if (a.confidence_level != null) map[a.question_id] = a.confidence_level })
    return map
  }

  const [answers, setAnswers] = useState(buildInitialAnswers)
  const [notes, setNotes] = useState<Record<string, string>>(buildInitialNotes)
  const [confidence, setConfidence] = useState<Record<string, number | null>>(buildInitialConfidence)
  const [status, setStatus] = useState(initialStatus)
  const [submitting, setSubmitting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [redoing, setRedoing] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState(false)
  const [freeResponseInput, setFreeResponseInput] = useState('')
  // Explanations keyed by question_id, fetched once the worksheet is complete
  const [explanations, setExplanations] = useState<Record<string, Array<{ text: string; canvasData: string | null }>>>({})

  const timerRef = useRef<Record<string, number>>({})
  const startTimeRef = useRef<number>(Date.now())
  const currentQIdRef = useRef<string | null>(null)

  const isComplete = status === 'complete'
  const questionItems = items.filter(i => i.type === 'question' && i.questions)
  const totalQuestions = questionItems.length
  const answeredCount = questionItems.filter(i => answers[i.questions!.id]?.selected).length
  const correctCount = questionItems.filter(i => answers[i.questions!.id]?.isCorrect === true).length

  // Initialize timer values
  useEffect(() => {
    existingAnswers.forEach(a => { timerRef.current[a.question_id] = a.time_spent_seconds })
  }, [existingAnswers])

  // Start timer for first question
  useEffect(() => {
    const q = questionItems[0]?.questions
    if (q && !isComplete) {
      currentQIdRef.current = q.id
      startTimeRef.current = Date.now()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch instructor explanations once the assignment is complete
  useEffect(() => {
    if (!isComplete) return
    const load = async () => {
      try {
        const { data } = await supabase
          .from('question_explanations')
          .select('question_id, steps')
          .eq('student_id', studentId)
          .not('sent_at', 'is', null)
        if (!data) return
        const map: Record<string, Array<{ text: string; canvasData: string | null }>> = {}
        for (const row of data) {
          map[row.question_id] = row.steps as Array<{ text: string; canvasData: string | null }>
        }
        setExplanations(map)
      } catch (e) {
        console.error('Failed to load explanations:', e)
      }
    }
    load()
  }, [isComplete, studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const flushTimer = useCallback(() => {
    const qId = currentQIdRef.current
    if (qId && !isComplete) {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
      timerRef.current[qId] = (timerRef.current[qId] || 0) + elapsed
      startTimeRef.current = Date.now()
    }
  }, [isComplete])

  const goToQuestion = useCallback((idx: number) => {
    if (idx < 0 || idx >= totalQuestions) return
    if (!isComplete) flushTimer()
    setCurrentIndex(idx)
    const nextQ = questionItems[idx]?.questions
    if (nextQ) {
      // Pre-fill free response input if there's an existing answer
      if (isFreeResponse(nextQ.correct_answer)) {
        setFreeResponseInput(answers[nextQ.id]?.selected || '')
      } else {
        setFreeResponseInput('')
      }
      if (!isComplete) {
        currentQIdRef.current = nextQ.id
        startTimeRef.current = Date.now()
      }
    }
  }, [totalQuestions, isComplete, flushTimer, questionItems, answers])

  const saveNotes = async (questionId: string, text: string) => {
    await supabase.from('student_answers').upsert({
      assignment_id: assignmentId,
      question_id: questionId,
      student_id: studentId,
      selected_answer: answers[questionId]?.selected ?? null,
      is_correct: answers[questionId]?.isCorrect ?? null,
      time_spent_seconds: timerRef.current[questionId] || 0,
      student_notes: text || null,
      confidence_level: confidence[questionId] ?? null,
      answered_at: new Date().toISOString(),
    }, { onConflict: 'assignment_id,question_id' })
  }

  const saveConfidence = async (questionId: string, level: number) => {
    setConfidence(prev => ({ ...prev, [questionId]: level }))
    await supabase.from('student_answers').upsert({
      assignment_id: assignmentId,
      question_id: questionId,
      student_id: studentId,
      selected_answer: answers[questionId]?.selected ?? null,
      is_correct: answers[questionId]?.isCorrect ?? null,
      time_spent_seconds: timerRef.current[questionId] || 0,
      student_notes: notes[questionId] || null,
      confidence_level: level,
      answered_at: new Date().toISOString(),
    }, { onConflict: 'assignment_id,question_id' })
  }

  const handleSelectAnswer = async (choice: string) => {
    if (isComplete) return
    const currentQ = questionItems[currentIndex]?.questions
    if (!currentQ) return

    flushTimer()
    const timeSpent = timerRef.current[currentQ.id] || 0
    const freeResp = isFreeResponse(currentQ.correct_answer)
    const isCorrect = freeResp
      ? checkFreeResponse(choice, currentQ.correct_answer)
      : currentQ.correct_answer === choice

    setAnswers(prev => ({ ...prev, [currentQ.id]: { selected: choice, isCorrect, time: timeSpent } }))
    setSaving(true)

    const { error } = await supabase
      .from('student_answers')
      .upsert({
        assignment_id: assignmentId,
        question_id: currentQ.id,
        student_id: studentId,
        selected_answer: choice,
        is_correct: isCorrect,
        time_spent_seconds: timeSpent,
        student_notes: notes[currentQ.id] || null,
        confidence_level: confidence[currentQ.id] ?? null,
        answered_at: new Date().toISOString(),
      }, { onConflict: 'assignment_id,question_id' })

    if (error) console.error('Failed to save answer:', error)
    setSaving(false)
    // No auto-advance — student clicks Next manually
  }

  const handleSubmit = async () => {
    const unanswered = questionItems.filter(i => !answers[i.questions!.id]?.selected)
    if (unanswered.length > 0) {
      const confirmed = window.confirm(
        `You have ${unanswered.length} unanswered question${unanswered.length > 1 ? 's' : ''}. Submit anyway?`
      )
      if (!confirmed) {
        goToQuestion(questionItems.findIndex(i => i.id === unanswered[0].id))
        return
      }
    }

    setSubmitting(true)
    flushTimer()

    for (const item of questionItems) {
      const qId = item.questions!.id
      await supabase.from('student_answers')
        .update({ time_spent_seconds: timerRef.current[qId] || 0 })
        .eq('assignment_id', assignmentId).eq('question_id', qId)
    }

    const { error } = await supabase
      .from('student_assignments')
      .update({ status: 'complete' })
      .eq('id', assignmentId)

    if (error) {
      console.error('Failed to submit:', error)
      alert('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    // Update final times in answers state
    setAnswers(prev => {
      const next = { ...prev }
      for (const item of questionItems) {
        const qId = item.questions!.id
        if (next[qId]) next[qId] = { ...next[qId], time: timerRef.current[qId] || 0 }
      }
      return next
    })

    setStatus('complete')
    setJustSubmitted(true)
    setSubmitting(false)

    // Notify teacher of submission (fire-and-forget)
    const finalCorrect = questionItems.filter(i => {
      const a = answers[i.questions!.id]
      return a?.isCorrect === true
    }).length
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'submission',
        worksheetTitle,
        correctCount: finalCorrect,
        totalQuestions,
        worksheetId,
      }),
    }).catch(console.error)
  }

  const handleRedo = async () => {
    setRedoing(true)

    // First, figure out the next attempt number by checking all existing attempts
    const { data: existing } = await supabase
      .from('student_assignments')
      .select('attempt_number')
      .eq('worksheet_id', worksheetId)
      .eq('student_id', studentId)
      .order('attempt_number', { ascending: false })
      .limit(1)

    const nextAttempt = existing && existing.length > 0
      ? ((existing[0] as any).attempt_number ?? 1) + 1
      : attemptNumber + 1

    const { data: newAssignment, error } = await supabase
      .from('student_assignments')
      .insert({ worksheet_id: worksheetId, student_id: studentId, attempt_number: nextAttempt, status: 'pending' })
      .select('id').single()

    if (error) {
      console.error('Redo failed:', error.message, error.details, error.hint, error.code)
      alert(`Could not start a new attempt: ${error.message}`)
      setRedoing(false)
      return
    }
    router.push(`/take/${newAssignment.id}`)
  }

  const currentQ = questionItems[currentIndex]?.questions

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLETED: Just-submitted summary (simple score + question list)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isComplete && justSubmitted) {
    const pct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0
    return (
      <main className="flex-1 overflow-y-auto px-4 py-8">
        <div className="max-w-xl mx-auto">
          {/* Score */}
          <div className="text-center mb-8">
            <div className="text-6xl font-bold mb-1"
              style={{ color: pct >= 70 ? '#16a34a' : pct >= 50 ? '#ca8a04' : '#dc2626' }}>
              {pct}%
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {correctCount} out of {totalQuestions} correct
            </p>
          </div>

          {/* Question results */}
          <div className="space-y-1.5 mb-8">
            {questionItems.map((item, idx) => {
              const q = item.questions!
              const a = answers[q.id]
              const correct = a?.isCorrect
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ background: correct ? '#f0fdf420' : '#fef2f220' }}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: correct ? '#f0fdf4' : '#fef2f2', color: correct ? '#16a34a' : '#dc2626' }}>
                    {correct ? '✓' : '✗'}
                  </span>
                  <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Q{idx + 1}</span>
                  <span className="text-sm" style={{ color: correct ? '#16a34a' : '#dc2626' }}>
                    {a?.selected || '—'}
                  </span>
                  {!correct && (
                    <span className="text-sm" style={{ color: '#16a34a' }}>→ {q.correct_answer}</span>
                  )}
                  <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>{a?.time ?? 0}s</span>
                </div>
              )
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setJustSubmitted(false)}
              className="px-5 py-2.5 rounded-xl text-sm font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              Review Answers
            </button>
            <button onClick={handleRedo} disabled={redoing}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: 'var(--accent)', opacity: redoing ? 0.6 : 1 }}>
              {redoing ? 'Starting...' : 'Redo Worksheet'}
            </button>
            <a href="/my-assignments"
              className="px-5 py-2.5 rounded-xl text-sm font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              Back
            </a>
          </div>
        </div>
      </main>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLETED: Full review view (scrollable worksheet with overlaid answers)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isComplete) {
    const pct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0
    return (
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto">
          {/* Score banner */}
          <div className="flex items-center justify-between rounded-2xl border p-5 mb-6"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div>
              <h1 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>{worksheetTitle}</h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {attemptNumber > 1 ? `Attempt ${attemptNumber} · ` : ''}{correctCount}/{totalQuestions} correct
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold"
                style={{ color: pct >= 70 ? '#16a34a' : pct >= 50 ? '#ca8a04' : '#dc2626' }}>
                {pct}%
              </span>
              <button onClick={handleRedo} disabled={redoing}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white"
                style={{ background: 'var(--accent)', opacity: redoing ? 0.6 : 1 }}>
                {redoing ? 'Starting...' : 'Redo'}
              </button>
              <a href="/my-assignments" className="px-4 py-2 rounded-xl text-xs font-medium border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                Back
              </a>
            </div>
          </div>

          {/* Questions with answers overlaid */}
          <div className="space-y-5">
            {items.map((item, idx) => {
              if (item.type === 'section_header') {
                return (
                  <div key={item.id} className="pt-3">
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>{item.content}</h2>
                  </div>
                )
              }
              if (item.type === 'note') {
                return (
                  <div key={item.id} className="rounded-xl px-4 py-3 text-sm"
                    style={{ background: '#fefce8', border: '1px solid #fde68a', color: '#713f12' }}>
                    {item.content}
                  </div>
                )
              }
              if (item.type === 'question' && item.questions) {
                const q = item.questions
                const a = answers[q.id]
                const qNum = questionItems.findIndex(i => i.id === item.id) + 1

                return (
                  <div key={item.id} className="rounded-2xl border overflow-hidden"
                    style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                    {/* Question header with result */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                      <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{
                          background: a?.isCorrect ? '#f0fdf4' : '#fef2f2',
                          color: a?.isCorrect ? '#16a34a' : '#dc2626',
                        }}>
                        {a?.isCorrect ? '✓' : '✗'}
                      </span>
                      <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                        Question {qNum}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {q.domain} · {q.skill}
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{a?.time ?? 0}s</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{
                            background: a?.isCorrect ? '#f0fdf4' : '#fef2f2',
                            color: a?.isCorrect ? '#16a34a' : '#dc2626',
                          }}>
                          {a?.selected || '—'}{!a?.isCorrect && ` → ${q.correct_answer}`}
                        </span>
                      </div>
                    </div>

                    {/* Question image */}
                    <div className="px-4 pt-4 pb-2">
                      <img src={q.question_image_url} alt={`Question ${qNum}`}
                        className="w-full rounded-lg object-contain" style={{ maxHeight: 420, background: 'white' }} />
                    </div>

                    {/* Answer choices / free-response overlaid */}
                    {isFreeResponse(q.correct_answer) ? (
                      <div className="px-4 pb-3 flex flex-col gap-2">
                        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm font-medium"
                          style={{
                            background: a?.isCorrect ? '#f0fdf4' : '#fef2f2',
                            borderColor: a?.isCorrect ? '#16a34a' : '#dc2626',
                            color: a?.isCorrect ? '#16a34a' : '#dc2626',
                          }}>
                          <span className="font-bold">Your answer:</span>
                          <span>{a?.selected || '—'}</span>
                          <span className="text-xs">{a?.isCorrect ? '✓' : '✗'}</span>
                        </div>
                        {!a?.isCorrect && (
                          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm font-medium"
                            style={{ background: '#f0fdf4', borderColor: '#16a34a', color: '#16a34a' }}>
                            <span className="font-bold">Correct:</span>
                            <span>{q.correct_answer}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="px-4 pb-3 grid grid-cols-4 gap-2">
                        {CHOICES.map(choice => {
                          const isSelected = a?.selected === choice
                          const isCorrectAnswer = q.correct_answer === choice
                          let bg = 'var(--background)'
                          let border = 'var(--border)'
                          let textColor = 'var(--foreground)'

                          if (isCorrectAnswer) {
                            bg = '#f0fdf4'; border = '#16a34a'; textColor = '#16a34a'
                          } else if (isSelected) {
                            bg = '#fef2f2'; border = '#dc2626'; textColor = '#dc2626'
                          }

                          return (
                            <div key={choice}
                              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium"
                              style={{ background: bg, borderColor: border, color: textColor }}>
                              <span className="font-bold">{choice}</span>
                              {isSelected && !isCorrectAnswer && <span className="text-xs">✗</span>}
                              {isCorrectAnswer && <span className="text-xs">✓</span>}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Answer explanation */}
                    {q.answer_image_url && (
                      <div className="px-4 pb-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                        <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Explanation</p>
                        <img src={q.answer_image_url} alt={`Answer ${qNum}`}
                          className="w-full rounded-lg object-contain" style={{ maxHeight: 400, background: 'white' }} />
                      </div>
                    )}

                    {/* Instructor explanation (if sent) */}
                    {explanations[q.id] && explanations[q.id].length > 0 && (
                      <ExplanationViewer steps={explanations[q.id]} />
                    )}
                  </div>
                )
              }
              return null
            })}
          </div>

          {/* Bottom actions */}
          <div className="flex items-center justify-center gap-3 py-8">
            <button onClick={handleRedo} disabled={redoing}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: 'var(--accent)', opacity: redoing ? 0.6 : 1 }}>
              {redoing ? 'Starting...' : 'Redo Worksheet'}
            </button>
            <a href="/my-assignments" className="px-5 py-2.5 rounded-xl text-sm font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              Back to Assignments
            </a>
          </div>
        </div>
      </main>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVE QUIZ: One question at a time
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <main className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
      {/* Top bar with progress */}
      <div className="border-b px-6 py-3 flex-shrink-0" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              {worksheetTitle}
              {attemptNumber > 1 && (
                <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                  Attempt {attemptNumber}
                </span>
              )}
            </p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {answeredCount}/{totalQuestions} answered
            </p>
          </div>
          <div className="flex items-center gap-1">
            {questionItems.map((item, idx) => {
              const answered = !!answers[item.questions!.id]?.selected
              const isCurrent = idx === currentIndex
              return (
                <button key={item.id} onClick={() => goToQuestion(idx)}
                  className="flex-1 h-2 rounded-full transition-all"
                  style={{
                    background: isCurrent ? 'var(--accent)' : answered ? 'var(--accent)' : 'var(--border)',
                    opacity: isCurrent ? 1 : answered ? 0.5 : 0.3,
                    minWidth: 4, maxWidth: 40,
                  }}
                  title={`Question ${idx + 1}${answered ? ' (answered)' : ''}`}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Question area */}
      {currentQ && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 overflow-y-auto">
          <div className="w-full max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold px-3 py-1 rounded-full"
                  style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                  Q{currentIndex + 1}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {currentQ.domain} · {currentQ.skill}
                </span>
              </div>
              {saving && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Saving...</span>}
            </div>

            {currentQ.question_image_url && (
              <div className="rounded-2xl overflow-hidden border mb-6"
                style={{ borderColor: 'var(--border)', background: 'white' }}>
                <img src={currentQ.question_image_url} alt={`Question ${currentIndex + 1}`}
                  className="w-full" style={{ maxHeight: '400px', objectFit: 'contain' }} />
              </div>
            )}

            {/* Answer input: multiple choice or free response */}
            {isFreeResponse(currentQ.correct_answer) ? (
              <div className="space-y-3">
                <label className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                  Enter your answer
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={freeResponseInput}
                    onChange={e => setFreeResponseInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && freeResponseInput.trim()) {
                        handleSelectAnswer(freeResponseInput.trim())
                      }
                    }}
                    placeholder="Type your answer (e.g. 5, 3/4, 0.75, -2)"
                    className="flex-1 px-4 py-3 rounded-xl border text-base outline-none"
                    style={{
                      borderColor: answers[currentQ.id]?.selected ? 'var(--accent)' : 'var(--border)',
                      background: 'var(--card)',
                      color: 'var(--foreground)',
                    }}
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      if (freeResponseInput.trim()) handleSelectAnswer(freeResponseInput.trim())
                    }}
                    disabled={!freeResponseInput.trim()}
                    className="px-5 py-3 rounded-xl text-sm font-medium text-white disabled:opacity-40"
                    style={{ background: 'var(--accent)' }}>
                    Save
                  </button>
                </div>
                {answers[currentQ.id]?.selected && (
                  <p className="text-xs" style={{ color: 'var(--accent)' }}>
                    Saved: {answers[currentQ.id].selected}
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {CHOICES.map(choice => {
                  const isSelected = answers[currentQ.id]?.selected === choice
                  return (
                    <button key={choice} onClick={() => handleSelectAnswer(choice)}
                      className="flex items-center gap-3 px-5 py-4 rounded-xl border text-base font-medium transition-all hover:shadow-sm"
                      style={{
                        background: isSelected ? 'var(--accent-light)' : 'var(--card)',
                        borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                        color: isSelected ? 'var(--accent)' : 'var(--foreground)',
                      }}>
                      <span className="w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{
                          borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                          color: isSelected ? 'var(--accent)' : 'var(--foreground)',
                        }}>
                        {choice}
                      </span>
                      Choice {choice}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Notes & confidence (optional) */}
            <div className="mt-5 space-y-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  How did you approach this? <span className="font-normal">(optional)</span>
                </label>
                <textarea
                  value={notes[currentQ.id] || ''}
                  onChange={e => setNotes(prev => ({ ...prev, [currentQ.id]: e.target.value }))}
                  onBlur={e => { if (e.target.value !== (existingAnswers.find(a => a.question_id === currentQ.id)?.student_notes ?? '')) saveNotes(currentQ.id, e.target.value) }}
                  placeholder="Describe your thinking..."
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm resize-none outline-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  Confidence level <span className="font-normal">(optional)</span>
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => saveConfidence(currentQ.id, n)}
                      className="w-10 h-10 rounded-full border font-semibold text-sm transition-all"
                      style={{
                        background: confidence[currentQ.id] === n ? 'var(--accent)' : 'var(--card)',
                        borderColor: confidence[currentQ.id] === n ? 'var(--accent)' : 'var(--border)',
                        color: confidence[currentQ.id] === n ? 'white' : 'var(--foreground)',
                      }}>
                      {n}
                    </button>
                  ))}
                  <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>
                    {confidence[currentQ.id] ? `${confidence[currentQ.id]}/5` : 'not set'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div className="border-t px-6 py-4 flex-shrink-0" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button onClick={() => goToQuestion(currentIndex - 1)} disabled={currentIndex === 0}
            className="px-4 py-2.5 rounded-xl text-sm font-medium border disabled:opacity-30"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
            ← Previous
          </button>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{currentIndex + 1} of {totalQuestions}</span>
          {currentIndex < totalQuestions - 1 ? (
            <button onClick={() => goToQuestion(currentIndex + 1)}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: 'var(--accent)' }}>
              Next →
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white"
              style={{
                background: answeredCount === totalQuestions ? 'var(--accent)' : 'var(--text-muted)',
                opacity: submitting ? 0.6 : 1,
              }}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          )}
        </div>
      </div>

      <DesmosCalculator />
    </main>
  )
}
