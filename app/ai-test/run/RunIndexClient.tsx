'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

type BatchResult = {
  done: boolean
  processed: number
  updated: number
  skipped: number
  next_offset: number
  total_remaining: number
}

export default function RunIndexClient({
  totalUnrated,
  hasApiKey,
}: {
  totalUnrated: number
  hasApiKey: boolean
}) {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [totalProcessed, setTotalProcessed] = useState(0)
  const [totalUpdated, setTotalUpdated] = useState(0)
  const [totalSkipped, setTotalSkipped] = useState(0)
  const [currentBatch, setCurrentBatch] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const abortRef = useRef(false)

  const BATCH_SIZE = 10
  const totalBatches = Math.ceil(totalUnrated / BATCH_SIZE)

  function addLog(msg: string) {
    setLog(prev => [...prev, msg])
  }

  async function runAll() {
    setRunning(true)
    setDone(false)
    abortRef.current = false
    setTotalProcessed(0)
    setTotalUpdated(0)
    setTotalSkipped(0)
    setCurrentBatch(0)
    setLog([])

    let batchNum = 0
    let grandProcessed = 0
    let grandUpdated = 0
    let grandSkipped = 0

    addLog(`Starting — ${totalUnrated} unrated questions, ~${totalBatches} batches of 10`)

    while (true) {
      if (abortRef.current) {
        addLog('⚠ Stopped by user.')
        break
      }

      batchNum++
      setCurrentBatch(batchNum)
      addLog(`Batch ${batchNum}…`)

      try {
        const res = await fetch('/api/index-difficulties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        const data: BatchResult = await res.json()

        // Guard against undefined values from unexpected responses
        const processed = data.processed ?? 0
        const updated = data.updated ?? 0
        const skipped = data.skipped ?? 0

        grandProcessed += processed
        grandUpdated += updated
        grandSkipped += skipped
        setTotalProcessed(grandProcessed)
        setTotalUpdated(grandUpdated)
        setTotalSkipped(grandSkipped)

        addLog(`  ✓ Rated: ${updated}  |  Unclear (skipped): ${skipped}`)

        if (data.done || processed === 0) {
          addLog(`\nAll done! Rated ${grandUpdated} questions. ${grandSkipped} were unclear and left unrated.`)
          setDone(true)
          break
        }

        // Small pause between batches to avoid rate limits
        await new Promise(r => setTimeout(r, 300))
      } catch (err) {
        addLog(`  ✗ Error on batch ${batchNum}: ${String(err)}`)
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
  const progress = totalUnrated > 0 ? Math.min(100, Math.round((totalHandled / totalUnrated) * 100)) : 0

  return (
    <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <div className="mb-6 flex items-center gap-2">
        <Link href="/ai-test" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Test batch</Link>
        <span style={{ color: 'var(--border)' }}>/</span>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Rate All Unrated Questions</h1>
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
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Unrated questions</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>{totalUnrated}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Rated so far</p>
            <p className="text-2xl font-bold" style={{ color: '#16a34a' }}>{totalUpdated}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Unclear / skipped</p>
            <p className="text-2xl font-bold" style={{ color: '#d97706' }}>{totalSkipped}</p>
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
                style={{ width: `${progress}%`, background: done ? '#16a34a' : '#7e22ce' }}
              />
            </div>
          </div>
        )}

        {!running && !done && (
          <div className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
            <p>Estimated time: ~{Math.ceil(totalUnrated / 10 * 5)} seconds &nbsp;·&nbsp; Estimated cost: ~${(totalUnrated * 0.003).toFixed(2)}</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-4">
        {!running && !done && (
          <button
            onClick={runAll}
            disabled={!hasApiKey || totalUnrated === 0}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: '#7e22ce' }}
          >
            Start Rating ({totalUnrated} questions)
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
            <Link
              href="/questions?difficulty=Unrated"
              className="px-5 py-2.5 rounded-lg text-sm font-medium border inline-block"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              View remaining unrated →
            </Link>
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
            <p key={i} style={{ color: line.startsWith('✓') || line.startsWith('All done') ? '#16a34a' : line.startsWith('✗') || line.startsWith('⚠') ? '#dc2626' : 'var(--text-muted)' }}>
              {line}
            </p>
          ))}
          {running && <p className="animate-pulse" style={{ color: '#7e22ce' }}>▌</p>}
        </div>
      )}
    </main>
  )
}
