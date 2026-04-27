'use client'

import {
  useRef, useEffect, useImperativeHandle, forwardRef,
  useState, useCallback,
} from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W = 700
const CANVAS_H = 420
const HANDLE_RADIUS = 7   // hit-test radius for resize handles (canvas px)
const MIN_SS_SIZE   = 40  // minimum screenshot dimension
const MAX_HISTORY   = 50  // max undo steps

const PEN_COLORS = [
  { label: 'Black',  value: '#000000' },
  { label: 'Red',    value: '#dc2626' },
  { label: 'Blue',   value: '#1d4ed8' },
  { label: 'Green',  value: '#16a34a' },
  { label: 'Orange', value: '#ea580c' },
]

const HIGHLIGHTER_COLORS = [
  { label: 'Yellow',      value: '#fde047' },
  { label: 'Light Blue',  value: '#7dd3fc' },
  { label: 'Light Green', value: '#86efac' },
  { label: 'Pink',        value: '#fda4af' },
]
const HIGHLIGHT_OPACITY = 0.28  // applied once per stroke, never accumulates

type ToolMode = 'pen' | 'highlighter' | 'eraser' | 'select'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScreenshotData {
  id:  string
  src: string
  x:   number
  y:   number
  w:   number
  h:   number
}

interface DragState {
  type:   'move' | 'resize'
  ssId:   string
  handle: 'tl' | 'tr' | 'bl' | 'br' | null
  startX: number
  startY: number
  origX:  number
  origY:  number
  origW:  number
  origH:  number
}

export interface StepCanvasRef {
  getDataUrl:  () => string | null
  loadDataUrl: (url: string) => void
  clear:       () => void
}

interface Props {
  initialData?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId() { return Math.random().toString(36).slice(2) }

function hitHandle(ss: ScreenshotData, px: number, py: number): 'tl' | 'tr' | 'bl' | 'br' | null {
  const corners: Array<['tl' | 'tr' | 'bl' | 'br', number, number]> = [
    ['tl', ss.x,        ss.y],
    ['tr', ss.x + ss.w, ss.y],
    ['bl', ss.x,        ss.y + ss.h],
    ['br', ss.x + ss.w, ss.y + ss.h],
  ]
  for (const [id, cx, cy] of corners) {
    if (Math.abs(px - cx) <= HANDLE_RADIUS && Math.abs(py - cy) <= HANDLE_RADIUS) return id
  }
  return null
}

function hitScreenshot(ss: ScreenshotData, px: number, py: number) {
  return px >= ss.x && px <= ss.x + ss.w && py >= ss.y && py <= ss.y + ss.h
}

// ── Component ─────────────────────────────────────────────────────────────────

const StepCanvas = forwardRef<StepCanvasRef, Props>(({ initialData }, ref) => {
  // ── Canvases ───────────────────────────────────────────────────────────────
  const bgRef   = useRef<HTMLCanvasElement>(null)   // white background
  const ssRef   = useRef<HTMLCanvasElement>(null)   // screenshot objects + handles
  const hlRef   = useRef<HTMLCanvasElement>(null)   // in-progress highlighter stroke (merged on mouseup)
  const drawRef = useRef<HTMLCanvasElement>(null)   // committed pen / highlighter strokes

  // ── Tool state ─────────────────────────────────────────────────────────────
  const [tool,     setTool]     = useState<ToolMode>('pen')
  const [penColor, setPenColor] = useState(PEN_COLORS[0].value)
  const [hlColor,  setHlColor]  = useState(HIGHLIGHTER_COLORS[0].value)

  // ── Screenshots ────────────────────────────────────────────────────────────
  const [screenshots, setScreenshots] = useState<ScreenshotData[]>([])
  const [selectedSsId, setSelectedSsId] = useState<string | null>(null)

  // Live refs used by global handlers (avoid stale closures)
  const screenshotsRef    = useRef<ScreenshotData[]>([])
  const selectedSsIdRef   = useRef<string | null>(null)
  const imgCache          = useRef<Map<string, HTMLImageElement>>(new Map())

  useEffect(() => { screenshotsRef.current  = screenshots   }, [screenshots])
  useEffect(() => { selectedSsIdRef.current = selectedSsId  }, [selectedSsId])

  // ── Draw history (undo / redo) ─────────────────────────────────────────────
  const drawHistory      = useRef<string[]>([])
  const drawHistoryIndex = useRef<number>(-1)
  const drawHasContent   = useRef(false)
  const isDrawing        = useRef(false)
  const lastPos          = useRef<{ x: number; y: number } | null>(null)

  // ── Screenshot drag state ──────────────────────────────────────────────────
  const ssDrag = useRef<DragState | null>(null)

  // ── Coordinate helper ──────────────────────────────────────────────────────
  const toCanvas = useCallback((e: MouseEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width)  * CANVAS_W,
      y: ((e.clientY - rect.top)  / rect.height) * CANVAS_H,
    }
  }, [])

