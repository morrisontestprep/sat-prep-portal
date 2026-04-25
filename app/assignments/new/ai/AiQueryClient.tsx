'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Question = {
  id: string
  subject: string
  domain: string
  skill: string
  difficulty: string
}

type ApiResponse = {
  questions: Question[]
  filterLabels: string[]
  total: number
  message?: string
  error?: string
}

const EXAMPLE_PROMPTS = [
  '10 medium Algebra problems on linear equations',
  '8 hard English grammar questions',
  '5 easy and medium math word problems',
  '12 Standard English Conventions questions',
  '6 hard Advanced Math questions',
]

function DifficultyBadge({ difficulty }: { difficulty: string | null | undefined }) {
  const styles: Record<string, { background: string; color: string }> = {
    Easy:   { background: '#f0fdf4', color: '#16a34a' },
    Medium: { background: '#fffbeb', color: '#d97706' },
    Hard:   { background: '#fef2f2', color: '#dc2626' },
  }
  const s = (difficulty && styles[difficulty]) ? styles[difficulty] : { background: '#f3f4f6', color: '#6b7280' }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={s}>
      {difficulty || 'Unrated'}
    </span>
  )
}

function SubjectBadge({ subject }: { subject: string }) {
  const isEnglish = subject === 'english'
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
      style={{
        background: isEnglish ? '#fdf4ff' : '#eff6ff',
        color: isEnglish ? '#7e22ce' : '#1d4ed8',
      }}
    >
      {isEnglish ? 'English' : 'Math'}
    </span>
  )
}

function QuestionCard({ q, onRemove }: { q: Question; onRemove: () => void }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl border"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <SubjectBadge subject={q.subject} />
      <span className="text-xs text-gray-500 flex-shrink-0">{q.domain}</span>
      <span className="text-xs text-gray-400 flex-shrink-0">·</span>
      <span className="text-xs text-gray-500 flex-1 truncate">{q.skill}</span>
      <DifficultyBadge difficulty={q.difficulty} />
      <button
        onClick={onRemove}
        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        title="Remove this question"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export default function AiQueryClient() {
  const router = useRouter()

  const [prompt, setPrompt] = useState('')
  const [count, setCount] = useState(10)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Question[] | null>(null)
  const [filterLabels, setFilterLabels] = useState<string[]>([])
  const [totalPool, setTotalPool] = useState(0)
  const [message, setMessage] = useState('')
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)

  const visibleQuestions = results?.filter(q => !removedIds.has(q.id)) ?? []

  async function handleSearch() {
    if (!prompt.trim()) return
    setLoading(true)
    setResults(null)
    setRemovedIds(new Set())
    setMessage('')

    try {
      const res = await fetch('/api/ai-select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), count }),
      })
      const data: ApiResponse = await res.json()

      if (data.error) {
        setMessage(data.error)
      } else {
        setResults(data.questions)
        setFilterLabels(data.filterLabels ?? [])
        setTotalPool(data.total)
        if (data.message) setMessage(data.message)
      }
    } catch {
      setMessage('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleRemove(id: string) {
    setRemovedIds(prev => new Set([...prev, id]))
  }

  function handleBuildWorksheet() {
    const ids = visibleQuestions.map(q => q.id).join(',')
    router.push(`/worksheets/new?q=${ids}`)
  }

  function handleExampleClick(example: string) {
    setPrompt(example)
  }

  return (
    <main className="flex-1 p-6 max-w-3xl mx-auto w-full">

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/assignments/new"
          className="text-sm flex items-center gap-1 transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
        <span style={{ color: 'var(--border)' }}>/</span>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>AI Query</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Describe what you need and we'll find matching questions.
          </p>
        </div>
      </div>

      {/* Prompt input card */}
      <div
        className="rounded-xl border p-5 mb-4"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      >
        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
          What questions do you need?
        </label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSearch() }}
          placeholder="e.g. 10 medium Algebra problems on linear equations"
          rows={3}
          className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2"
          style={{
            background: 'var(--background)',
            borderColor: 'var(--border)',
            color: 'var(--foreground)',
          }}
        />

        {/* Example prompts */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLE_PROMPTS.map(ex => (
            <button
              key={ex}
              onClick={() => handleExampleClick(ex)}
              className="text-xs px-2 py-1 rounded-full border transition-colors hover:opacity-80"
              style={{
                background: 'var(--accent-light)',
                borderColor: 'transparent',
                color: 'var(--accent)',
              }}
            >
              {ex}
            </button>
          ))}
        </div>

        {/* Count + Search row */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm" style={{ color: 'var(--text-muted)' }}>Questions:</label>
            <input
              type="number"
              min={1}
              max={30}
              value={count}
              onChange={e => setCount(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-16 rounded-lg border px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2"
              style={{
                background: 'var(--background)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
            />
          </div>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>max 30</span>
          <div className="flex-1" />
          <button
            onClick={handleSearch}
            disabled={loading || !prompt.trim()}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Finding…
              </span>
            ) : 'Find Questions'}
          </button>
        </div>
      </div>

      {/* Results */}
      {results !== null && (
        <div className="space-y-3">

          {/* Filter transparency */}
          {filterLabels.length > 0 && (
            <div
              className="rounded-xl border px-4 py-3"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            >
              <button
                className="flex items-center gap-2 w-full text-left"
                onClick={() => setFiltersOpen(o => !o)}
              >
                <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
                <span className="text-xs font-medium flex-1" style={{ color: 'var(--accent)' }}>
                  Filters applied — {visibleQuestions.length} of {totalPool} questions shown
                </span>
                <svg
                  className={`w-4 h-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--text-muted)' }}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {filtersOpen && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {filterLabels.map(label => (
                    <span
                      key={label}
                      className="text-xs px-2 py-1 rounded-full"
                      style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* No results message */}
          {message && visibleQuestions.length === 0 && (
            <div
              className="rounded-xl border px-4 py-4 text-sm"
              style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              <p>{message}</p>
              <p className="mt-1 text-xs">
                Try being more specific about subject, domain, or difficulty — e.g. "10 hard Algebra questions".
              </p>
            </div>
          )}

          {/* Question list */}
          {visibleQuestions.length > 0 && (
            <>
              <div className="space-y-2">
                {visibleQuestions.map(q => (
                  <QuestionCard key={q.id} q={q} onRemove={() => handleRemove(q.id)} />
                ))}
              </div>

              {removedIds.size > 0 && (
                <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                  {removedIds.size} question{removedIds.size > 1 ? 's' : ''} removed
                </p>
              )}

              {/* Actions */}
              <div
                className="rounded-xl border px-4 py-4 flex items-center gap-3"
                style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
              >
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg text-sm border transition-colors disabled:opacity-50"
                  style={{
                    background: 'var(--background)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-muted)',
                  }}
                >
                  ↺ Regenerate
                </button>
                <p className="text-xs flex-1" style={{ color: 'var(--text-muted)' }}>
                  Not what you expected? Try rewording your prompt or click Regenerate for a different random sample.
                </p>
                <button
                  onClick={handleBuildWorksheet}
                  disabled={visibleQuestions.length === 0}
                  className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50 flex items-center gap-2"
                  style={{ background: 'var(--accent)' }}
                >
                  Build Worksheet
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  )
}
