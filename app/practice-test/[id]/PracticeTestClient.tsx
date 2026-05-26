'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { isFreeResponse } from '@/utils/grading'
import DesmosCalculator from '@/components/DesmosCalculator'
import FormulasButton from '@/components/FormulasButton'
import { createClient } from '@/utils/supabase/client'

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
  timeTaken: number
}

type Phase = 'rw_m1' | 'rw_m2' | 'break' | 'math_m1' | 'math_m2' | 'done'

type SavedAnswer = {
  question_id: string
  selected_answer: string | null
  flagged: boolean
  time_spent_seconds: number | null
  position: number
}

type Props = {
  testId: string
  studentId: string
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
  studentId,
  initialModule,
  initialQuestions,
  initialTimeSeconds,
  initialSavedAnswers = [],
}: Props) {
  const supabase = createClient()
  const router = useRouter()

  const [phase, setPhase]           = useState<Phase>(initialModule)
  const [questions, setQuestions]   = useState<TestQuestion[]>(initialQuestions)
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    const answeredPositions = new Set(initialSavedAnswers.filter(a => a.selected_answer).map(a => a.position))
    const first = initialQuestions.findIndex((_, i) => !answeredPositions.has(i))
    return first === -1 ? 0 : first
  })

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

  const [freeText, setFreeText]         = useState('')
  const [timeLeft, setTimeLeft]         = useState(initialTimeSeconds)
  const [breakTimeLeft, setBreakTimeLeft] = useState(BREAK_SECONDS)
  const [submitting, setSubmitting]     = useState(false)
  const [paused, setPaused]             = useState(false)
  const [scores, setScores]             = useState<{ rw: number; math: number; total: number } | null>(null)

  const timerInterval    = useRef<ReturnType<typeof setInterval> | null>(null)
  const breakInterval    = useRef<ReturnType<typeof setInterval> | null>(null)
  const questionStartRef = useRef<number>(Date.now())

  // Keep refs in sync so save callbacks always see current state
  const answersRef      = useRef(answers)
  const timeLeftRef     = useRef(timeLeft)
  const phaseRef        = useRef(phase)
  const questionsRef    = useRef(questions)
  const currentIndexRef = useRef(currentIndex)
  useEffect(() => { answersRef.current      = answers      }, [answers])
  useEffect(() => { timeLeftRef.current     = timeLeft     }, [timeLeft])
  useEffect(() => { phaseRef.current        = phase        }, [phase])
  useEffect(() => { questionsRef.current    = questions    }, [questions])
  useEffect(() => { currentIndexRef.current = currentIndex }, [currentIndex])

  // Ref snapshot of current state — used in beforeunload (can't read state there)
  const stateRef = useRef({ questions, answers, phase, timeLeft })
  useEffect(() => { stateRef.current = { questions, answers, phase, timeLeft } }, [questions, answers, phase, timeLeft])

  // ── Question timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'break' || phase === 'done') return
    if (paused) {
      if (timerInterval.current) clearInterval(timerInterval.current)
      return
    }
    timerInterval.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerInterval.current!)
          handleSubmitModule(true)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => { if (timerInterval.current) clearInterval(timerInterval.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused])

  // ── Break timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'break') return
    breakInterval.current = setInterval(() => {
      setBreakTimeLeft(t => {
        if (t <= 1) { clearInterval(breakInterval.current!); startMathM1(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => { if (breakInterval.current) clearInterval(breakInterval.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => { questionStartRef.current = Date.now() }, [currentIndex])

  // ── Save-progress helpers ──────────────────────────────────────────────────

  // Builds a snapshot of answers including elapsed time on the current question.
  // Reads directly from refs so it's always up to date — bypasses React's
  // async state queue that would make saveCurrentTime() + saveProgress() racy.
  function buildSnapshot() {
    const elapsed  = (Date.now() - questionStartRef.current) / 1000
    const snapshot = { ...answersRef.current }
    const q        = questionsRef.current[currentIndexRef.current]
    if (q) {
      const prev = snapshot[q.id]
      snapshot[q.id] = {
        selected:  prev?.selected  ?? null,
        flagged:   prev?.flagged   ?? false,
        timeTaken: (prev?.timeTaken ?? 0) + elapsed,
      }
    }
    return snapshot
  }

  // ── Save progress: writes directly to Supabase via browser client ─────────
  // Uses the browser client (session managed in-browser) instead of the API
  // route to avoid any server-side cookie auth issues.
  async function saveProgress() {
    const mod = phaseRef.current
    if (mod === 'break' || mod === 'done') return

    const snapshot         = buildSnapshot()
    const qs               = questionsRef.current
    const secondsRemaining = timeLeftRef.current

    // Build answer rows — only include answered or flagged questions
    const answerRows = qs
      .map((q, i) => {
        const a = snapshot[q.id]
        if (!a?.selected && !a?.flagged) return null
        return {
          test_id:            testId,
          student_id:         studentId,
          module:             mod,
          position:           i,
          question_id:        q.id,
          selected_answer:    a?.selected   ?? null,
          correct_answer:     q.correct_answer,
          is_correct:         null, // not graded until submit
          flagged:            a?.flagged    ?? false,
          time_spent_seconds: a?.timeTaken  ?? 0,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    // Timer field for this module
    const timerField: Record<string, number> = {
      rw_m1:   () => ({ rw_m1_seconds_remaining:   secondsRemaining }),
      rw_m2:   () => ({ rw_m2_seconds_remaining:   secondsRemaining }),
      math_m1: () => ({ math_m1_seconds_remaining: secondsRemaining }),
      math_m2: () => ({ math_m2_seconds_remaining: secondsRemaining }),
    }[mod]?.() ?? {}

    try {
      // Clear existing partial answers for this module, then insert fresh
      await supabase
        .from('practice_test_answers')
        .delete()
        .eq('test_id', testId)
        .eq('module', mod)

      if (answerRows.length > 0) {
        await supabase.from('practice_test_answers').insert(answerRows)
      }

      if (Object.keys(timerField).length > 0) {
        await supabase
          .from('practice_tests')
          .update(timerField)
          .eq('id', testId)
      }
    } catch (e) {
      console.error('[saveProgress] error:', e)
    }
  }

  // ── Auto-save every 30 s ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'break' || phase === 'done' || paused) return
    const id = setInterval(() => { saveProgress() }, 30_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused])

  // ── Save on tab hide / close (keepalive fetch — more reliable than beacon) ─
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'hidden') return
      const mod = phaseRef.current
      if (mod === 'break' || mod === 'done') return
      const snapshot = buildSnapshot()
      const qs = questionsRef.current
      const payload = {
        module:           mod,
        secondsRemaining: timeLeftRef.current,
        answers: qs.map((q, i) => ({
          questionId:       q.id,
          correctAnswer:    q.correct_answer,
          selectedAnswer:   snapshot[q.id]?.selected ?? null,
          flagged:          snapshot[q.id]?.flagged  ?? false,
          timeSpentSeconds: snapshot[q.id]?.timeTaken ?? 0,
          position:         i,
        })),
      }
      // keepalive: true ensures the request completes even if the tab closes
      fetch(`/api/practice-test/${testId}/save-progress`, {
        method:    'POST',
        headers:   { 'Content-Type': 'application/json' },
        body:      JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {})
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [testId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ────────────────────────────────────────────────────────────────

  const currentQ   = questions[currentIndex]
  const isFR       = currentQ ? isFreeResponse(currentQ.correct_answer) : false
  const isMath     = phase === 'math_m1' || phase === 'math_m2'
  const isLastQ    = currentIndex === questions.length - 1
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
    setAnswers(prev => ({
      ...prev,
      [currentQ.id]: {
        selected:  choice,
        flagged:   prev[currentQ.id]?.flagged ?? false,
        timeTaken: (prev[currentQ.id]?.timeTaken ?? 0) + elapsed,
      },
    }))
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

    if (timerInterval.current) clearInterval(timerInterval.current)

    try {
      const res = await fetch(`/api/practice-test/${testId}/module-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: phase, answers: payload, secondsRemaining: timedOut ? 0 : timeLeft }),
      })
      const data = await res.json()

      if (data.nextModule === 'break') {
        setPhase('break')
        setBreakTimeLeft(BREAK_SECONDS)
      } else if (data.nextModule === 'rw_m2' || data.nextModule === 'math_m2') {
        setQuestions(data.questions)
        setAnswers({})
        setCurrentIndex(0)
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
    try {
      const res  = await fetch(`/api/practice-test/${testId}/resume`)
      const data = await res.json()
      setQuestions(data.questions)
      setAnswers({})
      setCurrentIndex(0)
      setFreeText('')
      setTimeLeft(data.timeSeconds)
      setPhase('math_m1')
    } catch (e) {
      console.error('Failed to load Math M1:', e)
    }
  }

  // ── Pause overlay ──────────────────────────────────────────────────────────
  if (paused) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center"
        style={{ background: 'var(--background)' }}>
        <div className="rounded-2xl border p-10 max-w-sm w-full text-center flex flex-col items-center gap-6"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: 'var(--accent-light)' }}>
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"
              style={{ color: 'var(--accent)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--foreground)' }}>Test Paused</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {MODULE_LABELS[phase]} · Question {currentIndex + 1} of {questions.length}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Time remaining: <span className="font-mono font-semibold">{fmtTime(timeLeft)}</span>
            </p>
          </div>
          <button
            onClick={() => { setPaused(false); questionStartRef.current = Date.now() }}
            className="w-full py-3 rounded-xl font-semibold text-sm text-white"
            style={{ background: 'var(--accent)' }}>
            Resume Test →
          </button>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            You can close this tab and resume later from the Practice Tests page.
          </p>
        </div>
      </div>
    )
  }

  // ── Break screen ───────────────────────────────────────────────────────────
  if (phase === 'break') {
    const isUrgent = breakTimeLeft <= 60
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>Section Break</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Reading &amp; Writing complete. Math begins after the break.
          </p>
        </div>
        <div
          className="w-40 h-40 rounded-full flex flex-col items-center justify-center border-4 font-mono text-3xl font-bold"
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
        <div className="rounded-2xl border p-10 max-w-md w-full"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--foreground)' }}>Test Complete!</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Your results are ready.</p>
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
        <button onClick={() => router.push('/practice-test')} className="text-sm underline"
          style={{ color: 'var(--text-muted)' }}>
          Back to Practice Tests
        </button>
      </div>
    )
  }

  if (!currentQ) return null

  const isUrgentTimer  = timeLeft <= 5 * 60
  const answeredCount  = Object.values(answers).filter(a => a.selected).length

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--background)' }}>

      {/* ── Top bar ── */}
      <div className="flex-shrink-0 border-b px-4 sm:px-6 py-3"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="max-w-2xl mx-auto">
          {/* Row 1: module label + timer + pause */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                {MODULE_LABELS[phase]}
              </p>
              <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                Question {currentIndex + 1} of {questions.length}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Timer */}
              <div
                className="flex items-center gap-1.5 font-mono text-sm font-bold px-3 py-1.5 rounded-full"
                style={{
                  background: isUrgentTimer ? '#fef2f2' : 'var(--border)',
                  color:      isUrgentTimer ? '#dc2626'  : 'var(--foreground)',
                }}>
                ⏱ {fmtTime(timeLeft)}
              </div>

              {/* Pause button */}
              <button
                onClick={async () => { await saveProgress(); setPaused(true); questionStartRef.current = Date.now() }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'transparent' }}
                title="Pause test">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                </svg>
                Pause
              </button>
            </div>
          </div>

          {/* Row 2: progress dots */}
          <div className="flex items-center gap-1">
            {questions.map((q, i) => {
              const ans      = answers[q.id]
              const isCurrent  = i === currentIndex
              const isAnswered = !!ans?.selected
              const isFlagged  = !!ans?.flagged
              let bg = 'var(--border)'
              if (isCurrent)                    bg = 'var(--accent)'
              else if (isFlagged && isAnswered) bg = '#ca8a04'
              else if (isFlagged)               bg = '#fcd34d'
              else if (isAnswered)              bg = 'var(--accent)'
              return (
                <button
                  key={q.id}
                  onClick={() => navigate(i)}
                  className="flex-1 h-2 rounded-full transition-all"
                  style={{
                    background: bg,
                    opacity:    isCurrent ? 1 : isAnswered ? 0.55 : 0.25,
                    minWidth: 4, maxWidth: 40,
                  }}
                  title={`Q${i + 1}${isAnswered ? ' ✓' : ''}${isFlagged ? ' 🚩' : ''}`}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-4">

          {/* Question label row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold px-3 py-1 rounded-full"
                style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                Q{currentIndex + 1}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {currentQ.domain}{currentQ.skill ? ` · ${currentQ.skill}` : ''}
              </span>
            </div>

            {/* Flag button */}
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
          </div>

          {/* Question image */}
          {currentQ.question_image_url ? (
            <div className="rounded-2xl border overflow-hidden"
              style={{ borderColor: 'var(--border)', background: 'white' }}>
              <img
                src={currentQ.question_image_url}
                alt={`Question ${currentIndex + 1}`}
                style={{ display: 'block', width: '100%' }}
              />
            </div>
          ) : (
            <div className="rounded-2xl border p-6 text-center"
              style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Question image not available</p>
            </div>
          )}

          {/* Answer choices */}
          {isFR ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={freeText || currentAns?.selected || ''}
                  onChange={e => setFreeText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitFreeText() }}
                  placeholder="Type your answer (e.g. 5, 3/4, 0.75)"
                  className="flex-1 px-4 py-3 rounded-xl border text-sm outline-none"
                  style={{
                    borderColor: currentAns?.selected ? 'var(--accent)' : 'var(--border)',
                    background: 'var(--card)',
                    color: 'var(--foreground)',
                  }}
                />
                <button
                  onClick={submitFreeText}
                  disabled={!freeText.trim()}
                  className="px-5 py-3 rounded-xl text-sm font-medium text-white disabled:opacity-40"
                  style={{ background: 'var(--accent)' }}>
                  Save
                </button>
              </div>
              {currentAns?.selected && (
                <p className="text-xs" style={{ color: 'var(--accent)' }}>
                  Saved: {currentAns.selected}
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {CHOICES.map(choice => {
                const isSelected = currentAns?.selected === choice
                return (
                  <button
                    key={choice}
                    onClick={() => selectChoice(choice)}
                    className="flex items-center gap-3 px-5 py-4 rounded-xl border text-base font-medium transition-all hover:shadow-sm"
                    style={{
                      background:  isSelected ? 'var(--accent-light)' : 'var(--card)',
                      borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                      color:       isSelected ? 'var(--accent)' : 'var(--foreground)',
                    }}>
                    <span
                      className="w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{
                        borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                        color:       isSelected ? 'var(--accent)' : 'var(--foreground)',
                      }}>
                      {choice}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Answered indicator */}
          {currentAns?.selected && (
            <p className="text-xs text-center" style={{ color: '#16a34a' }}>
              ✓ Answered — you can change your selection before submitting
            </p>
          )}

        </div>
      </div>

      {/* ── Bottom bar: prev / next / submit ── */}
      <div className="flex-shrink-0 border-t px-4 sm:px-6 py-4"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={() => currentIndex > 0 && navigate(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="px-5 py-2.5 rounded-xl border text-sm font-medium disabled:opacity-30"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
            ← Previous
          </button>

          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {answeredCount} / {questions.length} answered
          </span>

          {isLastQ ? (
            <button
              onClick={() => handleSubmitModule(false)}
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-60"
              style={{ background: '#16a34a' }}>
              {submitting ? 'Submitting…' : 'Submit Section ✓'}
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