  // ── Screenshot canvas render ───────────────────────────────────────────────
  const renderSsCanvas = useCallback((ssList: ScreenshotData[], selId: string | null) => {
    const canvas = ssRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

    for (const ss of ssList) {
      const img = imgCache.current.get(ss.id)
      if (img?.complete) ctx.drawImage(img, ss.x, ss.y, ss.w, ss.h)
    }

    if (selId) {
      const ss = ssList.find(s => s.id === selId)
      if (ss) {
        ctx.save()
        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth   = 2
        ctx.setLineDash([5, 3])
        ctx.strokeRect(ss.x, ss.y, ss.w, ss.h)
        ctx.setLineDash([])

        const hs = HANDLE_RADIUS * 2
        const corners: Array<[number, number]> = [
          [ss.x, ss.y],
          [ss.x + ss.w, ss.y],
          [ss.x, ss.y + ss.h],
          [ss.x + ss.w, ss.y + ss.h],
        ]
        for (const [cx, cy] of corners) {
          ctx.fillStyle   = '#ffffff'
          ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs)
          ctx.strokeStyle = '#2563eb'
          ctx.lineWidth   = 1.5
          ctx.setLineDash([])
          ctx.strokeRect(cx - hs / 2, cy - hs / 2, hs, hs)
        }
        ctx.restore()
      }
    }
  }, [])

  // Re-render ss canvas whenever screenshots or selection changes
  useEffect(() => {
    renderSsCanvas(screenshots, selectedSsId)
  }, [screenshots, selectedSsId, renderSsCanvas])

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
      ctx.globalAlpha = 1
    } else if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.lineWidth   = 24
      ctx.globalAlpha = 1
    }
    return ctx
  }, [tool, penColor, hlColor])

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  const saveDrawSnapshot = useCallback(() => {
    const canvas = drawRef.current
    if (!canvas) return
    // Truncate redo branch
    drawHistory.current = drawHistory.current.slice(0, drawHistoryIndex.current + 1)
    drawHistory.current.push(canvas.toDataURL())
    drawHistoryIndex.current = drawHistory.current.length - 1
    // Trim to MAX_HISTORY
    if (drawHistory.current.length > MAX_HISTORY) {
      drawHistory.current.shift()
      drawHistoryIndex.current--
    }
  }, [])

  const restoreDrawSnapshot = useCallback((dataUrl: string) => {
    const canvas = drawRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
      ctx.drawImage(img, 0, 0)
      drawHasContent.current = true
    }
    img.src = dataUrl
  }, [])

  const undoDraw = useCallback(() => {
    if (drawHistoryIndex.current < 0) return
    drawHistoryIndex.current--
    if (drawHistoryIndex.current < 0) {
      const ctx = drawRef.current?.getContext('2d')
      ctx?.clearRect(0, 0, CANVAS_W, CANVAS_H)
      drawHasContent.current = false
    } else {
      restoreDrawSnapshot(drawHistory.current[drawHistoryIndex.current])
    }
  }, [restoreDrawSnapshot])

  const redoDraw = useCallback(() => {
    if (drawHistoryIndex.current >= drawHistory.current.length - 1) return
    drawHistoryIndex.current++
    restoreDrawSnapshot(drawHistory.current[drawHistoryIndex.current])
  }, [restoreDrawSnapshot])

  const canUndo = drawHistoryIndex.current >= 0
  const canRedo = drawHistoryIndex.current < drawHistory.current.length - 1

  // ── Delete selected screenshot ─────────────────────────────────────────────
  const deleteSelectedSs = useCallback(() => {
    if (!selectedSsIdRef.current) return
    const id = selectedSsIdRef.current
    imgCache.current.delete(id)
    const next = screenshotsRef.current.filter(s => s.id !== id)
    screenshotsRef.current = next
    setScreenshots(next)
    setSelectedSsId(null)
  }, [])

  // ── Draw layer mouse handlers (canvas element events) ─────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawRef.current) return
    const pos = toCanvas(e, drawRef.current)

    if (tool === 'select') {
      // Hit-test screenshots in reverse order (top-most first)
      const ssList = screenshotsRef.current
      for (let i = ssList.length - 1; i >= 0; i--) {
        const ss = ssList[i]
        const handle = hitHandle(ss, pos.x, pos.y)
        if (handle) {
          setSelectedSsId(ss.id)
          ssDrag.current = { type: 'resize', ssId: ss.id, handle, startX: pos.x, startY: pos.y, origX: ss.x, origY: ss.y, origW: ss.w, origH: ss.h }
          document.body.style.cursor = 'nwse-resize'
          return
        }
        if (hitScreenshot(ss, pos.x, pos.y)) {
          setSelectedSsId(ss.id)
          ssDrag.current = { type: 'move', ssId: ss.id, handle: null, startX: pos.x, startY: pos.y, origX: ss.x, origY: ss.y, origW: ss.w, origH: ss.h }
          document.body.style.cursor = 'grabbing'
          return
        }
      }
      setSelectedSsId(null)
      return
    }

    // Drawing mode
    isDrawing.current = true
    lastPos.current   = pos
  }, [tool, toCanvas])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !drawRef.current) return
    if (tool === 'select') return
    const pos  = toCanvas(e, drawRef.current)
    const from = lastPos.current ?? pos

    if (tool === 'highlighter') {
      // Draw in-progress stroke to hlRef at full opacity — composited on mouseup
      const hlCanvas = hlRef.current
      if (!hlCanvas) return
      const ctx = hlCanvas.getContext('2d')
      if (!ctx) return
      ctx.lineCap  = 'round'
      ctx.lineJoin = 'round'
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = hlColor
      ctx.lineWidth   = 22
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    } else {
      const ctx = getDrawCtx()
      if (!ctx) return
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }

    lastPos.current        = pos
    drawHasContent.current = true
  }, [tool, hlColor, getDrawCtx, toCanvas])

  const stopDrawing = useCallback(() => {
    if (isDrawing.current) {
      isDrawing.current = false
      lastPos.current   = null

      // Merge in-progress highlighter stroke onto the committed draw canvas
      if (tool === 'highlighter' && hlRef.current && drawRef.current) {
        const drawCtx = drawRef.current.getContext('2d')
        if (drawCtx) {
          drawCtx.globalAlpha = HIGHLIGHT_OPACITY
          drawCtx.globalCompositeOperation = 'source-over'
          drawCtx.drawImage(hlRef.current, 0, 0)
          drawCtx.globalAlpha = 1
        }
        // Clear the staging canvas
        const hlCtx = hlRef.current.getContext('2d')
        hlCtx?.clearRect(0, 0, CANVAS_W, CANVAS_H)
      }

      const ctx = drawRef.current?.getContext('2d')
      if (ctx) ctx.globalCompositeOperation = 'source-over'
      if (drawHasContent.current) saveDrawSnapshot()
    }
  }, [tool, saveDrawSnapshot])

  // ── Global handlers: screenshot drag (works even outside canvas bounds) ────
  useEffect(() => {
    const onGlobalMove = (e: MouseEvent) => {
      if (!ssDrag.current || !drawRef.current) return
      const pos = toCanvas(e, drawRef.current)
      const drag = ssDrag.current
      const dx = pos.x - drag.startX
      const dy = pos.y - drag.startY

      let next: ScreenshotData[]
      if (drag.type === 'move') {
        next = screenshotsRef.current.map(s =>
          s.id === drag.ssId ? { ...s, x: drag.origX + dx, y: drag.origY + dy } : s
        )
      } else {
        let nx = drag.origX, ny = drag.origY, nw = drag.origW, nh = drag.origH
        switch (drag.handle) {
          case 'br': nw = Math.max(MIN_SS_SIZE, drag.origW + dx); nh = Math.max(MIN_SS_SIZE, drag.origH + dy); break
          case 'bl': nx = drag.origX + dx; nw = Math.max(MIN_SS_SIZE, drag.origW - dx); nh = Math.max(MIN_SS_SIZE, drag.origH + dy); break
          case 'tr': nw = Math.max(MIN_SS_SIZE, drag.origW + dx); ny = drag.origY + dy; nh = Math.max(MIN_SS_SIZE, drag.origH - dy); break
          case 'tl': nx = drag.origX + dx; nw = Math.max(MIN_SS_SIZE, drag.origW - dx); ny = drag.origY + dy; nh = Math.max(MIN_SS_SIZE, drag.origH - dy); break
        }
        next = screenshotsRef.current.map(s =>
          s.id === drag.ssId ? { ...s, x: nx, y: ny, w: nw, h: nh } : s
        )
      }
      screenshotsRef.current = next
      renderSsCanvas(next, selectedSsIdRef.current)
    }

    const onGlobalUp = () => {
      if (!ssDrag.current) return
      ssDrag.current = null
      document.body.style.cursor = ''
      // Commit to React state
      setScreenshots([...screenshotsRef.current])
    }

    window.addEventListener('mousemove', onGlobalMove)
    window.addEventListener('mouseup',   onGlobalUp)
    return () => {
      window.removeEventListener('mousemove', onGlobalMove)
      window.removeEventListener('mouseup',   onGlobalUp)
    }
  }, [toCanvas, renderSsCanvas])

  // ── Paste handler ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? [])
      const imgItem = items.find(it => it.type.startsWith('image/'))
      if (!imgItem) return
      const file = imgItem.getAsFile()
      if (!file) return

      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        const id = makeId()
        // Scale to fit canvas, center
        const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height, 1)
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const x = Math.round((CANVAS_W - w) / 2)
        const y = Math.round((CANVAS_H - h) / 2)

        imgCache.current.set(id, img)
        const ss: ScreenshotData = { id, src: url, x, y, w, h }
        const next = [...screenshotsRef.current, ss]
        screenshotsRef.current = next
        setScreenshots(next)
        setSelectedSsId(id)
        setTool('select')   // auto-switch so user can immediately move/resize
      }
      img.src = url
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  // ── Keyboard: Delete key removes selected screenshot ──────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSsIdRef.current) {
        // Only fire if not typing in an input
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
        e.preventDefault()
        deleteSelectedSs()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteSelectedSs])

  // ── Load initial data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialData) return
    const img = new Image()
    img.onload = () => {
      const id = makeId()
      imgCache.current.set(id, img)
      const ss: ScreenshotData = { id, src: initialData, x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }
      screenshotsRef.current = [ss]
      setScreenshots([ss])
    }
    img.src = initialData
  }, [initialData]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Exposed API ────────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getDataUrl() {
      const hasDraw = drawHasContent.current
      const hasSs   = screenshotsRef.current.length > 0
      if (!hasDraw && !hasSs) return null

      const merged = document.createElement('canvas')
      merged.width  = CANVAS_W
      merged.height = CANVAS_H
      const ctx = merged.getContext('2d')!
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      // Draw screenshots cleanly (no handles)
      for (const ss of screenshotsRef.current) {
        const img = imgCache.current.get(ss.id)
        if (img?.complete) ctx.drawImage(img, ss.x, ss.y, ss.w, ss.h)
      }
      if (drawRef.current) ctx.drawImage(drawRef.current, 0, 0)
      return merged.toDataURL('image/png')
    },

    loadDataUrl(url: string) {
      const img = new Image()
      img.onload = () => {
        const id = makeId()
        imgCache.current.clear()
        imgCache.current.set(id, img)
        const ss: ScreenshotData = { id, src: url, x: 0, y: 0, w: CANVAS_W, h: CANVAS_H }
        screenshotsRef.current = [ss]
        setScreenshots([ss])
        setSelectedSsId(null)
        // Clear draw + highlight staging layers
        const ctx   = drawRef.current?.getContext('2d')
        const hlCtx = hlRef.current?.getContext('2d')
        ctx?.clearRect(0, 0, CANVAS_W, CANVAS_H)
        hlCtx?.clearRect(0, 0, CANVAS_W, CANVAS_H)
        drawHistory.current      = []
        drawHistoryIndex.current = -1
        drawHasContent.current   = false
      }
      img.src = url
    },

    clear() {
      const bgCtx   = bgRef.current?.getContext('2d')
      const ssCtx   = ssRef.current?.getContext('2d')
      const hlCtx   = hlRef.current?.getContext('2d')
      const drawCtx = drawRef.current?.getContext('2d')
      bgCtx?.clearRect(0, 0, CANVAS_W, CANVAS_H)
      ssCtx?.clearRect(0, 0, CANVAS_W, CANVAS_H)
      hlCtx?.clearRect(0, 0, CANVAS_W, CANVAS_H)
      drawCtx?.clearRect(0, 0, CANVAS_W, CANVAS_H)
      imgCache.current.clear()
      screenshotsRef.current   = []
      drawHistory.current      = []
      drawHistoryIndex.current = -1
      drawHasContent.current   = false
      setScreenshots([])
      setSelectedSsId(null)
    },
  }), [])

  // ── Cursor ─────────────────────────────────────────────────────────────────
  const cursor =
    tool === 'select'     ? 'default' :
    tool === 'eraser'     ? 'cell'    : 'crosshair'

  // Force re-render for undo/redo button state
  const [, forceUpdate] = useState(0)

  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 flex-wrap border-b gap-y-2"
        style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>

        {/* Tool mode tabs */}
        <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: 'var(--card)' }}>
          {(['pen', 'highlighter', 'eraser', 'select'] as ToolMode[]).map(t => (
            <button key={t} onClick={() => setTool(t)}
              className="px-2 py-0.5 rounded-md text-xs font-medium transition-colors"
              style={{
                background: tool === t ? 'var(--accent)' : 'transparent',
                color:      tool === t ? 'white' : 'var(--text-muted)',
              }}>
              {t === 'pen' ? '✏️ Pen' : t === 'highlighter' ? '🖌 Hi-lite' : t === 'eraser' ? '⌫ Erase' : '↖ Select'}
            </button>
          ))}
        </div>

        {/* Pen colors */}
        {tool === 'pen' && (
          <div className="flex items-center gap-1">
            {PEN_COLORS.map(c => (
              <button key={c.value} title={c.label} onClick={() => setPenColor(c.value)}
                className="w-5 h-5 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                style={{
                  background:  c.value,
                  outline:     penColor === c.value ? `2px solid var(--foreground)` : '2px solid transparent',
                  outlineOffset: '1px',
                }} />
            ))}
          </div>
        )}

        {/* Highlighter colors */}
        {tool === 'highlighter' && (
          <div className="flex items-center gap-1">
            {HIGHLIGHTER_COLORS.map(c => (
              <button key={c.value} title={c.label} onClick={() => setHlColor(c.value)}
                className="w-6 h-4 rounded transition-transform hover:scale-110 border"
                style={{
                  background:  c.value,
                  borderColor: hlColor === c.value ? 'var(--foreground)' : 'var(--border)',
                }} />
            ))}
          </div>
        )}

        {/* Select mode: delete button */}
        {tool === 'select' && selectedSsId && (
          <button onClick={deleteSelectedSs}
            className="text-xs px-2.5 py-1 rounded-lg border font-medium"
            style={{ borderColor: '#fca5a5', color: '#dc2626', background: '#fef2f2' }}>
            🗑 Delete screenshot
          </button>
        )}

        {/* Undo / Redo */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => { undoDraw(); forceUpdate(n => n + 1) }}
            disabled={drawHistoryIndex.current < 0}
            title="Undo stroke (Ctrl+Z)"
            className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs disabled:opacity-30"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
            ↩
          </button>
          <button
            onClick={() => { redoDraw(); forceUpdate(n => n + 1) }}
            disabled={drawHistoryIndex.current >= drawHistory.current.length - 1}
            title="Redo stroke"
            className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs disabled:opacity-30"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
            ↪
          </button>
        </div>
      </div>

      {/* Paste hint */}
      <div className="px-3 py-1 text-xs border-b"
        style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        Ctrl+V to paste screenshot · Use Select tool to move, resize, or delete pasted images
      </div>

      {/* Canvas stack */}
      <div className="relative w-full" style={{ paddingBottom: `${(CANVAS_H / CANVAS_W) * 100}%` }}>
        {/* 1. White background */}
        <canvas ref={bgRef} width={CANVAS_W} height={CANVAS_H}
          className="absolute inset-0 w-full h-full"
          style={{ background: 'white' }} />
        {/* 2. Screenshot objects + handles */}
        <canvas ref={ssRef} width={CANVAS_W} height={CANVAS_H}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none' }} />
        {/* 3. In-progress highlighter stroke preview (merged to drawRef on mouseup) */}
        <canvas ref={hlRef} width={CANVAS_W} height={CANVAS_H}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none', opacity: HIGHLIGHT_OPACITY }} />
        {/* 4. Drawing layer (receives all pointer events) */}
        <canvas ref={drawRef} width={CANVAS_W} height={CANVAS_H}
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
