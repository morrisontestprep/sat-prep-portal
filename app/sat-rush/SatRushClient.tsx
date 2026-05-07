'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import DesmosCalculator from '@/components/DesmosCalculator'
import FormulasButton from '@/components/FormulasButton'
import { isFreeResponse } from '@/utils/grading'

// ─── Types ────────────────────────────────────────────────────────────────────

type Question = {
  id: string
  subject: string
  domain: string
  skill: string
  difficulty: string
  correct_answer: string
  question_image_url: string
  answer_image_url: string
}

type AnswerRecord = {
  questionId: string
  question: Question
  selectedAnswer: string | null
  isCorrect: boolean
  withinTimeLimit: boolean
  timeTaken: number
  pointsEarned: number
  bonusPoints: number
  order: number
}

type GameSettings = {
  totalDuration: number       // seconds
  timePerQuestion: number     // seconds
  subjects: string[]
  domains: string[]
  skills: string[]
  difficulties: string[]
}

type PastGame = {
  id: string
  created_at: string
  total_score: number
  questions_attempted: number
  questions_correct: number
  questions_incorrect: number
  ended_reason: string
  total_duration_seconds: number
  time_per_question_seconds: number
  subject_filter: string[] | null
  domain_filter: string[] | null
  skill_filter: string[] | null
  difficulty_filter: string[] | null
}

type Phase = 'setup' | 'game' | 'results'

// ─── Constants ────────────────────────────────────────────────────────────────

const MATH_DOMAINS = [
  'Algebra',
  'Advanced Math',
  'Geometry and Trigonometry',
  'Problem-Solving and Data Analysis',
]
const ENGLISH_DOMAINS = [
  'Craft and Structure',
  'Information and Ideas',
  'Standard English Conventions',
  'Expression of Ideas',
]
const DIFFICULTIES = ['Easy', 'Medium', 'Hard']
const LIVES = 3

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// Helper: compare two string arrays regardless of order
function arraysMatch(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const sa = [...(a ?? [])].sort()
  const sb = [...(b ?? [])].sort()
  return sa.length === sb.length && sa.every((v, i) => v === sb[i])
}

