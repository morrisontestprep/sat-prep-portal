'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { EnrichedAnswer } from './page'

// ── Types ────────────────────────────────────────────────────────────────────

type Student = { id: string; full_name: string | null; email: string | null }

type Props = {
  student: Student
  answers: EnrichedAnswer[]
}

type SkillStats = {
  name: string
  total: number
  correct: number
  wrong: EnrichedAnswer[]
}

type DomainStats = {
  name: string
  total: number
  correct: number
  skills: Record<string, SkillStats>
}

type SubjectStats = {
  name: string
  total: number
  correct: number
  domains: Record<string, DomainStats>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(correct: number, total: number) {
  return total === 0 ? 0 : Math.round((correct / total) * 100)
}

function scoreColor(p: number) {
  if (p >= 80) return '#16a34a'
  if (p >= 60) return '#d97706'
  return '#dc2626'
}

function formatSubject(s: string) {
  if (s === 'math') return 'Math'
  if (s === 'reading_and_writing') return 'Reading & Writing'
  return s
}

const CONFIDENCE_LABELS: Record<number, string> = {
  1: 'No idea',
  2: 'Unsure',
  3: 'Somewhat confident',
  4: 'Confident',
  5: 'Very confident',
}

// ── Aggregate answers into subject/domain/skill tree ─────────────────────────

function buildTree(answers: EnrichedAnswer[]): Record<string, SubjectStats> {
  const tree: Record<string, SubjectStats> = {}

  for (const ans of answers) {
    const { subject, domain, skill } = ans
    const isCorrect = ans.is_correct === true

    if (!tree[subject]) tree[subject] = { name: formatSubject(subject), total: 0, correct: 0, domains: {} }
    tree[subject].total++
    if (isCorrect) tree[subject].correct++

    const domainMap = tree[subject].domains
    if (!domainMap[domain]) domainMap[domain] = { name: domain, total: 0, correct: 0, skills: {} }
    domainMap[domain].total++
    if (isCorrect) domainMap[domain].correct++

    const skillMap = domainMap[domain].skills
    if (!skillMap[skill]) skillMap[skill] = { name: skill, total: 0, correct: 0, wrong: [] }
    skillMap[skill].total++
    if (isCorrect) {
      skillMap[skill].correct++
    } else {
      skillMap[skill].wrong.push(ans)
    }
  }

  return tree
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ correct, total }: { correct: number; total: number }) {
  const p = pct(correct, total)
  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${p}%`, background: scoreColor(p) }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums w-10 text-right flex-shrink-0"
        style={{ color: scoreColor(p) }}>
        {p}%
      </span>
      <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
        {correct}/{total}
      </span>
    </div>
  )
}

function WrongAnswerCard({ ans }: { ans: EnrichedAnswer }) {
  const [showAnswer, setShowAnswer] = useState(false)

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      {/* Question image */}
      {ans.question_image_url && (
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <img src={ans.question_image_url} alt="Question" className="w-full rounded-lg" />
        </div>
      )}

      {/* Answer info */}
      <div className="p-4 space-y-3">
        <div className="flex gap-6 flex-wrap">
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Student's answer</p>
            <span className="text-sm font-semibold px-2.5 py-1 rounded-lg"
              style={{ background: '#fef2f2', color: '#dc2626' }}>
              {ans.selected_answer ?? '—'}
            </span>
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Correct answer</p>
            <span className="text-sm font-semibold px-2.5 py-1 rounded-lg"
              style={{ background: '#f0fdf4', color: '#16a34a' }}>
              {ans.correct_answer}
            </span>
          </div>
          {ans.confidence_level && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Confidence</p>
              <span className="text-sm px-2.5 py-1 rounded-lg"
                style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                {ans.confidence_level}/5 — {CONFIDENCE_LABELS[ans.confidence_level]}
              </span>
            </div>
          )}
        </div>

        {ans.student_notes && (
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Student notes</p>
            <p className="text-sm italic px-3 py-2 rounded-lg"
              style={{ background: '#fefce8', color: '#92400e' }}>
              {ans.student_notes}
            </p>
          </div>
        )}

        {/* Show answer image toggle */}
        {ans.answer_image_url && (
          <button
            onClick={() => setShowAnswer(v => !v)}
            className="text-xs font-medium underline"
            style={{ color: 'var(--accent)' }}>
            {showAnswer ? 'Hide answer explanation' : 'Show answer explanation'}
          </button>
        )}
        {showAnswer && ans.answer_image_url && (
          <img src={ans.answer_image_url} alt="Answer explanation" className="w-full rounded-lg mt-2" />
        )}

        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          From: {ans.worksheet_title}
        </p>
      </div>
    </div>
  )
}

function SkillRow({ skill }: { skill: SkillStats }) {
  const [exploreOpen, setExploreOpen] = useState(false)
  const hasWrong = skill.wrong.length > 0

  return (
    <div>
      <div className="flex items-center gap-3 py-2 pl-10 pr-4">
        <span className="text-sm min-w-0 flex-1 truncate" style={{ color: 'var(--foreground)' }}>
          {skill.name}
        </span>
        <ProgressBar correct={skill.correct} total={skill.total} />
        {hasWrong && (
          <button
            onClick={() => setExploreOpen(v => !v)}
            className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0 font-medium"
            style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
            {exploreOpen ? 'Hide' : `Explore ${skill.wrong.length} wrong`}
          </button>
        )}
      </div>

      {exploreOpen && (
        <div className="pl-10 pr-4 pb-4 space-y-3">
          {skill.wrong.map((ans, i) => (
            <WrongAnswerCard key={`${ans.assignment_id}-${ans.question_id}-${i}`} ans={ans} />
          ))}
        </div>
      )}
    </div>
  )
}

function DomainRow({ domain }: { domain: DomainStats }) {
  const [open, setOpen] = useState(false)
  const skills = Object.values(domain.skills).sort((a, b) => pct(a.correct, a.total) - pct(b.correct, b.total))

  return (
    <div className="border-t" style={{ borderColor: 'var(--border)' }}>
      <button
        className="w-full flex items-center gap-3 py-2.5 px-6 text-left hover:opacity-80 transition-opacity"
        onClick={() => setOpen(v => !v)}>
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 transition-transform"
          style={{ color: 'var(--text-muted)', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: 'var(--foreground)' }}>
          {domain.name}
        </span>
        <ProgressBar correct={domain.correct} total={domain.total} />
      </button>

      {open && (
        <div className="pb-1" style={{ background: 'var(--background)' }}>
          {skills.map(skill => (
            <SkillRow key={skill.name} skill={skill} />
          ))}
        </div>
      )}
    </div>
  )
}

function SubjectSection({ subject }: { subject: SubjectStats }) {
  const [open, setOpen] = useState(true)
  const p = pct(subject.correct, subject.total)
  const domains = Object.values(subject.domains).sort((a, b) => pct(a.correct, a.total) - pct(b.correct, b.total))

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      {/* Subject header */}
      <button
        className="w-full flex items-center gap-4 px-6 py-4 text-left"
        onClick={() => setOpen(v => !v)}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: `${scoreColor(p)}20` }}>
          <span className="text-sm font-bold" style={{ color: scoreColor(p) }}>{p}%</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>{subject.name}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {subject.correct} correct · {subject.total - subject.correct} incorrect · {subject.total} total
          </p>
        </div>
        <div className="w-32 hidden sm:block">
          <ProgressBar correct={subject.correct} total={subject.total} />
        </div>
        <svg
          className="w-4 h-4 flex-shrink-0 transition-transform"
          style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Domains */}
      {open && (
        <div>
          {domains.map(domain => (
            <DomainRow key={domain.name} domain={domain} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AnalyticsClient({ student, answers }: Props) {
  const tree = buildTree(answers)
  const subjects = Object.values(tree).sort((a, b) => a.name.localeCompare(b.name))

  const totalAnswered = answers.length
  const totalCorrect = answers.filter(a => a.is_correct === true).length
  const totalPct = pct(totalCorrect, totalAnswered)

  // Weakest skills across all subjects (wrong >= 1, sorted by % desc for worst first)
  const allSkills: SkillStats[] = []
  for (const subj of subjects) {
    for (const dom of Object.values(subj.domains)) {
      for (const skill of Object.values(dom.skills)) {
        if (skill.wrong.length > 0) allSkills.push(skill)
      }
    }
  }
  allSkills.sort((a, b) => pct(a.correct, a.total) - pct(b.correct, b.total))
  const weakestSkills = allSkills.slice(0, 5)

  if (answers.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <Link href="/students" className="text-sm" style={{ color: 'var(--accent)' }}>← Students</Link>
        </div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--foreground)' }}>
          {student.full_name || student.email}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No answers submitted yet.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <Link href="/students" className="text-sm" style={{ color: 'var(--accent)' }}>
          ← Students
        </Link>
        <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--foreground)' }}>
          {student.full_name || student.email}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{student.email}</p>
      </div>

      {/* Overall summary bar */}
      <div className="rounded-2xl border px-6 py-5 flex flex-wrap gap-6"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Overall</p>
          <p className="text-3xl font-bold" style={{ color: scoreColor(totalPct) }}>{totalPct}%</p>
        </div>
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Questions</p>
          <p className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>{totalAnswered}</p>
        </div>
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Correct</p>
          <p className="text-3xl font-bold" style={{ color: '#16a34a' }}>{totalCorrect}</p>
        </div>
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Incorrect</p>
          <p className="text-3xl font-bold" style={{ color: '#dc2626' }}>{totalAnswered - totalCorrect}</p>
        </div>
      </div>

      {/* Weakest skills callout */}
      {weakestSkills.length > 0 && (
        <div className="rounded-2xl border px-6 py-5"
          style={{ background: '#fff7ed', borderColor: '#fed7aa' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: '#92400e' }}>
            Needs most work
          </p>
          <div className="space-y-2">
            {weakestSkills.map(skill => (
              <div key={skill.name} className="flex items-center gap-3">
                <span className="text-sm flex-1" style={{ color: '#78350f' }}>{skill.name}</span>
                <span className="text-xs font-semibold tabular-nums"
                  style={{ color: scoreColor(pct(skill.correct, skill.total)) }}>
                  {pct(skill.correct, skill.total)}%
                </span>
                <span className="text-xs" style={{ color: '#a16207' }}>
                  {skill.correct}/{skill.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subject breakdown */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>
          BREAKDOWN BY SUBJECT
        </h2>
        <div className="space-y-4">
          {subjects.map(subject => (
            <SubjectSection key={subject.name} subject={subject} />
          ))}
        </div>
      </div>
    </div>
  )
}
