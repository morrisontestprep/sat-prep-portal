'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

// ── Types ──────────────────────────────────────────────────────────────────────

type WBBoard = { id: string; name: string }

export type SelectedQuestion = {
  id: string
  imageUrl: string | null   // null = needs to be fetched from DB
}

type Props = {
  questions: SelectedQuestion[]
  worksheetTitle: string
  onClose: () => void
}

// ── Constants ──────────────────────────────────────────────────────────────────

// Default image dimensions on the whiteboard (world units = screen pixels at scale 1)
const IMG_W = 700
const IMG_H = 500
const GAP   = 60    // vertical gap between stacked images

function uid() { return Math.random().toString(36).slice(2) }

// ── Component ──────────────────────────────────────────────────────────────────

export default function AddToWhiteboardModal({ questions, worksheetTitle, onClose }: Props) {
  const supabase = createClient()

  const [boards,   setBoards]   = useState<WBBoard[]>([])
  const [loading,  setLoading]  = useState(true)
  const [targetId, setTargetId] = useState<string>('new')
  const [working,  setWorking]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // Load the teacher's own whiteboards
  useEffect(() => {
    fetch('/api/whiteboards')
      .then(r => r.json())
      .then(d => { setBoards(d.ownBoards ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleConfirm() {
    setWorking(true)
    setError(null)

    try {
      // ── Step 1: Resolve image URLs for any questions that don't have them ──
      const imageUrls: string[] = []
      for (const q of questions) {
        if (q.imageUrl) {
          imageUrls.push(q.imageUrl)
        } else {
          // Editor path — fetch from DB
          const { data } = await supabase
            .from('questions')
            .select('question_image_url')
            .eq('id', q.id)
            .single()
          if (data?.question_image_url) imageUrls.push(data.question_image_url)
        }
      }

      if (!imageUrls.length) {
        setError('No images found for the selected questions.')
        setWorking(false)
        return
      }

      // ── Step 2: Fetch existing whiteboard content (if appending) ──────────
      let existingElements: any[] = []
      if (targetId !== 'new') {
        const res = await fetch(`/api/whiteboards/${targetId}`)
        const data = await res.json()
        if (data?.canvas_json) {
          try { existingElements = JSON.parse(data.canvas_json).elements ?? [] } catch { /* ok */ }
        }
      }

      // ── Step 3: Find the bottommost y of all existing elements ────────────
      let maxBottom = 0
      for (const el of existingElements) {
        let bottom = 0
        if (el.type === 'image') {
          bottom = (el.y ?? 0) + (el.h ?? 0)
        } else if (el.type === 'text') {
          bottom = (el.y ?? 0) + ((el.size ?? 18) * 1.4)
        } else if (el.type === 'stroke' && Array.isArray(el.pts) && el.pts.length > 0) {
          bottom = Math.max(...el.pts.map((p: number[]) => p[1] ?? 0))
        }
        maxBottom = Math.max(maxBottom, bottom)
      }
      // Start below all existing content (plus breathing room)
      const startY = maxBottom > 0 ? maxBottom + GAP * 2 : 40

      // ── Step 4: Build new image elements stacked vertically ───────────────
      const newElements = imageUrls.map((url, i) => ({
        id:   uid(),
        type: 'image' as const,
        url,
        x:    40,
        y:    startY + i * (IMG_H + GAP),
        w:    IMG_W,
        h:    IMG_H,
      }))

      const canvasJson = JSON.stringify({
        version:  1,
        elements: [...existingElements, ...newElements],
      })

      // ── Step 5: Create or update the whiteboard ───────────────────────────
      let boardId = targetId

      if (targetId === 'new') {
        // POST /api/whiteboards creates a blank board
        const createRes = await fetch('/api/whiteboards', { method: 'POST' })
        if (!createRes.ok) throw new Error('Failed to create whiteboard')
        const createData = await createRes.json()
        boardId = createData.id

        const name = `${worksheetTitle || 'Worksheet'} – Whiteboard`
        await fetch(`/api/whiteboards/${boardId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ name, canvas_json: canvasJson }),
        })
      } else {
        await fetch(`/api/whiteboards/${boardId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ canvas_json: canvasJson }),
        })
      }

      // ── Step 6: Open whiteboard in new tab ────────────────────────────────
      window.open(`/whiteboards/${boardId}`, '_blank')
      onClose()

    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.')
      setWorking(false)
    }
  }

  const boardName = worksheetTitle ? `${worksheetTitle} – Whiteboard` : 'Worksheet – Whiteboard'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5"
        style={{ background: 'var(--card)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base" style={{ color: 'var(--foreground)' }}>
              Add to Whiteboard
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {questions.length} question{questions.length !== 1 ? 's' : ''} selected · images stacked vertically
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xl leading-none"
            style={{ color: 'var(--text-muted)' }}>
            ×
          </button>
        </div>

        {/* Board picker */}
        <div>
          <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Destination
          </p>

          {loading ? (
            <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>Loading whiteboards…</p>
          ) : (
            <div className="space-y-2">

              {/* New whiteboard */}
              <label
                className="flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-colors"
                style={{
                  borderColor: targetId === 'new' ? 'var(--accent)' : 'var(--border)',
                  background:  targetId === 'new' ? 'var(--accent-light)' : 'var(--background)',
                }}>
                <input
                  type="radio" name="wb-dest" value="new"
                  checked={targetId === 'new'}
                  onChange={() => setTargetId('new')}
                  className="accent-blue-600 flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    New whiteboard
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    "{boardName}"
                  </p>
                </div>
              </label>

              {/* Existing boards */}
              {boards.length > 0 && (
                <>
                  <div className="flex items-center gap-2 my-1">
                    <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>or add to existing</span>
                    <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  </div>

                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {boards.map(board => (
                      <label
                        key={board.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors"
                        style={{
                          borderColor: targetId === board.id ? 'var(--accent)' : 'var(--border)',
                          background:  targetId === board.id ? 'var(--accent-light)' : 'var(--background)',
                        }}>
                        <input
                          type="radio" name="wb-dest" value={board.id}
                          checked={targetId === board.id}
                          onChange={() => setTargetId(board.id)}
                          className="accent-blue-600 flex-shrink-0"
                        />
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {/* Whiteboard icon */}
                          <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                          </svg>
                          <p className="text-sm truncate" style={{ color: 'var(--foreground)' }}>
                            {board.name || 'Untitled Whiteboard'}
                          </p>
                        </div>
                        {targetId === board.id && (
                          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                            images placed below existing content
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border text-sm font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)', background: 'var(--background)' }}>
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={working || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'var(--accent)' }}>
            {working ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating…
              </>
            ) : (
              <>
                Open in Whiteboard
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
