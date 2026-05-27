'use client'

import { useState, useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SRQuestion = {
  position: number
  module: string
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
  rwScore: number | null
  mathScore: number | null
  totalScore: number | null
  rawCorrect: Record<string, number>
  rawTotal:   Record<string, number>
  mode: 'student' | 'teacher'
  testDate: string
  retake?: boolean
  backHref: string
  backLabel: string
  retakeHref?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  rw_m1:   'Reading & Writing — Module 1',
  rw_m2:   'Reading & Writing — Module 2',
  math_m1: 'Math — Module 1',
  math_m2: 'Math — Module 2',
}

const MODULE_ORDER = ['rw_m1', 'rw_m2', 'math_m1', 'math_m2']

const RW_MODULES   = ['rw_m1', 'rw_m2']
const MATH_MODULES = ['math_m1', 'math_m2']

type ModuleFilter = 'all' | 'rw' | 'math' | 'rw_m1' | 'rw_m2' | 'math_m1' | 'math_m2'
type ResultFilter = 'all' | 'correct' | 'wrong' | 'unanswered' | 'flagged'

function modulesForFilter(f: ModuleFilter): string[] {
  if (f === 'all')   return MODULE_ORDER
  if (f === 'rw')    return RW_MODULES
  if (f === 'math')  return MATH_MODULES
  return [f]
}

const DIFF_STYLE: Record<string, { bg: string; color: string }> = {
  Easy:   { bg: '#f0fdf4', color: '#16a34a' },
  Medium: { bg: '#fffbeb', color: '#d97706' },
  Hard:   { bg: '#fef2f2', color: '#dc2626' },
}

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
  if (s >= 700)  return '#16a34a'
  if (s >= 500)  return '#d97706'
  return '#dc2626'
}

function shortDomain(d: string): string {
  const map: Record<string, string> = {
    'Craft and Structure':               'Craft & Structure',
    'Information and Ideas':             'Info & Ideas',
    'Standard English Conventions':      'SEC',
    'Expression of Ideas':               'Expression',
    'Problem-Solving and Data Analysis': 'PSDA',
    'Geometry and Trigonometry':         'Geometry',
  }
  return map[d] ?? d
}

// ─── Difficulty Bar Chart ─────────────────────────────────────────────────────

type DiffBar = { diff: string; correct: number; wrong: number; unanswered: number; total: number }

