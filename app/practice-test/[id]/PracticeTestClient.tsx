'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { isFreeResponse } from '@/utils/grading'
import DesmosCalculator from '@/components/DesmosCalculator'
import FormulasButton from '@/components/FormulasButton'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TestQuestion = {
  id: string
  subject: string
  domain: string
  skill: string
  difficulty: string
  correct_answer: string
  question_image_url: string | null
  answer_image_url: string | null
}

type LocalAnswer = {
  selected: string | null
  flagged: boolean
  timeTaken: number // seconds accumulated on this question
}

type Phase =
  | 'rw_m1'
  | 'rw_m2'
  | 'break'
  | 'math_m1'
  | 'math_m2'
  | 'done'

type SavedAnswer = {
  question_id: string
  selected_answer: string | null
  flagged: boolean
  time_spent_seconds: number | null
  position: number
}

type Props = {
  testId: string
  initialModule: Phase
  initialQuestions: TestQuestion[]
  initialTimeSeconds: number
  initialSavedAnswers?: SavedAnswer[]
}

const MODULE_LABELS: Record<string, string> = {
  rw_m1:   'Reading & Writing — Module 1',
  rw_m2:   'Reading & Writing — Module 2',
  math_m1: 'Math — Module 1',
  math_m2: 'Math — Module 2',
}

const MODULE_TOTAL_SECONDS: Record<string, number> = {
  rw_m1: 32 * 60,
  rw_m2: 32 * 60,
  math_m1: 35 * 60,
  math_m2: 35 * 60,
}

const BREAK_SECONDS = 10 * 60
const CHOICES = ['A', 'B', 'C', 'D'] as const

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// ─── PracticeTestClient ───────────────────────────────────────────────────────

