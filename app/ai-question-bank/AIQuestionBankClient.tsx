'use client'

import { useState, useTransition } from 'react'
import type { AIQuestion, Choice } from './data'

// ── Types ────────────────────────────────────────────────────────────────────

type Status = 'pending' | 'approved' | 'discarded'
type FilterSubject    = 'all' | 'math' | 'reading_and_writing'
type FilterDifficulty = 'all' | 'Easy' | 'Medium' | 'Hard'
type FilterStatus     = 'all' | 'pending' | 'approved' | 'discarded'
type SkillTree        = Record<string, Record<string, string[]>>

// ── Style helpers ────────────────────────────────────────────────────────────

const DIFF_STYLES: Record<string, { bg: string; color: string }> = {
  Easy:   { bg: '#dcfce7', color: '#166534' },
  Medium: { bg: '#fef9c3', color: '#854d0e' },
  Hard:   { bg: '#fee2e2', color: '#991b1b' },
}
const SUBJ_STYLES: Record<string, { bg: string; color: string }> = {
  math:                { bg: '#dbeafe', color: '#1e40af' },
  english:             { bg: '#f3e8ff', color: '#6b21a8' },
  reading_and_writing: { bg: '#f3e8ff', color: '#6b21a8' },
}
const SUBJ_LABELS: Record<string, string> = {
  math:                'Math',
  english:             'Reading & Writing',
  reading_and_writing: 'Reading & Writing',
}

// ── API helpers ──────────────────────────────────────────────────────────────

