'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'

// ── Types ──────────────────────────────────────────────────────────────────────

export type Stroke = {
  id: string; type: 'stroke'
  pts: number[][]
  color: string; width: number; opacity: number
}
export type WBImage = {
  id: string; type: 'image'
  url: string; x: number; y: number; w: number; h: number
}
export type TextEl = {
  id: string; type: 'text'
  html: string        // rich text (innerHTML)
  text: string        // plain text (for measurement / legacy)
  x: number; y: number
  w: number           // box width in world coords (0 = auto)
  color: string; size: number
  bold?: boolean; italic?: boolean  // legacy whole-element flags
}
export type WBEl = Stroke | WBImage | TextEl

type View = { tx: number; ty: number; scale: number }

type ShareRow = {
  id: string
  shared_with: string
  access_level: 'view' | 'edit'
  profiles: { full_name: string | null; email: string | null } | null
}
type StudentInfo = { id: string; full_name: string | null; email: string | null }

type Props = {
  boardId: string
  initialName: string
  initialJson: string
  isOwner: boolean
  canEdit: boolean
  isTeacher: boolean
  students: StudentInfo[]
  initialShares: ShareRow[]
}

// ── Constants ──────────────────────────────────────────────────────────────────

type Tool = 'select' | 'pan' | 'pen' | 'highlighter' | 'eraser' | 'text'

const PEN_COLORS  = ['#1a1a1a','#dc2626','#1d4ed8','#16a34a','#ea580c','#7c3aed','#db2777','#ffffff']
const HL_COLORS   = ['#fde047','#7dd3fc','#86efac','#fda4af','#d8b4fe']
const HL_OPACITY  = 0.35
const AUTOSAVE_MS = 1500
const MIN_SCALE   = 0.1
const MAX_SCALE   = 10
const TOPBAR_H    = 52
const HANDLE_PX   = 8
const ERASER_RADIUS_PX = 14   // eraser radius in screen pixels

// ── Helpers ────────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2) }

function screenToWorld(sx: number, sy: number, v: View) {
  return [(sx - v.tx) / v.scale, (sy - v.ty) / v.scale] as [number, number]
}
function worldToScreen(wx: number, wy: number, v: View) {
  return [wx * v.scale + v.tx, wy * v.scale + v.ty] as [number, number]
}

function simplify(pts: number[][], tol: number): number[][] {
  if (pts.length <= 2) return pts
  const [fx, fy] = pts[0]; const [lx, ly] = pts[pts.length - 1]
  let maxD = 0, maxI = 0
  const dx = lx - fx, dy = ly - fy
  const len = Math.sqrt(dx * dx + dy * dy)
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len === 0
      ? Math.sqrt((pts[i][0] - fx) ** 2 + (pts[i][1] - fy) ** 2)
      : Math.abs(dy * pts[i][0] - dx * pts[i][1] + lx * fy - ly * fx) / len
    if (d > maxD) { maxD = d; maxI = i }
  }
  if (maxD > tol) {
    const l = simplify(pts.slice(0, maxI + 1), tol)
    const r = simplify(pts.slice(maxI), tol)
    return [...l.slice(0, -1), ...r]
  }
  return [pts[0], pts[pts.length - 1]]
}

/** Chaikin corner-cutting smoothing. 2 passes gives a nice smooth curve. */
function chaikin(pts: number[][], iterations = 2): number[][] {
  if (pts.length <= 2) return pts
  let result = pts
  for (let iter = 0; iter < iterations; iter++) {
    const next: number[][] = [result[0]]
    for (let i = 0; i < result.length - 1; i++) {
      const [x0, y0] = result[i], [x1, y1] = result[i + 1]
      next.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25])
      next.push([x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75])
    }
    next.push(result[result.length - 1])
    result = next
  }
  return result
}

/** Bounding box of a stroke (includes stroke half-width as padding). */
function strokeBounds(stroke: Stroke) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of stroke.pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  const pad = stroke.width / 2
  return { x: minX - pad, y: minY - pad, w: maxX - minX + stroke.width, h: maxY - minY + stroke.width }
}

/** Point-to-segment distance hit test for a stroke. */
function strokeHitTest(stroke: Stroke, wx: number, wy: number, threshold: number): boolean {
  const b = strokeBounds(stroke)
  // Quick bounding-box reject
  if (wx < b.x - threshold || wx > b.x + b.w + threshold ||
      wy < b.y - threshold || wy > b.y + b.h + threshold) return false
  for (let i = 0; i < stroke.pts.length; i++) {
    const [x1, y1] = stroke.pts[i]
    if (i === stroke.pts.length - 1) {
      if (Math.sqrt((wx - x1) ** 2 + (wy - y1) ** 2) <= threshold) return true
      break
    }
    const [x2, y2] = stroke.pts[i + 1]
    const ddx = x2 - x1, ddy = y2 - y1
    const len2 = ddx * ddx + ddy * ddy
    if (len2 === 0) {
      if (Math.sqrt((wx - x1) ** 2 + (wy - y1) ** 2) <= threshold) return true
    } else {
      const t = Math.max(0, Math.min(1, ((wx - x1) * ddx + (wy - y1) * ddy) / len2))
      const px = x1 + t * ddx, py = y1 + t * ddy
      if (Math.sqrt((wx - px) ** 2 + (wy - py) ** 2) <= threshold) return true
    }
  }
  return false
}

function fontStr(size: number, bold?: boolean, italic?: boolean) {
  const parts = [italic ? 'italic' : '', bold ? 'bold' : ''].filter(Boolean)
  return `${parts.join(' ')} ${size}px -apple-system, BlinkMacSystemFont, sans-serif`.trimStart()
}

// ── Rich text helpers ─────────────────────────────────────────────────────────

type TextRun = { text: string; bold: boolean; italic: boolean; underline: boolean }

/** Parse HTML innerHTML into styled text runs for canvas rendering. */
function parseHtmlToRuns(html: string, defBold = false, defItalic = false): TextRun[] {
  if (!html) return []
  if (typeof document === 'undefined') return [{ text: html, bold: defBold, italic: defItalic, underline: false }]
  const runs: TextRun[] = []
  const div = document.createElement('div')
  div.innerHTML = html

  function walk(node: Node, b: boolean, i: boolean, u: boolean) {
    if (node.nodeType === 3) {
      const t = node.textContent || ''
      if (t) runs.push({ text: t, bold: b, italic: i, underline: u })
      return
    }
    if (node.nodeType !== 1) return
    const el = node as HTMLElement
    const tag = el.tagName?.toLowerCase() || ''
    if (tag === 'br') { runs.push({ text: '\n', bold: b, italic: i, underline: u }); return }
    const nb = b || tag === 'b' || tag === 'strong'
    const ni = i || tag === 'i' || tag === 'em'
    const nu = u || tag === 'u'
    for (const child of Array.from(node.childNodes)) walk(child, nb, ni, nu)
    if ((tag === 'div' || tag === 'p') && node.childNodes.length > 0) {
      if (runs.length === 0 || runs[runs.length - 1].text !== '\n')
        runs.push({ text: '\n', bold: b, italic: i, underline: u })
    }
  }

  for (const child of Array.from(div.childNodes)) walk(child, defBold, defItalic, false)
  while (runs.length > 0 && runs[runs.length - 1].text === '\n') runs.pop()
  return runs
}

