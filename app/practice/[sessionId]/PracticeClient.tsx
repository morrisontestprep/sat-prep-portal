'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { isFreeResponse } from '@/utils/grading'
import type { PracticeQuestion, PracticeSession } from './page'

// ─── Types ────────────────────────────────────────────────────────────────────

type ExistingAnswer = {
  question_id: string
  selected_answer: string | null
  is_correct: boolean
  time_spent_seconds: number | null
  answered_at: string
}

type LocalAnswer = {
  selected: string
  isCorrect: boolean
  timeTaken: number
}

type Props = {
  session:         PracticeSession
  questions:       PracticeQuestion[]
  existingAnswers: ExistingAnswer[]
}

const CHOICES = ['A', 'B', 'C', 'D'] as const

function difficultyColor(d: string) {
  if (d === 'Easy')   return { bg: '#f0fdf4', color: '#16a34a' }
  if (d === 'Medium') return { bg: '#fffbeb', color: '#d97706' }
  if (d === 'Hard')   return { bg: '#fef2f2', color: '#dc2626' }
  return { bg: 'var(--border)', color: 'var(--text-muted)' }
}

function subjectColor(s: string) {
  return s === 'math'
    ? { bg: '#eff6ff', color: '#1d4ed8' }
    : { bg: '#fdf4ff', color: '#7e22ce' }
}

// ─── PracticeClient ───────────────────────────────────────────────────────────

