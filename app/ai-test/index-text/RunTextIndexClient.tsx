'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

type BatchResult = {
  done: boolean
  processed: number
  updated: number
  skipped: number
  total_remaining: number
  results: { id: string; status: string; chars?: number; features?: string[] }[]
  error?: string
}

export default function RunTextIndexClient({
  totalUnindexed,
  hasApiKey,
}: {
  totalUnindexed: number
  hasApiKey: boolean
}) {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [totalUpdated, setTotalUpdated] = useState(0)
  const [totalSkipped, setTotalSkipped] = useState(0)
  const [currentBatch, setCurrentBatch] = useState(0)
  const [remaining, setRemaining] = useState(totalUnindexed)
  const [log, setLog] = useState<string[]>([])
  const abortRef = useRef(false)

  const BATCH_SIZE = 10
  const totalBatches = Math.ceil(totalUnindexed / BATCH_SIZE)

  function addLog(msg: string) {
    setLog(prev => [...prev, msg])
  }

  async function runAll() {
    setRunning(true)
    setDone(false)
    abortRef.current = false
    setTotalUpdated(0)
    setTotalSkipped(0)
    setCurrentBatch(0)
    setRemaining(totalUnindexed)
    setLog([])

    let batchNum = 0
    let grandUpdated = 0
    let grandSkipped = 0

    addLog(`Starting — ${totalUnindexed.toLocaleString()} questions to index, ~${totalBatches} batches of ${BATCH_SIZE}`)

    while (true) {
      if (abortRef.current) {
        addLog('⚠ Stopped by user.')
        break
      }

      batchNum++
      setCurrentBatch(batchNum)
      addLog(`Batch ${batchNum}…`)

      try {
        const res = await fetch('/api/index-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        const data: BatchResult = await res.json()

        if (data.error) {
          addLog(`  ✗ API error: ${data.error}`)
          addLog('Stopping due to error.')
          break
        }

        const processed = data.processed ?? 0
        const updated = data.updated ?? 0
        const skipped = data.skipped ?? 0

        grandUpdated += updated
        grandSkipped += skipped
        setTotalUpdated(grandUpdated)
        setTotalSkipped(grandSkipped)
        setRemaining(data.total_remaining ?? 0)

        const avgChars = data.results
          .filter(r => r.chars)
          .reduce((sum, r) => sum + (r.chars ?? 0), 0)
        const okCount = data.results.filter(r => r.status === 'ok').length
        const avgCharsStr = okCount > 0 ? ` | avg ${Math.round(avgChars / okCount)} chars` : ''
        addLog(`  ✓ Indexed: ${updated}  |  Skipped: ${skipped}${avgCharsStr}  |  Remaining: ${data.total_remaining ?? 0}`)

        if (data.done || processed === 0) {
          addLog(`\nAll done! Indexed ${grandUpdated.toLocaleString()} questions. ${grandSkipped} failed and can be retried.`)
          setDone(true)
          break
        }

        // Small pause between batches
        await new Promise(r => setTimeout(r, 300))
      } catch (err) {
        const msg = String(err)
        // Network hiccup — wait 3s and retry this batch once before giving up
        if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) {
          addLog(`  ⚠ Network blip on batch ${batchNum}, retrying in 3s…`)
          await new Promise(r => setTimeout(r, 3000))
          batchNum-- // will be incremented again at top of loop
          continue
        }
        addLog(`  ✗ Error on batch ${batchNum}: ${msg}`)
        addLog('Stopping due to error.')
        break
      }
    }

    setRunning(false)
  }

  function stop() {
    abortRef.current = true
  }

  const totalHandled = totalUpdated + totalSkipped
  const progress = totalUnindexed > 0 ? Math.min(100, Math.round((totalHandled / totalUnindexed) * 100)) : 0

  const estSeconds = Math.ceil(totalUnindexed / BATCH_SIZE) * 5
  const estMinutes = Math.ceil(estSeconds / 60)
  const estCost = (totalUnindexed * 0.003).toFixed(2)

  return (
    <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/ai-test/text" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Text extraction test</Link>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Index All Questions</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Reads every question image and saves its text to the database for AI-powered searching.
        </p>
      </div>

      {!hasApiKey && (
        <div className="rounded-xl border p-4 mb-4" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
          <p className="text-sm" style={{ color: '#dc2626' }}>ANTHROPIC_API_KEY not found. Add it to .env.local and restart the dev server.</p>
        </div>
      )}

      {/* Stats */}
      <div className="rounded-xl border p-5 mb-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>To index</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>{remaining.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Indexed this run</p>
            <p className="text-2xl font-bold" style={{ color: '#16a34a' }}>{totalUpdated.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Skipped / failed</p>
            <p className="text-2xl font-bold" style={{ color: totalSkipped > 0 ? '#d97706' : 'var(--text-muted)' }}>{totalSkipped}</p>
          </div>
        </div>

        {/* Progress bar */}
        {(running || done) && (
          <div>
            <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              <span>Batch {currentBatch} of ~{totalBatches}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full rounded-full h-2" style={{ background: 'var(--border)' }}>
              <div
                className="h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%`, background: done ? '#16a34a' : '#2563eb' }}
              />
            </div>
          </div>
        )}

        {!running && !done && (
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            <p>Estimated time: ~{estMinutes} min &nbsp;·&nbsp; Estimated cost: ~${estCost}</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-4">
        {!running && !done && (
          <button
            onClick={runAll}
            disabled={!hasApiKey || totalUnindexed === 0}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: '#2563eb' }}
          >
            {totalUnindexed === 0 ? 'All Questions Indexed ✓' : `Index ${totalUnindexed.toLocaleString()} Questions`}
          </button>
        )}
        {running && (
          <button
            onClick={stop}
            className="px-6 py-2.5 rounded-lg text-sm font-medium border"
            style={{ borderColor: '#dc2626', color: '#dc2626' }}
          >
            Stop
          </button>
        )}
        {done && (
          <div className="flex gap-3">
            {totalSkipped > 0 && (
              <button
                onClick={runAll}
                className="px-5 py-2.5 rounded-lg text-sm font-medium border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                Retry {totalSkipped} failed
              </button>
            )}
            <Link
              href="/questions"
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-white inline-block"
              style={{ background: 'var(--accent)' }}
            >
              Back to Question Bank
            </Link>
          </div>
        )}
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div
          className="rounded-xl border p-4 font-mono text-xs space-y-0.5 max-h-80 overflow-y-auto"
          style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          {log.map((line, i) => (
            <p
              key={i}
              style={{
                color: line.startsWith('  ✓') || line.startsWith('All done') ? '#16a34a'
                  : line.startsWith('  ✗') || line.startsWith('⚠') ? '#dc2626'
                  : 'var(--text-muted)'
              }}
            >
              {line}
            </p>
          ))}
          {running && <p className="animate-pulse" style={{ color: '#2563eb' }}>▌</p>}
        </div>
      )}
    </main>
  )
}
