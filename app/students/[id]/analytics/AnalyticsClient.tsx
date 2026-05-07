'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { UnifiedAnswer, AnswerSource } from '@/lib/analyticsData'
import DesmosCalculator from '@/components/DesmosCalculator'

// ─── Types ────────────────────────────────────────────────────────────────────

type Student = { id: string; full_name: string | null; email: string | null }

type Props = {
  student: Student
  allStudents: Student[]   // for teacher's student switcher; empty for student view
  answers: UnifiedAnswer[]
  isTeacher: boolean
}

type FilterState = {
  subject:    string | null
  domain:     string | null
  skill:      string | null
  difficulty: string | null
  source:     AnswerSource | 'all'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(correct: number, total: number): number | null {
  return total === 0 ? null : Math.round((correct / total) * 100)
}

function scoreColor(p: number | null) {
  if (p === null) return 'var(--text-muted)'
  if (p >= 80) return '#16a34a'
  if (p >= 60) return '#d97706'
  return '#dc2626'
}

function formatSubject(s: string) {
  if (s === 'math')                return 'Math'
  if (s === 'english')             return 'English'
  if (s === 'reading_and_writing') return 'Reading & Writing'
  return s
}

function applyFilters(answers: UnifiedAnswer[], f: FilterState): UnifiedAnswer[] {
  let pool = answers
  if (f.source !== 'all') pool = pool.filter(a => a.source === f.source)
  if (f.subject)    pool = pool.filter(a => a.subject    === f.subject)
  if (f.domain)     pool = pool.filter(a => a.domain     === f.domain)
  if (f.skill)      pool = pool.filter(a => a.skill      === f.skill)
  if (f.difficulty) pool = pool.filter(a => a.difficulty === f.difficulty)
  return pool
}

const DIFF_ORDER = ['Easy', 'Medium', 'Hard']

// ─── Trend chart ──────────────────────────────────────────────────────────────

type TrendPoint = { label: string; pct: number; correct: number; total: number }

function TrendChart({ answers }: { answers: UnifiedAnswer[] }) {
  const sorted = [...answers].sort(
    (a, b) => new Date(a.answered_at).getTime() - new Date(b.answered_at).getTime()
  )

  const BATCH = 5
  const points: TrendPoint[] = []
  for (let i = 0; i + BATCH <= sorted.length; i += BATCH) {
    const chunk   = sorted.slice(i, i + BATCH)
    const correct = chunk.filter(a => a.is_correct === true).length
    points.push({
      label:   `Q${i + 1}–${i + BATCH}`,
      pct:     Math.round((correct / BATCH) * 100),
      correct,
      total:   BATCH,
    })
  }
  // Include a partial last batch only if at least 3 answers
  const remainder = sorted.length % BATCH
  if (remainder >= 3) {
    const chunk   = sorted.slice(sorted.length - remainder)
    const correct = chunk.filter(a => a.is_correct === true).length
    points.push({
      label:   `Q${sorted.length - remainder + 1}–${sorted.length}`,
      pct:     Math.round((correct / chunk.length) * 100),
      correct,
      total:   chunk.length,
    })
  }

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-32 rounded-xl border-2 border-dashed text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        Need at least 10 questions to show trend (have {sorted.length})
      </div>
    )
  }

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: TrendPoint }[]; label?: string }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="rounded-xl border px-3 py-2 text-sm shadow-lg"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <p className="font-semibold" style={{ color: 'var(--foreground)' }}>{label}</p>
        <p style={{ color: scoreColor(d.pct) }}>{d.pct}% correct</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{d.correct}/{d.total} right</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={v => `${v}%`}
          tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={70} strokeDasharray="4 4" stroke="#d97706" strokeWidth={1.5} />
        <Line
          type="monotone"
          dataKey="pct"
          stroke="var(--accent)"
          strokeWidth={2.5}
          dot={{ r: 4, fill: 'var(--accent)', strokeWidth: 0 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── Strengths & Weaknesses panel ─────────────────────────────────────────────

type GroupStat = { name: string; pct: number; correct: number; total: number; difficultyAdj: number }

// Difficulty-adjusted score: hard questions are graded on a curve so that
// 65% on Hard ≈ 80% on Easy when classifying strength vs. weakness.
const DIFF_BONUS: Record<string, number> = { Easy: 0, Medium: 8, Hard: 16, Unrated: 4 }

const RECENCY_WINDOW = 30

function groupAnswers(answers: UnifiedAnswer[], f: FilterState): GroupStat[] {
  // Decide grouping dimension based on current filter depth
  const getKey = (a: UnifiedAnswer) => {
    if (f.skill)   return a.difficulty || 'Unrated'
    if (f.domain)  return a.skill      || 'Unknown'
    if (f.subject) return a.domain     || 'Unknown'
    return a.domain || 'Unknown'
  }

  // Group all answers by key, sorted chronologically (answers already sorted by answered_at)
  const buckets = new Map<string, UnifiedAnswer[]>()
  for (const a of answers) {
    const key = getKey(a)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(a)
  }

  return Array.from(buckets.entries())
    .map(([name, all]) => {
      // Take only the most recent RECENCY_WINDOW answers for this group
      const recent = all.slice(-RECENCY_WINDOW)
      if (recent.length < 5) return null

      let correct = 0, diffSum = 0
      for (const a of recent) {
        if (a.is_correct === true) correct++
        diffSum += DIFF_BONUS[a.difficulty || 'Unrated'] ?? 4
      }

      const rawPct = Math.round(correct / recent.length * 100)
      const avgBonus = diffSum / recent.length
      return { name, pct: rawPct, correct, total: recent.length, difficultyAdj: Math.min(100, rawPct + avgBonus) }
    })
    .filter((g): g is GroupStat => g !== null)
}

function StatCard({
  item, color, rank,
}: {
  item: GroupStat; color: string; rank: number
}) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <span className="text-xs font-bold w-5 text-center" style={{ color: 'var(--text-muted)' }}>
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{item.name}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.total} questions</p>
      </div>
      <span className="text-sm font-bold flex-shrink-0" style={{ color }}>{item.pct}%</span>
    </div>
  )
}

