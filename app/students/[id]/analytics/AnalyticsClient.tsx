'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { EnrichedAnswer } from './page'
import DesmosCalculator from '@/components/DesmosCalculator'

// ── Types ────────────────────────────────────────────────────────────────────
type Student = { id: string; full_name: string | null; email: string | null }
type Props   = { student: Student; answers: EnrichedAnswer[] }

// ── Helpers ──────────────────────────────────────────────────────────────────
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

const CONFIDENCE_LABELS: Record<number, string> = {
  1: 'No idea', 2: 'Unsure', 3: 'Somewhat confident', 4: 'Confident', 5: 'Very confident',
}

// ── Time bucket config ────────────────────────────────────────────────────────
const TIME_BUCKETS = [
  { label: '< 30s',   min: 0,   max: 30       },
  { label: '30–60s',  min: 30,  max: 60       },
  { label: '60–90s',  min: 60,  max: 90       },
  { label: '90–120s', min: 90,  max: 120      },
  { label: '120s+',   min: 120, max: Infinity },
]

function inBucket(a: EnrichedAnswer, label: string) {
  const b = TIME_BUCKETS.find(x => x.label === label)
  if (!b || a.time_spent_seconds == null) return false
  return a.time_spent_seconds >= b.min && a.time_spent_seconds < b.max
}

// ── Cross-filter helper: apply subject/domain/skill filter to a pool ──────────
function applySubjectFilter(
  pool: EnrichedAnswer[],
  selSubject: string | null,
  selDomain:  string | null,
  selSkill:   string | null,
) {
  if (selSkill)   return pool.filter(a => a.skill   === selSkill)
  if (selDomain)  return pool.filter(a => a.domain  === selDomain)
  if (selSubject) return pool.filter(a => a.subject === selSubject)
  return pool
}