function DifficultyChart({ data }: { data: DiffBar[] }) {
  if (data.length === 0) return null

  const maxVal = Math.max(...data.flatMap(d => [d.correct, d.wrong]), 1)
  const BAR_H  = 120 // px — max bar height

  return (
    <div className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--text-muted)' }}>
        Results by Difficulty
      </p>

      <div className="flex items-end justify-around gap-4">
        {data.map(({ diff, correct, wrong, unanswered, total }) => {
          const correctH    = Math.round((correct    / maxVal) * BAR_H)
          const wrongH      = Math.round((wrong      / maxVal) * BAR_H)
          const correctPct  = total > 0 ? Math.round((correct / total) * 100) : 0
          const dc          = DIFF_STYLE[diff] ?? { bg: 'var(--border)', color: 'var(--text-muted)' }

          return (
            <div key={diff} className="flex flex-col items-center gap-2 flex-1">
              {/* Bars */}
              <div className="flex items-end gap-2 justify-center" style={{ height: BAR_H + 24 }}>
                {/* Correct bar */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs font-semibold" style={{ color: '#16a34a' }}>{correct}</span>
                  <div
                    style={{
                      width: 28,
                      height: correctH || 2,
                      background: '#16a34a',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.3s ease',
                      opacity: correct === 0 ? 0.25 : 1,
                    }}
                  />
                </div>
                {/* Wrong bar */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs font-semibold" style={{ color: '#dc2626' }}>{wrong}</span>
                  <div
                    style={{
                      width: 28,
                      height: wrongH || 2,
                      background: '#dc2626',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.3s ease',
                      opacity: wrong === 0 ? 0.25 : 1,
                    }}
                  />
                </div>
              </div>

              {/* Divider line */}
              <div style={{ width: '100%', height: 1, background: 'var(--border)' }} />

              {/* Difficulty label */}
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={dc}>
                {diff}
              </span>

              {/* Summary: n/total, pct */}
              <span className="text-xs font-medium" style={{ color: scoreColor(correctPct >= 10 ? correctPct * 7 : null) }}>
                {correct}/{total}
              </span>
              <span className="text-xs" style={{ color: correctPct >= 70 ? '#16a34a' : correctPct >= 50 ? '#d97706' : '#dc2626' }}>
                {correctPct}%
              </span>
              {unanswered > 0 && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {unanswered} skipped
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: '#16a34a' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Correct</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: '#dc2626' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Wrong</span>
        </div>
      </div>
    </div>
  )
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
      <div className="px-4 py-2.5 flex items-center gap-2 text-xs flex-wrap border-b" style={{ background: headerBg, borderColor }}>
        <span className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-white text-xs flex-shrink-0"
          style={{ background: !answered ? '#9ca3af' : isCorrect ? '#16a34a' : '#dc2626' }}>
          {idx + 1}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>
          {MODULE_LABELS[q.module]}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>{q.domain}</span>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{q.skill}</span>
        {q.difficulty && (
          <span className="px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-xs" style={dc}>
            {q.difficulty}
          </span>
        )}
        {q.flagged && (
          <span className="px-2 py-0.5 rounded-full text-xs flex-shrink-0" style={{ background: '#fefce8', color: '#854d0e' }}>
            🚩 Flagged
          </span>
        )}
        {q.time_spent_seconds != null && (
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
            ⏱ {fmtTime(q.time_spent_seconds)}
          </span>
        )}
      </div>

      {q.question_image_url && (
        <div className="px-4 pt-3 pb-2">
          <img src={q.question_image_url} alt="Question" className="w-full rounded-lg" />
        </div>
      )}

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
            <span className="font-semibold px-2 py-0.5 rounded"
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

      {q.answer_image_url && (
        mode === 'teacher' ? (
          <details className="px-4 pb-3 border-t" style={{ borderColor: 'var(--border)' }}
            open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}>
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
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all')
  const [domainFilter, setDomainFilter] = useState<string>('all')
  const [skillFilter,  setSkillFilter]  = useState<string>('all')
  const [diffFilter,   setDiffFilter]   = useState<string>('all')
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')

  // ── Module filter helpers ────────────────────────────────────────────────────
  function setModule(f: ModuleFilter) {
    setModuleFilter(f)
    setDomainFilter('all')
    setSkillFilter('all')
  }

  const activeModules = modulesForFilter(moduleFilter)

  // ── Base set: module-filtered only (used for domain grid + chart) ───────────
  const moduleFiltered = useMemo(
    () => questions.filter(q => activeModules.includes(q.module)),
    [questions, moduleFilter] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ── Available domains/skills within current module selection ─────────────────
  const domains = useMemo(
    () => [...new Set(moduleFiltered.map(q => q.domain))].sort(),
    [moduleFiltered]
  )
  const skills = useMemo(() => {
    const base = moduleFiltered.filter(q => domainFilter === 'all' || q.domain === domainFilter)
    return [...new Set(base.map(q => q.skill))].sort()
  }, [moduleFiltered, domainFilter])
  const diffs = useMemo(
    () => ['Easy', 'Medium', 'Hard'].filter(d => moduleFiltered.some(q => q.difficulty === d)),
    [moduleFiltered]
  )

  // ── Domain breakdown (module-filtered only, for the grid cards) ──────────────
  const domainBreakdown = useMemo(() => {
    const map: Record<string, { correct: number; total: number }> = {}
    for (const q of moduleFiltered) {
      if (!map[q.domain]) map[q.domain] = { correct: 0, total: 0 }
      map[q.domain].total++
      if (q.is_correct) map[q.domain].correct++
    }
    return map
  }, [moduleFiltered])

  // ── Chart data: module + domain + skill filtered, NOT result/diff filtered ──
  // (Chart always shows correct vs wrong breakdown so result filter doesn't collapse it)
  const chartBase = useMemo(() => moduleFiltered.filter(q => {
    if (domainFilter !== 'all' && q.domain !== domainFilter) return false
    if (skillFilter  !== 'all' && q.skill  !== skillFilter)  return false
    return true
  }), [moduleFiltered, domainFilter, skillFilter])

  const chartData: DiffBar[] = useMemo(() =>
    ['Easy', 'Medium', 'Hard']
      .map(diff => {
        const qs = chartBase.filter(q => q.difficulty === diff)
        return {
          diff,
          correct:    qs.filter(q => q.is_correct === true).length,
          wrong:      qs.filter(q => q.is_correct === false).length,
          unanswered: qs.filter(q => q.selected_answer == null).length,
          total:      qs.length,
        }
      })
      .filter(d => d.total > 0),
    [chartBase]
  )

  // ── Fully filtered list (question cards) ────────────────────────────────────
  const filtered = useMemo(() => moduleFiltered.filter(q => {
    if (domainFilter !== 'all' && q.domain !== domainFilter) return false
    if (skillFilter  !== 'all' && q.skill  !== skillFilter)  return false
    if (diffFilter   !== 'all' && q.difficulty !== diffFilter) return false
    if (resultFilter === 'correct'    && q.is_correct !== true)     return false
    if (resultFilter === 'wrong'      && q.is_correct !== false)    return false
    if (resultFilter === 'unanswered' && q.selected_answer != null) return false
    if (resultFilter === 'flagged'    && !q.flagged)                return false
    return true
  }), [moduleFiltered, domainFilter, skillFilter, diffFilter, resultFilter])

  // ── Summary counts (over full module-filtered set) ───────────────────────────
  const totalQ  = moduleFiltered.length
  const correct = moduleFiltered.filter(q => q.is_correct === true).length
  const wrong   = moduleFiltered.filter(q => q.is_correct === false).length
  const skipped = moduleFiltered.filter(q => q.selected_answer == null).length
  const flagged = moduleFiltered.filter(q => q.flagged).length

  // ── Chip style ───────────────────────────────────────────────────────────────
  function chipStyle(active: boolean, color?: string): React.CSSProperties {
    return {
      borderRadius: 999,
      padding: '4px 12px',
      fontSize: 12,
      fontWeight: active ? 600 : 400,
      cursor: 'pointer',
      border: active ? `1.5px solid ${color ?? 'var(--accent)'}` : '1.5px solid var(--border)',
      background: active ? (color ? `${color}18` : 'var(--accent-light)') : 'transparent',
      color: active ? (color ?? 'var(--accent)') : 'var(--text-muted)',
      transition: 'all 0.1s',
    }
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

      {/* ── Back + header ── */}
      <div>
        <a href={backHref} className="text-sm" style={{ color: 'var(--accent)' }}>← {backLabel}</a>
        <h1 className="text-2xl font-bold mt-1" style={{ color: 'var(--foreground)' }}>
          Score Report
          {mode === 'teacher' && <span className="text-base font-normal ml-2" style={{ color: 'var(--text-muted)' }}>(Teacher View)</span>}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {fmtDate(testDate)}{retake ? ' · Retake' : ''}
        </p>
      </div>

      {/* ── Score summary ── */}
      <div className="rounded-2xl border p-6" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
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
        <div className="flex gap-6 flex-wrap text-sm border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          {MODULE_ORDER.map(mod => (
            <div key={mod}>
              <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
                {rawCorrect[mod] ?? 0}/{rawTotal[mod] ?? 0}
              </span>
              <span className="ml-1.5" style={{ color: 'var(--text-muted)' }}>{MODULE_LABELS[mod]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Subject / Module filter ── */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Filter by section
        </p>
        {/* Subject row */}
        <div className="flex flex-wrap gap-2">
          <button style={chipStyle(moduleFilter === 'all')} onClick={() => setModule('all')}>All Sections</button>
          <button style={chipStyle(moduleFilter === 'rw', '#1d4ed8')} onClick={() => setModule('rw')}>
            Reading &amp; Writing
          </button>
          <button style={chipStyle(moduleFilter === 'math', '#7c3aed')} onClick={() => setModule('math')}>
            Math
          </button>
        </div>
        {/* Individual modules row */}
        <div className="flex flex-wrap gap-2">
          {(['rw_m1', 'rw_m2', 'math_m1', 'math_m2'] as ModuleFilter[]).map(mod => {
            const isRW   = mod === 'rw_m1' || mod === 'rw_m2'
            const color  = isRW ? '#1d4ed8' : '#7c3aed'
            const labels: Record<string, string> = {
              rw_m1:   'R&W Module 1', rw_m2:   'R&W Module 2',
              math_m1: 'Math Module 1', math_m2: 'Math Module 2',
            }
            return (
              <button key={mod} style={chipStyle(moduleFilter === mod, color)} onClick={() => setModule(mod)}>
                {labels[mod]}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Domain breakdown grid (respects module filter) ── */}
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
                background:  domainFilter === domain ? 'var(--accent-light)' : 'var(--card)',
                borderColor: domainFilter === domain ? 'var(--accent)'       : 'var(--border)',
              }}>
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-muted)' }}>
                {shortDomain(domain)}
              </p>
              <p className="text-lg font-bold mt-0.5" style={{ color: col }}>{c}/{t}</p>
              <p className="text-xs" style={{ color: col }}>{pct}%</p>
            </button>
          )
        })}
      </div>

      {/* ── Difficulty bar chart ── */}
      <DifficultyChart data={chartData} />

      {/* ── Question filters ── */}
      <div className="flex flex-col gap-3 rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Filter questions</p>

        {/* Result */}
        <div className="flex flex-wrap gap-2">
          {resultOptions.map(o => (
            <button key={o.key} style={chipStyle(resultFilter === o.key)} onClick={() => setResultFilter(o.key)}>
              {o.label} ({o.count})
            </button>
          ))}
        </div>

        {/* Domain */}
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

        {/* Skill (only when domain selected and multiple skills exist) */}
        {domainFilter !== 'all' && skills.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button style={chipStyle(skillFilter === 'all')} onClick={() => setSkillFilter('all')}>All Skills</button>
            {skills.map(s => (
              <button key={s} style={chipStyle(skillFilter === s)} onClick={() => setSkillFilter(s)}>{s}</button>
            ))}
          </div>
        )}

        {/* Difficulty */}
        <div className="flex flex-wrap gap-2">
          <button style={chipStyle(diffFilter === 'all')} onClick={() => setDiffFilter('all')}>All Difficulties</button>
          {diffs.map(d => (
            <button key={d} style={chipStyle(diffFilter === d)} onClick={() => setDiffFilter(d)}>{d}</button>
          ))}
        </div>
      </div>

      {/* ── Question list ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Questions</h2>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{filtered.length} of {totalQ}</span>
          {filtered.length === 0 && (
            <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>— no questions match</span>
          )}
        </div>
        {filtered.map((q, i) => (
          <QuestionCard key={`${q.module}-${q.position}`} q={q} mode={mode} idx={i} />
        ))}
      </div>

      {/* ── Footer ── */}
      {mode === 'student' && retakeHref && (
        <div className="flex gap-3">
          <a href={backHref} className="px-6 py-3 rounded-xl font-semibold text-sm border"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
            {backLabel}
          </a>
          <a href={retakeHref} className="px-6 py-3 rounded-xl font-semibold text-sm text-white"
            style={{ background: 'var(--accent)' }}>
            Retake This Test →
          </a>
        </div>
      )}
    </div>
  )
}
