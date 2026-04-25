'use client'

import { useState } from 'react'
import Link from 'next/link'

type Result = {
  id: string
  subject: string
  domain: string
  skill: string
  difficulty: string | null
  question_text: string | null
  features: string[]
  status: string
}

type Summary = {
  total: number
  extracted: number
  errors: number
  avg_text_length: number
  feature_counts: Record<string, number>
  estimated_cost: string
  full_bank_estimate: string
}

type ApiResponse = {
  results: Result[]
  summary: Summary
  error?: string
}

function DiffBadge({ d }: { d: string | null }) {
  const styles: Record<string, { bg: string; fg: string }> = {
    Easy:   { bg: '#f0fdf4', fg: '#16a34a' },
    Medium: { bg: '#fffbeb', fg: '#d97706' },
    Hard:   { bg: '#fef2f2', fg: '#dc2626' },
  }
  const s = (d && styles[d]) ? styles[d] : { bg: '#f3f4f6', fg: '#6b7280' }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium inline-block" style={{ background: s.bg, color: s.fg }}>
      {d ?? 'Unrated'}
    </span>
  )
}

export default function TextIndexClient({ hasApiKey }: { hasApiKey: boolean }) {
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<Result[] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  async function runTest() {
    setRunning(true)
    setError('')
    setResults(null)
    setSummary(null)

    try {
      const res = await fetch('/api/test-text-index', { method: 'POST' })
      const data: ApiResponse = await res.json()

      if (data.error) {
        setError(data.error)
      } else {
        setResults(data.results)
        setSummary(data.summary)
      }
    } catch {
      setError('Something went wrong. Check the console for details.')
    } finally {
      setRunning(false)
    }
  }

  const topFeatures = summary
    ? Object.entries(summary.feature_counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
    : []

  return (
    <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/ai-test" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Test batch</Link>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Text Extraction Test</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Tests Claude Vision on 20 random questions — extracts question text and features for preview. Nothing is written to the database.
        </p>
      </div>

      {/* API key warning */}
      {!hasApiKey && (
        <div className="rounded-xl border p-4 mb-4" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
          <p className="text-sm" style={{ color: '#dc2626' }}>ANTHROPIC_API_KEY not found. Add it to .env.local and restart the dev server.</p>
        </div>
      )}

      {/* Run button */}
      {hasApiKey && !running && !results && (
        <div className="rounded-xl border p-6 text-center" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: '#eff6ff' }}>
            <svg className="w-7 h-7" style={{ color: '#2563eb' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--foreground)' }}>Ready to test text extraction</p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            Sends 20 question images to Claude Vision to extract readable text and visual features. Estimated cost: ~$0.06. No data is saved.
          </p>
          <button
            onClick={runTest}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: '#2563eb' }}
          >
            Run Extraction Test (20 questions)
          </button>
        </div>
      )}

      {/* Running */}
      {running && (
        <div className="rounded-xl border p-8 text-center" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="w-8 h-8 border-3 rounded-full animate-spin mx-auto mb-3"
            style={{ borderColor: '#bfdbfe', borderTopColor: '#2563eb', borderWidth: 3 }} />
          <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Extracting text from 20 questions…</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>This takes about 30–60 seconds</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border p-4 mb-4" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
          <p className="text-sm" style={{ color: '#dc2626' }}>{error}</p>
        </div>
      )}

      {/* Results */}
      {results && summary && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Extraction Summary</h2>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Processed</p>
                <p className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>{summary.total}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Extracted</p>
                <p className="text-xl font-bold" style={{ color: '#16a34a' }}>{summary.extracted}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Avg text length</p>
                <p className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>{summary.avg_text_length} chars</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Errors</p>
                <p className="text-xl font-bold" style={{ color: summary.errors > 0 ? '#dc2626' : '#16a34a' }}>{summary.errors}</p>
              </div>
            </div>

            {/* Top features */}
            {topFeatures.length > 0 && (
              <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--foreground)' }}>Most common features detected</p>
                <div className="flex flex-wrap gap-2">
                  {topFeatures.map(([feat, count]) => (
                    <span key={feat} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--background)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      {feat} <span className="font-semibold">×{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 pt-3 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              This test cost {summary.estimated_cost} · Full 3,135 questions would cost {summary.full_bank_estimate}
            </div>

            {summary.extracted >= 18 && (
              <div className="mt-3 rounded-lg p-3" style={{ background: '#f0fdf4' }}>
                <p className="text-xs font-semibold" style={{ color: '#16a34a' }}>Extraction quality looks great!</p>
                <p className="text-xs mt-0.5" style={{ color: '#16a34a' }}>
                  Go to <Link href="/ai-test/index-text" className="underline font-semibold">/ai-test/index-text</Link> to index all {(3135).toLocaleString()} questions.
                </p>
              </div>
            )}
          </div>

          {/* Re-run */}
          <button
            onClick={runTest}
            disabled={running}
            className="px-4 py-2 rounded-lg text-sm border transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--card)' }}
          >
            ↺ Run Again (new random sample)
          </button>

          {/* Results list */}
          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={r.id}
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
              >
                <button
                  className="w-full text-left px-4 py-3 flex items-center gap-3"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)', minWidth: 20 }}>{i + 1}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
                    background: r.subject === 'math' ? '#eff6ff' : '#fdf4ff',
                    color: r.subject === 'math' ? '#1d4ed8' : '#7e22ce',
                  }}>
                    {r.subject === 'math' ? 'Math' : 'English'}
                  </span>
                  <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{r.domain}</span>
                  <DiffBadge d={r.difficulty} />
                  {r.question_text
                    ? <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#f0fdf4', color: '#16a34a' }}>✓ Extracted</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#fef2f2', color: '#dc2626' }}>✗ Failed</span>
                  }
                  <svg
                    className="w-4 h-4 transition-transform"
                    style={{ color: 'var(--text-muted)', transform: expanded === r.id ? 'rotate(180deg)' : 'none' }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {expanded === r.id && (
                  <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    {r.question_text ? (
                      <>
                        <div className="mt-3 rounded-lg p-3 text-sm" style={{ background: 'var(--background)', color: 'var(--foreground)', lineHeight: 1.6 }}>
                          {r.question_text}
                        </div>
                        {r.features.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {r.features.map(f => (
                              <span key={f} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--background)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                                {f}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="mt-3 text-xs" style={{ color: '#dc2626' }}>{r.status}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {summary.extracted >= 18 && (
            <div className="flex gap-3">
              <Link
                href="/ai-test/index-text"
                className="px-6 py-2.5 rounded-lg text-sm font-medium text-white inline-block"
                style={{ background: '#2563eb' }}
              >
                Index All Questions →
              </Link>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
