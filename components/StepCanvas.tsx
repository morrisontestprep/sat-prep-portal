'use client'

import { useRef, useEffect, useImperativeHandle, forwardRef, useState, useCallback } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W = 700
const CANVAS_H = 420

const PEN_COLORS = [
  { label: 'Black',  value: '#000000' },
  { label: 'Red',    value: '#dc2626' },
  { label: 'Blue',   value: '#1d4ed8' },
  { label: 'Green',  value: '#16a34a' },
  { label: 'Orange', value: '#ea580c' },
]

const HIGHLIGHTER_COLORS = [
  { label: 'Yellow',     value: 'rgba(253,224,71,0.45)'  },
  { label: 'Blue',       value: 'rgba(125,211,252,0.45)' },
  { label: 'Green',      value: 'rgba(134,239,172,0.45)' },
  { label: 'Pink',       value: 'rgba(253,164,175,0.45)' },
]

type ToolMode = 'pen' | 'highlighter' | 'eraser'

// ── Public API exposed via ref ─────────────────────────────────────────────────

export interface StepCanvasRef {
  /** Returns a merged data URL of bg + draw layers, or null if both are empty */
  getDataUrl: () => string | null
  /** Load a saved data URL onto the background layer */
  loadDataUrl: (url: string) => void
  /** Clear both layers */
  clear: () => void
}

interface Props {
  /** If provided, paint onto background layer on mount */
  initialData?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

const StepCanvas = forwardRef<StepCanvasRef, Props>(({ initialData }, ref) => {
  const bgRef   = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef<HTMLCanvasElement>(null)

  const [tool, setTool]   = useState<ToolMode>('pen')
  const [penColor,   setPenColor]   = useState(PEN_COLORS[0].value)
  const [hlColor,    setHlColor]    = useState(HIGHLIGHTER_COLORS[0].value)

  const isDrawing = useRef(false)
  const lastPos   = useRef<{ x: number; y: number } | null>(null)
  const bgHasContent = useRef(false)
  const drawHasContent = useRef(false)

  // ── Coordinate helper ──────────────────────────────────────────────────────
  const toCanvas = useCallback((e: MouseEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width)  * CANVAS_W,
      y: ((e.clientY - rect.top)  / rect.height) * CANVAS_H,
    }
  }, [])