/** Render rich text runs on canvas with optional word-wrap. */
function renderRichText(
  ctx: CanvasRenderingContext2D,
  runs: TextRun[],
  x: number, startY: number,
  boxW: number,    // 0 = no wrap
  lineH: number,
  baseSize: number,
  color: string,
) {
  ctx.fillStyle = color
  let curX = x, curY = startY

  for (const run of runs) {
    ctx.font = fontStr(baseSize, run.bold, run.italic)
    const parts = run.text.split('\n')
    for (let pi = 0; pi < parts.length; pi++) {
      if (pi > 0) { curX = x; curY += lineH }
      const part = parts[pi]
      if (!part) continue
      if (boxW <= 0) {
        ctx.fillText(part, curX, curY)
        if (run.underline) drawUnderline(ctx, curX, curY, ctx.measureText(part).width, baseSize, color)
        curX += ctx.measureText(part).width
      } else {
        const tokens = part.split(/(\s+)/)
        for (const tok of tokens) {
          if (!tok) continue
          const tw = ctx.measureText(tok).width
          if (curX > x && tok.trim() && curX + tw > x + boxW) { curX = x; curY += lineH }
          if (!tok.trim() && curX === x) continue
          ctx.fillStyle = color
          ctx.fillText(tok, curX, curY)
          if (run.underline && tok.trim()) drawUnderline(ctx, curX, curY, tw, baseSize, color)
          curX += tw
        }
      }
    }
  }
}

function drawUnderline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, size: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(0.5, size * 0.07)
  ctx.beginPath()
  ctx.moveTo(x, y + size * 0.13)
  ctx.lineTo(x + w, y + size * 0.13)
  ctx.stroke()
  ctx.restore()
}