export default function PracticeClient({ session, questions, existingAnswers }: Props) {
  const router = useRouter()

  // Build initial answers map from existing (resumed session)
  const buildInitial = (): Record<string, LocalAnswer> => {
    const map: Record<string, LocalAnswer> = {}
    for (const a of existingAnswers) {
      if (a.selected_answer) {
        map[a.question_id] = {
          selected:  a.selected_answer,
          isCorrect: a.is_correct,
          timeTaken: a.time_spent_seconds ?? 0,
        }
      }
    }
    return map
  }

  const [answers,       setAnswers]       = useState<Record<string, LocalAnswer>>(buildInitial)
  const [currentIndex,  setCurrentIndex]  = useState(() => {
    // Start where we left off (first unanswered question)
    const answered = new Set(existingAnswers.map(a => a.question_id))
    const first = questions.findIndex(q => !answered.has(q.id))
    return first === -1 ? questions.length - 1 : first
  })
  const [showAnswer,    setShowAnswer]    = useState(false)
  const [freeText,      setFreeText]      = useState('')
  const [completing,    setCompleting]    = useState(false)
  const [phase,         setPhase]         = useState<'practice' | 'done'>(
    existingAnswers.length === questions.length ? 'done' : 'practice'
  )

  const timerRef   = useRef<Record<string, number>>({})
  const startedAt  = useRef<number>(Date.now())

  // Start timing when question changes
  useEffect(() => {
    startedAt.current = Date.now()
  }, [currentIndex])

  const currentQ = questions[currentIndex]
  const alreadyAnswered = currentQ ? !!answers[currentQ.id] : false
  const isFR = currentQ ? isFreeResponse(currentQ.correct_answer) : false

  const handleAnswer = useCallback(async (choice: string) => {
    if (!currentQ || alreadyAnswered) return

    const timeTaken = (Date.now() - startedAt.current) / 1000
    timerRef.current[currentQ.id] = timeTaken

    const isCorrect = isFR
      ? choice.trim().toUpperCase() === currentQ.correct_answer.trim().toUpperCase()
      : choice.trim().toUpperCase() === currentQ.correct_answer.trim().toUpperCase()

    const local: LocalAnswer = { selected: choice, isCorrect, timeTaken }
    setAnswers(prev => ({ ...prev, [currentQ.id]: local }))
    setShowAnswer(true)

    // Save to API (non-blocking)
    fetch('/api/practice/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId:        session.id,
        questionId:       currentQ.id,
        selectedAnswer:   choice,
        correctAnswer:    currentQ.correct_answer,
        timeSpentSeconds: timeTaken,
      }),
    }).catch(console.error)
  }, [currentQ, alreadyAnswered, isFR, session.id])

  const handleNext = useCallback(() => {
    setShowAnswer(false)
    setFreeText('')
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(i => i + 1)
    } else {
      // All done — complete the session
      setCompleting(true)
      fetch('/api/practice/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      }).finally(() => {
        setCompleting(false)
        setPhase('done')
      })
    }
  }, [currentIndex, questions.length, session.id])

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const totalCorrect = Object.values(answers).filter(a => a.isCorrect).length
    const total        = questions.length
    const score        = Math.round((totalCorrect / total) * 100)

    const scoreColor = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626'

    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border p-8 text-center" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-bold text-white"
            style={{ background: scoreColor }}>
            {score}%
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--foreground)' }}>
            Practice Complete!
          </h1>
          <p className="text-base" style={{ color: 'var(--text-muted)' }}>
            {totalCorrect} / {total} correct
          </p>
          {session.subject_filter && (
            <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
              {[session.subject_filter, session.domain_filter, session.skill_filter]
                .filter(Boolean).join(' → ')}
            </p>
          )}
        </div>

        {/* Per-question recap */}
        <div className="space-y-3">
          {questions.map((q, i) => {
            const ans       = answers[q.id]
            const isCorrect = ans?.isCorrect
            const diff      = difficultyColor(q.difficulty)
            const subj      = subjectColor(q.subject)

            return (
              <div
                key={q.id}
                className="rounded-2xl border overflow-hidden"
                style={{ background: 'var(--card)', borderColor: isCorrect ? '#bbf7d0' : '#fecaca' }}>
                {/* Header */}
                <div
                  className="px-4 py-2.5 flex items-center gap-2 text-xs flex-wrap border-b"
                  style={{
                    background:  isCorrect ? '#f0fdf4' : '#fef2f2',
                    borderColor: isCorrect ? '#bbf7d0' : '#fecaca',
                  }}>
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-white text-xs flex-shrink-0"
                    style={{ background: isCorrect ? '#16a34a' : '#dc2626' }}>
                    {i + 1}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                    style={subj}>
                    {q.subject === 'math' ? 'Math' : 'English'}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{q.domain}</span>
                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                  <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{q.skill}</span>
                  <span
                    className="px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                    style={diff}>
                    {q.difficulty}
                  </span>
                </div>
                {/* Question image */}
                {q.question_image_url && (
                  <div className="px-4 pt-3 pb-2">
                    <img src={q.question_image_url} alt="Question" className="w-full rounded-lg" />
                  </div>
                )}
                {/* Answer row */}
                <div className="px-4 pb-3 flex items-center gap-3 text-sm">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>You:</span>
                  <span
                    className="font-semibold px-2 py-0.5 rounded"
                    style={{
                      background: isCorrect ? '#f0fdf4' : '#fef2f2',
                      color: isCorrect ? '#16a34a' : '#dc2626',
                    }}>
                    {ans?.selected ?? '—'}
                  </span>
                  {!isCorrect && ans && (
                    <>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Correct:</span>
                      <span className="font-semibold px-2 py-0.5 rounded" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                        {q.correct_answer}
                      </span>
                    </>
                  )}
                  {ans?.timeTaken && (
                    <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
                      ⏱ {ans.timeTaken.toFixed(1)}s
                    </span>
                  )}
                </div>
                {/* Explanation */}
                {q.answer_image_url && !isCorrect && (
                  <details className="px-4 pb-3 border-t" style={{ borderColor: 'var(--border)' }}>
                    <summary className="text-xs cursor-pointer pt-3" style={{ color: 'var(--accent)' }}>
                      Show explanation
                    </summary>
                    <img src={q.answer_image_url} alt="Explanation" className="w-full rounded-lg mt-2" />
                  </details>
                )}
              </div>
            )
          })}
        </div>

        {/* Back button */}
        <button
          onClick={() => router.push('/my-analytics')}
          className="px-6 py-3 rounded-xl font-semibold text-sm text-white self-start"
          style={{ background: 'var(--accent)' }}>
          ← Back to Analytics
        </button>
      </div>
    )
  }

  // ── Practice screen ─────────────────────────────────────────────────────────
  if (!currentQ) return null

  const answeredCount = Object.keys(answers).length
  const progress      = (answeredCount / questions.length) * 100
  const currentAns    = answers[currentQ.id]
  const isCorrect     = currentAns?.isCorrect
  const diff          = difficultyColor(currentQ.difficulty)
  const subj          = subjectColor(currentQ.subject)

  return (
    <div className="flex flex-col gap-4">
      {/* Header: progress + title */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Practice Session</p>
          <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
            Question {currentIndex + 1} of {questions.length}
          </p>
        </div>
        {session.subject_filter && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {[session.subject_filter, session.domain_filter, session.skill_filter]
              .filter(Boolean).join(' → ')}
          </p>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${progress}%`, background: 'var(--accent)' }}
        />
      </div>

      {/* Question card */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background:  'var(--card)',
          borderColor: alreadyAnswered
            ? (isCorrect ? '#bbf7d0' : '#fecaca')
            : 'var(--border)',
        }}>
        {/* Question meta */}
        <div
          className="px-4 py-2.5 flex items-center gap-2 text-xs flex-wrap border-b"
          style={{
            background: alreadyAnswered
              ? (isCorrect ? '#f0fdf4' : '#fef2f2')
              : 'var(--card)',
            borderColor: alreadyAnswered
              ? (isCorrect ? '#bbf7d0' : '#fecaca')
              : 'var(--border)',
          }}>
          <span
            className="px-2 py-0.5 rounded-full font-medium"
            style={subj}>
            {currentQ.subject === 'math' ? 'Math' : 'English'}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>{currentQ.domain}</span>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{currentQ.skill}</span>
          <span className="px-2 py-0.5 rounded-full font-medium" style={diff}>
            {currentQ.difficulty || 'Unrated'}
          </span>
        </div>

        {/* Question image */}
        {currentQ.question_image_url && (
          <div className="px-4 pt-4 pb-3">
            <img src={currentQ.question_image_url} alt="Question" className="w-full rounded-lg" />
          </div>
        )}

        {/* Answer choices */}
        <div className="px-4 pb-4 space-y-2">
          {isFR ? (
            // Free response
            <div>
              <input
                type="text"
                value={freeText}
                onChange={e => setFreeText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && freeText.trim()) handleAnswer(freeText.trim()) }}
                disabled={alreadyAnswered}
                placeholder="Type your answer…"
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--background)',
                  color: 'var(--foreground)',
                }}
              />
              {!alreadyAnswered && (
                <button
                  onClick={() => freeText.trim() && handleAnswer(freeText.trim())}
                  className="mt-2 px-4 py-2 rounded-xl text-sm font-medium text-white"
                  style={{ background: 'var(--accent)' }}>
                  Submit
                </button>
              )}
            </div>
          ) : (
            CHOICES.map(choice => {
              const isSelected = currentAns?.selected === choice
              const isRight    = choice === currentQ.correct_answer
              let bg = 'transparent', border = 'var(--border)', color = 'var(--foreground)'

              if (alreadyAnswered) {
                if (isRight)     { bg = '#f0fdf4'; border = '#16a34a'; color = '#16a34a' }
                else if (isSelected && !isRight) { bg = '#fef2f2'; border = '#dc2626'; color = '#dc2626' }
              } else {
                // Hover state handled by Tailwind
              }

              return (
                <button
                  key={choice}
                  onClick={() => handleAnswer(choice)}
                  disabled={alreadyAnswered}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm text-left font-medium transition-all disabled:cursor-default"
                  style={{ background: bg, borderColor: border, color }}>
                  <span
                    className="w-7 h-7 rounded-full border-2 flex items-center justify-center font-bold text-xs flex-shrink-0"
                    style={{ borderColor: border, color }}>
                    {choice}
                  </span>
                  {alreadyAnswered && isRight && (
                    <span className="text-xs">✓ Correct</span>
                  )}
                  {alreadyAnswered && isSelected && !isRight && (
                    <span className="text-xs">✗ Your answer</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Feedback + explanation (after answering) */}
        {alreadyAnswered && (
          <div className="border-t px-4 py-4" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-semibold mb-2" style={{ color: isCorrect ? '#16a34a' : '#dc2626' }}>
              {isCorrect ? '✓ Correct!' : `✗ Correct answer: ${currentQ.correct_answer}`}
            </p>
            {currentQ.answer_image_url && (
              <details>
                <summary className="text-xs cursor-pointer mb-2" style={{ color: 'var(--accent)' }}>
                  Show explanation
                </summary>
                <img src={currentQ.answer_image_url} alt="Explanation" className="w-full rounded-lg" />
              </details>
            )}
          </div>
        )}
      </div>

      {/* Next button (only shown after answering) */}
      {(alreadyAnswered || showAnswer) && (
        <button
          onClick={handleNext}
          disabled={completing}
          className="px-6 py-3 rounded-xl font-semibold text-sm text-white self-end transition-opacity disabled:opacity-60"
          style={{ background: 'var(--accent)' }}>
          {completing
            ? 'Saving…'
            : currentIndex < questions.length - 1
              ? 'Next Question →'
              : 'Finish Practice ✓'
          }
        </button>
      )}

      {/* Nav: prev / next question dots */}
      <div className="flex items-center gap-1.5 flex-wrap mt-1">
        {questions.map((q, i) => {
          const ans = answers[q.id]
          return (
            <button
              key={q.id}
              onClick={() => { setCurrentIndex(i); setShowAnswer(false); setFreeText('') }}
              className="w-6 h-6 rounded-full text-xs font-bold transition-all border"
              style={{
                background: i === currentIndex
                  ? 'var(--accent)'
                  : ans
                    ? (ans.isCorrect ? '#16a34a' : '#dc2626')
                    : 'var(--border)',
                borderColor: i === currentIndex ? 'var(--accent)' : 'transparent',
                color: (i === currentIndex || ans) ? 'white' : 'var(--text-muted)',
              }}>
              {i + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}