function getHighScore(settings: GameSettings, pastGames: PastGame[]): number | null {
  const matching = pastGames.filter(g =>
    g.total_duration_seconds    === settings.totalDuration &&
    g.time_per_question_seconds === settings.timePerQuestion &&
    arraysMatch(g.subject_filter,    settings.subjects.length    > 0 ? settings.subjects    : null) &&
    arraysMatch(g.domain_filter,     settings.domains.length     > 0 ? settings.domains     : null) &&
    arraysMatch(g.skill_filter,      settings.skills.length      > 0 ? settings.skills      : null) &&
    arraysMatch(g.difficulty_filter, settings.difficulties.length > 0 ? settings.difficulties : null)
  )
  if (matching.length === 0) return null
  return Math.max(...matching.map(g => g.total_score))
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function diffColor(d: string | null | undefined) {
  if (d === 'Easy')   return { bg: '#f0fdf4', color: '#15803d' }
  if (d === 'Medium') return { bg: '#fffbeb', color: '#b45309' }
  if (d === 'Hard')   return { bg: '#fef2f2', color: '#b91c1c' }
  return { bg: '#f3f4f6', color: '#6b7280' }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SatRushClient() {
  const [phase, setPhase] = useState<Phase>('setup')
  const [settings, setSettings] = useState<GameSettings>({
    totalDuration: 15 * 60,
    timePerQuestion: 75,
    subjects: [],
    domains: [],
    skills: [],
    difficulties: [],
  })

  // ── Setup state ────────────────────────────────────────────────────────────
  const [availableSkills, setAvailableSkills]   = useState<string[]>([])
  const [availableCount, setAvailableCount]     = useState<number | null>(null)
  const [loadingCount, setLoadingCount]         = useState(false)
  const [pastGames, setPastGames]               = useState<PastGame[]>([])
  const [loadingHistory, setLoadingHistory]     = useState(true)
  const [startingGame, setStartingGame]         = useState(false)

  // ── Game state ─────────────────────────────────────────────────────────────
  const [gameId, setGameId]                     = useState<string>('')
  const [questions, setQuestions]               = useState<Question[]>([])
  const [currentIdx, setCurrentIdx]             = useState(0)
  const [answers, setAnswers]                   = useState<AnswerRecord[]>([])
  const [livesLeft, setLivesLeft]               = useState(LIVES)
  const [streak, setStreak]                     = useState(0)
  const [totalScore, setTotalScore]             = useState(0)
  const [selectedAnswer, setSelectedAnswer]     = useState<string>('')
  const [freeAnswer, setFreeAnswer]             = useState<string>('')
  const [feedback, setFeedback]                 = useState<{ isCorrect: boolean; points: number; bonus: number } | null>(null)
  const [submitting, setSubmitting]             = useState(false)
  const [gameEnded, setGameEnded]               = useState(false)
  const [endReason, setEndReason]               = useState<string>('')

  // Timers
  const [totalTimeLeft, setTotalTimeLeft]       = useState(0)
  const [questionTimeLeft, setQuestionTimeLeft] = useState(0)
  const questionStartRef                        = useRef<number>(Date.now())
  const totalTimerRef                           = useRef<ReturnType<typeof setInterval> | null>(null)
  const questionTimerRef                        = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Load history on mount ─────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/sat-rush/history')
      .then(r => r.json())
      .then(d => { setPastGames(d.games ?? []); setLoadingHistory(false) })
      .catch(() => setLoadingHistory(false))
  }, [phase]) // reload when returning to setup

  // ─── Load available skills when subject/domain changes ────────────────────
  useEffect(() => {
    if (settings.subjects.length === 0 && settings.domains.length === 0) {
      setAvailableSkills([])
      return
    }
    const params = new URLSearchParams()
    if (settings.subjects.length === 1) params.set('subject', settings.subjects[0])
    if (settings.domains.length  === 1) params.set('domain',  settings.domains[0])
    fetch(`/api/sat-rush/skills?${params}`)
      .then(r => r.json())
      .then(d => setAvailableSkills(d.skills ?? []))
  }, [settings.subjects.join(','), settings.domains.join(',')])

  // ─── Debounced available count fetch ──────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoadingCount(true)
      const res = await fetch('/api/sat-rush/available-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects:     settings.subjects.length     > 0 ? settings.subjects     : null,
          domains:      settings.domains.length      > 0 ? settings.domains      : null,
          skills:       settings.skills.length       > 0 ? settings.skills       : null,
          difficulties: settings.difficulties.length > 0 ? settings.difficulties : null,
        }),
      })
      const d = await res.json()
      setAvailableCount(d.count ?? null)
      setLoadingCount(false)
    }, 400)
    return () => clearTimeout(t)
  }, [
    settings.subjects.join(','),
    settings.domains.join(','),
    settings.skills.join(','),
    settings.difficulties.join(','),
  ])

  // ─── Timer management ─────────────────────────────────────────────────────
  const stopTimers = useCallback(() => {
    if (totalTimerRef.current)    clearInterval(totalTimerRef.current)
    if (questionTimerRef.current) clearInterval(questionTimerRef.current)
    totalTimerRef.current    = null
    questionTimerRef.current = null
  }, [])

  const startQuestionTimer = useCallback(() => {
    if (questionTimerRef.current) clearInterval(questionTimerRef.current)
    questionStartRef.current = Date.now()
    setQuestionTimeLeft(settings.timePerQuestion)
    // Timer counts below zero — no auto-submit. Student can still answer for 1 pt.
    questionTimerRef.current = setInterval(() => {
      setQuestionTimeLeft(prev => prev - 0.1)
    }, 100)
  }, [settings.timePerQuestion])

  // ─── End game ─────────────────────────────────────────────────────────────
  const endGame = useCallback(async (reason: string, gId: string) => {
    stopTimers()
    setGameEnded(true)
    setEndReason(reason)
    await fetch('/api/sat-rush/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gId, reason }),
    })
    // Small delay for final feedback to show, then go to results
    setTimeout(() => setPhase('results'), 1200)
  }, [stopTimers])

  // Total timer — ends the game at 0
  const startTotalTimer = useCallback((duration: number, gId: string) => {
    if (totalTimerRef.current) clearInterval(totalTimerRef.current)
    setTotalTimeLeft(duration)
    totalTimerRef.current = setInterval(() => {
      setTotalTimeLeft(prev => {
        const next = prev - 0.1
        if (next <= 0) {
          endGame('time_up', gId)
          return 0
        }
        return next
      })
    }, 100)
  }, [endGame])

  useEffect(() => () => stopTimers(), [stopTimers])

  // ─── Start game ────────────────────────────────────────────────────────────
  const handleStart = async (overrideSettings?: GameSettings) => {
    const s = overrideSettings ?? settings
    setStartingGame(true)
    const res = await fetch('/api/sat-rush/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalDuration:   s.totalDuration,
        timePerQuestion: s.timePerQuestion,
        subjects:     s.subjects.length     > 0 ? s.subjects     : null,
        domains:      s.domains.length      > 0 ? s.domains      : null,
        skills:       s.skills.length       > 0 ? s.skills       : null,
        difficulties: s.difficulties.length > 0 ? s.difficulties : null,
      }),
    })
    const d = await res.json()
    setStartingGame(false)
    if (d.error || !d.questions?.length) return alert(d.error ?? 'No questions available.')

    setGameId(d.gameId)
    setQuestions(d.questions)
    setCurrentIdx(0)
    setAnswers([])
    setLivesLeft(LIVES)
    setStreak(0)
    setTotalScore(0)
    setSelectedAnswer('')
    setFreeAnswer('')
    setFeedback(null)
    setGameEnded(false)
    setEndReason('')
    setPhase('game')

    // Start timers
    startTotalTimer(s.totalDuration, d.gameId)
    startQuestionTimer()
  }

  // ─── Submit answer ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submitting || gameEnded || feedback) return
    const q = questions[currentIdx]
    if (!q) return

    const answer = isFreeResponse(q.correct_answer) ? freeAnswer : selectedAnswer
    if (!answer) return // nothing selected yet

    setSubmitting(true)
    if (questionTimerRef.current) clearInterval(questionTimerRef.current)
    const timeTaken = (Date.now() - questionStartRef.current) / 1000

    const res = await fetch('/api/sat-rush/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId,
        questionId:        q.id,
        questionOrder:     currentIdx,
        selectedAnswer:    answer || null,
        correctAnswer:     q.correct_answer,
        timeTakenSeconds:  timeTaken,
        timePerQuestion:   settings.timePerQuestion,
        currentStreak:     streak,
      }),
    })
    const result = await res.json()

    const record: AnswerRecord = {
      questionId:      q.id,
      question:        q,
      selectedAnswer:  answer || null,
      isCorrect:       result.isCorrect,
      withinTimeLimit: result.withinTimeLimit,
      timeTaken,
      pointsEarned:    result.pointsEarned,
      bonusPoints:     result.bonusPoints,
      order:           currentIdx,
    }

    setAnswers(prev => [...prev, record])
    setTotalScore(prev => prev + result.pointsEarned)
    setStreak(result.newStreak)
    setFeedback({ isCorrect: result.isCorrect, points: result.basePoints, bonus: result.bonusPoints })
    setSubmitting(false)

    if (!result.isCorrect) {
      const newLives = livesLeft - 1
      setLivesLeft(newLives)
      if (newLives <= 0) {
        endGame('three_wrong', gameId)
        return
      }
    }

    // Advance after 1.5s
    setTimeout(() => {
      setFeedback(null)
      setSelectedAnswer('')
      setFreeAnswer('')

      if (gameEnded) return
      if (currentIdx + 1 >= questions.length) {
        endGame('completed', gameId)
        return
      }
      setCurrentIdx(prev => prev + 1)
      startQuestionTimer()
    }, 1500)
  }, [
    submitting, gameEnded, feedback, questions, currentIdx,
    freeAnswer, selectedAnswer, gameId, settings.timePerQuestion,
    streak, answers, livesLeft, endGame, startQuestionTimer,
  ])

  // (No auto-submit on question timer expiry — student stays on the question for 1 pt)

  // ─── Replay a past game ────────────────────────────────────────────────────
  const handleReplay = (game: PastGame) => {
    const s: GameSettings = {
      totalDuration:   game.total_duration_seconds,
      timePerQuestion: game.time_per_question_seconds,
      subjects:        game.subject_filter    ?? [],
      domains:         game.domain_filter     ?? [],
      skills:          game.skill_filter      ?? [],
      difficulties:    game.difficulty_filter ?? [],
    }
    setSettings(s)
    handleStart(s)
  }

  // ─── Helpers for setup toggles ─────────────────────────────────────────────
  function toggle<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]
  }
  function toggleSetting(key: keyof GameSettings, val: string) {
    setSettings(prev => ({
      ...prev,
      [key]: toggle(prev[key] as string[], val),
      // Clear skills if subjects/domains change
      ...(key === 'subjects' ? { skills: [] } : {}),
      ...(key === 'domains'  ? { skills: [] } : {}),
    }))
  }

  const domains = settings.subjects.includes('math') && !settings.subjects.includes('english')
    ? MATH_DOMAINS
    : settings.subjects.includes('english') && !settings.subjects.includes('math')
    ? ENGLISH_DOMAINS
    : [...MATH_DOMAINS, ...ENGLISH_DOMAINS]

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════════

  if (phase === 'setup') return <SetupScreen
    settings={settings} setSettings={setSettings}
    domains={domains} availableSkills={availableSkills}
    availableCount={availableCount} loadingCount={loadingCount}
    pastGames={pastGames} loadingHistory={loadingHistory}
    startingGame={startingGame}
    onStart={() => handleStart()} onReplay={handleReplay}
    toggleSetting={toggleSetting}
  />

  if (phase === 'game') return <GameScreen
    questions={questions} currentIdx={currentIdx}
    answers={answers} livesLeft={livesLeft} streak={streak}
    totalScore={totalScore} totalTimeLeft={totalTimeLeft}
    questionTimeLeft={questionTimeLeft} timePerQuestion={settings.timePerQuestion}
    selectedAnswer={selectedAnswer} setSelectedAnswer={setSelectedAnswer}
    freeAnswer={freeAnswer} setFreeAnswer={setFreeAnswer}
    feedback={feedback} submitting={submitting} gameEnded={gameEnded}
    onSubmit={() => handleSubmit()}
  />

  if (phase === 'results') return <ResultsScreen
    answers={answers} totalScore={totalScore}
    settings={settings} endReason={endReason}
    onNewGame={() => { setPhase('setup') }}
    onReplay={() => handleStart()}
  />

  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// SETUP SCREEN