// ── Filter button ────────────────────────────────────────────────────────────
function FilterBtn({
  label, correct, total, active, onClick, indent = 0,
}: {
  label: string; correct: number; total: number
  active: boolean; onClick: () => void; indent?: number
}) {
  const p = pct(correct, total)
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all w-full"
      style={{
        marginLeft: indent * 14,
        width: `calc(100% - ${indent * 14}px)`,
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        background:  active ? 'var(--accent-light)' : 'transparent',
      }}>
      <span
        className="text-sm flex-1 min-w-0 truncate"
        style={{ color: active ? 'var(--accent)' : 'var(--foreground)', fontWeight: active ? 600 : 400 }}>
        {label}
      </span>
      <span className="flex-shrink-0 flex items-center gap-1 tabular-nums">
        {p !== null ? (
          <>
            <span className="text-xs font-semibold" style={{ color: scoreColor(p) }}>{p}%</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{correct}/{total}</span>
          </>
        ) : (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </span>
    </button>
  )
}

// ── Question card ────────────────────────────────────────────────────────────
function QuestionCard({ ans }: { ans: EnrichedAnswer }) {
  const [showExplanation, setShowExplanation] = useState(false)
  const isCorrect = ans.is_correct === true

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        background:  'var(--card)',
        borderColor: isCorrect ? '#bbf7d0' : '#fecaca',
      }}>

      {/* Header strip */}
      <div
        className="px-4 py-2 flex items-center gap-2 text-xs flex-wrap border-b"
        style={{ background: isCorrect ? '#f0fdf4' : '#fef2f2', borderColor: isCorrect ? '#bbf7d0' : '#fecaca' }}>
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
          style={{ background: isCorrect ? '#16a34a' : '#dc2626' }}>
          {isCorrect ? '✓' : '✗'}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>{ans.domain}</span>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span className="truncate flex-1" style={{ color: 'var(--text-muted)' }}>{ans.skill}</span>
        {ans.time_spent_seconds != null && (
          <span className="flex-shrink-0 px-1.5 py-0.5 rounded" style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>
            ⏱ {ans.time_spent_seconds}s
          </span>
        )}
        {ans.confidence_level != null && (
          <span className="flex-shrink-0 px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
            conf {ans.confidence_level}/5
          </span>
        )}
      </div>

      {/* Question image */}
      {ans.question_image_url && (
        <div className="px-4 pt-4 pb-2">
          <img src={ans.question_image_url} alt="Question" className="w-full rounded-lg" />
        </div>
      )}

      {/* Student notes */}
      {ans.student_notes && (
        <div
          className="mx-4 mb-3 flex items-start gap-2 px-3 py-2.5 rounded-lg border"
          style={{ background: '#fefce8', borderColor: '#fde68a' }}>
          <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="#ca8a04">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <p className="text-sm italic" style={{ color: '#92400e' }}>{ans.student_notes}</p>
        </div>
      )}

      {/* Answer row */}
      <div className="px-4 pb-4 flex items-center gap-4 flex-wrap text-sm">
        <div>
          <span className="text-xs font-medium mr-1" style={{ color: 'var(--text-muted)' }}>Answered:</span>
          <span
            className="font-semibold px-2 py-0.5 rounded-lg"
            style={{ background: isCorrect ? '#f0fdf4' : '#fef2f2', color: isCorrect ? '#16a34a' : '#dc2626' }}>
            {ans.selected_answer ?? '—'}
          </span>
        </div>
        {!isCorrect && (
          <div>
            <span className="text-xs font-medium mr-1" style={{ color: 'var(--text-muted)' }}>Correct:</span>
            <span className="font-semibold px-2 py-0.5 rounded-lg" style={{ background: '#f0fdf4', color: '#16a34a' }}>
              {ans.correct_answer}
            </span>
          </div>
        )}
        {ans.confidence_level != null && (
          <span className="text-xs px-2 py-0.5 rounded-lg" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
            {CONFIDENCE_LABELS[ans.confidence_level]}
          </span>
        )}
        <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>{ans.worksheet_title}</span>
      </div>

      {/* Explanation toggle */}
      {ans.answer_image_url && (
        <div className="px-4 pb-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setShowExplanation(v => !v)}
            className="text-xs font-medium underline"
            style={{ color: 'var(--accent)' }}>
            {showExplanation ? 'Hide explanation' : 'Show explanation'}
          </button>
          {showExplanation && (
            <img src={ans.answer_image_url} alt="Explanation" className="w-full rounded-lg mt-3" />
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AnalyticsClient({ student, answers }: Props) {
  const [selTime,    setSelTime]    = useState<string | null>(null)
  const [selSubject, setSelSubject] = useState<string | null>(null)
  const [selDomain,  setSelDomain]  = useState<string | null>(null)
  const [selSkill,   setSelSkill]   = useState<string | null>(null)
  const [correctness, setCorrectness] = useState<'all' | 'correct' | 'wrong'>('all')

  if (answers.length === 0) {
    return (
      <div>
        <Link href="/students" className="text-sm" style={{ color: 'var(--accent)' }}>← Students</Link>
        <h1 className="text-2xl font-bold mt-2 mb-1" style={{ color: 'var(--foreground)' }}>
          {student.full_name || student.email}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No answers submitted yet.</p>
      </div>
    )
  }

  // ── Pools for cross-filter % computation ──────────────────────────────────
  // Time buttons: see % for each bucket given the current subject/domain/skill filter
  const poolForTime    = applySubjectFilter(answers, selSubject, selDomain, selSkill)

  // Subject buttons: see % for each subject given the current time filter
  const poolForSubject = selTime ? answers.filter(a => inBucket(a, selTime)) : answers

  // Domain buttons: filtered by time + subject
  const poolForDomain  = poolForSubject.filter(a => !selSubject || a.subject === selSubject)

  // Skill buttons: filtered by time + subject + domain
  const poolForSkill   = poolForDomain.filter(a => !selDomain || a.domain === selDomain)

  // ── Display answers (all filters + correctness) ───────────────────────────
  const displayAnswers = applySubjectFilter(
    selTime ? answers.filter(a => inBucket(a, selTime)) : answers,
    selSubject, selDomain, selSkill,
  ).filter(a =>
    correctness === 'all'     ? true :
    correctness === 'correct' ? a.is_correct === true :
                                a.is_correct !== true
  )

  const totalAnswered = displayAnswers.length
  const totalCorrect  = displayAnswers.filter(a => a.is_correct === true).length
  const totalPct      = pct(totalCorrect, totalAnswered)

  // ── Subject / domain / skill lists ───────────────────────────────────────
  const allSubjects = [...new Set(answers.map(a => a.subject))].sort()

  const domains = selSubject
    ? [...new Set(answers.filter(a => a.subject === selSubject).map(a => a.domain))].sort()
    : []

  const skills = selDomain
    ? [...new Set(answers.filter(a => a.domain === selDomain).map(a => a.skill))].sort()
    : []

  const showCalculator = selSubject === 'math'

  return (
    <div className="flex flex-col gap-4 pb-20">
      {/* Header */}
      <div>
        <Link href="/students" className="text-sm" style={{ color: 'var(--accent)' }}>← Students</Link>
        <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--foreground)' }}>
          {student.full_name || student.email}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{student.email}</p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-5 items-start">

        {/* ── LEFT SIDEBAR ──────────────────────────────────────────────── */}
        <aside className="flex-shrink-0 space-y-5" style={{ width: 272 }}>

          {/* Show: All / Correct / Wrong */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'var(--text-muted)' }}>Show</p>
            <div className="flex gap-1">
              {(['all', 'correct', 'wrong'] as const).map(c => (
                <button key={c}
                  onClick={() => setCorrectness(c)}
                  className="flex-1 text-xs py-1.5 rounded-lg border transition-colors"
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
          </div>

          {/* Time per question */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'var(--text-muted)' }}>Time per question</p>
            <div className="space-y-1">
              {TIME_BUCKETS.map(b => {
                const inB    = poolForTime.filter(a => inBucket(a, b.label))
                const correct = inB.filter(a => a.is_correct === true).length
                return (
                  <FilterBtn
                    key={b.label}
                    label={b.label}
                    correct={correct}
                    total={inB.length}
                    active={selTime === b.label}
                    onClick={() => setSelTime(selTime === b.label ? null : b.label)}
                  />
                )
              })}
            </div>
          </div>

          {/* Subject / domain / skill */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'var(--text-muted)' }}>Subject</p>
            <div className="space-y-1">
              {allSubjects.map(subj => {
                const inS    = poolForSubject.filter(a => a.subject === subj)
                const correct = inS.filter(a => a.is_correct === true).length
                const active  = selSubject === subj
                return (
                  <div key={subj}>
                    <FilterBtn
                      label={formatSubject(subj)}
                      correct={correct}
                      total={inS.length}
                      active={active}
                      onClick={() => {
                        if (active) { setSelSubject(null); setSelDomain(null); setSelSkill(null) }
                        else        { setSelSubject(subj); setSelDomain(null); setSelSkill(null) }
                      }}
                    />

                    {/* Domains — only shown when this subject is selected */}
                    {active && domains.map(dom => {
                      const inD     = poolForDomain.filter(a => a.domain === dom)
                      const dcorrect = inD.filter(a => a.is_correct === true).length
                      const domActive = selDomain === dom
                      return (
                        <div key={dom} className="mt-1 space-y-1">
                          <FilterBtn
                            label={dom}
                            correct={dcorrect}
                            total={inD.length}
                            active={domActive}
                            indent={1}
                            onClick={() => {
                              if (domActive) { setSelDomain(null); setSelSkill(null) }
                              else           { setSelDomain(dom);  setSelSkill(null) }
                            }}
                          />

                          {/* Skills — only shown when this domain is selected */}
                          {domActive && skills.map(sk => {
                            const inK     = poolForSkill.filter(a => a.skill === sk)
                            const scorrect = inK.filter(a => a.is_correct === true).length
                            const skActive = selSkill === sk
                            return (
                              <FilterBtn
                                key={sk}
                                label={sk}
                                correct={scorrect}
                                total={inK.length}
                                active={skActive}
                                indent={2}
                                onClick={() => setSelSkill(skActive ? null : sk)}
                              />
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>

        {/* ── RIGHT: Summary + question cards ────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Summary bar */}
          <div className="flex items-center gap-6 px-5 py-3.5 rounded-2xl border"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Score</p>
              <p className="text-2xl font-bold" style={{ color: scoreColor(totalPct) }}>
                {totalPct !== null ? `${totalPct}%` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Questions</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>{totalAnswered}</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Correct</p>
              <p className="text-2xl font-bold" style={{ color: '#16a34a' }}>{totalCorrect}</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Incorrect</p>
              <p className="text-2xl font-bold" style={{ color: '#dc2626' }}>{totalAnswered - totalCorrect}</p>
            </div>
          </div>

          {/* Question cards */}
          {displayAnswers.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border-2 border-dashed"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <p className="text-sm">No questions match the current filters.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayAnswers.map((ans, i) => (
                <QuestionCard key={`${ans.assignment_id}-${ans.question_id}-${i}`} ans={ans} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Desmos calculator floating button — appears when Math is selected */}
      {showCalculator && <DesmosCalculator />}
    </div>
  )
}