  // ── Draw context setup ─────────────────────────────────────────────────────
  const getDrawCtx = useCallback(() => {
    const canvas = drawRef.current
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.lineCap  = 'round'
    ctx.lineJoin = 'round'

    if (tool === 'pen') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = penColor
      ctx.lineWidth   = 2.5
      ctx.globalAlpha = 1
    } else if (tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = hlColor
      ctx.lineWidth   = 22
      ctx.globalAlpha = 1  // alpha is baked into the color string
    } else {
      // eraser: only removes marks from drawing layer
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.lineWidth   = 24
      ctx.globalAlpha = 1
    }

    return ctx
  }, [tool, penColor, hlColor])

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawRef.current) return
    isDrawing.current = true
    lastPos.current   = toCanvas(e, drawRef.current)
  }, [toCanvas])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !drawRef.current) return
    const ctx  = getDrawCtx()
    if (!ctx) return
    const pos  = toCanvas(e, drawRef.current)
    const from = lastPos.current ?? pos

    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
    drawHasContent.current = true
  }, [getDrawCtx, toCanvas])

  const stopDrawing = useCallback(() => {
    isDrawing.current = false
    lastPos.current   = null
    // Reset composite op so future renders are clean
    const canvas = drawRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.globalCompositeOperation = 'source-over'
    }
  }, [])

  // ── Paste handler ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? [])
      const imageItem = items.find(it => it.type.startsWith('image/'))
      if (!imageItem) return

      const file = imageItem.getAsFile()
      if (!file) return

      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        const canvas = bgRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Scale image to fit within canvas while maintaining aspect ratio
        const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height, 1)
        const w = img.width  * scale
        const h = img.height * scale
        const x = (CANVAS_W - w) / 2
        const y = (CANVAS_H - h) / 2

        ctx.drawImage(img, x, y, w, h)
        bgHasContent.current = true
        URL.revokeObjectURL(url)
      }
      img.src = url
    }

    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  // ── Load initial data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialData || !bgRef.current) return
    const img = new Image()
    img.onload = () => {
      const ctx = bgRef.current?.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H)
      bgHasContent.current = true
    }
    img.src = initialData
  }, [initialData])

  // ── Exposed API ────────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getDataUrl() {
      if (!bgHasContent.current && !drawHasContent.current) return null
      const bg   = bgRef.current
      const draw = drawRef.current
      if (!bg || !draw) return null

      // Merge both layers onto a temp canvas
      const merged = document.createElement('canvas')
      merged.width  = CANVAS_W
      merged.height = CANVAS_H
      const ctx = merged.getContext('2d')!
      ctx.drawImage(bg,   0, 0)
      ctx.drawImage(draw, 0, 0)
      return merged.toDataURL('image/png')
    },

    loadDataUrl(url: string) {
      const img = new Image()
      img.onload = () => {
        const ctx = bgRef.current?.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
        ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H)
        bgHasContent.current = true
      }
      img.src = url
    },

    clear() {
      const bgCtx   = bgRef.current?.getContext('2d')
      const drawCtx = drawRef.current?.getContext('2d')
      bgCtx?.clearRect(0, 0, CANVAS_W, CANVAS_H)
      drawCtx?.clearRect(0, 0, CANVAS_W, CANVAS_H)
      bgHasContent.current   = false
      drawHasContent.current = false
    },
  }), [])

  // ── Cursor ─────────────────────────────────────────────────────────────────
  const cursor = tool === 'eraser' ? 'cell' : 'crosshair'

  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 flex-wrap border-b"
        style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>

        {/* Tool mode */}
        <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: 'var(--card)' }}>
          {(['pen', 'highlighter', 'eraser'] as ToolMode[]).map(t => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors capitalize"
              style={{
                background: tool === t ? 'var(--accent)' : 'transparent',
                color:      tool === t ? 'white' : 'var(--text-muted)',
              }}
            >
              {t === 'pen' ? '✏️' : t === 'highlighter' ? '🖌' : '⌫'}
              {' '}{t}
            </button>
          ))}
        </div>

        {/* Pen colors */}
        {tool === 'pen' && (
          <div className="flex items-center gap-1">
            {PEN_COLORS.map(c => (
              <button
                key={c.value}
                title={c.label}
                onClick={() => setPenColor(c.value)}
                className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  background:   c.value,
                  borderColor:  penColor === c.value ? 'var(--foreground)' : 'transparent',
                  transform:    penColor === c.value ? 'scale(1.2)' : undefined,
                }}
              />
            ))}
          </div>
        )}

        {/* Highlighter colors */}
        {tool === 'highlighter' && (
          <div className="flex items-center gap-1">
            {HIGHLIGHTER_COLORS.map(c => (
              <button
                key={c.value}
                title={c.label}
                onClick={() => setHlColor(c.value)}
                className="w-6 h-4 rounded border-2 transition-transform hover:scale-110"
                style={{
                  background:  c.value,
                  borderColor: hlColor === c.value ? 'var(--foreground)' : 'var(--border)',
                }}
              />
            ))}
          </div>
        )}

        <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
          Ctrl+V to paste screenshot
        </span>
      </div>

      {/* Canvas stack */}
      <div className="relative w-full" style={{ paddingBottom: `${(CANVAS_H / CANVAS_W) * 100}%` }}>
        {/* Background layer: screenshots / pasted images */}
        <canvas
          ref={bgRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="absolute inset-0 w-full h-full"
          style={{ background: 'white' }}
        />
        {/* Drawing layer: pen / highlighter / eraser */}
        <canvas
          ref={drawRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="absolute inset-0 w-full h-full"
          style={{ cursor, touchAction: 'none' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
        />
      </div>
    </div>
  )
})

StepCanvas.displayName = 'StepCanvas'
export default StepCanvas