/** Convert legacy TextEl (text + bold/italic flags) to HTML. */
function textElToHtml(el: TextEl): string {
  if (el.html) return el.html
  let c = (el.text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
  if (el.italic) c = `<i>${c}</i>`
  if (el.bold)   c = `<b>${c}</b>`
  return c
}

function getElBounds(
  el: WBImage | TextEl,
  ctx: CanvasRenderingContext2D,
): { x: number; y: number; w: number; h: number } {
  if (el.type === 'image') return { x: el.x, y: el.y, w: el.w, h: el.h }
  const lineH = el.size * 1.3
  if (el.w > 0) {
    const lines = (el.text || '').split('\n')
    return { x: el.x - 2, y: el.y - el.size, w: el.w + 4, h: Math.max(1, lines.length) * lineH + 4 }
  }
  ctx.font = fontStr(el.size, el.bold, el.italic)
  const lines = (el.text || '').split('\n')
  const maxW  = Math.max(...lines.map(l => ctx.measureText(l).width), 40)
  return { x: el.x - 2, y: el.y - el.size, w: maxW + 4, h: lines.length * lineH + 4 }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function WhiteboardEditor({
  boardId, initialName, initialJson,
  isOwner, canEdit, isTeacher, students, initialShares,
}: Props) {
  const supabase  = createClient()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgCache  = useRef<Map<string, HTMLImageElement>>(new Map())
  const rafRef    = useRef<number>(0)

  // Mutable refs
  const elementsRef   = useRef<WBEl[]>([])
  const viewRef       = useRef<View>({ tx: 0, ty: 0, scale: 1 })
  const activePtsRef  = useRef<number[][] | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const dragRef       = useRef<{
    startWx: number; startWy: number
    origX: number; origY: number
    origPts?: number[][]   // stored original points for stroke dragging
  } | null>(null)
  const resizeRef     = useRef<{
    handleIdx: number
    origBounds: { x: number; y: number; w: number; h: number }
    origSize: number
    origPts?: number[][]   // for stroke point scaling
    startWx: number; startWy: number
  } | null>(null)
  const panStartRef   = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null)
  const isPanRef      = useRef(false)
  const isSpaceRef    = useRef(false)
  const touch1Ref     = useRef<{ id: number; x: number; y: number } | null>(null)
  const touch2Ref     = useRef<{ id: number; x: number; y: number; dist: number } | null>(null)
  // Track unsaved local changes so sync-pull doesn't overwrite them
  const dirtyRef      = useRef(false)
  // Track eraser cursor position for hover preview (even before click)
  const eraserPosRef  = useRef<[number, number] | null>(null)

  // Text drag-to-create ref
  const textDragRef = useRef<{ startWx: number; startWy: number; endWx: number; endWy: number } | null>(null)
  // Tracks ID of text element currently being edited (for canvas skip)
  const textEditingIdRef = useRef<string | null>(null)
  // Rich-text runs cache: id → { html, runs }
  const runsCacheRef = useRef<Map<string, { html: string; runs: TextRun[] }>>(new Map())

  // React state
  const [tool,       setTool]       = useState<Tool>('pen')
  const [color,      setColor]      = useState(PEN_COLORS[0])
  const [hlColor,    setHlColor]    = useState(HL_COLORS[0])
  const [thickness,  setThickness]  = useState(4)
  const [boardName,  setBoardName]  = useState(initialName)
  const [saving,     setSaving]     = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Text editing state
  type TextEditing = {
    id: string | null        // null = new element
    wx: number; wy: number   // world baseline position
    w: number                // world box width (0 = auto)
    html: string
    color: string
    size: number
    key: number              // increment to force contenteditable remount
  }
  const [textEditing, setTextEditing] = useState<TextEditing | null>(null)
  const [textSize,    setTextSize]    = useState(18)
  const [textColor,   setTextColor]   = useState(PEN_COLORS[0])
  const editRef = useRef<HTMLDivElement>(null)

  // Share modal
  const [showShare,   setShowShare]   = useState(false)
  const [shares,      setShares]      = useState<ShareRow[]>(Array.isArray(initialShares) ? initialShares : [])
  const [shareTarget, setShareTarget] = useState<Set<string>>(new Set())
  const [shareAccess, setShareAccess] = useState<'view'|'edit'>('view')
  const [sharing,     setSharing]     = useState(false)
  const [shareError,  setShareError]  = useState<string | null>(null)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // ── Load initial data ─────────────────────────────────────────────────────
  // scheduleRender ref so image onload callbacks can call it without stale closures
  const scheduleRenderRef = useRef<() => void>(() => {})

  useEffect(() => {
    try {
      const data = JSON.parse(initialJson) as { elements: WBEl[] }
      elementsRef.current = data.elements ?? []
      for (const el of elementsRef.current) {
        if (el.type === 'image' && !imgCache.current.has(el.url)) {
          const img = new Image()
          img.onload = () => scheduleRenderRef.current()
          img.src = el.url
          imgCache.current.set(el.url, img)
        }
      }
    } catch { /* empty board */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx   = canvas.getContext('2d')!
    const { tx, ty, scale } = viewRef.current
    const els   = elementsRef.current
    const selId = selectedIdRef.current
    const editId = textEditingIdRef.current

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.translate(tx, ty)
    ctx.scale(scale, scale)

    for (const el of els) {
      if (el.type === 'stroke') {
        if (el.pts.length < 2) continue
        ctx.save()
        ctx.globalAlpha = el.opacity
        ctx.strokeStyle = el.color
        ctx.lineWidth   = el.width
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(el.pts[0][0], el.pts[0][1])
        for (let i = 1; i < el.pts.length; i++) ctx.lineTo(el.pts[i][0], el.pts[i][1])
        ctx.stroke()
        ctx.restore()
        if (selId === el.id) {
          const b = strokeBounds(el)
          drawSelectionBox(ctx, b.x, b.y, b.w, b.h, false)
        }
      } else if (el.type === 'image') {
        const img = imgCache.current.get(el.url)
        if (img?.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, el.x, el.y, el.w, el.h)
          if (selId === el.id) drawSelectionBox(ctx, el.x, el.y, el.w, el.h, false)
        }
      } else if (el.type === 'text') {
        // Skip element being edited — contenteditable shows it
        if (editId === el.id) continue

        // Get (or compute + cache) text runs
        const htmlKey = el.html || el.text || ''
        let cached = runsCacheRef.current.get(el.id)
        if (!cached || cached.html !== htmlKey) {
          const runs = parseHtmlToRuns(el.html || el.text || '', el.bold, el.italic)
          cached = { html: htmlKey, runs }
          runsCacheRef.current.set(el.id, cached)
        }

        ctx.save()
        const lineH = el.size * 1.3
        renderRichText(ctx, cached.runs, el.x, el.y, el.w, lineH, el.size, el.color)

        if (selId === el.id) {
          const bounds = getElBounds(el, ctx)
          // Show side handles (left/right) for text width resize
          drawSelectionBox(ctx, bounds.x, bounds.y, bounds.w, bounds.h, true)
        }
        ctx.restore()
      }
    }

    // Active drawing stroke (pen / highlighter) — Chaikin smoothed preview
    const pts = activePtsRef.current
    if (pts && pts.length > 1 && tool !== 'eraser') {
      const isHl = tool === 'highlighter'
      // Apply 1 pass of Chaikin for a smoother live preview
      const drawPts = pts.length >= 4 ? chaikin(pts, 1) : pts
      ctx.save()
      ctx.globalAlpha = isHl ? HL_OPACITY : 1
      ctx.strokeStyle = isHl ? hlColor : color
      ctx.lineWidth   = isHl ? 24 : thickness
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(drawPts[0][0], drawPts[0][1])
      for (let i = 1; i < drawPts.length; i++) ctx.lineTo(drawPts[i][0], drawPts[i][1])
      ctx.stroke()
      ctx.restore()
    }

    // Eraser: show circular cursor (uses eraserPosRef so visible even when hovering)
    const eraserPos = eraserPosRef.current
    if (tool === 'eraser' && eraserPos) {
      const [ex, ey] = eraserPos
      const r = ERASER_RADIUS_PX / scale
      ctx.save()
      ctx.strokeStyle = '#9ca3af'
      ctx.lineWidth = 1.5 / scale
      ctx.setLineDash([4 / scale, 3 / scale])
      ctx.beginPath()
      ctx.arc(ex, ey, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    }

    // Drag-to-create text preview
    const td = textDragRef.current
    if (td && tool === 'text') {
      const x = Math.min(td.startWx, td.endWx)
      const y = Math.min(td.startWy, td.endWy)
      const w = Math.abs(td.endWx - td.startWx)
      const h = Math.abs(td.endWy - td.startWy)
      if (w > 5 || h > 5) {
        ctx.save()
        ctx.strokeStyle = '#3b5bdb'
        ctx.lineWidth = 1.5 / scale
        ctx.setLineDash([6 / scale, 3 / scale])
        ctx.strokeRect(x, y, w, h)
        ctx.setLineDash([])
        ctx.restore()
      }
    }

    ctx.restore()
  }, [tool, color, hlColor, thickness])

  useEffect(() => { scheduleRenderRef.current = scheduleRender }, ) // always current

  // drawSelectionBox defined inside component so it can access viewRef.
  // showSideHandles=true adds left + right mid-point handles for text width resize.
  function drawSelectionBox(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    showSideHandles: boolean,
  ) {
    const s  = viewRef.current.scale
    const hs = HANDLE_PX / s
    ctx.save()
    ctx.strokeStyle = '#3b5bdb'; ctx.lineWidth = 1.5 / s
    ctx.setLineDash([6 / s, 3 / s])
    ctx.strokeRect(x - 4, y - 4, w + 8, h + 8)
    ctx.setLineDash([])
    const corners = [
      [x - 4,           y - 4          ],
      [x + w + 4 - hs,  y - 4          ],
      [x + w + 4 - hs,  y + h + 4 - hs],
      [x - 4,           y + h + 4 - hs],
    ]
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#3b5bdb'; ctx.lineWidth = 1 / s
    for (const [hx, hy] of corners) { ctx.fillRect(hx, hy, hs, hs); ctx.strokeRect(hx, hy, hs, hs) }
    // Side handles for width resizing (text only)
    if (showSideHandles) {
      const midY = y + h / 2 - hs / 2
      // Right handle (index 4)
      const rxH = x + w + 4 - hs
      ctx.fillRect(rxH, midY, hs, hs); ctx.strokeRect(rxH, midY, hs, hs)
      // Left handle (index 5)
      ctx.fillRect(x - 4, midY, hs, hs); ctx.strokeRect(x - 4, midY, hs, hs)
    }
    ctx.restore()
  }

  const scheduleRender = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(render)
  }, [render])

  // ── Canvas resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current; if (!canvas) return
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight - TOPBAR_H
      scheduleRender()
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [scheduleRender])

  // ── Sync textEditing → ref so render can skip edited element ──────────────
  useEffect(() => {
    textEditingIdRef.current = textEditing?.id ?? null
    scheduleRender()
  }, [textEditing, scheduleRender])

  // ── Set innerHTML + focus when edit session opens ─────────────────────────
  useEffect(() => {
    if (!textEditing || !editRef.current) return
    editRef.current.innerHTML = textEditing.html
    editRef.current.focus()
    // cursor to end
    const range = document.createRange()
    range.selectNodeContents(editRef.current)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [textEditing?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const scheduleSave = useCallback(() => {
    if (!canEdit) return
    dirtyRef.current = true   // mark as having unsaved changes
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      const json = JSON.stringify({ version: 1, elements: elementsRef.current })
      try {
        const res  = await fetch(`/api/whiteboards/${boardId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ canvas_json: json }),
        })
        if (!res.ok) console.error('Autosave failed:', await res.json())
        else dirtyRef.current = false   // saved successfully
      } catch (err) { console.error('Autosave error:', err) }
      setSaving(false)
    }, AUTOSAVE_MS)
  }, [boardId, canEdit])

  // ── Hit testing ───────────────────────────────────────────────────────────
  const hitTest = useCallback((wx: number, wy: number): WBEl | null => {
    for (const el of [...elementsRef.current].reverse()) {
      if (el.type === 'stroke') {
        // Use screen-pixel threshold converted to world space
        const threshold = (el.width / 2 + 4) / viewRef.current.scale
        if (strokeHitTest(el, wx, wy, threshold)) return el
      } else if (el.type === 'image') {
        if (wx >= el.x && wx <= el.x + el.w && wy >= el.y && wy <= el.y + el.h) return el
      } else if (el.type === 'text') {
        const canvas = canvasRef.current; if (!canvas) continue
        const ctx = canvas.getContext('2d')!
        const b = getElBounds(el, ctx)
        if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) return el
      }
    }
    return null
  }, [])

  // hitTestHandle returns:
  //   0-3 = corner handles (TL, TR, BR, BL)
  //   4   = right-side handle (text width increase)
  //   5   = left-side handle (text width/position adjust)
  //   -1  = no handle
  const hitTestHandle = useCallback((wx: number, wy: number, el: WBEl): number => {
    let x: number, y: number, w: number, h: number
    if (el.type === 'stroke') {
      const b = strokeBounds(el)
      x = b.x; y = b.y; w = b.w; h = b.h
    } else if (el.type === 'image') {
      x = el.x; y = el.y; w = el.w; h = el.h
    } else {
      const canvas = canvasRef.current; if (!canvas) return -1
      const ctx = canvas.getContext('2d')!
      const b = getElBounds(el, ctx)
      x = b.x; y = b.y; w = b.w; h = b.h
    }
    const hs = HANDLE_PX / viewRef.current.scale
    const corners = [
      [x - 4, y - 4], [x + w + 4 - hs, y - 4],
      [x + w + 4 - hs, y + h + 4 - hs], [x - 4, y + h + 4 - hs],
    ]
    for (let i = 0; i < corners.length; i++) {
      const [hx, hy] = corners[i]
      if (wx >= hx && wx <= hx + hs && wy >= hy && wy <= hy + hs) return i
    }
    // Side handles for text width resize only
    if (el.type === 'text') {
      const midY = y + h / 2 - hs / 2
      const rxH = x + w + 4 - hs
      if (wx >= rxH && wx <= rxH + hs && wy >= midY && wy <= midY + hs) return 4
      if (wx >= x - 4 && wx <= x - 4 + hs && wy >= midY && wy <= midY + hs) return 5
    }
    return -1
  }, [])

  const getCanvasXY = (e: React.PointerEvent | React.MouseEvent | PointerEvent | MouseEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top] as [number, number]
  }

  // ── Commit text edit ──────────────────────────────────────────────────────
  const commitEdit = useCallback(() => {
    if (!textEditing || !editRef.current) { setTextEditing(null); return }
    const html = editRef.current.innerHTML
    // Extract plain text for measurement / storage
    const tmp = document.createElement('div'); tmp.innerHTML = html
    const text = (tmp.textContent || '').trim()

    if (!text) {
      if (textEditing.id)
        elementsRef.current = elementsRef.current.filter(el => el.id !== textEditing.id)
      setTextEditing(null)
      scheduleRender(); scheduleSave()
      return
    }

    // Invalidate runs cache so re-render uses new HTML
    if (textEditing.id) runsCacheRef.current.delete(textEditing.id)

    if (textEditing.id) {
      elementsRef.current = elementsRef.current.map(el =>
        el.id === textEditing.id && el.type === 'text'
          ? { ...el, html, text, color: textEditing.color, size: textEditing.size, w: textEditing.w }
          : el
      )
    } else {
      const newEl: TextEl = {
        id: uid(), type: 'text',
        html, text,
        x: textEditing.wx, y: textEditing.wy,
        w: textEditing.w,
        color: textEditing.color,
        size: textEditing.size,
      }
      elementsRef.current = [...elementsRef.current, newEl]
    }
    setTextEditing(null)
    scheduleRender(); scheduleSave()
  }, [textEditing, scheduleRender, scheduleSave])

  // ── Pointer events ────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEdit && tool !== 'select') return
    const [sx, sy] = getCanvasXY(e)
    const v = viewRef.current

    if (isSpaceRef.current || tool === 'pan' || e.button === 1) {
      isPanRef.current    = true
      panStartRef.current = { mx: sx, my: sy, tx: v.tx, ty: v.ty }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    const [wx, wy] = screenToWorld(sx, sy, v)

    if (tool === 'select') {
      if (selectedIdRef.current) {
        const selEl = elementsRef.current.find(el => el.id === selectedIdRef.current)
        if (selEl) {
          const hIdx = hitTestHandle(wx, wy, selEl)
          if (hIdx >= 0) {
            let origBounds: { x: number; y: number; w: number; h: number }
            let origPts: number[][] | undefined
            if (selEl.type === 'stroke') {
              origBounds = strokeBounds(selEl)
              origPts = selEl.pts.map(p => [p[0], p[1]])
            } else {
              const ctx = canvasRef.current!.getContext('2d')!
              origBounds = getElBounds(selEl, ctx)
            }
            resizeRef.current = {
              handleIdx: hIdx,
              origBounds,
              origSize: selEl.type === 'text' ? selEl.size : 0,
              origPts,
              startWx: wx, startWy: wy,
            }
            e.currentTarget.setPointerCapture(e.pointerId)
            return
          }
        }
      }
      const hit = hitTest(wx, wy)
      if (hit) {
        selectedIdRef.current = hit.id; setSelectedId(hit.id)
        if (hit.type === 'stroke') {
          // Store original points so drag is computed from start position
          dragRef.current = {
            startWx: wx, startWy: wy,
            origX: 0, origY: 0,
            origPts: hit.pts.map(p => [p[0], p[1]]),
          }
        } else {
          const el = hit as WBImage | TextEl
          dragRef.current = { startWx: wx, startWy: wy, origX: el.x, origY: el.y }
        }
        e.currentTarget.setPointerCapture(e.pointerId)
      } else {
        selectedIdRef.current = null; setSelectedId(null)
      }
      scheduleRender(); return
    }

    if (tool === 'text') {
      // Start drag to define box width
      textDragRef.current = { startWx: wx, startWy: wy, endWx: wx, endWy: wy }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    activePtsRef.current = [[wx, wy]]
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [tool, canEdit, hitTest, hitTestHandle, scheduleRender]) // eslint-disable-line

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const [sx, sy] = getCanvasXY(e)
    const v = viewRef.current

    if (isPanRef.current && panStartRef.current) {
      const { mx, my, tx, ty } = panStartRef.current
      viewRef.current = { ...v, tx: tx + (sx - mx), ty: ty + (sy - my) }
      scheduleRender(); return
    }

    const [wx, wy] = screenToWorld(sx, sy, v)

    if (resizeRef.current && selectedIdRef.current) {
      const { handleIdx, origBounds, origSize, startWx, startWy } = resizeRef.current
      const dx = wx - startWx, dy = wy - startWy
      let { x, y, w, h } = origBounds
      if      (handleIdx === 0) { x += dx; y += dy; w -= dx; h -= dy }
      else if (handleIdx === 1) { y += dy; w += dx; h -= dy }
      else if (handleIdx === 2) { w += dx; h += dy }
      else if (handleIdx === 3) { x += dx; w -= dx; h += dy }
      else if (handleIdx === 4) { w += dx }             // right side: widen
      else if (handleIdx === 5) { x += dx; w -= dx }   // left side: shift + narrow
      w = Math.max(20, w); h = Math.max(20, h)
      elementsRef.current = elementsRef.current.map(el => {
        if (el.id !== selectedIdRef.current) return el
        if (el.type === 'stroke' && resizeRef.current?.origPts) {
          // Scale all stroke points proportionally from origBounds → new bounds
          const ob = origBounds
          const obW = Math.max(1, ob.w), obH = Math.max(1, ob.h)
          const newPts = resizeRef.current.origPts.map(([px, py]) => {
            const relX = (px - ob.x) / obW
            const relY = (py - ob.y) / obH
            return [x + relX * w, y + relY * h]
          })
          return { ...el, pts: newPts }
        }
        if (el.type === 'image') return { ...el, x, y, w, h }
        if (el.type === 'text') {
          if (handleIdx === 4) {
            // Right side: just change w (reflow)
            return { ...el, w: Math.max(40, origBounds.w + dx) }
          }
          if (handleIdx === 5) {
            // Left side: shift x, adjust w
            const newW = Math.max(40, origBounds.w - dx)
            return { ...el, x: origBounds.x + 2 + (origBounds.w - newW), w: newW }
          }
          const scaleH = h / Math.max(origBounds.h, 1)
          const newSize = Math.max(8, Math.round(origSize * scaleH))
          return { ...el, x, y: y + newSize, size: newSize }
        }
        return el
      })
      scheduleRender(); return
    }

    if (dragRef.current && tool === 'select' && selectedIdRef.current) {
      const { startWx, startWy, origX, origY, origPts } = dragRef.current
      const dx = wx - startWx, dy = wy - startWy
      elementsRef.current = elementsRef.current.map(el => {
        if (el.id !== selectedIdRef.current) return el
        if (el.type === 'stroke' && origPts) {
          return { ...el, pts: origPts.map(([px, py]) => [px + dx, py + dy]) }
        }
        if (el.type === 'image' || el.type === 'text') return { ...el, x: origX + dx, y: origY + dy }
        return el
      })
      scheduleRender(); return
    }

    if (textDragRef.current) {
      textDragRef.current.endWx = wx; textDragRef.current.endWy = wy
      scheduleRender(); return
    }

    // Eraser: always track position for cursor circle, render on every move
    if (tool === 'eraser') {
      eraserPosRef.current = [wx, wy]
      if (activePtsRef.current) {
        // Actively erasing — remove any stroke elements under the eraser circle
        activePtsRef.current.push([wx, wy])
        const eraserRadius = ERASER_RADIUS_PX / v.scale
        let changed = false
        const newEls = elementsRef.current.filter(el => {
          if (el.type !== 'stroke') return true  // never erase text or images
          if (strokeHitTest(el, wx, wy, eraserRadius)) { changed = true; return false }
          return true
        })
        if (changed) {
          elementsRef.current = newEls
          scheduleSave()
        }
      }
      scheduleRender()
      return
    }

    // Pen / highlighter: push with min-distance filter for smoothness
    if (activePtsRef.current) {
      const prev = activePtsRef.current[activePtsRef.current.length - 1]
      // Convert last world point to screen to measure screen-pixel distance
      const [prevSx, prevSy] = worldToScreen(prev[0], prev[1], v)
      const dsx = sx - prevSx, dsy = sy - prevSy
      // Only add point if it moved at least 3 screen pixels (reduces jitter)
      if (activePtsRef.current.length > 1 && dsx * dsx + dsy * dsy < 9) return
      activePtsRef.current.push([wx, wy])
      scheduleRender()
    }
  }, [tool, scheduleRender, scheduleSave])

  const onPointerUp = useCallback((e?: React.PointerEvent | { clientX?: number; clientY?: number }) => {
    if (isPanRef.current) { isPanRef.current = false; panStartRef.current = null; return }
    if (resizeRef.current) { resizeRef.current = null; scheduleSave(); return }
    if (dragRef.current) { dragRef.current = null; scheduleSave(); return }

    // Finish text drag-to-create
    if (textDragRef.current) {
      const drag = textDragRef.current; textDragRef.current = null
      const dragW = Math.abs(drag.endWx - drag.startWx)
      const wx = Math.min(drag.startWx, drag.endWx)
      // y = top of drag rect + one line height as baseline
      const wy = Math.min(drag.startWy, drag.endWy) + textSize
      const w  = dragW > 20 ? dragW : 0   // 0 = auto width
      setTextEditing({
        id: null, wx, wy,
        w,
        html: '',
        color: textColor, size: textSize,
        key: Date.now(),
      })
      scheduleRender(); return
    }

    const pts = activePtsRef.current; activePtsRef.current = null

    // Eraser: just clear the circle preview — elements were already removed in onPointerMove
    if (tool === 'eraser') { scheduleRender(); return }

    if (!pts || pts.length < 2) return

    const simplified = simplify(pts, 0.5 / viewRef.current.scale)
    // Apply Chaikin smoothing to pen strokes (not highlighter — keep it blocky/natural)
    const finalPts = tool === 'highlighter' ? simplified : chaikin(simplified, 2)

    const isHl = tool === 'highlighter'
    const newEl: Stroke = {
      id: uid(), type: 'stroke',
      pts: finalPts,
      color: isHl ? hlColor : color,
      width: isHl ? 24 : thickness,
      opacity: isHl ? HL_OPACITY : 1,
    }
    elementsRef.current = [...elementsRef.current, newEl]
    scheduleRender(); scheduleSave()
  }, [tool, color, hlColor, thickness, textSize, textColor, scheduleRender, scheduleSave])

  // ── Double-click: open text editor regardless of active tool ──────────────
  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const [sx, sy] = getCanvasXY(e)
    const [wx, wy] = screenToWorld(sx, sy, viewRef.current)
    const hit = hitTest(wx, wy)
    if (hit && hit.type === 'text') {
      setTextSize(hit.size); setTextColor(hit.color)
      setTextEditing({
        id: hit.id, wx: hit.x, wy: hit.y,
        w: hit.w ?? 0,
        html: textElToHtml(hit),
        color: hit.color, size: hit.size,
        key: Date.now(),
      })
    }
  }, [hitTest])

  // ── Wheel: zoom on ctrl/pinch, pan in all directions otherwise ───────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = viewRef.current
      if (e.ctrlKey) {
        // Pinch-to-zoom (ctrl + wheel, or trackpad pinch)
        const rect = canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left, my = e.clientY - rect.top
        const factor   = Math.exp(-e.deltaY * 0.008)
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor))
        const ratio    = newScale / v.scale
        viewRef.current = { scale: newScale, tx: mx - ratio * (mx - v.tx), ty: my - ratio * (my - v.ty) }
      } else {
        // Two-finger scroll / mouse wheel → pan in all 4 directions
        viewRef.current = { ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }
      }
      scheduleRender()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [scheduleRender])

  // ── Touch events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1) {
        const t = e.touches[0]
        const rect = canvas.getBoundingClientRect()
        const sx = t.clientX - rect.left, sy = t.clientY - rect.top
        const v  = viewRef.current
        if (tool === 'pan' || isSpaceRef.current) {
          isPanRef.current    = true
          panStartRef.current = { mx: sx, my: sy, tx: v.tx, ty: v.ty }
          touch1Ref.current   = { id: t.identifier, x: sx, y: sy }
        } else if (canEdit) {
          const [wx, wy] = screenToWorld(sx, sy, v)
          activePtsRef.current = [[wx, wy]]
          touch1Ref.current    = { id: t.identifier, x: sx, y: sy }
        }
      } else if (e.touches.length === 2) {
        activePtsRef.current = null; isPanRef.current = true
        const t1 = e.touches[0], t2 = e.touches[1]
        const rect = canvas.getBoundingClientRect()
        const x1 = t1.clientX - rect.left, y1 = t1.clientY - rect.top
        const x2 = t2.clientX - rect.left, y2 = t2.clientY - rect.top
        const dist = Math.hypot(x2 - x1, y2 - y1)
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
        touch1Ref.current   = { id: t1.identifier, x: x1, y: y1 }
        touch2Ref.current   = { id: t2.identifier, x: x2, y: y2, dist }
        panStartRef.current = { mx, my, tx: viewRef.current.tx, ty: viewRef.current.ty }
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      if (e.touches.length === 2 && touch2Ref.current) {
        const t1 = e.touches[0], t2 = e.touches[1]
        const x1 = t1.clientX - rect.left, y1 = t1.clientY - rect.top
        const x2 = t2.clientX - rect.left, y2 = t2.clientY - rect.top
        const newDist = Math.hypot(x2 - x1, y2 - y1)
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
        const v  = viewRef.current
        const rawRatio = newDist / touch2Ref.current.dist
        const dampedRatio = 1 + (rawRatio - 1) * 0.6
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * dampedRatio))
        const { mx: omx, my: omy, tx: otx, ty: oty } = panStartRef.current!
        const ratio = newScale / v.scale
        viewRef.current = { scale: newScale, tx: mx - ratio*(omx - otx) - (omx - mx), ty: my - ratio*(omy - oty) - (omy - my) }
        touch2Ref.current = { ...touch2Ref.current, x: x1, y: y1, dist: newDist }
        scheduleRender()
      } else if (e.touches.length === 1) {
        const t = e.touches[0]
        const sx = t.clientX - rect.left, sy = t.clientY - rect.top
        const v  = viewRef.current
        if (isPanRef.current && panStartRef.current) {
          const { mx, my, tx, ty } = panStartRef.current
          viewRef.current = { ...v, tx: tx + (sx - mx), ty: ty + (sy - my) }
          scheduleRender()
        } else if (activePtsRef.current) {
          const [wx, wy] = screenToWorld(sx, sy, v)
          activePtsRef.current.push([wx, wy]); scheduleRender()
        }
      }
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        onPointerUp()
        isPanRef.current = false; panStartRef.current = null
        touch1Ref.current = null; touch2Ref.current = null
      }
    }
    canvas.addEventListener('touchstart',  onTouchStart,  { passive: false })
    canvas.addEventListener('touchmove',   onTouchMove,   { passive: false })
    canvas.addEventListener('touchend',    onTouchEnd,    { passive: false })
    canvas.addEventListener('touchcancel', onTouchEnd,    { passive: false })
    return () => {
      canvas.removeEventListener('touchstart',  onTouchStart)
      canvas.removeEventListener('touchmove',   onTouchMove)
      canvas.removeEventListener('touchend',    onTouchEnd)
      canvas.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [onPointerUp, tool, canEdit, scheduleRender])

  // ── Spacebar pan ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && (e.target as HTMLElement).tagName !== 'INPUT' && !(e.target as HTMLElement).isContentEditable)
        isSpaceRef.current = true
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') { isSpaceRef.current = false; isPanRef.current = false }
    }
    window.addEventListener('keydown', onDown); window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [])

  // ── Delete / Undo ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!canEdit) return
      const tgt = e.target as HTMLElement
      if (tgt.tagName === 'INPUT' || tgt.isContentEditable) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdRef.current) {
        elementsRef.current = elementsRef.current.filter(el => el.id !== selectedIdRef.current)
        selectedIdRef.current = null; setSelectedId(null)
        scheduleRender(); scheduleSave()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (elementsRef.current.length === 0) return
        elementsRef.current = elementsRef.current.slice(0, -1)
        scheduleRender(); scheduleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canEdit, scheduleRender, scheduleSave])

  // ── Paste image ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canEdit) return
    const onPaste = async (e: ClipboardEvent) => {
      const items   = Array.from(e.clipboardData?.items ?? [])
      const imgItem = items.find(it => it.type.startsWith('image/'))
      if (!imgItem) return
      const file = imgItem.getAsFile(); if (!file) return
      const ext  = file.type.split('/')[1] || 'png'
      const path = `${boardId}/${uid()}.${ext}`
      const { data: uploaded, error } = await supabase.storage
        .from('whiteboard-images').upload(path, file, { contentType: file.type })
      const url = (!error && uploaded)
        ? supabase.storage.from('whiteboard-images').getPublicUrl(path).data.publicUrl
        : URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        imgCache.current.set(url, img)
        const canvas = canvasRef.current!; const v = viewRef.current
        const vw = canvas.width / v.scale, vh = canvas.height / v.scale
        const scale = Math.min(vw * 0.6 / img.width, vh * 0.6 / img.height, 1)
        const w = img.width * scale, h = img.height * scale
        const cx = (canvas.width  / 2 - v.tx) / v.scale
        const cy = (canvas.height / 2 - v.ty) / v.scale
        const newEl: WBImage = { id: uid(), type: 'image', url, x: cx - w/2, y: cy - h/2, w, h }
        elementsRef.current = [...elementsRef.current, newEl]
        scheduleRender(); scheduleSave()
      }
      img.src = url
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [canEdit, boardId, scheduleRender, scheduleSave]) // eslint-disable-line

  // ── Sync: pull latest canvas (guarded by dirtyRef) ───────────────────────
  useEffect(() => {
    const pull = async () => {
      // Don't pull while there are unsaved local changes — it would overwrite them
      if (activePtsRef.current || resizeRef.current || dragRef.current || dirtyRef.current) return
      try {
        const res  = await fetch(`/api/whiteboards/${boardId}`)
        const data = await res.json()
        if (data?.canvas_json) {
          const parsed = JSON.parse(data.canvas_json)
          elementsRef.current = parsed.elements ?? []
          for (const el of elementsRef.current) {
            if (el.type === 'image' && !imgCache.current.has(el.url)) {
              const img = new Image()
              img.onload = () => scheduleRenderRef.current()
              img.src = el.url
              imgCache.current.set(el.url, img)
            }
          }
          scheduleRender()
        }
      } catch { /* silent */ }
    }
    window.addEventListener('focus', pull)
    const interval = setInterval(pull, 15_000)
    return () => { window.removeEventListener('focus', pull); clearInterval(interval) }
  }, [boardId, scheduleRender])

  // ── Board name save ───────────────────────────────────────────────────────
  const saveName = useCallback(async (name: string) => {
    if (!isOwner) return
    await fetch(`/api/whiteboards/${boardId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  }, [boardId, isOwner])

  // ── Sharing helpers ───────────────────────────────────────────────────────
  const loadShares = useCallback(async () => {
    setShareError(null)
    try {
      const res  = await fetch(`/api/whiteboards/${boardId}/share`)
      const data = await res.json()
      if (Array.isArray(data)) setShares(data)
      else setShareError(data?.error || 'Failed to load shares')
    } catch { setShareError('Network error') }
  }, [boardId])

  const doShare = useCallback(async () => {
    if (shareTarget.size === 0) return
    setSharing(true)
    await fetch(`/api/whiteboards/${boardId}/share`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds: [...shareTarget], accessLevel: shareAccess }),
    })
    await loadShares(); setShareTarget(new Set()); setSharing(false)
  }, [boardId, shareTarget, shareAccess, loadShares])

  const revokeShare = useCallback(async (shareId: string) => {
    await fetch(`/api/whiteboards/${boardId}/share?shareId=${shareId}`, { method: 'DELETE' })
    await loadShares()
  }, [boardId, loadShares])

  const changeAccess = useCallback(async (shareId: string, level: 'view'|'edit') => {
    await fetch(`/api/whiteboards/${boardId}/share`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareId, accessLevel: level }),
    })
    setShares(prev => prev.map(s => s.id === shareId ? { ...s, access_level: level } : s))
  }, [boardId])

  const shareWithTeacher = useCallback(async () => {
    setSharing(true)
    await fetch(`/api/whiteboards/${boardId}/share`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withTeacher: true }),
    })
    await loadShares(); setSharing(false)
  }, [boardId, loadShares])

  const zoom = (delta: number) => {
    const canvas = canvasRef.current; if (!canvas) return
    const cx = canvas.width / 2, cy = canvas.height / 2
    const v  = viewRef.current
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * delta))
    const ratio    = newScale / v.scale
    viewRef.current = { scale: newScale, tx: cx - ratio*(cx - v.tx), ty: cy - ratio*(cy - v.ty) }
    scheduleRender()
  }
  const resetView = () => { viewRef.current = { tx: 0, ty: 0, scale: 1 }; scheduleRender() }

  useEffect(() => { scheduleRender() }, [tool, color, hlColor, thickness, scheduleRender])

  const cursor = isSpaceRef.current || tool === 'pan' ? 'grab'
    : tool === 'select'  ? 'default'
    : tool === 'text'    ? 'crosshair'
    : tool === 'eraser'  ? 'none'   // we draw our own circle cursor
    : 'crosshair'

  // ── Compute in-place editor screen position ────────────────────────────────
  const editorScreenPos = (() => {
    if (!textEditing || !canvasRef.current) return null
    const rect = canvasRef.current.getBoundingClientRect()
    const v    = viewRef.current
    const [sx, sy] = worldToScreen(textEditing.wx, textEditing.wy, v)
    return {
      left:   rect.left  + sx,
      top:    rect.top   + sy - textEditing.size * v.scale,
      width:  textEditing.w > 0 ? textEditing.w * v.scale : undefined,
      scale:  v.scale,
    }
  })()

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--background)' }}>

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b flex items-center gap-3 px-4"
        style={{ height: TOPBAR_H, background: 'var(--card)', borderColor: 'var(--border)' }}>

        <a href="/whiteboards"
          className="text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1 flex-shrink-0"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          ← Back
        </a>

        {isOwner ? (
          <input value={boardName} onChange={e => setBoardName(e.target.value)}
            onBlur={e => saveName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className="font-semibold text-sm bg-transparent border-b outline-none min-w-0 flex-1 max-w-xs"
            style={{ color: 'var(--foreground)', borderColor: 'var(--border)' }} />
        ) : (
          <span className="font-semibold text-sm flex-1 truncate max-w-xs" style={{ color: 'var(--foreground)' }}>
            {boardName}
          </span>
        )}

        {saving && <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Saving…</span>}
        {!canEdit && (
          <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ background: 'var(--background)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            View only
          </span>
        )}

        <div className="flex-1" />

        <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
          <button onClick={() => zoom(0.8)} className="w-7 h-7 rounded-lg border text-sm flex items-center justify-center"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>−</button>
          <button onClick={resetView} className="text-xs px-2 py-1 rounded-lg border min-w-[48px] text-center"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
            {Math.round(viewRef.current.scale * 100)}%
          </button>
          <button onClick={() => zoom(1.25)} className="w-7 h-7 rounded-lg border text-sm flex items-center justify-center"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>+</button>
        </div>

        {isOwner && (
          <button onClick={() => { setShowShare(true); loadShares() }}
            className="text-xs px-3 py-1.5 rounded-lg font-medium text-white flex-shrink-0"
            style={{ background: 'var(--accent)' }}>
            Share
          </button>
        )}
        {!isOwner && !isTeacher && (
          <button onClick={shareWithTeacher} disabled={sharing}
            className="text-xs px-3 py-1.5 rounded-lg font-medium flex-shrink-0 border disabled:opacity-50"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
            {sharing ? 'Sharing…' : 'Share with teacher'}
          </button>
        )}
      </div>

      {/* ── Canvas area ───────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          style={{ cursor, display: 'block', touchAction: 'none', userSelect: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => {
            if (eraserPosRef.current) { eraserPosRef.current = null; scheduleRender() }
          }}
          onDoubleClick={onDoubleClick}
        />

        {/* ── In-place text editor + floating toolbar ──────────────────── */}
        {textEditing && editorScreenPos && (
          <>
            {/* Floating toolbar — uses onMouseDown+preventDefault everywhere so
                focus stays in the contenteditable */}
            <div
              data-wb-toolbar
              onMouseDown={e => e.preventDefault()}
              style={{
                position: 'fixed',
                left: Math.max(4, editorScreenPos.left),
                top:  Math.max(TOPBAR_H + 4, editorScreenPos.top - 48),
                display: 'flex', alignItems: 'center', gap: 2,
                background: '#1f2937',
                borderRadius: 10, padding: '4px 8px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
                zIndex: 200, userSelect: 'none',
              }}
            >
              {/* Bold */}
              <button
                onMouseDown={e => { e.preventDefault(); document.execCommand('bold') }}
                title="Bold (⌘B)"
                className="w-7 h-7 rounded flex items-center justify-center text-sm font-bold transition-colors hover:bg-white/20"
                style={{ color: '#fff' }}>B</button>

              {/* Italic */}
              <button
                onMouseDown={e => { e.preventDefault(); document.execCommand('italic') }}
                title="Italic (⌘I)"
                className="w-7 h-7 rounded flex items-center justify-center text-sm italic transition-colors hover:bg-white/20"
                style={{ color: '#fff' }}>I</button>

              {/* Underline */}
              <button
                onMouseDown={e => { e.preventDefault(); document.execCommand('underline') }}
                title="Underline (⌘U)"
                className="w-7 h-7 rounded flex items-center justify-center text-sm transition-colors hover:bg-white/20"
                style={{ color: '#fff', textDecoration: 'underline' }}>U</button>

              <div style={{ width: 1, height: 18, background: '#4b5563', margin: '0 3px' }} />

              {/* Size decrease */}
              <button
                onMouseDown={e => {
                  e.preventDefault()
                  setTextEditing(prev => prev ? { ...prev, size: Math.max(8, prev.size - 2) } : null)
                }}
                title="Decrease size"
                className="w-7 h-7 rounded flex items-center justify-center transition-colors hover:bg-white/20"
                style={{ color: '#fff', fontSize: 11 }}>A−</button>

              <span style={{ color: '#9ca3af', fontSize: 11, minWidth: 28, textAlign: 'center' }}>
                {textEditing.size}
              </span>

              {/* Size increase */}
              <button
                onMouseDown={e => {
                  e.preventDefault()
                  setTextEditing(prev => prev ? { ...prev, size: Math.min(200, prev.size + 2) } : null)
                }}
                title="Increase size"
                className="w-7 h-7 rounded flex items-center justify-center transition-colors hover:bg-white/20"
                style={{ color: '#fff', fontSize: 11 }}>A+</button>

              <div style={{ width: 1, height: 18, background: '#4b5563', margin: '0 3px' }} />

              {/* Color swatches */}
              {PEN_COLORS.slice(0, 7).map(c => (
                <button
                  key={c}
                  onMouseDown={e => {
                    e.preventDefault()
                    setTextEditing(prev => prev ? { ...prev, color: c } : null)
                    setTextColor(c)
                  }}
                  className="w-4 h-4 rounded-full flex-shrink-0 transition-transform hover:scale-110"
                  style={{
                    background: c,
                    outline: textEditing.color === c ? '2px solid #60a5fa' : '2px solid transparent',
                    outlineOffset: 1,
                    boxShadow: c === '#ffffff' ? '0 0 0 1px #6b7280' : undefined,
                  }}
                />
              ))}

              <div style={{ width: 1, height: 18, background: '#4b5563', margin: '0 3px' }} />

              {/* Commit */}
              <button
                onMouseDown={e => { e.preventDefault(); commitEdit() }}
                title="Done (⌘Enter)"
                className="text-xs px-2 py-1 rounded font-medium transition-colors hover:bg-white/20"
                style={{ color: '#60a5fa' }}>Done</button>
            </div>

            {/* The actual in-place contenteditable editor */}
            <div
              key={textEditing.key}
              ref={editRef}
              contentEditable
              suppressContentEditableWarning
              onKeyDown={e => {
                if (e.key === 'Escape') { e.preventDefault(); setTextEditing(null); scheduleRender() }
                // Enter alone = newline (natural browser behavior)
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commitEdit() }
                if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); document.execCommand('bold') }
                if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); document.execCommand('italic') }
                if ((e.metaKey || e.ctrlKey) && e.key === 'u') { e.preventDefault(); document.execCommand('underline') }
              }}
              onBlur={e => {
                // Don't commit if focus moved to our toolbar (relatedTarget inside toolbar)
                const related = e.relatedTarget as HTMLElement | null
                if (related && related.closest('[data-wb-toolbar]')) return
                commitEdit()
              }}
              style={{
                position:   'fixed',
                left:       editorScreenPos.left,
                top:        editorScreenPos.top,
                width:      editorScreenPos.width,
                minWidth:   120,
                minHeight:  textEditing.size * editorScreenPos.scale * 1.4,
                fontSize:   `${textEditing.size * editorScreenPos.scale}px`,
                lineHeight: 1.3,
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                color:      textEditing.color,
                background: 'rgba(255,255,255,0.06)',
                border:     '1.5px dashed #3b5bdb',
                borderRadius: 4,
                padding:    '2px 4px',
                outline:    'none',
                zIndex:     150,
                caretColor: textEditing.color,
                cursor:     'text',
                whiteSpace: editorScreenPos.width ? 'pre-wrap' : 'pre',
                wordBreak:  editorScreenPos.width ? 'break-word' : 'normal',
                overflowWrap: editorScreenPos.width ? 'break-word' : 'normal',
              }}
            />
          </>
        )}
      </div>

      {/* ── Bottom toolbar ────────────────────────────────────────────────── */}
      {canEdit && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 border-t flex-wrap"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

          {/* Tool buttons */}
          {([
            { id: 'select',      title: 'Select / move / resize (double-click text to edit)',
              icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-7-7m0 0h5m-5 0v5" /></svg> },
            { id: 'pan',         title: 'Pan (or hold Space, or two-finger drag)',
              icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" /></svg> },
            { id: 'pen',         title: 'Pen',
              icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> },
            { id: 'highlighter', title: 'Highlighter',
              icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
            { id: 'eraser',      title: 'Eraser (pen/highlighter only)',
              icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 20H7L3 16l10-10 7 7-3.5 3.5" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.5 17.5l4-4" /></svg> },
            { id: 'text',        title: 'Text — click or drag to place',
              icon: <span className="text-sm font-bold">T</span> },
          ] as { id: Tool; title: string; icon: React.ReactNode }[]).map(t => (
            <button key={t.id} title={t.title} onClick={() => setTool(t.id)}
              className="w-9 h-9 rounded-xl border text-sm font-medium flex items-center justify-center transition-colors"
              style={{
                background:  tool === t.id ? 'var(--accent)' : 'var(--background)',
                borderColor: tool === t.id ? 'var(--accent)' : 'var(--border)',
                color:       tool === t.id ? '#fff' : 'var(--foreground)',
              }}>
              {t.icon}
            </button>
          ))}

          <div className="w-px h-6 mx-1 flex-shrink-0" style={{ background: 'var(--border)' }} />

          {/* Color / size controls per tool */}
          {(tool === 'pen' || tool === 'eraser' || tool === 'select') && PEN_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} title={c}
              className="w-6 h-6 rounded-full border-2 flex-shrink-0 transition-transform hover:scale-110"
              style={{
                background:  c,
                borderColor: color === c ? 'var(--foreground)' : 'transparent',
                boxShadow:   c === '#ffffff' ? '0 0 0 1px var(--border)' : undefined,
              }} />
          ))}

          {tool === 'highlighter' && HL_COLORS.map(c => (
            <button key={c} onClick={() => setHlColor(c)}
              className="w-7 h-5 rounded border-2 flex-shrink-0"
              style={{ background: c, borderColor: hlColor === c ? 'var(--foreground)' : 'transparent' }} />
          ))}

          {/* Text tool: default size + color for new boxes */}
          {tool === 'text' && (
            <>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Default:</span>
              {PEN_COLORS.slice(0, 7).map(c => (
                <button key={c} onClick={() => setTextColor(c)}
                  className="w-5 h-5 rounded-full border-2 flex-shrink-0"
                  style={{ background: c, borderColor: textColor === c ? 'var(--foreground)' : 'transparent' }} />
              ))}
              <select value={textSize} onChange={e => setTextSize(Number(e.target.value))}
                className="text-xs rounded-lg border px-1 py-1"
                style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}>
                {[8,10,12,14,16,18,22,28,36,48,64,96].map(s => <option key={s} value={s}>{s}px</option>)}
              </select>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· drag to set width</span>
            </>
          )}

          {tool === 'pen' && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Size</span>
              <input type="range" min={1} max={20} value={thickness}
                onChange={e => setThickness(Number(e.target.value))} className="w-20 accent-blue-600" />
              <span className="text-xs w-4" style={{ color: 'var(--text-muted)' }}>{thickness}</span>
            </div>
          )}

          {tool === 'select' && selectedId && (
            <button
              onClick={() => {
                elementsRef.current = elementsRef.current.filter(el => el.id !== selectedId)
                selectedIdRef.current = null; setSelectedId(null)
                scheduleRender(); scheduleSave()
              }}
              className="text-xs px-2.5 py-1 rounded-lg border ml-2"
              style={{ borderColor: '#fca5a5', color: '#dc2626', background: '#fef2f2' }}>
              🗑 Delete
            </button>
          )}

          <button
            onClick={() => {
              if (elementsRef.current.length === 0) return
              elementsRef.current = elementsRef.current.slice(0, -1)
              scheduleRender(); scheduleSave()
            }}
            title="Undo (⌘Z)"
            className="w-9 h-9 rounded-xl border text-sm flex items-center justify-center ml-1 flex-shrink-0"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)', background: 'var(--background)' }}>
            ↩
          </button>
        </div>
      )}

      {/* ── Share modal ──────────────────────────────────────────────────────── */}
      {showShare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowShare(false) }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4 max-h-[80vh] overflow-y-auto"
            style={{ background: 'var(--card)' }}>

            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base" style={{ color: 'var(--foreground)' }}>
                Share &ldquo;{boardName}&rdquo;
              </h2>
              <button onClick={() => setShowShare(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-lg"
                style={{ color: 'var(--text-muted)' }}>×</button>
            </div>

            {shareError && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>
                {shareError}
              </p>
            )}

            {shares.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Currently shared with
                </p>
                <div className="space-y-2">
                  {shares.map(s => {
                    const name = Array.isArray(s.profiles)
                      ? (s.profiles[0]?.full_name || s.profiles[0]?.email || s.shared_with)
                      : (s.profiles?.full_name || s.profiles?.email || s.shared_with)
                    return (
                      <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                        style={{ background: 'var(--background)' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{name}</p>
                        </div>
                        <select value={s.access_level}
                          onChange={e => changeAccess(s.id, e.target.value as 'view'|'edit')}
                          className="text-xs rounded-lg border px-2 py-1"
                          style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}>
                          <option value="view">View</option>
                          <option value="edit">Edit</option>
                        </select>
                        <button onClick={() => revokeShare(s.id)}
                          className="text-xs px-2 py-1 rounded-lg border"
                          style={{ borderColor: '#fca5a5', color: '#dc2626', background: '#fef2f2' }}>
                          Revoke
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {isTeacher && students.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Share with students
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {students.map(st => {
                    const alreadyShared = shares.some(s => s.shared_with === st.id)
                    const checked = shareTarget.has(st.id)
                    return (
                      <label key={st.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer"
                        style={{ background: checked ? 'var(--accent-light)' : 'var(--background)' }}>
                        <input type="checkbox" checked={checked} disabled={alreadyShared}
                          onChange={e => {
                            setShareTarget(prev => {
                              const next = new Set(prev)
                              e.target.checked ? next.add(st.id) : next.delete(st.id)
                              return next
                            })
                          }} className="accent-blue-600" />
                        <span className="text-sm flex-1 truncate" style={{ color: 'var(--foreground)' }}>
                          {st.full_name || st.email}
                        </span>
                        {alreadyShared && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Already shared</span>}
                      </label>
                    )
                  })}
                </div>
                {shareTarget.size > 0 && (
                  <div className="mt-3 flex items-center gap-3">
                    {shareTarget.size === 1 && (
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        Access:
                        <select value={shareAccess} onChange={e => setShareAccess(e.target.value as 'view'|'edit')}
                          className="rounded-lg border px-2 py-1"
                          style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}>
                          <option value="view">View only</option>
                          <option value="edit">Can edit</option>
                        </select>
                      </div>
                    )}
                    {shareTarget.size > 1 && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Multiple → view only</span>
                    )}
                    <button onClick={doShare} disabled={sharing}
                      className="ml-auto text-sm px-4 py-2 rounded-xl font-medium text-white disabled:opacity-50"
                      style={{ background: 'var(--accent)' }}>
                      {sharing ? 'Sharing…' : `Share with ${shareTarget.size}`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {!isTeacher && (() => {
              const TEACHER_EMAIL = 'morrisontestprep@gmail.com'
              const alreadySharedWithTeacher = shares.some(
                s => s.profiles?.email === TEACHER_EMAIL || s.profiles?.full_name?.toLowerCase().includes('teacher')
              )
              return (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    Share with teacher
                  </p>
                  {alreadySharedWithTeacher ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--background)' }}>
                      <svg className="w-4 h-4 flex-shrink-0" style={{ color: '#16a34a' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm" style={{ color: 'var(--foreground)' }}>Already shared with your teacher</span>
                    </div>
                  ) : (
                    <button onClick={async () => { await shareWithTeacher(); setShowShare(false) }}
                      disabled={sharing}
                      className="w-full py-2.5 rounded-xl font-medium text-white text-sm disabled:opacity-50"
                      style={{ background: 'var(--accent)' }}>
                      {sharing ? 'Sharing…' : 'Share with teacher (edit access)'}
                    </button>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
