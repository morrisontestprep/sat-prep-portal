'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

type BatchResult = {
  done: boolean
  processed: number
  updated: number
  skipped: number
  total_remaining: number
  error?: string
}

export default function EmbeddingsIndexClient({
  totalUnembedded,
  hasApiKey,
}: {
  totalUnembedded: number
  hasApiKey: boolean
}) {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [totalUpdated, setTotalUpdated] = useState(0)
  const [totalSkipped, setTotalSkipped] = useState(0)
  const [currentBatch, setCurrentBatch] = useState(0)
  const [remaining, setRemaining] = useState(totalUnembedded)
  const [log, setLog] = useState<string[]>([])
  const abortRef = useRef(false)

  const BATCH_SIZE = 50
  const totalBatches = Math.ceil(totalUnembedded / BATCH_SIZE)
  // ~3,135 questions × ~200 tokens × $0.00000002/token ≈ $0.01
  const estCost = ((totalUnembedded * 200 / 1_000_000) * 0.02).toFixed(2)
  const estSeconds = Math.ceil(totalBatches * 2) // ~2s per batch (single API call)
  const estMinutes = estSeconds < 60 ? `${estSeconds}s` : `${Math.ceil(estSeconds / 60)} min`

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
    setRemaining(totalUnembedded)
    setLog([])

    let batchNum = 0
    let grandUpdated = 0
    let grandSkipped = 0

    addLog(`Starting — ${totalUnembedded.toLocaleString()} questions, ~${totalBatches} batches of ${BATCH_SIZE}`)

    while (true) {
      if (abortRef.current) {
        addLog('⚠ Stopped by user.')
        break
      }

      batchNum++
      setCurrentBatch(batchNum)

      try {
        const res = await fetch('/api/index-embeddings', { method: 'POST' })
        const data: BatchResult = await res.json()

        if (data.error) {
          addLog(`  ✗ Error: ${data.error}`)
          addLog('Stopping due to error.')
          break
        }

        const updated = data.updated ?? 0
        const skipped = data.skipped ?? 0
        grandUpdated += updated
        grandSkipped += skipped
        setTotalUpdated(grandUpdated)
        setTotalSkipped(grandSkipped)
        setRemaining(data.total_remaining ?? 0)

        addLog(`  ✓ Batch ${batchNum}: embedded ${updated} | remaining: ${data.total_remaining}`)

        if (data.done || data.processed === 0) {
          addLog(`\nAll done! Embedded ${grandUpdated.toLocaleString()} questions.`)
          if (grandSkipped > 0) addLog(`  ${grandSkipped} skipped — retry to catch them.`)
          setDone(true)
          break
        }

        // Small pause — OpenAI embeddings are fast, no need for long delays
        await new Promise(r => setTimeout(r, 200))
      } catch (err) {
        const msg = String(err)
        if (msg.includes('fetch') || msg.includes('Failed')) {
          addLog(`  ⚠ Network blip on batch ${batchNum}, retrying in 3s…`)
          await new Promise(r => setTimeout(r, 3000))
          batchNum--
          continue
        }
        addLog(`  ✗ Error: ${msg}`)
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
  const progress = totalUnembedded > 0 ? Math.min(100, Math.round((totalHandled / totalUnembedded) * 100)) : 0

  return (
    <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <div className="mb-6">
        <Link href="/ai-test" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Test tools</Link>
        <h1 className="text-2xl font-bold mt-1" style={{ color: 'var(--foreground)' }}>Semantic Search Index</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Converts every question into a meaning vector so the AI can understand concepts, not just keywords.
        </p>
      </div>

      {!hasApiKey && (
        <div className="rounded-xl border p-4 mb-4" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
          <p className="text-sm font-semibold" style={{ color: '#dc2626' }}>OPENAI_API_KEY not found</p>
          <p className="text-xs mt-1" style={{ color: '#dc2626' }}>
            Add it to portal/.env.local and restart the dev server. Get a key at platform.openai.com.
          </p>
        </div>
      )}

      {/* How it works */}
      {!running && !done && (
        <div className="rounded-xl border p-4 mb-4 text-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          <p className="font-semibold mb-1" style={{ color: 'var(--foreground)' }}>How semantic search works</p>
          <p>Each question gets converted into a 1536-number "meaning vector" by OpenAI. When you search "circle problems", your prompt is also converted, and the database finds the questions whose meaning is mathematically closest — even if they use different words.</p>
        </div>
      )}

      {/* Stats */}
      <div className="rounded-xl border p-5 mb-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>To embed</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>{remaining.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Embedded this run</p>
            <p className="text-2xl font-bold" style={{ color: '#16a34a' }}>{totalUpdated.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Skipped</p>
            <p className="text-2xl font-bold" style={{ color: totalSkipped > 0 ? '#d97706' : 'var(--text-muted)' }}>{totalSkipped}</p>
          </div>
        </div>

        {(running || done) && (
          <div>
            <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              <span>Batch {currentBatch} of ~{totalBatches}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full rounded-full h-2" style={{ background: 'var(--border)' }}>
              <div
                className="h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%`, background: done ? '#16a34a' : '#7c3aed' }}
              />
            </div>
          </div>
        )}

        {!running && !done && hasApiKey && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Estimated time: ~{estMinutes} &nbsp;·&nbsp; Estimated cost: ~${estCost} (one-time)
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-4">
        {!running && !done && (
          <button
            onClick={runAll}
            disabled={!hasApiKey || totalUnembedded === 0}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: '#7c3aed' }}
          >
            {totalUnembedded === 0 ? 'All Questions Embedded ✓' : `Generate Embeddings (${totalUnembedded.toLocaleString()} questions)`}
          </button>
        )}
        {running && (
          <button onClick={stop} className="px-6 py-2.5 rounded-lg text-sm font-medium border" style={{ borderColor: '#dc2626', color: '#dc2626' }}>
            Stop
          </button>
        )}
        {done && (
          <div className="flex gap-3 items-center">
            <div className="text-sm font-semibold" style={{ color: '#16a34a' }}>✓ Semantic search is ready</div>
            <Link href="/questions" className="px-5 py-2.5 rounded-lg text-sm font-medium text-white inline-block" style={{ background: 'var(--accent)' }}>
              Try it in Question Bank →
            </Link>
          </div>
        )}
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div className="rounded-xl border p-4 font-mono text-xs space-y-0.5 max-h-64 overflow-y-auto" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
          {log.map((line, i) => (
            <p key={i} style={{ color: line.startsWith('  ✓') || line.startsWith('All done') ? '#16a34a' : line.startsWith('  ✗') || line.startsWith('⚠') ? '#dc2626' : 'var(--text-muted)' }}>
              {line}
            </p>
          ))}
          {running && <p className="animate-pulse" style={{ color: '#7c3aed' }}>▌</p>}
        </div>
      )}
    </main>
  )
}