// Thresholds use the difficulty-adjusted score so Hard questions are fairly classified.
// A group can only appear in one list — weakness < 65 adj, strength ≥ 75 adj.
// If nothing clears the threshold, fall back to strict top/bottom halves (no overlap).
function splitStrengthsWeaknesses(groups: GroupStat[]): { weaknesses: GroupStat[]; strengths: GroupStat[] } {
  const WEAK_THRESHOLD   = 65
  const STRONG_THRESHOLD = 75

  let weaknesses = groups.filter(g => g.difficultyAdj < WEAK_THRESHOLD)
    .sort((a, b) => a.difficultyAdj - b.difficultyAdj)
    .slice(0, 4)

  let strengths = groups.filter(g => g.difficultyAdj >= STRONG_THRESHOLD)
    .sort((a, b) => b.difficultyAdj - a.difficultyAdj)
    .slice(0, 4)

  // Fallback: if either list is empty, split sorted array in half (strictly mutually exclusive)
  if (weaknesses.length === 0 || strengths.length === 0) {
    const sorted = [...groups].sort((a, b) => a.difficultyAdj - b.difficultyAdj)
    const mid = Math.floor(sorted.length / 2)
    // bottom half → weaknesses, top half → strengths, middle item (odd count) goes to neither
    weaknesses = sorted.slice(0, mid).slice(0, 4)
    strengths  = sorted.slice(sorted.length - mid).reverse().slice(0, 4)
  }

  return { weaknesses, strengths }
}

function StrengthsWeaknessPanel({ answers, filters }: { answers: UnifiedAnswer[]; filters: FilterState }) {
  const groups = groupAnswers(answers, filters)

  if (groups.length === 0) {
    return (
      <div className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
        Not enough data yet
      </div>
    )
  }

  const { weaknesses, strengths } = splitStrengthsWeaknesses(groups)

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#dc2626' }}>
          <span>⬇</span> Weaknesses
        </p>
        <div className="space-y-1.5">
          {weaknesses.length > 0
            ? weaknesses.map((item, i) => (
                <StatCard key={item.name} item={item} color={scoreColor(item.pct)} rank={i + 1} />
              ))
            : <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>None identified yet</p>
          }
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#16a34a' }}>
          <span>⬆</span> Strengths
        </p>
        <div className="space-y-1.5">
          {strengths.length > 0
            ? strengths.map((item, i) => (
                <StatCard key={item.name} item={item} color={scoreColor(item.pct)} rank={i + 1} />
              ))
            : <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>None identified yet</p>
          }
        </div>
      </div>
    </div>
  )
}

