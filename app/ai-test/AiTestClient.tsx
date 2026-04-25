'use client'

import { useState } from 'react'
import Link from 'next/link'

type Result = {
  id: string
  subject: string
  domain: string
  skill: string
  current_difficulty: string | null
  ai_difficulty: string | null
  difficulty_confidence?: string
  question_text: string | null
  features: string[]
  match?: 'correct' | 'mismatch' | 'new'
  error?: string
}

type Summary = {
  total_processed: number
  rated_tested: number
  correct_matches: number
  accuracy_percent: number
  errors: number
  estimated_cost: string
  full_bank_estimate: string
}

type ApiResponse = {
  results: Result[]
  summary: Summary
  error?: string
}

function DiffBadge({ d, label }: { d: string | null; label?: string }) {
  const styles: Record<string, { bg: string; fg: string }> = {
    Easy:   { bg: '#f0fdf4', fg: '#16a34a' },
    Medium: { bg: '#fffbeb', fg: '#d97706' },
    Hard:   { bg: '#fef2f2', fg: '#dc2626' },
  }
  const s = (d && styles[d]) ? styles[d] : { bg: '#f3f4f6', fg: '#6b7280' }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium inline-block" style={{ background: s.bg, color: s.fg }}>
      {label ?? d ?? 'Unrated'}
    </span>
  )
}

function MatchBadge({ match }: { match?: string }) {
  if (match === 'correct') return <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#f0fdf4', color: '#16a34a' }}>Match</span>
  if (match === 'mismatch') return <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#fef2f2', color: '#dc2626' }}>Mismatch</span>
  if (match === 'new') return <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#fdf4ff', color: '#7e22ce' }}>New rating</span>
  return null
}