// ══════════════════════════════════════════════════════════════════════════════

function SetupScreen({
  settings, setSettings, domains, availableSkills,
  availableCount, loadingCount, pastGames, loadingHistory,
  startingGame, onStart, onReplay, toggleSetting,
}: {
  settings: GameSettings
  setSettings: React.Dispatch<React.SetStateAction<GameSettings>>
  domains: string[]
  availableSkills: string[]
  availableCount: number | null
  loadingCount: boolean
  pastGames: PastGame[]
  loadingHistory: boolean
  startingGame: boolean
  onStart: () => void
  onReplay: (g: PastGame) => void
  toggleSetting: (key: keyof GameSettings, val: string) => void
}) {
  const totalMins  = Math.round(settings.totalDuration / 60)
  const tpqSecs    = settings.timePerQuestion
  const highScore  = getHighScore(settings, pastGames)

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--background)' }}>
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="text-3xl">⚡</span>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>SAT Rush</h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Race against the clock. 3 wrong answers and it's over.
          </p>
        </div>

        <div className="space-y-6">

          {/* ── Game Duration ──────────────────────────────────────────────── */}
          <section className="rounded-xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
              Game Duration
            </h2>
            <div className="flex items-center gap-4">
              <input
                type="range" min={5} max={30} step={1}
                value={totalMins}
                onChange={e => setSettings(s => ({ ...s, totalDuration: +e.target.value * 60 }))}
                className="flex-1 accent-[var(--accent)]"
              />
              <span className="text-lg font-bold w-20 text-right tabular-nums" style={{ color: 'var(--accent)' }}>
                {totalMins} min
              </span>
            </div>
            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              <span>5 min</span><span>30 min</span>
            </div>
          </section>

          {/* ── Time Per Question ──────────────────────────────────────────── */}
          <section className="rounded-xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
              Target Time Per Question
            </h2>
            <div className="flex items-center gap-4">
              <input
                type="range" min={10} max={180} step={5}
                value={tpqSecs}
                onChange={e => setSettings(s => ({ ...s, timePerQuestion: +e.target.value }))}
                className="flex-1 accent-[var(--accent)]"
              />
              <span className="text-lg font-bold w-20 text-right tabular-nums" style={{ color: 'var(--accent)' }}>
                {tpqSecs >= 60
                  ? `${Math.floor(tpqSecs / 60)}:${(tpqSecs % 60).toString().padStart(2, '0')}`
                  : `${tpqSecs}s`}
              </span>
            </div>
            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              <span>10 sec</span><span>3 min</span>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              Answer within this time for full points (2 pts). After = 1 pt. No answer = 0 pts.
            </p>
          </section>

          {/* ── Subjects ──────────────────────────────────────────────────── */}
          <section className="rounded-xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
              Subject <span className="font-normal text-xs" style={{ color: 'var(--text-muted)' }}>(select any, or leave blank for all)</span>
            </h2>
            <div className="flex gap-2 flex-wrap">
              {[
                { val: 'math', label: 'Math' },
                { val: 'english', label: 'English' },
              ].map(({ val, label }) => {
                const on = settings.subjects.includes(val)
                return (
                  <button key={val} onClick={() => toggleSetting('subjects', val)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: on ? 'var(--accent)' : 'var(--background)',
                      color: on ? 'white' : 'var(--text-muted)',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                    }}>
                    {label}
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── Domains ──────────────────────────────────────────────────────── */}
          <section className="rounded-xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
              Domain <span className="font-normal text-xs" style={{ color: 'var(--text-muted)' }}>(optional — multiselect)</span>
            </h2>
            <div className="flex gap-2 flex-wrap">
              {domains.map(d => {
                const on = settings.domains.includes(d)
                return (
                  <button key={d} onClick={() => toggleSetting('domains', d)}
                    className="px-3 py-1.5 rounded-lg text-sm transition-all"
                    style={{
                      background: on ? 'var(--accent-light)' : 'var(--background)',
                      color: on ? 'var(--accent)' : 'var(--text-muted)',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                      fontWeight: on ? '600' : '400',
                    }}>
                    {d}
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── Skills ──────────────────────────────────────────────────────── */}
          {availableSkills.length > 0 && (
            <section className="rounded-xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
                Skill <span className="font-normal text-xs" style={{ color: 'var(--text-muted)' }}>(optional — multiselect)</span>
              </h2>
              <div className="flex gap-2 flex-wrap">
                {availableSkills.map(sk => {
                  const on = settings.skills.includes(sk)
                  return (
                    <button key={sk} onClick={() => toggleSetting('skills', sk)}
                      className="px-3 py-1.5 rounded-lg text-sm transition-all"
                      style={{
                        background: on ? 'var(--accent-light)' : 'var(--background)',
                        color: on ? 'var(--accent)' : 'var(--text-muted)',
                        border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                        fontWeight: on ? '600' : '400',
                      }}>
                      {sk}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── Difficulty ────────────────────────────────────────────────── */}
          <section className="rounded-xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
              Difficulty <span className="font-normal text-xs" style={{ color: 'var(--text-muted)' }}>(optional — multiselect)</span>
            </h2>
            <div className="flex gap-2 flex-wrap">
              {DIFFICULTIES.map(d => {
                const on = settings.difficulties.includes(d)
                const { bg, color } = diffColor(d)
                return (
                  <button key={d} onClick={() => toggleSetting('difficulties', d)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: on ? bg : 'var(--background)',
                      color: on ? color : 'var(--text-muted)',
                      border: `1px solid ${on ? color : 'var(--border)'}`,
                      opacity: on ? 1 : 0.8,
                    }}>
                    {d}
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── Available question count + High score + Start ─────────────── */}
          <div className="space-y-3">
            {/* Question count row */}
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {loadingCount
                ? 'Counting questions…'
                : availableCount !== null
                ? <span>
                    <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{availableCount}</span>
                    {' '}unseen question{availableCount !== 1 ? 's' : ''} available
                    {availableCount < 5 && availableCount > 0 && (
                      <span className="ml-2 text-xs" style={{ color: '#b45309' }}>⚠ Very few — repeats likely</span>
                    )}
                    {availableCount === 0 && (
                      <span className="ml-2 text-xs" style={{ color: '#b91c1c' }}>All questions seen — will repeat</span>
                    )}
                  </span>
                : 'All questions available'}
            </div>

            {/* High score badge */}
            {highScore !== null && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
                style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                <span className="text-lg">🏆</span>
                <span className="text-sm font-medium" style={{ color: '#92400e' }}>
                  Your high score for this game type is{' '}
                  <span className="font-bold text-base" style={{ color: '#b45309' }}>{highScore} pts</span>
                  {' '}— can you beat it?
                </span>
              </div>
            )}

            {/* Start button */}
            <div className="flex justify-end">
              <button
                onClick={onStart}
                disabled={startingGame}
                className="px-8 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: 'var(--accent)', color: 'white' }}>
                {startingGame ? 'Starting…' : '⚡ Start Rush'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Past Games ────────────────────────────────────────────────────── */}
        {!loadingHistory && pastGames.length > 0 && (
          <div className="mt-10">
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>
              Past Games
            </h2>
            <div className="space-y-2">
              {pastGames.map(g => (
                <div key={g.id}
                  className="rounded-xl p-4 flex items-center justify-between gap-4"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                        {g.total_score} pts
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {g.questions_correct}/{g.questions_attempted} correct
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--background)', color: 'var(--text-muted)' }}>
                        {g.ended_reason === 'three_wrong' ? '💀 3 wrong' :
                         g.ended_reason === 'time_up'    ? '⏱ Time up' : '✓ Finished'}
                      </span>
                    </div>
                    <div className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
                      {Math.round(g.total_duration_seconds / 60)}min · {g.time_per_question_seconds}s/q
                      {g.domain_filter?.length ? ` · ${g.domain_filter.join(', ')}` : ''}
                      {g.difficulty_filter?.length ? ` · ${g.difficulty_filter.join('/')}` : ''}
                      {' · '}{fmtDate(g.created_at)}
                    </div>
                  </div>
                  <button
                    onClick={() => onReplay(g)}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium flex-shrink-0 transition-colors"
                    style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                    Replay
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// GAME SCREEN
// ══════════════════════════════════════════════════════════════════════════════

const CHOICES = ['A', 'B', 'C', 'D'] as const

function GameScreen({
  questions, currentIdx, answers, livesLeft, streak,
  totalScore, totalTimeLeft, questionTimeLeft, timePerQuestion,
  selectedAnswer, setSelectedAnswer, freeAnswer, setFreeAnswer,
  feedback, submitting, gameEnded, onSubmit,
}: {
  questions: Question[]
  currentIdx: number
  answers: AnswerRecord[]
  livesLeft: number
  streak: number
  totalScore: number
  totalTimeLeft: number
  questionTimeLeft: number
  timePerQuestion: number
  selectedAnswer: string
  setSelectedAnswer: (v: string) => void
  freeAnswer: string
  setFreeAnswer: (v: string) => void
  feedback: { isCorrect: boolean; points: number; bonus: number } | null
  submitting: boolean
  gameEnded: boolean
  onSubmit: () => void
}) {
  const q = questions[currentIdx]
  if (!q) return null

  const isFR        = isFreeResponse(q.correct_answer)
  const isOvertime  = questionTimeLeft < 0
  const questionTimePct = Math.max(0, questionTimeLeft / timePerQuestion)
  const qTimerRed   = questionTimeLeft <= timePerQuestion * 0.25
  const tTimerYellow = totalTimeLeft < 120 // last 2 min

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--background)' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="border-b px-4 py-3 flex-shrink-0"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-4">

          {/* Per-question timer */}
          <div className="flex items-center gap-2 flex-1">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"
              style={{ color: qTimerRed ? '#b91c1c' : 'var(--text-muted)' }}>
              <circle cx="12" cy="12" r="10" strokeWidth="2"/>
              <polyline points="12 6 12 12 16 14" strokeWidth="2"/>
            </svg>
            <div className="flex-1 max-w-32">
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--background)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${questionTimePct * 100}%`,
                    background: isOvertime ? '#b91c1c' : qTimerRed ? '#ef4444' : questionTimePct < 0.5 ? '#f59e0b' : 'var(--accent)',
                    transition: 'width 0.1s linear',
                  }}
                />
              </div>
            </div>
            {isOvertime ? (
              <span className="text-xs font-bold tabular-nums w-16 animate-pulse" style={{ color: '#b91c1c' }}>
                OVERTIME
              </span>
            ) : (
              <span className="text-sm font-bold tabular-nums w-10"
                style={{ color: qTimerRed ? '#b91c1c' : 'var(--foreground)' }}>
                {fmtTime(questionTimeLeft)}
              </span>
            )}
          </div>

          {/* Lives */}
          <div className="flex gap-1">
            {Array.from({ length: LIVES }).map((_, i) => (
              <span key={i} className="text-lg">{i < livesLeft ? '❤️' : '🖤'}</span>
            ))}
          </div>

          {/* Score + streak */}
          <div className="text-right">
            <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
              {totalScore} pts
            </div>
            {streak >= 3 && (
              <div className="text-xs font-medium" style={{ color: '#f59e0b' }}>
                🔥 {streak} streak
              </div>
            )}
          </div>

          {/* Total timer */}
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"
              style={{ color: tTimerYellow ? '#f59e0b' : 'var(--text-muted)' }}>
              <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2"/>
              <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2"/>
              <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2"/>
              <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2"/>
            </svg>
            <span className="text-sm font-bold tabular-nums"
              style={{ color: tTimerYellow ? '#f59e0b' : 'var(--foreground)' }}>
              {fmtTime(totalTimeLeft)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Main area ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Question pane */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="max-w-2xl mx-auto">

            {/* Question meta */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: q.subject === 'math' ? '#eff6ff' : '#fdf4ff',
                         color: q.subject === 'math' ? '#1d4ed8' : '#7e22ce' }}>
                {q.subject === 'math' ? 'Math' : 'English'}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{q.domain}</span>
              {q.skill && (
                <span className="text-xs truncate max-w-40" style={{ color: 'var(--text-muted)' }}>· {q.skill}</span>
              )}
              {q.difficulty && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium ml-auto"
                  style={{ ...diffColor(q.difficulty), background: diffColor(q.difficulty).bg }}>
                  {q.difficulty}
                </span>
              )}
            </div>

            {/* Question image */}
            <div className="relative rounded-xl overflow-hidden mb-4 border"
              style={{ borderColor: 'var(--border)', background: 'white' }}>
              {q.question_image_url && (
                <Image
                  src={q.question_image_url}
                  alt="Question"
                  width={700} height={400}
                  className="w-full h-auto"
                  style={{ display: 'block' }}
                  priority
                />
              )}

              {/* Feedback overlay */}
              {feedback && (
                <div className="absolute inset-0 flex items-center justify-center"
                  style={{
                    background: feedback.isCorrect
                      ? 'rgba(20,184,166,0.15)'
                      : 'rgba(239,68,68,0.15)',
                  }}>
                  <div className="rounded-2xl px-8 py-5 text-center shadow-2xl"
                    style={{
                      background: feedback.isCorrect ? '#f0fdf4' : '#fef2f2',
                      border: `2px solid ${feedback.isCorrect ? '#22c55e' : '#ef4444'}`,
                    }}>
                    <div className="text-4xl mb-2">{feedback.isCorrect ? '✓' : '✗'}</div>
                    <div className="text-lg font-bold"
                      style={{ color: feedback.isCorrect ? '#15803d' : '#b91c1c' }}>
                      {feedback.isCorrect ? 'Correct!' : 'Incorrect'}
                    </div>
                    {feedback.points > 0 && (
                      <div className="text-sm mt-1 font-semibold" style={{ color: 'var(--accent)' }}>
                        +{feedback.points} pt{feedback.points !== 1 ? 's' : ''}
                        {feedback.bonus > 0 && (
                          <span style={{ color: '#f59e0b' }}> +{feedback.bonus} bonus 🔥</span>
                        )}
                      </div>
                    )}
                    {!feedback.isCorrect && (
                      <div className="text-xs mt-1" style={{ color: '#b91c1c' }}>
                        {livesLeft <= 0 ? 'Game over!' : `${livesLeft} life${livesLeft !== 1 ? 's' : ''} left`}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Answer choices */}
            {!feedback && (
              <>
                {isFR ? (
                  <div className="mb-4">
                    <input
                      type="text"
                      placeholder="Enter your answer…"
                      value={freeAnswer}
                      onChange={e => setFreeAnswer(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && onSubmit()}
                      autoFocus
                      className="w-full px-4 py-3 rounded-xl text-sm border focus:outline-none"
                      style={{
                        background: 'var(--card)',
                        borderColor: 'var(--border)',
                        color: 'var(--foreground)',
                      }}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {CHOICES.map(c => (
                      <button key={c}
                        onClick={() => setSelectedAnswer(c)}
                        className="px-4 py-3 rounded-xl text-sm font-medium text-left transition-all"
                        style={{
                          background: selectedAnswer === c ? 'var(--accent)' : 'var(--card)',
                          color: selectedAnswer === c ? 'white' : 'var(--foreground)',
                          border: `1px solid ${selectedAnswer === c ? 'var(--accent)' : 'var(--border)'}`,
                        }}>
                        <span className="font-bold mr-2">{c}.</span>
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={onSubmit}
                  disabled={submitting || (!selectedAnswer && !freeAnswer)}
                  className="w-full py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: 'white' }}>
                  {submitting ? 'Checking…' : 'Submit Answer'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Right pane: Question log ────────────────────────────────────── */}
        <div className="w-14 flex-shrink-0 border-l overflow-y-auto py-3 flex flex-col items-center gap-1.5"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          {answers.map((a, i) => (
            <div key={i}
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{
                background: a.isCorrect ? '#f0fdf4' : '#fef2f2',
                color: a.isCorrect ? '#15803d' : '#b91c1c',
                border: `1.5px solid ${a.isCorrect ? '#22c55e' : '#ef4444'}`,
              }}
              title={`Q${i + 1}: ${a.isCorrect ? `Correct (+${a.pointsEarned}pts)` : 'Incorrect'}`}>
              {a.isCorrect ? '✓' : '✗'}
            </div>
          ))}
          {/* Current question indicator */}
          {!gameEnded && (
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 animate-pulse"
              style={{
                background: 'var(--accent-light)',
                color: 'var(--accent)',
                border: '1.5px solid var(--accent)',
              }}>
              {currentIdx + 1}
            </div>
          )}
        </div>
      </div>

      {/* Floating tools: calculator + formulas (math questions only) */}
      <DesmosCalculator />
      {questions[currentIdx]?.subject === 'math' && <FormulasButton hasCalculator />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// RESULTS SCREEN
// ══════════════════════════════════════════════════════════════════════════════

function ResultsScreen({
  answers, totalScore, settings, endReason, onNewGame, onReplay,
}: {
  answers: AnswerRecord[]
  totalScore: number
  settings: GameSettings
  endReason: string
  onNewGame: () => void
  onReplay: () => void
}) {
  const correct   = answers.filter(a => a.isCorrect)
  const incorrect = answers.filter(a => !a.isCorrect)
  const maxStreak = (() => {
    let best = 0, cur = 0
    for (const a of answers) {
      if (a.isCorrect && a.withinTimeLimit) { cur++; best = Math.max(best, cur) }
      else cur = 0
    }
    return best
  })()

  const endLabel = endReason === 'three_wrong' ? '💀 3 Wrong — Game Over'
    : endReason === 'time_up' ? '⏱ Time\'s Up'
    : '✓ All Questions Done'

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--background)' }}>
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">
            {endReason === 'three_wrong' ? '💀' : endReason === 'time_up' ? '⏱' : '🏆'}
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--foreground)' }}>
            {endLabel}
          </h1>
          <div className="text-4xl font-bold mt-3" style={{ color: 'var(--accent)' }}>
            {totalScore} <span className="text-lg font-normal" style={{ color: 'var(--text-muted)' }}>points</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: 'Correct', value: correct.length, color: '#15803d', bg: '#f0fdf4' },
            { label: 'Incorrect', value: incorrect.length, color: '#b91c1c', bg: '#fef2f2' },
            { label: 'Best Streak', value: maxStreak, color: '#b45309', bg: '#fffbeb' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-4 text-center"
              style={{ background: s.bg, border: `1px solid ${s.color}22` }}>
              <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs mt-1" style={{ color: s.color }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-8">
          <button onClick={onReplay}
            className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
            style={{ background: 'var(--accent)', color: 'white' }}>
            ⚡ Replay Same Settings
          </button>
          <button onClick={onNewGame}
            className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
            style={{ background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)' }}>
            New Game
          </button>
        </div>

        {/* Question Review — incorrect first */}
        {answers.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-muted)' }}>
              Question Review
            </h2>
            <div className="space-y-4">
              {[...incorrect, ...correct].map((a, i) => (
                <div key={a.questionId}
                  className="rounded-xl overflow-hidden border"
                  style={{
                    borderColor: a.isCorrect ? '#22c55e' : '#ef4444',
                    borderWidth: '1.5px',
                  }}>
                  {/* Header */}
                  <div className="px-4 py-2 flex items-center justify-between"
                    style={{ background: a.isCorrect ? '#f0fdf4' : '#fef2f2' }}>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm"
                        style={{ color: a.isCorrect ? '#15803d' : '#b91c1c' }}>
                        {a.isCorrect ? '✓' : '✗'} Q{a.order + 1}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {a.question.domain} · {a.question.skill}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold"
                        style={{ color: a.isCorrect ? '#15803d' : '#b91c1c' }}>
                        +{a.pointsEarned} pts
                      </span>
                      <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                        {a.timeTaken.toFixed(1)}s
                        {!a.withinTimeLimit && <span style={{ color: '#b45309' }}> (over limit)</span>}
                      </span>
                    </div>
                  </div>

                  {/* Question image */}
                  <div style={{ background: 'white' }}>
                    {a.question.question_image_url && (
                      <Image
                        src={a.question.question_image_url}
                        alt={`Question ${a.order + 1}`}
                        width={700} height={350}
                        className="w-full h-auto"
                      />
                    )}
                  </div>

                  {/* Answer info bar */}
                  <div className="px-4 py-3 flex items-center gap-4 border-t"
                    style={{
                      borderColor: a.isCorrect ? '#bbf7d0' : '#fca5a5',
                      background: a.isCorrect ? '#f8fff8' : '#fff8f8',
                    }}>
                    {!a.isCorrect && (
                      <div>
                        <div className="text-xs font-semibold mb-0.5" style={{ color: '#6b7280' }}>Your answer</div>
                        <div className="text-sm font-bold" style={{ color: '#b91c1c' }}>
                          {a.selectedAnswer ?? '—'}
                        </div>
                      </div>
                    )}
                    <div className={!a.isCorrect ? 'border-l pl-4' : ''} style={{ borderColor: '#fca5a5' }}>
                      <div className="text-xs font-semibold mb-0.5" style={{ color: '#6b7280' }}>Correct answer</div>
                      <div className="text-sm font-bold" style={{ color: '#15803d' }}>
                        {a.question.correct_answer}
                      </div>
                    </div>
                    {!a.withinTimeLimit && (
                      <span className="text-xs ml-2" style={{ color: '#b45309' }}>
                        ⚠ Over time limit {a.isCorrect ? '(1 pt instead of 2)' : ''}
                      </span>
                    )}
                  </div>

                  {/* Answer explanation image — full width */}
                  {a.question.answer_image_url && (
                    <div className="border-t" style={{ borderColor: a.isCorrect ? '#bbf7d0' : '#fca5a5', background: 'white' }}>
                      <Image
                        src={a.question.answer_image_url}
                        alt="Answer explanation"
                        width={700} height={400}
                        className="w-full h-auto"
                        style={{ display: 'block' }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