async function updateStatus(id: string, status: Status): Promise<void> {
  const res = await fetch('/api/ai-questions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  })
  if (!res.ok) throw new Error('Failed to update status')
}

// ── Generation panel ─────────────────────────────────────────────────────────

function GeneratePanel({
  skillTree,
  onGenerated,
}: {
  skillTree: SkillTree
  onGenerated: (newQuestions: AIQuestion[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [subject,    setSubject]    = useState('')
  const [domain,     setDomain]     = useState('')
  const [skill,      setSkill]      = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [count,      setCount]      = useState(3)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState('')

  const subjectKeys = Object.keys(skillTree).sort()
  const domainKeys  = subject ? Object.keys(skillTree[subject] ?? {}).sort() : []
  const skillKeys   = (subject && domain) ? (skillTree[subject]?.[domain] ?? []).sort() : []

  const canGenerate = subject && domain && skill && difficulty && count > 0

  const handleSubjectChange = (v: string) => {
    setSubject(v); setDomain(''); setSkill('')
  }
  const handleDomainChange = (v: string) => {
    setDomain(v); setSkill('')
  }

  const SUBJECT_DISPLAY: Record<string, string> = {
    math:                'Math',
    english:             'Reading & Writing',
    reading_and_writing: 'Reading & Writing',
  }

  const handleGenerate = async () => {
    if (!canGenerate) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/ai-questions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, domain, skill, difficulty, count }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')

      // Fetch the newly created questions to add them to the list
      const fetchRes = await fetch(`/api/ai-questions/recent?ids=${data.ids.join(',')}`)
      if (fetchRes.ok) {
        const { questions } = await fetchRes.json()
        onGenerated(questions)
      }

      setSuccess(`${data.count} question${data.count !== 1 ? 's' : ''} generated and added to the pending list.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-6 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      {/* Panel header — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5"
        style={{ background: 'var(--card)' }}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--accent)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            Generate New Questions
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
            AI
          </span>
        </div>
        <svg
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
          style={{ color: 'var(--text-muted)' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Panel body */}
      {open && (
        <div className="px-5 py-4 border-t" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Pick a skill and difficulty. Claude will read real questions from your bank as examples and generate new ones in the same style.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {/* Subject */}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--foreground)' }}>Subject</label>
              <select
                value={subject}
                onChange={e => handleSubjectChange(e.target.value)}
                className="w-full text-sm px-3 py-1.5 rounded-lg border"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                <option value="">Select…</option>
                {subjectKeys.map(s => (
                  <option key={s} value={s}>{SUBJECT_DISPLAY[s] ?? s}</option>
                ))}
              </select>
            </div>

            {/* Domain */}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--foreground)' }}>Domain</label>
              <select
                value={domain}
                onChange={e => handleDomainChange(e.target.value)}
                disabled={!subject}
                className="w-full text-sm px-3 py-1.5 rounded-lg border disabled:opacity-40"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                <option value="">Select…</option>
                {domainKeys.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Skill */}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--foreground)' }}>Skill</label>
              <select
                value={skill}
                onChange={e => setSkill(e.target.value)}
                disabled={!domain}
                className="w-full text-sm px-3 py-1.5 rounded-lg border disabled:opacity-40"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                <option value="">Select…</option>
                {skillKeys.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Difficulty */}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--foreground)' }}>Difficulty</label>
              <select
                value={difficulty}
                onChange={e => setDifficulty(e.target.value)}
                className="w-full text-sm px-3 py-1.5 rounded-lg border"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              >
                <option value="">Select…</option>
                {['Easy', 'Medium', 'Hard'].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Count */}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--foreground)' }}>
                How many <span style={{ color: 'var(--text-muted)' }}>(1–8)</span>
              </label>
              <input
                type="number"
                min={1} max={8}
                value={count}
                onChange={e => setCount(Math.min(8, Math.max(1, Number(e.target.value))))}
                className="w-full text-sm px-3 py-1.5 rounded-lg border"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
              />
            </div>

            {/* Generate button */}
            <div className="flex items-end">
              <button
                onClick={handleGenerate}
                disabled={!canGenerate || loading}
                className="w-full text-sm font-semibold px-4 py-1.5 rounded-lg text-white disabled:opacity-40 transition-opacity"
                style={{ background: 'var(--accent)' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating…
                  </span>
                ) : 'Generate'}
              </button>
            </div>
          </div>

          {loading && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Reading seed questions and generating… this takes about 20–30 seconds.
            </p>
          )}
          {error && (
            <p className="text-xs font-medium" style={{ color: '#dc2626' }}>{error}</p>
          )}
          {success && (
            <p className="text-xs font-medium" style={{ color: '#166534' }}>✓ {success}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AIQuestionBankClient({
  initialQuestions,
  skillTree,
}: {
  initialQuestions: AIQuestion[]
  skillTree: SkillTree
}) {
  const [questions, setQuestions] = useState<AIQuestion[]>(initialQuestions)
  const [statuses, setStatuses] = useState<Record<string, Status>>(
    () => Object.fromEntries(initialQuestions.map(q => [q.id, q.status]))
  )
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({})
  const [filterSubject,    setFilterSubject]    = useState<FilterSubject>('all')
  const [filterDifficulty, setFilterDifficulty] = useState<FilterDifficulty>('all')
  const [filterStatus,     setFilterStatus]     = useState<FilterStatus>('pending')
  const [, startTransition] = useTransition()

  const setStatus = (id: string, status: Status) => {
    const previous = statuses[id]
    setStatuses(prev => ({ ...prev, [id]: status }))
    startTransition(() => {
      updateStatus(id, status).catch(() => {
        setStatuses(prev => ({ ...prev, [id]: previous }))
      })
    })
  }

  const handleGenerated = (newQuestions: AIQuestion[]) => {
    setQuestions(prev => [...newQuestions, ...prev])
    setStatuses(prev => ({
      ...prev,
      ...Object.fromEntries(newQuestions.map(q => [q.id, 'pending' as Status])),
    }))
    // Auto-switch filter to show the new pending questions
    setFilterStatus('pending')
  }

  const toggleNotes = (id: string) => {
    setExpandedNotes(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const counts = {
    pending:  Object.values(statuses).filter(s => s === 'pending').length,
    approved: Object.values(statuses).filter(s => s === 'approved').length,
    discarded: Object.values(statuses).filter(s => s === 'discarded').length,
  }

  const filtered = questions.filter(q => {
    if (filterSubject !== 'all' && q.subject !== filterSubject) return false
    if (filterDifficulty !== 'all' && q.difficulty !== filterDifficulty) return false
    if (filterStatus !== 'all' && statuses[q.id] !== filterStatus) return false
    return true
  })

  return (
    <div>
      {/* ── Generate panel ─────────────────────────────────────────────── */}
      <GeneratePanel skillTree={skillTree} onGenerated={handleGenerated} />

      {/* ── Summary bar ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-5">
        {[
          { label: 'Pending review', count: counts.pending,   color: 'var(--text-muted)', status: 'pending'   as FilterStatus },
          { label: 'In Question Bank', count: counts.approved, color: '#166534',           status: 'approved'  as FilterStatus },
          { label: 'Discarded',      count: counts.discarded, color: '#9ca3af',            status: 'discarded' as FilterStatus },
        ].map(({ label, count, color, status }) => (
          <button
            key={label}
            onClick={() => setFilterStatus(f => f === status ? 'all' : status)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-opacity"
            style={{
              background: filterStatus === status ? 'var(--accent-light)' : 'var(--card)',
              border: filterStatus === status ? '1.5px solid var(--accent)' : '1px solid var(--border)',
            }}
          >
            <span className="font-bold" style={{ color }}>{count}</span>
            <span style={{ color: 'var(--text-muted)' }}>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-6">
        <select
          value={filterSubject}
          onChange={e => setFilterSubject(e.target.value as FilterSubject)}
          className="text-sm px-3 py-1.5 rounded-lg border"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
        >
          <option value="all">All subjects</option>
          <option value="math">Math</option>
          <option value="reading_and_writing">Reading & Writing</option>
        </select>

        <select
          value={filterDifficulty}
          onChange={e => setFilterDifficulty(e.target.value as FilterDifficulty)}
          className="text-sm px-3 py-1.5 rounded-lg border"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
        >
          <option value="all">All difficulties</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as FilterStatus)}
          className="text-sm px-3 py-1.5 rounded-lg border"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending review</option>
          <option value="approved">In Question Bank</option>
          <option value="discarded">Discarded</option>
        </select>

        <span className="self-center text-sm" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} question{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Question cards ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        {filtered.map((q, idx) => {
          const status    = statuses[q.id]
          const notesOpen = expandedNotes[q.id]
          const diffStyle = DIFF_STYLES[q.difficulty] ?? DIFF_STYLES.Easy
          const subjStyle = SUBJ_STYLES[q.subject]    ?? SUBJ_STYLES.math

          return (
            <div
              key={q.id}
              className="rounded-2xl p-5 transition-opacity"
              style={{
                background: 'var(--card)',
                border: status === 'approved'
                  ? '1.5px solid #16a34a'
                  : status === 'discarded'
                  ? '1.5px solid var(--border)'
                  : '1px solid var(--border)',
                opacity: status === 'discarded' ? 0.45 : 1,
              }}
            >
              {/* Header */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>#{idx + 1}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: subjStyle.bg, color: subjStyle.color }}>
                  {SUBJ_LABELS[q.subject] ?? q.subject}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {q.domain} · {q.skill}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full ml-auto"
                  style={{ background: diffStyle.bg, color: diffStyle.color }}>
                  {q.difficulty}
                </span>
                {status === 'approved' && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: '#dcfce7', color: '#166534' }}>
                    ✓ In Question Bank
                  </span>
                )}
                {status === 'discarded' && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: '#f3f4f6', color: '#6b7280' }}>
                    Discarded
                  </span>
                )}
              </div>

              {/* Passage */}
              {q.passage && (
                <div className="text-sm mb-3 p-3 rounded-xl"
                  style={{ background: 'var(--background)', color: 'var(--text-muted)', borderLeft: '3px solid var(--accent)' }}>
                  {q.passage.split('\n\n').map((para, i) => (
                    <p key={i} className={i > 0 ? 'mt-2' : 'italic'}>{para}</p>
                  ))}
                </div>
              )}

              {/* Stem */}
              <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--foreground)' }}>
                {q.stem.split('\n\n').map((part, i) => (
                  <span key={i}>{i > 0 && <><br /><br /></>}{part}</span>
                ))}
              </p>

              {/* Choices */}
              <div className="space-y-2 mb-4">
                {(['A', 'B', 'C', 'D'] as Choice[]).map(letter => {
                  const isCorrect = letter === q.correct_answer
                  return (
                    <div key={letter}
                      className="flex items-start gap-3 px-3 py-2 rounded-xl text-sm"
                      style={{
                        background: isCorrect ? '#dcfce7' : 'var(--background)',
                        border: isCorrect ? '1.5px solid #16a34a' : '1px solid var(--border)',
                        color: isCorrect ? '#166534' : 'var(--foreground)',
                      }}>
                      <span className="font-bold flex-shrink-0 w-4">{letter}.</span>
                      <span className="flex-1">{q.choices[letter]}</span>
                      {isCorrect && (
                        <span className="text-xs flex-shrink-0 font-semibold" style={{ color: '#166534' }}>✓ correct</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Distractor notes */}
              {notesOpen && (
                <div className="mb-4 p-3 rounded-xl text-xs space-y-2"
                  style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>
                  <p className="font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                    Distractor reasoning
                  </p>
                  {(['A', 'B', 'C', 'D'] as Choice[]).map(letter => {
                    const note = q.distractor_notes[letter]
                    if (!note) return null
                    return (
                      <div key={letter} className="flex gap-2">
                        <span className="font-bold flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{letter}.</span>
                        <span style={{ color: 'var(--text-muted)' }}>{note}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => toggleNotes(q.id)}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ color: 'var(--accent)', background: 'var(--accent-light)' }}>
                  {notesOpen ? 'Hide distractor notes' : 'Show distractor notes'}
                </button>
                <div className="flex-1" />
                {status !== 'approved' && (
                  <button onClick={() => setStatus(q.id, 'approved')}
                    className="text-xs font-semibold px-4 py-1.5 rounded-lg text-white"
                    style={{ background: '#16a34a' }}>
                    Approve
                  </button>
                )}
                {status !== 'discarded' && (
                  <button onClick={() => setStatus(q.id, 'discarded')}
                    className="text-xs font-semibold px-4 py-1.5 rounded-lg border"
                    style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                    Discard
                  </button>
                )}
                {status !== 'pending' && (
                  <button onClick={() => setStatus(q.id, 'pending')}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ color: status === 'approved' ? '#dc2626' : 'var(--text-muted)' }}>
                    {status === 'approved' ? 'Remove from bank' : 'Undo'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
          <p className="text-sm">
            {questions.length === 0
              ? 'No questions yet — use the Generate panel above to create your first batch.'
              : 'No questions match the current filters.'}
          </p>
        </div>
      )}
    </div>
  )
}