// ─── Improving / Regressing panel ─────────────────────────────────────────────

type TrendStat = { name: string; delta: number; early: number; recent: number; total: number }

function ImprovingRegressingPanel({ answers, filters }: { answers: UnifiedAnswer[]; filters: FilterState }) {
  const getKey = (a: UnifiedAnswer) => {
    if (filters.skill)   return a.difficulty || 'Unrated'
    if (filters.domain)  return a.skill      || 'Unknown'
    if (filters.subject) return a.domain     || 'Unknown'
    return a.domain || 'Unknown'
  }

  const sorted = [...answers].sort(
    (a, b) => new Date(a.answered_at).getTime() - new Date(b.answered_at).getTime()
  )

  const grouped = new Map<string, UnifiedAnswer[]>()
  for (const a of sorted) {
    const key = getKey(a)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(a)
  }

  const trends: TrendStat[] = []
  for (const [name, items] of grouped.entries()) {
    if (items.length < 10) continue
    const mid    = Math.floor(items.length / 2)
    const early  = items.slice(0, mid)
    const recent = items.slice(mid)
    const earlyPct  = Math.round(early.filter(a => a.is_correct).length  / early.length  * 100)
    const recentPct = Math.round(recent.filter(a => a.is_correct).length / recent.length * 100)
    trends.push({ name, delta: recentPct - earlyPct, early: earlyPct, recent: recentPct, total: items.length })
  }

  if (trends.length === 0) {
    return (
      <div className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
        Need 10+ questions per category to show trends
      </div>
    )
  }

  const improving  = trends.filter(t => t.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3)
  const regressing = trends.filter(t => t.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3)

  if (improving.length === 0 && regressing.length === 0) {
    return (
      <div className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
        No clear trends yet — keep practicing!
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#16a34a' }}>
          🚀 Getting Better
        </p>
        <div className="space-y-1.5">
          {improving.length === 0
            ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>None yet</p>
            : improving.map(t => (
              <div key={t.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
                style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{t.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.early}% → {t.recent}%</p>
                </div>
                <span className="text-sm font-bold flex-shrink-0" style={{ color: '#16a34a' }}>+{t.delta}%</span>
              </div>
            ))
          }
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#dc2626' }}>
          ⚠️ Getting Worse
        </p>
        <div className="space-y-1.5">
          {regressing.length === 0
            ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>None — nice work!</p>
            : regressing.map(t => (
              <div key={t.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
                style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{t.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.early}% → {t.recent}%</p>
                </div>
                <span className="text-sm font-bold flex-shrink-0" style={{ color: '#dc2626' }}>{t.delta}%</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

// ─── Analyze Drawer ───────────────────────────────────────────────────────────

function AnalyzeDrawer({
  answers,
  onClose,
}: {
  answers: UnifiedAnswer[]
  onClose: () => void
}) {
  const [correctness, setCorrectness] = useState<'all' | 'correct' | 'wrong'>('all')
  const [expanded, setExpanded]       = useState<string | null>(null)

  // Group by question_id — keep all attempts; show summary + attempts list
  const grouped = useMemo(() => {
    const map = new Map<string, { meta: UnifiedAnswer; attempts: UnifiedAnswer[] }>()
    const sorted = [...answers].sort(
      (a, b) => new Date(a.answered_at).getTime() - new Date(b.answered_at).getTime()
    )
    for (const a of sorted) {
      if (!map.has(a.question_id)) {
        map.set(a.question_id, { meta: a, attempts: [] })
      }
      map.get(a.question_id)!.attempts.push(a)
    }
    return Array.from(map.values())
  }, [answers])

  const filtered = grouped.filter(g => {
    if (correctness === 'all') return true
    const lastAttempt = g.attempts[g.attempts.length - 1]
    if (correctness === 'correct') return lastAttempt.is_correct === true
    return lastAttempt.is_correct !== true
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        className="w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--background)', maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
              Analyze Problems
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {grouped.length} unique question{grouped.length !== 1 ? 's' : ''} ·{' '}
              {answers.length} total attempt{answers.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Correctness filter */}
            <div className="flex gap-1">
              {(['all', 'correct', 'wrong'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setCorrectness(c)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
                  style={{
                    borderColor: correctness === c ? 'var(--accent)' : 'var(--border)',
                    background:  correctness === c ? 'var(--accent-light)' : 'transparent',
                    color:       correctness === c ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight:  correctness === c ? 600 : 400,
                  }}>
                  {c === 'all' ? 'All' : c === 'correct' ? '✓' : '✗'}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-lg transition-colors"
              style={{ color: 'var(--text-muted)', background: 'var(--border)' }}>
              ×
            </button>
          </div>
        </div>

        {/* Question list */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
              No questions match.
            </p>
          ) : filtered.map(g => {
            const isExpanded = expanded === g.meta.question_id
            const rightCount = g.attempts.filter(a => a.is_correct === true).length
            const wrongCount = g.attempts.length - rightCount
            const lastCorrect = g.attempts[g.attempts.length - 1]?.is_correct === true

            return (
              <div
                key={g.meta.question_id}
                className="rounded-2xl border overflow-hidden"
                style={{
                  background:  'var(--card)',
                  borderColor: lastCorrect ? '#bbf7d0' : '#fecaca',
                }}>
                {/* Row header */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : g.meta.question_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  style={{
                    background: lastCorrect ? '#f0fdf420' : '#fef2f220',
                  }}>
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-white text-xs flex-shrink-0"
                    style={{ background: lastCorrect ? '#16a34a' : '#dc2626' }}>
                    {lastCorrect ? '✓' : '✗'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text-muted)' }}>
                      {g.meta.domain} · {g.meta.skill}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {g.meta.difficulty || 'Unrated'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                    {g.attempts.length > 1 && (
                      <span className="px-2 py-0.5 rounded-full font-medium"
                        style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                        {g.attempts.length}× attempted
                      </span>
                    )}
                    <span style={{ color: '#16a34a' }}>{rightCount} ✓</span>
                    <span style={{ color: '#dc2626' }}>{wrongCount} ✗</span>
                    <svg
                      className="w-4 h-4 transition-transform"
                      style={{
                        color: 'var(--text-muted)',
                        transform: isExpanded ? 'rotate(180deg)' : 'none',
                      }}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t" style={{ borderColor: 'var(--border)' }}>
                    {/* Question image */}
                    {g.meta.question_image_url && (
                      <div className="px-4 pt-4">
                        <img src={g.meta.question_image_url} alt="Question" className="w-full rounded-lg" />
                      </div>
                    )}
                    {/* Attempts list */}
                    <div className="px-4 py-3 space-y-2">
                      {g.attempts.map((attempt, i) => (
                        <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b last:border-0"
                          style={{ borderColor: 'var(--border)' }}>
                          <span className="font-medium w-16 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                            Attempt {i + 1}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded font-semibold"
                            style={{
                              background: attempt.is_correct ? '#f0fdf4' : '#fef2f2',
                              color: attempt.is_correct ? '#16a34a' : '#dc2626',
                            }}>
                            {attempt.selected_answer ?? '—'}
                          </span>
                          {!attempt.is_correct && (
                            <span className="px-2 py-0.5 rounded" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                              Correct: {attempt.correct_answer}
                            </span>
                          )}
                          <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>
                            {attempt.source_label}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Answer explanation */}
                    {g.meta.answer_image_url && (
                      <div className="px-4 pb-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                          Explanation
                        </p>
                        <img src={g.meta.answer_image_url} alt="Explanation" className="w-full rounded-lg" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Filter pill button ────────────────────────────────────────────────────────

function Pill({
  label, active, onClick, color,
}: {
  label: string; active: boolean; onClick: () => void; color?: string
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full border text-xs font-medium transition-all flex-shrink-0"
      style={{
        borderColor: active ? (color ?? 'var(--accent)') : 'var(--border)',
        background:  active ? (color ? color + '20' : 'var(--accent-light)') : 'transparent',
        color:       active ? (color ?? 'var(--accent)') : 'var(--text-muted)',
      }}>
      {label}
    </button>
  )
}

// ─── Main AnalyticsClient ─────────────────────────────────────────────────────

export default function AnalyticsClient({ student, allStudents, answers, isTeacher }: Props) {
  const router = useRouter()

  const [filters, setFilters] = useState<FilterState>({
    subject: null, domain: null, skill: null, difficulty: null, source: 'all',
  })
  const [showAnalyze, setShowAnalyze]   = useState(false)
  const [generating, setGenerating]     = useState(false)
  const [genError, setGenError]         = useState<string | null>(null)
  const [studentPickerOpen, setStudentPickerOpen] = useState(false)

  // ── Derived data ────────────────────────────────────────────────────────────

  const filteredAnswers = useMemo(() => applyFilters(answers, filters), [answers, filters])

  // Available filter options — always derived from the full answer set, not filtered
  const subjects = useMemo(() => [...new Set(answers.map(a => a.subject))].sort(), [answers])

  const domains = useMemo(() =>
    filters.subject
      ? [...new Set(answers.filter(a => a.subject === filters.subject).map(a => a.domain))].sort()
      : [],
    [answers, filters.subject]
  )

  const skills = useMemo(() =>
    filters.domain
      ? [...new Set(answers.filter(a => a.domain === filters.domain).map(a => a.skill))].sort()
      : [],
    [answers, filters.domain]
  )

  const difficulties = useMemo(() =>
    DIFF_ORDER.filter(d =>
      (filters.domain || filters.subject
        ? answers.filter(a =>
            (!filters.subject || a.subject === filters.subject) &&
            (!filters.domain  || a.domain  === filters.domain))
        : answers
      ).some(a => a.difficulty === d)
    ),
    [answers, filters.subject, filters.domain]
  )

  const totalCorrect  = filteredAnswers.filter(a => a.is_correct === true).length
  const totalAnswered = filteredAnswers.length
  const totalPct      = pct(totalCorrect, totalAnswered)

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = { worksheet: 0, sat_rush: 0, practice: 0 }
    for (const a of answers) counts[a.source] = (counts[a.source] ?? 0) + 1
    return counts
  }, [answers])

  // ── Callbacks ───────────────────────────────────────────────────────────────

  const setFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value }
      // Clear child filters when parent changes
      if (key === 'subject') { next.domain = null; next.skill = null }
      if (key === 'domain')  { next.skill  = null }
      return next
    })
  }, [])

  const clearFilters = useCallback(() => {
    setFilters({ subject: null, domain: null, skill: null, difficulty: null, source: 'all' })
  }, [])

  // ── Generate practice problems ───────────────────────────────────────────────

  const buildReqFilters = useCallback(() => {
    const reqFilters: Record<string, unknown> = {}
    if (filters.subject)    reqFilters.subject      = filters.subject
    if (filters.domain)     reqFilters.domain       = filters.domain
    if (filters.skill)      reqFilters.skill        = filters.skill
    if (filters.difficulty) reqFilters.difficulties = [filters.difficulty]
    return reqFilters
  }, [filters])

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setGenError(null)
    try {
      const reqFilters = buildReqFilters()

      const recRes = await fetch('/api/practice/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: reqFilters, count: 10 }),
      })
      const recData = await recRes.json()
      if (!recRes.ok || !recData.questions?.length) {
        setGenError(recData.error ?? 'No questions found for this filter. Try broadening your selection.')
        setGenerating(false)
        return
      }

      const questionIds: string[] = recData.questions.map((q: { id: string }) => q.id)

      // Create the session
      const startRes = await fetch('/api/practice/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionIds, filters: reqFilters }),
      })
      const startData = await startRes.json()
      if (!startRes.ok || !startData.sessionId) {
        setGenError(startData.error ?? 'Failed to create practice session.')
        setGenerating(false)
        return
      }

      router.push(`/practice/${startData.sessionId}`)
    } catch (err) {
      setGenError(String(err))
      setGenerating(false)
    }
  }, [filters, router, buildReqFilters])

  // Teacher: generate questions targeting this student's weaknesses → open worksheet builder
  const handleTeacherGenerate = useCallback(async () => {
    setGenerating(true)
    setGenError(null)
    try {
      const reqFilters = buildReqFilters()

      const recRes = await fetch('/api/practice/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: reqFilters, count: 10, studentId: student.id }),
      })
      const recData = await recRes.json()
      if (!recRes.ok || !recData.questions?.length) {
        setGenError(recData.error ?? 'No questions found. Try broadening the filter.')
        setGenerating(false)
        return
      }

      const questionIds: string[] = recData.questions.map((q: { id: string }) => q.id)
      // Navigate to worksheet builder with questions pre-loaded and student pre-selected
      router.push(`/worksheets/new?q=${questionIds.join(',')}&student=${student.id}`)
    } catch (err) {
      setGenError(String(err))
      setGenerating(false)
    }
  }, [filters, router, student.id, buildReqFilters])

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (answers.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {isTeacher && (
          <a href="/students" className="text-sm" style={{ color: 'var(--accent)' }}>← Students</a>
        )}
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
          {student.full_name || student.email}
          {isTeacher && <span className="text-base font-normal ml-2" style={{ color: 'var(--text-muted)' }}>Analytics</span>}
        </h1>
        <div className="py-16 text-center rounded-2xl border-2 border-dashed"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          <p className="text-sm">No questions answered yet. Complete some worksheets or SAT Rush to see analytics.</p>
        </div>
      </div>
    )
  }

  const hasActiveFilter = !!(filters.subject || filters.domain || filters.skill || filters.difficulty || filters.source !== 'all')

  return (
    <div className="flex flex-col gap-5 pb-20">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {isTeacher && (
            <a href="/students" className="text-sm" style={{ color: 'var(--accent)' }}>← Students</a>
          )}
          <h1 className="text-2xl font-bold mt-1" style={{ color: 'var(--foreground)' }}>
            {student.full_name || student.email}
            {!isTeacher && (
              <span className="text-base font-normal ml-2" style={{ color: 'var(--text-muted)' }}>
                My Analytics
              </span>
            )}
          </h1>
          {isTeacher && student.email && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{student.email}</p>
          )}
        </div>

        {/* Teacher: student switcher */}
        {isTeacher && allStudents.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setStudentPickerOpen(v => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)', background: 'var(--card)' }}>
              Switch student
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {studentPickerOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-20 rounded-xl border overflow-auto"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', maxHeight: 280, minWidth: 200 }}>
                {allStudents.map(s => (
                  <a
                    key={s.id}
                    href={`/students/${s.id}/analytics`}
                    className="block px-4 py-2.5 text-sm hover:bg-opacity-80 transition-colors"
                    style={{
                      color: s.id === student.id ? 'var(--accent)' : 'var(--foreground)',
                      background: s.id === student.id ? 'var(--accent-light)' : 'transparent',
                    }}>
                    {s.full_name || s.email}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Top panels: Strengths / Weaknesses + Improving / Regressing ──── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Strengths & Weaknesses
          </p>
          <StrengthsWeaknessPanel answers={filteredAnswers} filters={filters} />
        </div>
        <div className="rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Trends Over Time
          </p>
          <ImprovingRegressingPanel answers={filteredAnswers} filters={filters} />
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border p-4 space-y-3" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Filters
          </p>
          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              className="text-xs px-2 py-1 rounded-lg transition-colors"
              style={{ color: 'var(--accent)', background: 'var(--accent-light)' }}>
              Clear all
            </button>
          )}
        </div>

        {/* Subject */}
        <div className="flex flex-wrap gap-1.5">
          {subjects.map(s => {
            const cnt = answers.filter(a => a.subject === s).length
            return (
              <Pill
                key={s}
                label={`${formatSubject(s)} (${cnt})`}
                active={filters.subject === s}
                onClick={() => setFilter('subject', filters.subject === s ? null : s)}
              />
            )
          })}
        </div>

        {/* Domains — shown when subject selected */}
        {domains.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-3 border-l-2" style={{ borderColor: 'var(--accent-light)' }}>
            {domains.map(d => {
              const cnt = answers.filter(a => a.subject === filters.subject && a.domain === d).length
              return (
                <Pill
                  key={d}
                  label={`${d} (${cnt})`}
                  active={filters.domain === d}
                  onClick={() => setFilter('domain', filters.domain === d ? null : d)}
                />
              )
            })}
          </div>
        )}

        {/* Skills — shown when domain selected */}
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-6 border-l-2" style={{ borderColor: 'var(--accent-light)' }}>
            {skills.map(sk => {
              const cnt = answers.filter(a => a.domain === filters.domain && a.skill === sk).length
              return (
                <Pill
                  key={sk}
                  label={`${sk} (${cnt})`}
                  active={filters.skill === sk}
                  onClick={() => setFilter('skill', filters.skill === sk ? null : sk)}
                />
              )
            })}
          </div>
        )}

        {/* Difficulty row */}
        {difficulties.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {difficulties.map(d => {
              const color = d === 'Easy' ? '#16a34a' : d === 'Medium' ? '#d97706' : '#dc2626'
              const cnt = filteredAnswers.filter(a => a.difficulty === d).length
              return (
                <Pill
                  key={d}
                  label={`${d} (${cnt})`}
                  active={filters.difficulty === d}
                  color={color}
                  onClick={() => setFilter('difficulty', filters.difficulty === d ? null : d)}
                />
              )
            })}
          </div>
        )}

        {/* Source row */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <Pill
            label={`All (${answers.length})`}
            active={filters.source === 'all'}
            onClick={() => setFilter('source', 'all')}
          />
          {sourceCounts.worksheet > 0 && (
            <Pill
              label={`Worksheets (${sourceCounts.worksheet})`}
              active={filters.source === 'worksheet'}
              onClick={() => setFilter('source', filters.source === 'worksheet' ? 'all' : 'worksheet')}
            />
          )}
          {sourceCounts.sat_rush > 0 && (
            <Pill
              label={`SAT Rush (${sourceCounts.sat_rush})`}
              active={filters.source === 'sat_rush'}
              onClick={() => setFilter('source', filters.source === 'sat_rush' ? 'all' : 'sat_rush')}
            />
          )}
          {sourceCounts.practice > 0 && (
            <Pill
              label={`Practice (${sourceCounts.practice})`}
              active={filters.source === 'practice'}
              onClick={() => setFilter('source', filters.source === 'practice' ? 'all' : 'practice')}
            />
          )}
        </div>
      </div>

      {/* ── Trend chart ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Accuracy Over Time
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Each dot = 5-question batch · dashed line = 70% target
            </p>
          </div>
          {/* Summary stats */}
          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Overall</p>
              <p className="text-xl font-bold" style={{ color: scoreColor(totalPct) }}>
                {totalPct !== null ? `${totalPct}%` : '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Questions</p>
              <p className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>{totalAnswered}</p>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>✓ / ✗</p>
              <p className="text-xl font-bold">
                <span style={{ color: '#16a34a' }}>{totalCorrect}</span>
                <span style={{ color: 'var(--text-muted)' }}> / </span>
                <span style={{ color: '#dc2626' }}>{totalAnswered - totalCorrect}</span>
              </p>
            </div>
          </div>
        </div>
        <TrendChart answers={filteredAnswers} />
      </div>

      {/* ── Action bar ─────────────────────────────────────────────────────── */}
      {!isTeacher && (
        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white transition-opacity disabled:opacity-60"
            style={{ background: 'var(--accent)' }}>
            {generating ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Finding problems…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate Practice Problems
              </>
            )}
          </button>

          <button
            onClick={() => setShowAnalyze(true)}
            disabled={filteredAnswers.length === 0}
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm border transition-colors disabled:opacity-60"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--foreground)',
              background: 'var(--card)',
            }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Analyze Problems
            {filteredAnswers.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                {filteredAnswers.length}
              </span>
            )}
          </button>

          {genError && (
            <p className="text-sm self-center" style={{ color: '#dc2626' }}>{genError}</p>
          )}
        </div>
      )}

      {/* Teacher action bar */}
      {isTeacher && (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleTeacherGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white transition-opacity disabled:opacity-60"
            style={{ background: 'var(--accent)' }}>
            {generating ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Building worksheet…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Generate Targeted Worksheet
              </>
            )}
          </button>

          {filteredAnswers.length > 0 && (
            <button
              onClick={() => setShowAnalyze(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)', background: 'var(--card)' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Analyze Problems
              <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                {filteredAnswers.length}
              </span>
            </button>
          )}

          {genError && (
            <p className="text-sm self-center" style={{ color: '#dc2626' }}>{genError}</p>
          )}
        </div>
      )}

      {/* Analyze drawer */}
      {showAnalyze && (
        <AnalyzeDrawer
          answers={filteredAnswers}
          onClose={() => setShowAnalyze(false)}
        />
      )}

      {/* Desmos calculator — shown when math is active */}
      {filters.subject === 'math' && <DesmosCalculator />}
    </div>
  )
}
