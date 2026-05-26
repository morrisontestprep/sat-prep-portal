'use client'

import { useState, useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SRQuestion = {
  position: number       // 1-based within module
  module: string         // 'rw_m1' | 'rw_m2' | 'math_m1' | 'math_m2'
  domain: string
  skill: string
  difficulty: string
  correct_answer: string
  question_image_url: string | null
  answer_image_url: string | null
  selected_answer: string | null
  is_correct: boolean | null
  flagged: boolean
  time_spent_seconds: number | null
}

type Props = {
  questions: SRQuestion[]
  // Scores
  rwScore: number | null
  mathScore: number | null
  totalScore: number | null
  rawCorrect: Record<string, number>   // { rw_m1: N, rw_m2: N, math_m1: N, math_m2: N }
  rawTotal:   Record<string, number>   // { rw_m1: N, rw_m2: N, math_m1: N, math_m2: N }
  // Presentation
  mode: 'student' | 'teacher'
  testDate: string       // ISO date string
  retake?: boolean
  backHref: string       // where the "← Back" link goes
  backLabel: string
  retakeHref?: string    // only for student mode
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  rw_m1:   'Reading & Writing — Module 1',
  rw_m2:   'Reading & Writing — Module 2',
  math_m1: 'Math — Module 1',
  math_m2: 'Math — Module 2',
}

const MODULE_ORDER = ['rw_m1', 'rw_m2', 'math_m1', 'math_m2']

const DIFF_STYLE: Record<string, { bg: string; color: string }> = {
  Easy:      { bg: '#f0fdf4', color: '#16a34a' },
  Medium:    { bg: '#fffbeb', color: '#d97706' },
  Hard:      { bg: '#fef2f2', color: '#dc2626' },
  'Very Hard': { bg: '#fdf2f8', color: '#9333ea' },
}

type ResultFilter = 'all' | 'correct' | 'wrong' | 'unanswered' | 'flagged'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(s: number | null): string {
  if (s == null || s < 0) return '—'
  return `${s.toFixed(0)}s`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function scoreColor(s: number | null): string {
  if (s == null) return 'var(--text-muted)'
  if (s >= 700) return '#16a34a'
  if (s >= 500) return '#d97706'
  return '#dc2626'
}

// Shorten long domain names for filter chips
function shortDomain(d: string): string {
  const map: Record<string, string> = {
    'Craft and Structure':                     'Craft & Structure',
    'Information and Ideas':                   'Info & Ideas',
    'Standard English Conventions':            'SEC',
    'Expression of Ideas':                     'Expression',
    'Problem-Solving and Data Analysis':       'PSDA',
    'Geometry and Trigonometry':               'Geometry',
  }
  return map[d] ?? d
}

// ─── QuestionCard ─────────────────────────────────────────────────────────────

function QuestionCard({ q, mode, idx }: { q: SRQuestion; mode: 'student' | 'teacher'; idx: number }) {
  const [open, setOpen] = useState(false)
  const answered  = q.selected_answer != null
  const isCorrect = q.is_correct
  const dc        = DIFF_STYLE[q.difficulty] ?? { bg: 'var(--border)', color: 'var(--text-muted)' }

  const borderColor = !answered ? 'var(--border)' : isCorrect ? '#bbf7d0' : '#fecaca'
  const headerBg    = !answered ? 'var(--card)'   : isCorrect ? '#f0fdf4' : '#fef2f2'

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor, background: 'var(--card)' }}>
      {/* Header row */}
      <div
        className="px-4 py-2.5 flex items-center gap-2 text-xs flex-wrap border-b"
        style={{ background: headerBg, borderColor }}>
        {/* Position badge */}
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-white text-xs flex-shrink-0"
          style={{ background: !answered ? '#9ca3af' : isCorrect ? '#16a34a' : '#dc2626' }}>
          {idx + 1}
        </span>

        {/* Module */}
        <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>
          {MODULE_LABELS[q.module]}
        </span>

        {/* Domain · Skill */}
        <span style={{ color: 'var(--text-muted)' }}>{q.domain}</span>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{q.skill}</span>

        {/* Difficulty */}
        {q.difficulty && (
          <span className="px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-xs" style={dc}>
            {q.difficulty}
          </span>
        )}

        {/* Flagged */}
        {q.flagged && (
          <span className="px-2 py-0.5 rounded-full text-xs flex-shrink-0" style={{ background: '#fefce8', color: '#854d0e' }}>
            🚩 Flagged
          </span>
        )}

        {/* Time */}
        {q.time_spent_seconds != null && (
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
            ⏱ {fmtTime(q.time_spent_seconds)}
          </span>
        )}
      </div>

      {/* Question image */}
      {q.question_image_url && (
        <div className="px-4 pt-3 pb-2">
          <img src={q.question_image_url} alt="Question" className="w-full rounded-lg" />
        </div>
      )}

      {/* Answer row */}
      <div className="px-4 pb-3 flex items-center gap-3 text-sm flex-wrap">
        {!answered ? (
          <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>
            Not answered
          </span>
        ) : (
          <>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {mode === 'student' ? 'Your answer:' : 'Student:'}
            </span>
            <span
              className="font-semibold px-2 py-0.5 rounded"
              style={{ background: isCorrect ? '#f0fdf4' : '#fef2f2', color: isCorrect ? '#16a34a' : '#dc2626' }}>
              {q.selected_answer}
            </span>
            {!isCorrect && q.correct_answer && (
              <>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Correct:</span>
                <span className="font-semibold px-2 py-0.5 rounded" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                  {q.correct_answer}
                </span>
              </>
            )}
          </>
        )}
      </div>

      {/* Explanation */}
      {q.answer_image_url && (
        mode === 'teacher' ? (
          <details
            className="px-4 pb-3 border-t"
            style={{ borderColor: 'var(--border)' }}
            open={open}
            onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}>
            <summary className="text-xs cursor-pointer pt-3" style={{ color: 'var(--accent)' }}>
              {open ? 'Hide explanation' : 'Show explanation'}
            </summary>
            <img src={q.answer_image_url} alt="Explanation" className="w-full rounded-lg mt-2" />
          </details>
        ) : (
          <details className="px-4 pb-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <summary className="text-xs cursor-pointer pt-3" style={{ color: 'var(--accent)' }}>
              Show explanation
            </summary>
            <img src={q.answer_image_url} alt="Explanation" className="w-full rounded-lg mt-2" />
          </details>
        )
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScoreReportClient({
  questions, rwScore, mathScore, totalScore,
  rawCorrect, rawTotal, mode, testDate, retake,
  backHref, backLabel, retakeHref,
}: Props) {
  // ── Filter state ────────────────────────────────────────────────────────────
  const [domainFilter,  setDomainFilter]  = useState<string>('all')
  const [skillFilter,   setSkillFilter]   = useState<string>('all')
  const [diffFilter,    setDiffFilter]    = useState<string>('all')
  const [resultFilter,  setResultFilter]  = useState<ResultFilter>('all')

  // ── Derived: available filter options ───────────────────────────────────────
  const domains    = useMemo(() => [...new Set(questions.map(q => q.domain))].sort(),    [questions])
  const skills     = useMemo(() => {
    const base = questions.filter(q => domainFilter === 'all' || q.domain === domainFilter)
    return [...new Set(base.map(q => q.skill))].sort()
  }, [questions, domainFilter])
  const diffs      = useMemo(() => ['Easy', 'Medium', 'Hard'].filter(d => questions.some(q => q.difficulty === d)), [questions])

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return questions.filter(q => {
      if (domainFilter !== 'all' && q.domain !== domainFilter) return false
      if (skillFilter  !== 'all' && q.skill  !== skillFilter)  return false
      if (diffFilter   !== 'all' && q.difficulty !== diffFilter) return false
      if (resultFilter === 'correct'    && q.is_correct !== true)        return false
      if (resultFilter === 'wrong'      && q.is_correct !== false)       return false
      if (resultFilter === 'unanswered' && q.selected_answer != null)    return false
      if (resultFilter === 'flagged'    && !q.flagged)                   return false
      return true
    })
  }, [questions, domainFilter, skillFilter, diffFilter, resultFilter])

  // ── Summary stats ────────────────────────────────────────────────────────────
  const totalQ    = questions.length
  const correct   = questions.filter(q => q.is_correct === true).length
  const wrong     = questions.filter(q => q.is_correct === false).length
  const skipped   = questions.filter(q => q.selected_answer == null).length
  const flagged   = questions.filter(q => q.flagged).length

  // Domain breakdown
  const domainBreakdown = useMemo(() => {
    const map: Record<string, { correct: number; total: number }> = {}
    for (const q of questions) {
      if (!map[q.domain]) map[q.domain] = { correct: 0, total: 0 }
      map[q.domain].total++
      if (q.is_correct) map[q.domain].correct++
    }
    return map
  }, [questions])

  // ── Filter chip helpers ─────────────────────────────────────────────────────
  function chipStyle(active: boolean) {
    return {
      borderRadius: 999,
      padding: '4px 12px',
      fontSize: 12,
      fontWeight: active ? 600 : 400,
      cursor: 'pointer',
      border: active ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
      background: active ? 'var(--accent-light)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
      transition: 'all 0.1s',
    } as React.CSSProperties
  }

  const resultOptions: { key: ResultFilter; label: string; count: number }[] = [
    { key: 'all',        label: 'All',        count: totalQ  },
    { key: 'correct',    label: '✓ Correct',  count: correct },
    { key: 'wrong',      label: '✗ Wrong',    count: wrong   },
    { key: 'unanswered', label: '— Skipped',  count: skipped },
    { key: 'flagged',    label: '🚩 Flagged', count: flagged },
  ]

  return (
    <div className="flex flex-col gap-8 pb-16">
      {/* ── Back link + header ── */}
      <div>
        <a href={backHref} className="text-sm" style={{ color: 'var(--accent)' }}>
          ← {backLabel}
        </a>
        <h1 className="text-2xl font-bold mt-1" style={{ color: 'var(--foreground)' }}>
          Score Report
          {mode === 'teacher' && <span className="text-base font-normal ml-2" style={{ color: 'var(--text-muted)' }}>(Teacher View)</span>}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {fmtDate(testDate)}{retake ? ' · Retake' : ''}
        </p>
      </div>

      {/* ── Score summary card ── */}
      <div className="rounded-2xl border p-6" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        {/* Score row */}
        <div className="flex items-end gap-10 flex-wrap mb-6">
          {[
            { label: 'Total',             val: totalScore, max: 1600, big: true },
            { label: 'Reading & Writing', val: rwScore,    max: 800 },
            { label: 'Math',              val: mathScore,  max: 800 },
          ].map(({ label, val, max, big }) => (
            <div key={label} className="text-center">
              <p className={`font-bold ${big ? 'text-5xl' : 'text-3xl'}`} style={{ color: scoreColor(val) }}>
                {val ?? '—'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{label} / {max}</p>
            </div>
          ))}
        </div>

        {/* Module breakdown */}
        <div className="flex gap-6 flex-wrap text-sm border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          {MODULE_ORDER.map(mod => (
            <div key={mod}>
              <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
                {rawCorrect[mod] ?? 0}/{rawTotal[mod] ?? 0}
              </span>
              <span className="ml-1.5" style={{ color: 'var(--text-muted)' }}>
                {MODULE_LABELS[mod]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Domain breakdown grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Object.entries(domainBreakdown).map(([domain, { correct: c, total: t }]) => {
          const pct = t > 0 ? Math.round((c / t) * 100) : 0
          const col = pct >= 70 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'
          return (
            <button
              key={domain}
              onClick={() => { setDomainFilter(d => d === domain ? 'all' : domain); setSkillFilter('all') }}
              className="rounded-xl border p-3 text-left transition-all"
              style={{
                background: domainFilter === domain ? 'var(--accent-light)' : 'var(--card)',
                borderColor: domainFilter === domain ? 'var(--accent)' : 'var(--border)',
              }}>
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-muted)' }}>
                {shortDomain(domain)}
              </p>
              <p className="text-lg font-bold mt-0.5" style={{ color: col }}>
                {c}/{t}
              </p>
              <p className="text-xs" style={{ color: col }}>{pct}%</p>
            </button>
          )
        })}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col gap-3 rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Filter questions</p>

        {/* Result filter */}
        <div className="flex flex-wrap gap-2">
          {resultOptions.map(o => (
            <button key={o.key} style={chipStyle(resultFilter === o.key)} onClick={() => setResultFilter(o.key)}>
              {o.label} ({o.count})
            </button>
          ))}
        </div>

        {/* Domain filter */}
        <div className="flex flex-wrap gap-2">
          <button style={chipStyle(domainFilter === 'all')} onClick={() => { setDomainFilter('all'); setSkillFilter('all') }}>
            All Domains
          </button>
          {domains.map(d => (
            <button key={d} style={chipStyle(domainFilter === d)} onClick={() => { setDomainFilter(d); setSkillFilter('all') }}>
              {shortDomain(d)}
            </button>
          ))}
        </div>

        {/* Skill filter (only when domain selected) */}
        {domainFilter !== 'all' && skills.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button style={chipStyle(skillFilter === 'all')} onClick={() => setSkillFilter('all')}>
              All Skills
            </button>
            {skills.map(s => (
              <button key={s} style={chipStyle(skillFilter === s)} onClick={() => setSkillFilter(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Difficulty filter */}
        <div className="flex flex-wrap gap-2">
          <button style={chipStyle(diffFilter === 'all')} onClick={() => setDiffFilter('all')}>
            All Difficulties
          </button>
          {diffs.map(d => (
            <button key={d} style={chipStyle(diffFilter === d)} onClick={() => setDiffFilter(d)}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* ── Question list ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            Questions
          </h2>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {filtered.length} of {totalQ}
          </span>
          {filtered.length === 0 && (
            <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>— no questions match your filters</span>
          )}
        </div>
        {filtered.map((q, i) => (
          <QuestionCard key={`${q.module}-${q.position}`} q={q} mode={mode} idx={i} />
        ))}
      </div>

      {/* ── Footer ── */}
      {mode === 'student' && retakeHref && (
        <div className="flex gap-3">
          <a
            href={backHref}
            className="px-6 py-3 rounded-xl font-semibold text-sm border"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
            {backLabel}
          </a>
          <a
            href={retakeHref}
            className="px-6 py-3 rounded-xl font-semibold text-sm text-white"
            style={{ background: 'var(--accent)' }}>
            Retake This Test →
          </a>
        </div>
      )}
    </div>
  )
}