export default function AiTestClient({ hasApiKey }: { hasApiKey: boolean }) {
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<Result[] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')

  async function runTest() {
    setRunning(true)
    setError('')
    setResults(null)
    setSummary(null)

    try {
      const res = await fetch('/api/test-vision', { method: 'POST' })
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

  return (
    <main className="flex-1 p-6 max-w-5xl mx-auto w-full">

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/questions" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Question Bank</Link>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>AI Vision Test Batch</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Processes 20 random questions with Claude Vision — 10 that already have difficulty ratings (to validate accuracy) and 10 unrated ones (to preview what AI would assign).
        </p>
      </div>

      {/* API key check */}
      {!hasApiKey && (
        <div className="rounded-xl border p-5 mb-6" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
          <p className="text-sm font-semibold mb-2" style={{ color: '#92400e' }}>API Key Required</p>
          <div className="text-sm space-y-2" style={{ color: '#78350f' }}>
            <p>To run this test, add your Anthropic API key to the project:</p>
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>Go to <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">console.anthropic.com</a></li>
              <li>Sign up or sign in (this is separate from your Claude Pro subscription)</li>
              <li>Go to <strong>Settings → Billing</strong> and add a payment method, then add credits ($5 minimum)</li>
              <li>Go to <strong>API Keys</strong> → <strong>Create Key</strong></li>
              <li>Copy the key and add it to your project file <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: '#fef3c7' }}>portal/.env.local</code>:</li>
            </ol>
            <div className="rounded-lg p-3 mt-2 font-mono text-xs" style={{ background: '#fef3c7' }}>
              ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
            </div>
            <p className="mt-2">Then restart your dev server (<code className="px-1.5 py-0.5 rounded text-xs" style={{ background: '#fef3c7' }}>npm run dev</code>) and refresh this page.</p>
          </div>
        </div>
      )}

      {/* Run button */}
      {hasApiKey && !running && !results && (
        <div className="rounded-xl border p-6 text-center" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: '#fdf4ff' }}>
            <svg className="w-7 h-7" style={{ color: '#7e22ce' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--foreground)' }}>Ready to test</p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            This will send 20 question images to Claude Vision Haiku. Estimated cost: ~$0.06.
          </p>
          <button
            onClick={runTest}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: '#7e22ce' }}
          >
            Run Test Batch (20 questions)
          </button>
        </div>
      )}

      {/* Running state */}
      {running && (
        <div className="rounded-xl border p-8 text-center" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="w-8 h-8 border-3 rounded-full animate-spin mx-auto mb-3"
            style={{ borderColor: '#e9d5ff', borderTopColor: '#7e22ce', borderWidth: 3 }} />
          <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Processing 20 questions…</p>
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

          {/* Summary card */}
          <div className="rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>Results Summary</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Questions processed</p>
                <p className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>{summary.total_processed}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Accuracy on known ratings</p>
                <p className="text-lg font-bold" style={{ color: summary.accuracy_percent >= 70 ? '#16a34a' : summary.accuracy_percent >= 50 ? '#d97706' : '#dc2626' }}>
                  {summary.accuracy_percent}% ({summary.correct_matches}/{summary.rated_tested})
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>This test cost</p>
                <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{summary.estimated_cost}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Full bank estimate (3,135 questions)</p>
                <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{summary.full_bank_estimate}</p>
              </div>
            </div>

            {/* Bar count accuracy breakdown */}
            {results && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--foreground)' }}>How AI determined difficulty</p>
                <div className="flex gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>● Counted bars: {results.filter(r => r.difficulty_confidence === 'bar_count').length}</span>
                  <span>~ Inferred: {results.filter(r => r.difficulty_confidence === 'inferred').length}</span>
                  <span>? Unclear: {results.filter(r => !r.difficulty_confidence || r.difficulty_confidence === 'unclear').length}</span>
                </div>
              </div>
            )}

            {summary.accuracy_percent >= 70 && (
              <div className="mt-4 rounded-lg p-3" style={{ background: '#f0fdf4' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: '#16a34a' }}>Looking good!</p>
                <p className="text-xs" style={{ color: '#16a34a' }}>
                  The AI is reliably reading the difficulty bars. Go to <strong>localhost:3000/ai-test/run</strong> to index all unrated questions.
                </p>
              </div>
            )}
            {summary.accuracy_percent > 0 && summary.accuracy_percent < 70 && (
              <div className="mt-4 rounded-lg p-3" style={{ background: '#fffbeb' }}>
                <p className="text-xs" style={{ color: '#d97706' }}>
                  Accuracy is lower than expected. Check the &quot;How AI knew&quot; column — if most say &quot;Unclear,&quot; the bars may not be visible in the image URLs. You can still rate questions manually by clicking any difficulty badge in the Question Bank.
                </p>
              </div>
            )}
          </div>

          {/* Re-run button */}
          <div className="flex gap-3">
            <button
              onClick={runTest}
              disabled={running}
              className="px-4 py-2 rounded-lg text-sm border transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--card)' }}
            >
              ↺ Run Again (new random sample)
            </button>
          </div>

          {/* Results table */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--background)' }}>
                    <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>#</th>
                    <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Subject / Domain</th>
                    <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Current</th>
                    <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>AI Estimate</th>
                    <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Result</th>
                    <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>How AI knew</th>
                    <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Extracted Text (preview)</th>
                    <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Features</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr
                      key={r.id}
                      className="border-t"
                      style={{ borderColor: 'var(--border)', background: i % 2 === 0 ? 'var(--card)' : 'var(--background)' }}
                    >
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
                          background: r.subject === 'math' ? '#eff6ff' : '#fdf4ff',
                          color: r.subject === 'math' ? '#1d4ed8' : '#7e22ce',
                        }}>
                          {r.subject === 'math' ? 'Math' : 'English'}
                        </span>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{r.domain}</p>
                      </td>
                      <td className="px-4 py-3"><DiffBadge d={r.current_difficulty} /></td>
                      <td className="px-4 py-3">
                        {r.error
                          ? <span className="text-xs" style={{ color: '#dc2626' }}>Error</span>
                          : <DiffBadge d={r.ai_difficulty} />
                        }
                      </td>
                      <td className="px-4 py-3"><MatchBadge match={r.match} /></td>
                      <td className="px-4 py-3">
                        <span className="text-xs" style={{ color: r.difficulty_confidence === 'bar_count' ? '#16a34a' : r.difficulty_confidence === 'inferred' ? '#d97706' : 'var(--text-muted)' }}>
                          {r.difficulty_confidence === 'bar_count' ? '● Counted bars' : r.difficulty_confidence === 'inferred' ? '~ Inferred' : '? Unclear'}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                          {r.question_text?.slice(0, 120) ?? '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {r.features?.slice(0, 4).map(f => (
                            <span key={f} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--background)', color: 'var(--text-muted)' }}>
                              {f}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
