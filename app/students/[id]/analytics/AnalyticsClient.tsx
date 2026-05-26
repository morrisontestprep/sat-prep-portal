'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
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

const DIFF_ORDER   = ['Easy', 'Medium', 'Hard']
const DIFF_COLORS: Record<string, string> = { Easy: '#16a34a', Medium: '#d97706', Hard: '#dc2626', Unrated: '#6b7280' }
const RECENCY_WINDOW = 30

function barFill(p: number) {
  return p >= 80 ? '#16a34a' : p >= 55 ? '#d97706' : '#dc2626'
}

/** Deduplicate by question_id (keep latest), sort chronologically, take last N */
function dedupRecent(pool: UnifiedAnswer[], n = RECENCY_WINDOW): UnifiedAnswer[] {
  const latest = new Map<string, UnifiedAnswer>()
  for (const a of pool) latest.set(a.question_id, a)
  return [...latest.values()]
    .sort((a, b) => new Date(a.answered_at).getTime() - new Date(b.answered_at).getTime())
    .slice(-n)
}

// ─── Panel 1: Performance by Difficulty (bar chart per subject) ───────────────

type BarDatum = { difficulty: string; pct: number | null; correct: number; total: number; fill: string }

function DifficultyBarChart({ answers, subject }: { answers: UnifiedAnswer[]; subject: string }) {
  const [domain, setDomain] = useState<string | null>(null)
  const [skill,  setSkill]  = useState<string | null>(null)

  const subjectLabel = subject === 'math' ? 'Math' : 'English'

  const subjectAnswers = useMemo(
    () => answers.filter(a => a.subject === subject),
    [answers, subject]
  )
  const domains = useMemo(
    () => [...new Set(subjectAnswers.map(a => a.domain).filter((d): d is string => !!d))].sort(),
    [subjectAnswers]
  )
  const skills = useMemo(
    () => domain
      ? [...new Set(subjectAnswers.filter(a => a.domain === domain).map(a => a.skill).filter((s): s is string => !!s))].sort()
      : [],
    [subjectAnswers, domain]
  )
  const scoped = useMemo(() => {
    let pool = subjectAnswers
    if (domain) pool = pool.filter(a => a.domain === domain)
    if (skill)  pool = pool.filter(a => a.skill  === skill)
    return pool
  }, [subjectAnswers, domain, skill])

  const barData: BarDatum[] = useMemo(() =>
    DIFF_ORDER.map(diff => {
      const recent = dedupRecent(scoped.filter(a => a.difficulty === diff))
      if (recent.length === 0) return { difficulty: diff, pct: null, correct: 0, total: 0, fill: '#e5e7eb' }
      const correct = recent.filter(a => a.is_correct === true).length
      const p = Math.round(correct / recent.length * 100)
      return { difficulty: diff, pct: p, correct, total: recent.length, fill: barFill(p) }
    }),
    [scoped]
  )

  const hasData = barData.some(b => b.total > 0)

  // Custom X-axis tick: difficulty name + sample size below
  function CustomTick({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value: string } }) {
    const d = barData.find(b => b.difficulty === payload?.value)
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={12} textAnchor="middle" fontSize={11} fill="var(--text-muted)">{payload?.value}</text>
        {d && d.total > 0 && (
          <text x={0} y={26} textAnchor="middle" fontSize={10} fill="var(--text-muted)">n={d.total}</text>
        )}
      </g>
    )
  }

  // Label above each bar showing percentage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function BarLabel({ x = 0, y = 0, width = 0, value, index = 0 }: any) {
    if (value == null) return null
    const d = barData[index]
    if (!d || d.total === 0) return null
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill={d.fill}>
        {value}%
      </text>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Header + domain pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-bold flex-shrink-0" style={{ color: 'var(--foreground)' }}>{subjectLabel}</p>
        {domains.map(d => (
          <button key={d}
            onClick={() => { setDomain(domain === d ? null : d); setSkill(null) }}
            className="text-xs px-2.5 py-1 rounded-full border transition-all"
            style={{
              borderColor: domain === d ? 'var(--accent)' : 'var(--border)',
              background:  domain === d ? 'var(--accent-light)' : 'transparent',
              color:       domain === d ? 'var(--accent)' : 'var(--text-muted)',
            }}>
            {d}
          </button>
        ))}
      </div>
      {/* Skill pills */}
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-2 border-l-2" style={{ borderColor: 'var(--accent-light)' }}>
          {skills.map(sk => (
            <button key={sk}
              onClick={() => setSkill(skill === sk ? null : sk)}
              className="text-xs px-2.5 py-1 rounded-full border transition-all"
              style={{
                borderColor: skill === sk ? 'var(--accent)' : 'var(--border)',
                background:  skill === sk ? 'var(--accent-light)' : 'transparent',
                color:       skill === sk ? 'var(--accent)' : 'var(--text-muted)',
              }}>
              {sk}
            </button>
          ))}
        </div>
      )}
      {/* Chart */}
      {!hasData ? (
        <div className="h-36 flex items-center justify-center rounded-xl border-2 border-dashed text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          No {subjectLabel} data yet
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={barData} margin={{ top: 24, right: 4, bottom: 28, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="difficulty" tick={<CustomTick />} tickLine={false} axisLine={false} interval={0} />
              <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as BarDatum
                  if (d.total === 0) return null
                  return (
                    <div className="rounded-xl border px-3 py-2 text-xs shadow-lg"
                      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                      <p className="font-semibold" style={{ color: 'var(--foreground)' }}>{d.difficulty}</p>
                      <p style={{ color: d.fill }}>{d.pct}% correct</p>
                      <p style={{ color: 'var(--text-muted)' }}>{d.correct} / {d.total} questions (last {RECENCY_WINDOW})</p>
                    </div>
                  )
                }}
              />
              {/* Green dashed line at 80% mastery */}
              <ReferenceLine y={80} strokeDasharray="4 4" stroke="#16a34a" strokeWidth={1.5} opacity={0.5} />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]} label={<BarLabel />}>
                {barData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} fillOpacity={entry.total === 0 ? 0.2 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Dashed line = 80% mastery · bars use last {RECENCY_WINDOW} unique questions
          </p>
        </>
      )}
    </div>
  )
}