export default function PracticeTestClient({
  testId,
  initialModule,
  initialQuestions,
  initialTimeSeconds,
  initialSavedAnswers = [],
}: Props) {
  const router = useRouter()

  // ── State ──────────────────────────────────────────────────────────────────
  const [phase, setPhase]       = useState<Phase>(initialModule)
  const [questions, setQuestions] = useState<TestQuestion[]>(initialQuestions)
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    // Resume: start at first unanswered question
    const answeredPositions = new Set(initialSavedAnswers.filter(a => a.selected_answer).map(a => a.position))
    const first = initialQuestions.findIndex((_, i) => !answeredPositions.has(i))
    return first === -1 ? 0 : first
  })

  // answers[questionId] = LocalAnswer
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>(() => {
    const map: Record<string, LocalAnswer> = {}
    for (const a of initialSavedAnswers) {
      const q = initialQuestions[a.position]
      if (q) {
        map[q.id] = {
          selected:  a.selected_answer,
          flagged:   a.flagged,
          timeTaken: a.time_spent_seconds ?? 0,
        }
      }
    }
    return map
  })

  const [pendingChoice, setPendingChoice] = useState<string | null>(null)
  const [freeText, setFreeText]           = useState('')
  const [timeLeft, setTimeLeft]           = useState(initialTimeSeconds)
  const [breakTimeLeft, setBreakTimeLeft] = useState(BREAK_SECONDS)
  const [submitting, setSubmitting]       = useState(false)

  // Scores — revealed only on done screen
  const [scores, setScores] = useState<{ rw: number; math: number; total: number } | null>(null)

  // Timers
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const breakInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const questionStartRef = useRef<number>(Date.now()) // when we entered current question

  // ── Question timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'break' || phase === 'done') return

    timerInterval.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          // Time's up — auto-submit current module
          clearInterval(timerInterval.current!)
          handleSubmitModule(true)
          return 0
        }
        return t - 1
      })
    }, 1000)

    return () => { if (timerInterval.current) clearInterval(timerInterval.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ── Break timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'break') return
    breakInterval.current = setInterval(() => {
      setBreakTimeLeft(t => {
        if (t <= 1) {
          clearInterval(breakInterval.current!)
          startMathM1()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => { if (breakInterval.current) clearInterval(breakInterval.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ── Reset question timer when navigating ──────────────────────────────────
  useEffect(() => {
    questionStartRef.current = Date.now()
  }, [currentIndex])

  // ── Helpers ────────────────────────────────────────────────────────────────

  const currentQ = questions[currentIndex]
  const isFR     = currentQ ? isFreeResponse(currentQ.correct_answer) : false
  const isMath   = phase === 'math_m1' || phase === 'math_m2'
  const isLastQ  = currentIndex === questions.length - 1
  const currentAns = currentQ ? answers[currentQ.id] : undefined

  function getTimeTaken(): number {
    return (Date.now() - questionStartRef.current) / 1000
  }

  function saveCurrentTime() {
    if (!currentQ) return
    const elapsed = getTimeTaken()
    setAnswers(prev => {
      const existing = prev[currentQ.id]
      return {
        ...prev,
        [currentQ.id]: {
          selected:  existing?.selected ?? null,
          flagged:   existing?.flagged ?? false,
          timeTaken: (existing?.timeTaken ?? 0) + elapsed,
        },
      }
    })
  }

  const navigate = useCallback((idx: number) => {
    saveCurrentTime()
    setCurrentIndex(idx)
    setPendingChoice(null)
    setFreeText('')
    questionStartRef.current = Date.now()
  }, [currentQ]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleFlag() {
    if (!currentQ) return
    setAnswers(prev => ({
      ...prev,
      [currentQ.id]: {
        selected:  prev[currentQ.id]?.selected ?? null,
        flagged:   !prev[currentQ.id]?.flagged,
        timeTaken: prev[currentQ.id]?.timeTaken ?? 0,
      },
    }))
  }

  function selectChoice(choice: string) {
    if (!currentQ) return
    const elapsed = getTimeTaken()
    // Record answer immediately (no confirmation step — can change until submit)
    setAnswers(prev => ({
      ...prev,
      [currentQ.id]: {
        selected:  choice,
        flagged:   prev[currentQ.id]?.flagged ?? false,
        timeTaken: (prev[currentQ.id]?.timeTaken ?? 0) + elapsed,
      },
    }))
    setPendingChoice(choice)
    questionStartRef.current = Date.now()
  }

  function submitFreeText() {
    if (!currentQ || !freeText.trim()) return
    const elapsed = getTimeTaken()
    setAnswers(prev => ({
      ...prev,
      [currentQ.id]: {
        selected:  freeText.trim(),
        flagged:   prev[currentQ.id]?.flagged ?? false,
        timeTaken: (prev[currentQ.id]?.timeTaken ?? 0) + elapsed,
      },
    }))
    setFreeText('')
    questionStartRef.current = Date.now()
  }

  // ── Submit module ──────────────────────────────────────────────────────────

  const handleSubmitModule = useCallback(async (timedOut = false) => {
    if (submitting) return
    setSubmitting(true)

    saveCurrentTime()

    // Build answers payload
    const payload = questions.map((q, i) => {
      const a = answers[q.id]
      return {
        questionId:       q.id,
        correctAnswer:    q.correct_answer,
        selectedAnswer:   a?.selected ?? null,
        flagged:          a?.flagged ?? false,
        timeSpentSeconds: a?.timeTaken ?? 0,
        position:         i,
      }
    })

    // Stop timer
    if (timerInterval.current) clearInterval(timerInterval.current)

    try {
      const res = await fetch(`/api/practice-test/${testId}/module-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module:           phase,
          answers:          payload,
          secondsRemaining: timedOut ? 0 : timeLeft,
        }),
      })
      const data = await res.json()

      if (data.nextModule === 'break') {
        setPhase('break')
        setBreakTimeLeft(BREAK_SECONDS)
      } else if (data.nextModule === 'rw_m2' || data.nextModule === 'math_m2') {
        setQuestions(data.questions)
        setAnswers({})
        setCurrentIndex(0)
        setPendingChoice(null)
        setFreeText('')
        setTimeLeft(data.timeSeconds)
        setPhase(data.nextModule as Phase)
      } else if (data.nextModule === 'done') {
        setScores(data.scores)
        setPhase('done')
      }
    } catch (e) {
      console.error('Module submit error:', e)
    } finally {
      setSubmitting(false)
    }
  }, [submitting, questions, answers, phase, testId, timeLeft]) // eslint-disable-line react-hooks/exhaustive-deps

  async function startMathM1() {
    // Fetch math M1 questions from resume endpoint
    try {
      const res = await fetch(`/api/practice-test/${testId}/resume`)
      const data = await res.json()
      setQuestions(data.questions)
      setAnswers({})
      setCurrentIndex(0)
      setPendingChoice(null)
      setFreeText('')
      setTimeLeft(data.timeSeconds)
      setPhase('math_m1')
    } catch (e) {
      console.error('Failed to load Math M1:', e)
    }
  }

  // ── Break screen ───────────────────────────────────────────────────────────
  if (phase === 'break') {
    const isUrgent = breakTimeLeft <= 60
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
            Section Break
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Reading &amp; Writing complete. Math begins after the break.
          </p>
        </div>
        <div
          className="w-40 h-40 rounded-full flex flex-col items-center justify-center border-4 font-mono text-3xl font-bold transition-colors"
          style={{
            borderColor: isUrgent ? '#dc2626' : 'var(--accent)',
            color:       isUrgent ? '#dc2626' : 'var(--accent)',
            background:  'var(--card)',
          }}>
          {fmtTime(breakTimeLeft)}
          <span className="text-xs font-normal mt-1" style={{ color: 'var(--text-muted)' }}>remaining</span>
        </div>
        <button
          onClick={startMathM1}
          className="px-8 py-3 rounded-xl font-semibold text-white text-sm"
          style={{ background: 'var(--accent)' }}>
          Skip Break → Start Math
        </button>
      </div>
    )
  }

  // ── Done screen ────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div
          className="rounded-2xl border p-10 max-w-md w-full"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--foreground)' }}>
            Test Complete!
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            Your results are ready.
          </p>
          {scores && (
            <div className="flex gap-4 justify-center mb-6">
              {[
                { label: 'Reading & Writing', val: scores.rw },
                { label: 'Math',              val: scores.math },
                { label: 'Total',             val: scores.total },
              ].map(({ label, val }) => (
                <div key={label} className="flex flex-col items-center">
                  <span className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>{val}</span>
                  <span className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{label}</span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => router.push(`/practice-test/${testId}/results`)}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm"
            style={{ background: 'var(--accent)' }}>
            Review Answers
          </button>
        </div>
        <button
          onClick={() => router.push('/practice-test')}
          className="text-sm underline"
          style={{ color: 'var(--text-muted)' }}>
          Back to Practice Tests
        </button>
      </div>
    )
  }

  // ── Module active ──────────────────────────────────────────────────────────
  if (!currentQ) return null

  const isUrgentTimer = timeLeft <= 5 * 60
  const answeredCount = Object.values(answers).filter(a => a.selected).length

  return (
    <div className="flex flex-col gap-0 h-screen overflow-hidden" style={{ background: 'var(--background)' }}>

      {/* ── Top bar ── */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div>
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            {MODULE_LABELS[phase]}
          </p>
          <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            Question {currentIndex + 1} of {questions.length}
          </p>
        </div>

        {/* Timer */}
        <div
          className="flex items-center gap-2 font-mono text-lg font-bold px-4 py-1.5 rounded-full transition-colors"
          style={{
            background:  isUrgentTimer ? '#fef2f2' : 'var(--border)',
            color:       isUrgentTimer ? '#dc2626'  : 'var(--foreground)',
          }}>
          ⏱ {fmtTime(timeLeft)}
        </div>

        {/* Domain label */}
        <p className="text-xs text-right max-w-[140px]" style={{ color: 'var(--text-muted)' }}>
          {currentQ.domain}
        </p>
      </div>

      {/* ── Main content area (scrollable) ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">

        {/* Flag button */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleFlag}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={{
              borderColor: currentAns?.flagged ? '#ca8a04' : 'var(--border)',
              background:  currentAns?.flagged ? '#fefce8' : 'transparent',
              color:       currentAns?.flagged ? '#ca8a04' : 'var(--text-muted)',
            }}>
            🚩 {currentAns?.flagged ? 'Flagged' : 'Flag for review'}
          </button>
          {currentAns?.selected && (
            <span className="text-xs px-2 py-1 rounded" style={{ background: '#f0fdf4', color: '#16a34a' }}>
              ✓ Answered
            </span>
          )}
        </div>

        {/* Question card */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

          {/* Question image */}
          {currentQ.question_image_url && (
            <div className="p-4">
              <img src={currentQ.question_image_url} alt="Question" className="w-full rounded-lg" />
            </div>
          )}

          {/* Answer choices */}
          <div className="px-4 pb-4 space-y-2">
            {isFR ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={freeText || currentAns?.selected || ''}
                  onChange={e => setFreeText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitFreeText() }}
                  placeholder="Type your answer…"
                  className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                  }}
                />
                <button
                  onClick={submitFreeText}
                  disabled={!freeText.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40 self-start"
                  style={{ background: 'var(--accent)' }}>
                  Save Answer
                </button>
              </div>
            ) : (
              CHOICES.map(choice => {
                const isSelected = (pendingChoice ?? currentAns?.selected) === choice
                return (
                  <button
                    key={choice}
                    onClick={() => selectChoice(choice)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm text-left font-medium transition-all"
                    style={{
                      background:   isSelected ? '#eff6ff' : 'transparent',
                      borderColor:  isSelected ? '#3b82f6' : 'var(--border)',
                      color:        isSelected ? '#1d4ed8' : 'var(--foreground)',
                    }}>
                    <span
                      className="w-7 h-7 rounded-full border-2 flex items-center justify-center font-bold text-xs flex-shrink-0"
                      style={{
                        borderColor: isSelected ? '#3b82f6' : 'var(--border)',
                        color:       isSelected ? '#1d4ed8' : 'var(--text-muted)',
                      }}>
                      {choice}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Navigation: Previous / Next, or Submit on last question */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => currentIndex > 0 && navigate(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="px-5 py-2.5 rounded-xl border text-sm font-medium disabled:opacity-30 transition-opacity"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
            ← Previous
          </button>

          {isLastQ ? (
            <button
              onClick={() => handleSubmitModule(false)}
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-60 transition-opacity"
              style={{ background: '#16a34a' }}>
              {submitting ? 'Submitting…' : `Submit ${MODULE_LABELS[phase].split('—')[1].trim()} ✓`}
            </button>
          ) : (
            <button
              onClick={() => navigate(currentIndex + 1)}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: 'var(--accent)' }}>
              Next →
            </button>
          )}
        </div>

        {/* Progress stats */}
        <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
          {answeredCount} of {questions.length} answered
        </p>
      </div>

      {/* ── Question navigator (bottom) ── */}
      <div
        className="flex-shrink-0 border-t px-4 py-3 flex items-center gap-1.5 flex-wrap overflow-y-auto max-h-24"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        {questions.map((q, i) => {
          const ans     = answers[q.id]
          const isCurrent = i === currentIndex
          const isAnswered = !!ans?.selected
          const isFlagged  = !!ans?.flagged

          let bg          = 'var(--border)'
          let color       = 'var(--text-muted)'
          let borderColor = 'transparent'
          let extraStyle  = {}

          if (isCurrent) {
            bg = 'var(--accent)'; color = 'white'; borderColor = 'var(--accent)'
          } else if (isFlagged && isAnswered) {
            // Answered + flagged: gold border, filled
            bg = '#854d0e'; color = 'white'; borderColor = '#ca8a04'
            extraStyle = { outline: '2px solid #ca8a04', outlineOffset: '1px' }
          } else if (isFlagged) {
            // Flagged but not answered: yellow
            bg = '#fefce8'; color = '#854d0e'; borderColor = '#ca8a04'
          } else if (isAnswered) {
            // Answered: solid dark
            bg = 'var(--foreground)'; color = 'var(--background)'
          }

          return (
            <button
              key={q.id}
              onClick={() => navigate(i)}
              className="w-7 h-7 rounded-full text-xs font-bold transition-all border flex-shrink-0"
              style={{ background: bg, color, borderColor, ...extraStyle }}>
              {i + 1}
            </button>
          )
        })}
      </div>

      {/* Floating math tools */}
      {isMath && (
        <>
          <DesmosCalculator />
          <FormulasButton hasCalculator />
        </>
      )}
    </div>
  )
}