// ─── Panel 2: Readiness Signals ───────────────────────────────────────────────

type ReadinessSignal = {
  domain:  string
  signal:  'mastered' | 'level-up-hard' | 'level-up-medium' | 'foundation-gap'
  pct:     number
  count:   number
  atDiff:  string
}

const SIGNAL_CFG = {
  'mastered':        { label: 'Mastered Hard',          icon: '⭐', color: '#16a34a', bg: '#f0fdf4' },
  'level-up-hard':   { label: 'Try Hard questions',     icon: '🚀', color: '#7c3aed', bg: '#f5f3ff' },
  'level-up-medium': { label: 'Try Medium questions',   icon: '📈', color: '#2563eb', bg: '#eff6ff' },
  'foundation-gap':  { label: 'Foundation gap',         icon: '⚠️', color: '#dc2626', bg: '#fef2f2' },
}

function buildReadinessSignals(answers: UnifiedAnswer[]): ReadinessSignal[] {
  const domainGroups = new Map<string, UnifiedAnswer[]>()
  for (const a of answers) {
    const d = a.domain || 'Unknown'
    if (!domainGroups.has(d)) domainGroups.set(d, [])
    domainGroups.get(d)!.push(a)
  }

  const signals: ReadinessSignal[] = []
  const MIN = 10

  for (const [domain, pool] of domainGroups.entries()) {
    const stats: Partial<Record<string, { pct: number; count: number }>> = {}
    for (const diff of DIFF_ORDER) {
      const recent = dedupRecent(pool.filter(a => a.difficulty === diff))
      if (recent.length === 0) continue
      const correct = recent.filter(a => a.is_correct === true).length
      stats[diff] = { pct: Math.round(correct / recent.length * 100), count: recent.length }
    }

    const easy = stats['Easy'],   easyOk = !!(easy   && easy.count   >= MIN)
    const med  = stats['Medium'], medOk  = !!(med    && med.count    >= MIN)
    const hard = stats['Hard'],   hardOk = !!(hard   && hard.count   >= MIN)

    if      (hardOk && hard!.pct >= 80)                           signals.push({ domain, signal: 'mastered',        pct: hard!.pct,  count: hard!.count,  atDiff: 'Hard'   })
    else if (medOk  && med!.pct  >= 80)                           signals.push({ domain, signal: 'level-up-hard',   pct: med!.pct,   count: med!.count,   atDiff: 'Medium' })
    else if (easyOk && easy!.pct >= 80)                           signals.push({ domain, signal: 'level-up-medium', pct: easy!.pct,  count: easy!.count,  atDiff: 'Easy'   })
    else if (easyOk && easy!.pct < 55)                            signals.push({ domain, signal: 'foundation-gap',  pct: easy!.pct,  count: easy!.count,  atDiff: 'Easy'   })
    // 55-79% at any level with enough data → "keep practicing" (no signal shown)
  }

  // Sort: foundation gaps first, then level-ups, then mastered
  const ORDER: ReadinessSignal['signal'][] = ['foundation-gap', 'level-up-medium', 'level-up-hard', 'mastered']
  return signals.sort((a, b) => ORDER.indexOf(a.signal) - ORDER.indexOf(b.signal))
}

function ReadinessPanel({ answers }: { answers: UnifiedAnswer[] }) {
  const signals = useMemo(() => buildReadinessSignals(answers), [answers])

  if (signals.length === 0) {
    return (
      <div className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>
        Answer 10+ questions per difficulty in each area to see readiness signals
      </div>
    )
  }

  return (
    <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 280 }}>
      {signals.map(s => {
        const cfg = SIGNAL_CFG[s.signal]
        return (
          <div key={s.domain} className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border"
            style={{ background: cfg.bg, borderColor: cfg.color + '40' }}>
            <span className="flex-shrink-0 mt-0.5">{cfg.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--foreground)' }}>{s.domain}</p>
              <p className="text-xs" style={{ color: cfg.color }}>
                {cfg.label} · {s.pct}% at {s.atDiff} (n={s.count})
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Panel 3: 3-Line Trend (per difficulty, immune to difficulty switching) ───

function buildDiffBatches(answers: UnifiedAnswer[], diff: string, batchSize = 5): number[] {
  const stream = [...answers]
    .filter(a => a.difficulty === diff)
    .sort((a, b) => new Date(a.answered_at).getTime() - new Date(b.answered_at).getTime())

  const points: number[] = []
  for (let i = 0; i + batchSize <= stream.length; i += batchSize) {
    const chunk = stream.slice(i, i + batchSize)
    points.push(Math.round(chunk.filter(a => a.is_correct === true).length / batchSize * 100))
  }
  // Partial last batch ≥ 3
  const rem = stream.length % batchSize
  if (rem >= 3) {
    const chunk = stream.slice(stream.length - rem)
    points.push(Math.round(chunk.filter(a => a.is_correct === true).length / chunk.length * 100))
  }
  return points
}

function TrendChart({ answers }: { answers: UnifiedAnswer[] }) {
  const easyPts  = useMemo(() => buildDiffBatches(answers, 'Easy'),   [answers])
  const medPts   = useMemo(() => buildDiffBatches(answers, 'Medium'), [answers])
  const hardPts  = useMemo(() => buildDiffBatches(answers, 'Hard'),   [answers])
  const maxLen   = Math.max(easyPts.length, medPts.length, hardPts.length)

  if (maxLen < 2) {
    return (
      <div className="h-36 flex items-center justify-center rounded-xl border-2 border-dashed text-xs text-center px-4"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        Need 10+ questions per difficulty level to show trend lines
      </div>
    )
  }

  const data = Array.from({ length: maxLen }, (_, i) => ({
    batch:  `#${i + 1}`,
    Easy:   easyPts[i]  ?? null,
    Medium: medPts[i]   ?? null,
    Hard:   hardPts[i]  ?? null,
  }))

  const counts = {
    Easy:   answers.filter(a => a.difficulty === 'Easy').length,
    Medium: answers.filter(a => a.difficulty === 'Medium').length,
    Hard:   answers.filter(a => a.difficulty === 'Hard').length,
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
        {([
          ['Easy',   '——',   'none'],
          ['Medium', '╌╌',   '8 4'],
          ['Hard',   '···',  '3 3'],
        ] as const).map(([d, symbol]) => (
          <div key={d} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="font-bold flex-shrink-0 w-5 text-center" style={{ color: DIFF_COLORS[d] }}>{symbol}</span>
            {d} <span style={{ color: counts[d] > 0 ? DIFF_COLORS[d] : 'var(--text-muted)' }}>({counts[d]} Qs)</span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="batch" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div className="rounded-xl border px-3 py-2 text-xs shadow-lg"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <p className="font-semibold mb-1" style={{ color: 'var(--foreground)' }}>Batch {label}</p>
                  {payload.filter(p => p.value !== null).map(p => {
                    const dk = p.dataKey as string
                    return (
                      <p key={dk} style={{ color: DIFF_COLORS[dk] }}>
                        {dk}: {p.value}%
                      </p>
                    )
                  })}
                </div>
              )
            }}
          />
          <ReferenceLine y={70} strokeDasharray="4 4" stroke="var(--text-muted)" strokeWidth={1} opacity={0.4} />
          {/* Each difficulty gets a distinct dash pattern so overlapping lines stay legible */}
          <Line key="Easy"   type="monotone" dataKey="Easy"
            stroke={DIFF_COLORS['Easy']}   strokeWidth={3}
            strokeDasharray="none"
            dot={{ r: 5, fill: DIFF_COLORS['Easy'],   stroke: 'var(--card)', strokeWidth: 2 }}
            activeDot={{ r: 7 }} connectNulls={false} />
          <Line key="Medium" type="monotone" dataKey="Medium"
            stroke={DIFF_COLORS['Medium']} strokeWidth={3}
            strokeDasharray="8 4"
            dot={{ r: 5, fill: DIFF_COLORS['Medium'], stroke: 'var(--card)', strokeWidth: 2 }}
            activeDot={{ r: 7 }} connectNulls={false} />
          <Line key="Hard"   type="monotone" dataKey="Hard"
            stroke={DIFF_COLORS['Hard']}   strokeWidth={3}
            strokeDasharray="3 3"
            dot={{ r: 5, fill: DIFF_COLORS['Hard'],   stroke: 'var(--card)', strokeWidth: 2 }}
            activeDot={{ r: 7 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-center mt-1" style={{ color: 'var(--text-muted)' }}>
        Each point = 5 consecutive questions at that difficulty · lines are independent — can&apos;t be gamed by switching difficulty
      </p>
    </div>
  )
}

// ─── Panel 4: True Improvement (difficulty-controlled) ────────────────────────

type ImprovementStat = {
  key:       string
  label:     string
  diffColor: string
  early:     number
  recent:    number
  delta:     number
  count:     number
}

function buildImprovementStats(answers: UnifiedAnswer[]): ImprovementStat[] {
  // Group by domain × difficulty — comparing within the same difficulty level
  // prevents a student from "improving" simply by switching to easier questions
  const groups = new Map<string, UnifiedAnswer[]>()
  for (const a of answers) {
    const key = `${a.domain || 'Unknown'}|${a.difficulty || 'Unrated'}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(a)
  }

  const stats: ImprovementStat[] = []
  for (const [key, pool] of groups.entries()) {
    const [domain, difficulty] = key.split('|')
    // Deduplicate and sort (no recency cap here — we want the full history for trend)
    const sorted = dedupRecent(pool, 9999)
    if (sorted.length < 10) continue

    const half      = Math.floor(sorted.length / 2)
    const earlyPct  = Math.round(sorted.slice(0, half).filter(a => a.is_correct === true).length / half * 100)
    const recentPct = Math.round(sorted.slice(half).filter(a => a.is_correct === true).length / (sorted.length - half) * 100)
    const delta     = recentPct - earlyPct

    if (Math.abs(delta) < 5) continue // filter noise < 5 pp

    stats.push({
      key, delta, count: sorted.length,
      label:     `${domain} · ${difficulty}`,
      diffColor: DIFF_COLORS[difficulty] ?? '#6b7280',
      early:     earlyPct,
      recent:    recentPct,
    })
  }
  return stats
}

function TrueImprovementPanel({ answers }: { answers: UnifiedAnswer[] }) {
  const stats      = useMemo(() => buildImprovementStats(answers), [answers])
  const improving  = stats.filter(s => s.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5)
  const regressing = stats.filter(s => s.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5)

  if (stats.length === 0) {
    return (
      <div className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
        Need 10+ questions per domain × difficulty level to show improvement trends
      </div>
    )
  }
  if (improving.length === 0 && regressing.length === 0) {
    return (
      <div className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
        No meaningful trends yet (changes under 5%) — keep practicing!
      </div>
    )
  }

  function ImpRow({ s }: { s: ImprovementStat }) {
    const isPos = s.delta > 0
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.diffColor }} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--foreground)' }}>{s.label}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.early}% → {s.recent}% · {s.count} questions</p>
        </div>
        <span className="text-sm font-bold flex-shrink-0" style={{ color: isPos ? '#16a34a' : '#dc2626' }}>
          {isPos ? '+' : ''}{s.delta}%
        </span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#16a34a' }}>🚀 Improving</p>
        <div className="space-y-1.5">
          {improving.length === 0
            ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>None yet</p>
            : improving.map(s => <ImpRow key={s.key} s={s} />)
          }
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#dc2626' }}>⚠️ Declining</p>
        <div className="space-y-1.5">
          {regressing.length === 0
            ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>None — great work!</p>
            : regressing.map(s => <ImpRow key={s.key} s={s} />)
          }
        </div>
      </div>
    </div>
  )
}

// ─── Analyze Drawer ───────────────────────────────────────────────────────────

type Whiteboard = { id: string; name: string }

function AnalyzeDrawer({
  answers,
  onClose,
}: {
  answers: UnifiedAnswer[]
  onClose: () => void
}) {
  const [correctness,    setCorrectness]    = useState<'all' | 'correct' | 'wrong'>('all')
  const [diffFilter,     setDiffFilter]     = useState<string | null>(null)
  const [domainFilter,   setDomainFilter]   = useState<string | null>(null)
  const [skillFilter,    setSkillFilter]    = useState<string | null>(null)
  const [expanded,       setExpanded]       = useState<string | null>(null)
  const [selected,       setSelected]       = useState<Set<string>>(new Set())
  const [showWbPicker,   setShowWbPicker]   = useState(false)
  const [whiteboards,    setWhiteboards]    = useState<Whiteboard[]>([])
  const [loadingWbs,     setLoadingWbs]     = useState(false)
  const [addingToWb,     setAddingToWb]     = useState(false)
  const [wbSuccess,      setWbSuccess]      = useState<string | null>(null)

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

  // Available filter options derived from grouped questions
  const availableDiffs = useMemo(() =>
    [...new Set(grouped.map(g => g.meta.difficulty).filter((d): d is string => !!d))].sort(),
    [grouped]
  )
  const availableDomains = useMemo(() =>
    [...new Set(grouped.map(g => g.meta.domain).filter((d): d is string => !!d))].sort(),
    [grouped]
  )
  const availableSkills = useMemo(() =>
    domainFilter
      ? [...new Set(grouped.filter(g => g.meta.domain === domainFilter).map(g => g.meta.skill).filter((s): s is string => !!s))].sort()
      : [],
    [grouped, domainFilter]
  )

  const filtered = grouped.filter(g => {
    if (correctness !== 'all') {
      const lastAttempt = g.attempts[g.attempts.length - 1]
      if (correctness === 'correct' && lastAttempt.is_correct !== true) return false
      if (correctness === 'wrong'   && lastAttempt.is_correct === true)  return false
    }
    if (diffFilter   && g.meta.difficulty !== diffFilter)   return false
    if (domainFilter && g.meta.domain     !== domainFilter)  return false
    if (skillFilter  && g.meta.skill      !== skillFilter)   return false
    return true
  })

  const toggleSelect = (qid: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(qid)) { next.delete(qid) } else { next.add(qid) }
      return next
    })
  }
  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(g => g.meta.question_id)))
    }
  }

  const openWbPicker = async () => {
    setShowWbPicker(true)
    setLoadingWbs(true)
    try {
      const res = await fetch('/api/whiteboards')
      const data = await res.json()
      // API returns { ownBoards, sharedBoards } — merge into a flat list
      const own    = (data.ownBoards    ?? []) as Whiteboard[]
      const shared = (data.sharedBoards ?? []).map((s: { whiteboards: Whiteboard }) => s.whiteboards).filter(Boolean) as Whiteboard[]
      const all = [...own, ...shared]
      // Deduplicate by id
      const seen = new Set<string>()
      setWhiteboards(all.filter(wb => { if (seen.has(wb.id)) return false; seen.add(wb.id); return true }))
    } catch {
      setWhiteboards([])
    } finally {
      setLoadingWbs(false)
    }
  }

  const addToWhiteboard = async (boardId: string, boardName: string) => {
    const selectedGroups = filtered.filter(g => selected.has(g.meta.question_id))
    if (selectedGroups.length === 0) return

    setAddingToWb(true)
    try {
      // Fetch current whiteboard canvas
      const res = await fetch(`/api/whiteboards/${boardId}`)
      const data = await res.json()
      let elements: unknown[] = []
      try {
        const parsed = JSON.parse(data.canvas_json || '{}')
        elements = parsed.elements ?? []
      } catch { /* empty board */ }

      // Add question images side by side in a row
      const IMG_W = 600
      const IMG_H = 400
      const GAP   = 40
      const PER_ROW = 2

      // Find the bottom of existing content to place new images below
      let startY = 100
      for (const el of elements) {
        const e = el as { type: string; y?: number; h?: number; pts?: number[][] }
        if (e.type === 'image' && e.y !== undefined && e.h !== undefined) {
          startY = Math.max(startY, e.y + e.h + GAP)
        }
        if (e.type === 'stroke' && e.pts) {
          const maxY = Math.max(...e.pts.map((p: number[]) => p[1]))
          startY = Math.max(startY, maxY + GAP)
        }
      }

      const newEls = selectedGroups.map((g, i) => {
        const col = i % PER_ROW
        const row = Math.floor(i / PER_ROW)
        return {
          id: Math.random().toString(36).slice(2),
          type: 'image',
          url: g.meta.question_image_url,
          x: col * (IMG_W + GAP) + 60,
          y: startY + row * (IMG_H + GAP),
          w: IMG_W,
          h: IMG_H,
        }
      }).filter(el => !!el.url)

      const newCanvas = JSON.stringify({ version: 1, elements: [...elements, ...newEls] })
      await fetch(`/api/whiteboards/${boardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvas_json: newCanvas }),
      })

      setWbSuccess(boardName)
      setShowWbPicker(false)
      setSelected(new Set())
      setTimeout(() => setWbSuccess(null), 3000)
    } catch (err) {
      console.error('Add to whiteboard error:', err)
    } finally {
      setAddingToWb(false)
    }
  }

  const hasFilters = correctness !== 'all' || diffFilter || domainFilter || skillFilter

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        className="w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--background)', maxHeight: '90vh' }}>

        {/* Header */}
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
                Analyze Problems
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {grouped.length} unique question{grouped.length !== 1 ? 's' : ''} ·{' '}
                {answers.length} total attempt{answers.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-lg transition-colors flex-shrink-0"
              style={{ color: 'var(--text-muted)', background: 'var(--border)' }}>
              ×
            </button>
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Correctness */}
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
                  {c === 'all' ? 'All' : c === 'correct' ? '✓ Correct' : '✗ Wrong'}
                </button>
              ))}
            </div>

            {/* Difficulty filter */}
            {availableDiffs.length > 0 && (
              <div className="flex gap-1">
                {availableDiffs.map(d => {
                  const color = d === 'Easy' ? '#16a34a' : d === 'Medium' ? '#d97706' : '#dc2626'
                  return (
                    <button
                      key={d}
                      onClick={() => setDiffFilter(diffFilter === d ? null : d)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
                      style={{
                        borderColor: diffFilter === d ? color : 'var(--border)',
                        background:  diffFilter === d ? color + '20' : 'transparent',
                        color:       diffFilter === d ? color : 'var(--text-muted)',
                        fontWeight:  diffFilter === d ? 600 : 400,
                      }}>
                      {d}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Domain filter */}
            {availableDomains.length > 1 && (
              <select
                value={domainFilter ?? ''}
                onChange={e => { setDomainFilter(e.target.value || null); setSkillFilter(null) }}
                className="text-xs px-2.5 py-1.5 rounded-lg border outline-none"
                style={{ borderColor: domainFilter ? 'var(--accent)' : 'var(--border)', background: domainFilter ? 'var(--accent-light)' : 'var(--background)', color: domainFilter ? 'var(--accent)' : 'var(--text-muted)' }}>
                <option value="">All Topics</option>
                {availableDomains.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}

            {/* Skill filter */}
            {availableSkills.length > 0 && (
              <select
                value={skillFilter ?? ''}
                onChange={e => setSkillFilter(e.target.value || null)}
                className="text-xs px-2.5 py-1.5 rounded-lg border outline-none"
                style={{ borderColor: skillFilter ? 'var(--accent)' : 'var(--border)', background: skillFilter ? 'var(--accent-light)' : 'var(--background)', color: skillFilter ? 'var(--accent)' : 'var(--text-muted)' }}>
                <option value="">All Skills</option>
                {availableSkills.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}

            {/* Clear filters */}
            {hasFilters && (
              <button
                onClick={() => { setCorrectness('all'); setDiffFilter(null); setDomainFilter(null); setSkillFilter(null) }}
                className="text-xs px-2 py-1 rounded-lg transition-colors"
                style={{ color: 'var(--accent)', background: 'var(--accent-light)' }}>
                Clear
              </button>
            )}
          </div>

          {/* Selection bar */}
          {filtered.length > 0 && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === filtered.length}
                  ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length }}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 rounded"
                  style={{ accentColor: 'var(--accent)' }}
                />
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
              </label>

              {selected.size > 0 && (
                <>
                  <button
                    onClick={openWbPicker}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium text-white"
                    style={{ background: 'var(--accent)' }}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Add to Whiteboard
                  </button>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="text-xs px-2 py-1 rounded-lg"
                    style={{ color: 'var(--text-muted)' }}>
                    Clear selection
                  </button>
                </>
              )}

              {wbSuccess && (
                <span className="text-xs px-2.5 py-1 rounded-lg font-medium"
                  style={{ background: '#f0fdf4', color: '#16a34a' }}>
                  ✓ Added to &ldquo;{wbSuccess}&rdquo;
                </span>
              )}
            </div>
          )}
        </div>

        {/* Question list */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
              No questions match.
            </p>
          ) : filtered.map(g => {
            const isExpanded  = expanded === g.meta.question_id
            const isSelected  = selected.has(g.meta.question_id)
            const rightCount  = g.attempts.filter(a => a.is_correct === true).length
            const wrongCount  = g.attempts.length - rightCount
            const lastCorrect = g.attempts[g.attempts.length - 1]?.is_correct === true
            const diffColor   = g.meta.difficulty === 'Easy' ? '#16a34a' : g.meta.difficulty === 'Medium' ? '#d97706' : g.meta.difficulty === 'Hard' ? '#dc2626' : '#6b7280'

            return (
              <div
                key={g.meta.question_id}
                className="rounded-2xl border overflow-hidden"
                style={{
                  background:  'var(--card)',
                  borderColor: isSelected ? 'var(--accent)' : lastCorrect ? '#bbf7d0' : '#fecaca',
                  boxShadow:   isSelected ? '0 0 0 1px var(--accent)' : undefined,
                }}>
                {/* Row header */}
                <div
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  style={{ background: isSelected ? 'var(--accent-light)' : lastCorrect ? '#f0fdf420' : '#fef2f220' }}>
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(g.meta.question_id)}
                    onClick={e => e.stopPropagation()}
                    className="w-4 h-4 rounded flex-shrink-0 cursor-pointer"
                    style={{ accentColor: 'var(--accent)' }}
                  />

                  <button
                    onClick={() => setExpanded(isExpanded ? null : g.meta.question_id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-white text-xs flex-shrink-0"
                      style={{ background: lastCorrect ? '#16a34a' : '#dc2626' }}>
                      {lastCorrect ? '✓' : '✗'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-muted)' }}>
                        {g.meta.domain}{g.meta.skill ? ` · ${g.meta.skill}` : ''}
                      </p>
                      <span className="text-xs px-1.5 py-0.5 rounded-full inline-block mt-0.5"
                        style={{ background: diffColor + '20', color: diffColor }}>
                        {g.meta.difficulty || 'Unrated'}
                      </span>
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
                        style={{ color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t" style={{ borderColor: 'var(--border)' }}>
                    {/* Question image / text */}
                    {g.meta.stem ? (
                      <div className="px-4 pt-4">
                        <div className="rounded-xl p-3" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>
                          {g.meta.passage && <p className="text-xs italic mb-2" style={{ color: 'var(--text-muted)' }}>{g.meta.passage}</p>}
                          <p className="text-sm leading-relaxed" style={{ color: 'var(--foreground)' }}>{g.meta.stem}</p>
                          {g.meta.choices && ['A','B','C','D'].map(letter => (
                            <div key={letter} className="flex gap-2 mt-1.5 text-sm" style={{ color: 'var(--foreground)' }}>
                              <span className="font-bold w-4 flex-shrink-0">{letter}.</span>
                              <span>{g.meta.choices![letter]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : g.meta.question_image_url ? (
                      <div className="px-4 pt-4">
                        <img src={g.meta.question_image_url} alt="Question" className="w-full rounded-lg" />
                      </div>
                    ) : null}
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
                    {g.meta.stem ? null : g.meta.answer_image_url ? (
                      <div className="px-4 pb-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                          Explanation
                        </p>
                        <img src={g.meta.answer_image_url} alt="Explanation" className="w-full rounded-lg" />
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Whiteboard picker modal */}
      {showWbPicker && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowWbPicker(false) }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-5 flex flex-col gap-4"
            style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                Add {selected.size} question{selected.size !== 1 ? 's' : ''} to whiteboard
              </h3>
              <button onClick={() => setShowWbPicker(false)} style={{ color: 'var(--text-muted)' }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {loadingWbs ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-5 h-5 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
              </div>
            ) : whiteboards.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>No whiteboards yet.</p>
                <a href="/whiteboards/new" target="_blank" rel="noreferrer"
                  className="text-sm px-4 py-2 rounded-xl font-medium text-white"
                  style={{ background: 'var(--accent)' }}>
                  Create a whiteboard
                </a>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {whiteboards.map(wb => (
                    <button
                      key={wb.id}
                      onClick={() => addToWhiteboard(wb.id, wb.name)}
                      disabled={addingToWb}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors disabled:opacity-50 hover:opacity-80"
                      style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                      <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center"
                        style={{ background: 'var(--accent-light)' }}>
                        <svg className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                        {wb.name}
                      </span>
                      {addingToWb && <div className="w-4 h-4 border-2 rounded-full animate-spin ml-auto flex-shrink-0"
                        style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />}
                    </button>
                  ))}
                </div>
                {/* Always offer to create a new whiteboard */}
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>or</span>
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                </div>
                <a
                  href="/whiteboards/new"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-xl border text-sm font-medium transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--accent)', background: 'var(--accent-light)' }}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create new whiteboard
                </a>
              </div>
            )}
          </div>
        </div>
      )}
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

  // For all accuracy metrics, keep only the most recent attempt per question.
  // filteredAnswers is already sorted chronologically, so iterating in order and
  // overwriting means the last entry per question_id wins.
  const dedupedAnswers = useMemo(() => {
    const latest = new Map<string, UnifiedAnswer>()
    for (const a of filteredAnswers) latest.set(a.question_id, a)
    return [...latest.values()].sort(
      (a, b) => new Date(a.answered_at).getTime() - new Date(b.answered_at).getTime()
    )
  }, [filteredAnswers])

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

  const totalCorrect  = dedupedAnswers.filter(a => a.is_correct === true).length
  const totalAnswered = dedupedAnswers.length
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
          {isTeacher && (
            <a
              href={`/students/${student.id}/practice-tests`}
              className="inline-block mt-1 text-xs px-3 py-1 rounded-lg font-medium"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
              📋 View Practice Tests
            </a>
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

      {/* ── Panel 1: Performance by Difficulty ─────────────────────────── */}
      <div className="rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
          Performance by Difficulty
        </p>
        <div className="grid grid-cols-2 gap-6">
          {[...new Set(answers.map(a => a.subject))].sort().map(subj => (
            <DifficultyBarChart key={subj} answers={answers} subject={subj} />
          ))}
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

      {/* ── Panel 2 + 3: Readiness Signals + Trend Chart ───────────────── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '2fr 3fr' }}>
        <div className="rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Readiness Signals
          </p>
          <ReadinessPanel answers={answers} />
        </div>
        <div className="rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Accuracy Over Time by Difficulty
            </p>
            {/* Overall summary stats */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Overall</p>
                <p className="text-base font-bold" style={{ color: scoreColor(totalPct) }}>
                  {totalPct !== null ? `${totalPct}%` : '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Unique Qs</p>
                <p className="text-base font-bold" style={{ color: 'var(--foreground)' }}>{totalAnswered}</p>
              </div>
            </div>
          </div>
          <TrendChart answers={dedupedAnswers} />
        </div>
      </div>

      {/* ── Panel 4: True Improvement ──────────────────────────────────── */}
      <div className="rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Improvement Over Time
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Compares first half vs second half of attempts within the same domain × difficulty — immune to difficulty switching
          </p>
        </div>
        <TrueImprovementPanel answers={dedupedAnswers} />
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
