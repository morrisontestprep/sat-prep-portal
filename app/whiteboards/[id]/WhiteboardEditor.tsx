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
  text: string; x: number; y: number; color: string; size: number
  bold?: boolean; italic?: boolean
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
const HANDLE_PX   = 8  // resize handle size in screen pixels

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
  const [fx, fy] = pts[0]
  const [lx, ly] = pts[pts.length - 1]
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

function fontStr(size: number, bold?: boolean, italic?: boolean) {
  const parts = [italic ? 'italic' : '', bold ? 'bold' : ''].filter(Boolean)
  return `${parts.join(' ')} ${size}px -apple-system, sans-serif`.trimStart()
}

function getElBounds(
  el: WBImage | TextEl,
  ctx: CanvasRenderingContext2D,
): { x: number; y: number; w: number; h: number } {
  if (el.type === 'image') return { x: el.x, y: el.y, w: el.w, h: el.h }
  ctx.font = fontStr(el.size, el.bold, el.italic)
  const tw = ctx.measureText(el.text).width
  return { x: el.x - 2, y: el.y - el.size, w: tw + 4, h: el.size + 4 }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function WhiteboardEditor({
  boardId, initialName, initialJson,
  isOwner, canEdit, isTeacher, students, initialShares,
}: Props) {
  const supabase   = createClient()
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const imgCache   = useRef<Map<string, HTMLImageElement>>(new Map())
  const rafRef     = useRef<number>(0)

  // Mutable refs (avoid stale closures in canvas callbacks)
  const elementsRef   = useRef<WBEl[]>([])
  const viewRef       = useRef<View>({ tx: 0, ty: 0, scale: 1 })
  const activePtsRef  = useRef<number[][] | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const dragRef       = useRef<{ startWx: number; startWy: number; origX: number; origY: number } | null>(null)
  const resizeRef     = useRef<{
    handleIdx: number
    origBounds: { x: number; y: number; w: number; h: number }
    origSize: number
    startWx: number; startWy: number
  } | null>(null)
  const panStartRef   = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null)
  const isPanRef      = useRef(false)
  const isSpaceRef    = useRef(false)
  const touch1Ref     = useRef<{ id: number; x: number; y: number } | null>(null)
  const touch2Ref     = useRef<{ id: number; x: number; y: number; dist: number } | null>(null)

  // React state (UI only)
  const [tool,       setTool]      = useState<Tool>('pen')
  const [color,      setColor]     = useState(PEN_COLORS[0])
  const [hlColor,    setHlColor]   = useState(HL_COLORS[0])
  const [thickness,  setThickness] = useState(4)
  const [boardName,  setBoardName] = useState(initialName)
  const [saving,     setSaving]    = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Text state
  const [textInput,  setTextInput]  = useState('')
  const [textPos,    setTextPos]    = useState<{ wx: number; wy: number } | null>(null)
  const [textColor,  setTextColor]  = useState(PEN_COLORS[0])
  const [textSize,   setTextSize]   = useState(18)
  const [textBold,   setTextBold]   = useState(false)
  const [textItalic, setTextItalic] = useState(false)

  // Share modal state
  const [showShare,   setShowShare]   = useState(false)
  const [shares,      setShares]      = useState<ShareRow[]>(
    Array.isArray(initialShares) ? initialShares : []
  )
  const [shareTarget, setShareTarget] = useState<Set<string>>(new Set())
  const [shareAccess, setShareAccess] = useState<'view'|'edit'>('view')
  const [sharing,     setSharing]     = useState(false)
  const [shareError,  setShareError]  = useState<string | null>(null)

  const saveTimer    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const textInputRef = useRef<HTMLInputElement>(null)

  // ── Load initial canvas data ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const data = JSON.parse(initialJson) as { elements: WBEl[] }
      elementsRef.current = data.elements ?? []
      for (const el of elementsRef.current) {
        if (el.type === 'image' && !imgCache.current.has(el.url)) {
          const img = new Image(); img.src = el.url
          imgCache.current.set(el.url, img)
        }
      }
    } catch { /* empty board */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx    = canvas.getContext('2d')!
    const { tx, ty, scale } = viewRef.current
    const els   = elementsRef.current
    const selId = selectedIdRef.current

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
        ctx.lineCap     = 'round'
        ctx.lineJoin    = 'round'
        ctx.beginPath()
        ctx.moveTo(el.pts[0][0], el.pts[0][1])
        for (let i = 1; i < el.pts.length; i++) ctx.lineTo(el.pts[i][0], el.pts[i][1])
        ctx.stroke()
        ctx.restore()
      } else if (el.type === 'image') {
        const img = imgCache.current.get(el.url)
        if (img?.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, el.x, el.y, el.w, el.h)
          if (selId === el.id) drawSelectionBox(ctx, el.x, el.y, el.w, el.h)
        }
      } else if (el.type === 'text') {
        ctx.save()
        ctx.font      = fontStr(el.size, el.bold, el.italic)
        ctx.fillStyle = el.color
        ctx.fillText(el.text, el.x, el.y)
        if (selId === el.id) {
          const tw = ctx.measureText(el.text).width
          drawSelectionBox(ctx, el.x - 2, el.y - el.size, tw + 4, el.size + 4)
        }
        ctx.restore()
      }
    }

    // Active stroke being drawn
    const pts = activePtsRef.current
    if (pts && pts.length > 1) {
      const isHl = tool === 'highlighter'
      ctx.save()
      ctx.globalAlpha = isHl ? HL_OPACITY : 1
      ctx.strokeStyle = isHl ? hlColor : (tool === 'eraser' ? '#ffffff' : color)
      ctx.lineWidth   = isHl ? 24 : (tool === 'eraser' ? 28 : thickness)
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
      ctx.stroke()
      ctx.restore()
    }

    ctx.restore()
  }, [tool, color, hlColor, thickness])

  function drawSelectionBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const s  = viewRef.current.scale
    const hs = HANDLE_PX / s
    ctx.save()
    ctx.strokeStyle = '#3b5bdb'
    ctx.lineWidth   = 1.5 / s
    ctx.setLineDash([6 / s, 3 / s])
    ctx.strokeRect(x - 4, y - 4, w + 8, h + 8)
    ctx.setLineDash([])
    // Corner resize handles
    const corners = [
      [x - 4,           y - 4          ],  // TL
      [x + w + 4 - hs,  y - 4          ],  // TR
      [x + w + 4 - hs,  y + h + 4 - hs],  // BR
      [x - 4,           y + h + 4 - hs],  // BL
    ]
    ctx.fillStyle   = '#ffffff'
    ctx.strokeStyle = '#3b5bdb'
    ctx.lineWidth   = 1 / s
    for (const [hx, hy] of corners) {
      ctx.fillRect(hx, hy, hs, hs)
      ctx.strokeRect(hx, hy, hs, hs)
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
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight - TOPBAR_H
      scheduleRender()
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [scheduleRender])

  // ── Focus text input when text tool places a pin ──────────────────────────
  useEffect(() => {
    if (textPos) {
      // Short delay lets the input mount before we try to focus it
      const t = setTimeout(() => textInputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [textPos])

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const scheduleSave = useCallback(() => {
    if (!canEdit) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      const json = JSON.stringify({ version: 1, elements: elementsRef.current })
      await fetch(`/api/whiteboards/${boardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvas_json: json }),
      })
      setSaving(false)
    }, AUTOSAVE_MS)
  }, [boardId, canEdit])

  // ── Hit testing ───────────────────────────────────────────────────────────
  const hitTest = useCallback((wx: number, wy: number): WBEl | null => {
    const els = [...elementsRef.current].reverse()
    for (const el of els) {
      if (el.type === 'image') {
        if (wx >= el.x && wx <= el.x + el.w && wy >= el.y && wy <= el.y + el.h) return el
      } else if (el.type === 'text') {
        const canvas = canvasRef.current
        if (!canvas) continue
        const ctx = canvas.getContext('2d')!
        ctx.font = fontStr(el.size, el.bold, el.italic)
        const tw = ctx.measureText(el.text).width
        if (wx >= el.x - 2 && wx <= el.x + tw + 2 && wy >= el.y - el.size && wy <= el.y + 4) return el
      }
    }
    return null
  }, [])

  // Returns handle index 0-3 (TL/TR/BR/BL) or -1 if not on a handle
  const hitTestHandle = useCallback((wx: number, wy: number, el: WBImage | TextEl): number => {
    const canvas = canvasRef.current
    if (!canvas) return -1
    const ctx = canvas.getContext('2d')!
    const { x, y, w, h } = getElBounds(el, ctx)
    const hs = HANDLE_PX / viewRef.current.scale
    const corners = [
      [x - 4,           y - 4          ],
      [x + w + 4 - hs,  y - 4          ],
      [x + w + 4 - hs,  y + h + 4 - hs],
      [x - 4,           y + h + 4 - hs],
    ]
    for (let i = 0; i < corners.length; i++) {
      const [hx, hy] = corners[i]
      if (wx >= hx && wx <= hx + hs && wy >= hy && wy <= hy + hs) return i
    }
    return -1
  }, [])

  // ── Pointer helpers ───────────────────────────────────────────────────────
  const getCanvasXY = (e: React.PointerEvent | PointerEvent) => {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top] as [number, number]
  }

  // ── Pointer events ────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEdit && tool !== 'select') return
    const [sx, sy] = getCanvasXY(e)
    const v        = viewRef.current

    if (isSpaceRef.current || tool === 'pan' || e.button === 1) {
      isPanRef.current    = true
      panStartRef.current = { mx: sx, my: sy, tx: v.tx, ty: v.ty }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    const [wx, wy] = screenToWorld(sx, sy, v)

    if (tool === 'select') {
      // Check resize handles first
      if (selectedIdRef.current) {
        const selEl = elementsRef.current.find(el => el.id === selectedIdRef.current)
        if (selEl && (selEl.type === 'image' || selEl.type === 'text')) {
          const hIdx = hitTestHandle(wx, wy, selEl)
          if (hIdx >= 0) {
            const ctx = canvasRef.current!.getContext('2d')!
            const bounds = getElBounds(selEl, ctx)
            resizeRef.current = {
              handleIdx: hIdx,
              origBounds: bounds,
              origSize: selEl.type === 'text' ? selEl.size : 0,
              startWx: wx, startWy: wy,
            }
            e.currentTarget.setPointerCapture(e.pointerId)
            return
          }
        }
      }
      const hit = hitTest(wx, wy)
      if (hit) {
        selectedIdRef.current = hit.id
        setSelectedId(hit.id)
        const el = hit as WBImage | TextEl
        dragRef.current = {
          startWx: wx, startWy: wy,
          origX: el.x,
          origY: el.y,
        }
        e.currentTarget.setPointerCapture(e.pointerId)
      } else {
        selectedIdRef.current = null
        setSelectedId(null)
      }
      scheduleRender()
      return
    }

    if (tool === 'text') {
      setTextPos({ wx, wy })
      setTextColor(color)
      setTextInput('')
      return
    }

    activePtsRef.current = [[wx, wy]]
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [tool, canEdit, hitTest, hitTestHandle, color, scheduleRender]) // eslint-disable-line

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const [sx, sy] = getCanvasXY(e)
    const v        = viewRef.current

    if (isPanRef.current && panStartRef.current) {
      const { mx, my, tx, ty } = panStartRef.current
      viewRef.current = { ...v, tx: tx + (sx - mx), ty: ty + (sy - my) }
      scheduleRender()
      return
    }

    const [wx, wy] = screenToWorld(sx, sy, v)

    // Resize
    if (resizeRef.current && selectedIdRef.current) {
      const { handleIdx, origBounds, origSize, startWx, startWy } = resizeRef.current
      const dx = wx - startWx, dy = wy - startWy
      let { x, y, w, h } = origBounds

      if      (handleIdx === 0) { x += dx; y += dy; w -= dx; h -= dy }  // TL
      else if (handleIdx === 1) { y += dy; w += dx; h -= dy }            // TR
      else if (handleIdx === 2) { w += dx; h += dy }                     // BR
      else if (handleIdx === 3) { x += dx; w -= dx; h += dy }            // BL

      w = Math.max(20, w)
      h = Math.max(20, h)

      elementsRef.current = elementsRef.current.map(el => {
        if (el.id !== selectedIdRef.current) return el
        if (el.type === 'image') return { ...el, x, y, w, h }
        if (el.type === 'text') {
          const scaleH = h / Math.max(origBounds.h, 1)
          const newSize = Math.max(8, Math.round(origSize * scaleH))
          return { ...el, x, y: y + newSize, size: newSize }
        }
        return el
      })
      scheduleRender()
      return
    }

    if (dragRef.current && tool === 'select' && selectedIdRef.current) {
      const { startWx, startWy, origX, origY } = dragRef.current
      const dx = wx - startWx, dy = wy - startWy
      elementsRef.current = elementsRef.current.map(el => {
        if (el.id !== selectedIdRef.current) return el
        if (el.type === 'image' || el.type === 'text') return { ...el, x: origX + dx, y: origY + dy }
        return el
      })
      scheduleRender()
      return
    }

    if (activePtsRef.current) {
      activePtsRef.current.push([wx, wy])
      scheduleRender()
    }
  }, [tool, scheduleRender])

  const onPointerUp = useCallback(() => {
    if (isPanRef.current) {
      isPanRef.current    = false
      panStartRef.current = null
      return
    }
    if (resizeRef.current) {
      resizeRef.current = null
      scheduleSave()
      return
    }
    if (dragRef.current) {
      dragRef.current = null
      scheduleSave()
      return
    }

    const pts = activePtsRef.current
    activePtsRef.current = null
    if (!pts || pts.length < 2) return

    const simplified = simplify(pts, 0.5 / viewRef.current.scale)
    const isHl = tool === 'highlighter'
    const newEl: Stroke = {
      id:      uid(),
      type:    'stroke',
      pts:     simplified,
      color:   tool === 'eraser' ? '#ffffff' : (isHl ? hlColor : color),
      width:   isHl ? 24 : (tool === 'eraser' ? 28 : thickness),
      opacity: isHl ? HL_OPACITY : 1,
    }
    elementsRef.current = [...elementsRef.current, newEl]
    scheduleRender()
    scheduleSave()
  }, [tool, color, hlColor, thickness, scheduleRender, scheduleSave])

  // ── Wheel (zoom) — gentler exponential scaling ────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect  = canvas.getBoundingClientRect()
      const mx    = e.clientX - rect.left
      const my    = e.clientY - rect.top
      const v     = viewRef.current
      // ctrlKey = true during trackpad pinch on macOS (more sensitive needed)
      // Regular scroll: very gentle
      const factor   = Math.exp(-e.deltaY * (e.ctrlKey ? 0.008 : 0.002))
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor))
      const ratio    = newScale / v.scale
      viewRef.current = {
        scale: newScale,
        tx:    mx - ratio * (mx - v.tx),
        ty:    my - ratio * (my - v.ty),
      }
      scheduleRender()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [scheduleRender])

  // ── Touch (draw, pan, pinch-zoom) ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

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
        activePtsRef.current = null
        isPanRef.current     = true
        const t1 = e.touches[0], t2 = e.touches[1]
        const rect = canvas.getBoundingClientRect()
        const x1 = t1.clientX - rect.left, y1 = t1.clientY - rect.top
        const x2 = t2.clientX - rect.left, y2 = t2.clientY - rect.top
        const dist = Math.hypot(x2 - x1, y2 - y1)
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
        const v = viewRef.current
        touch1Ref.current   = { id: t1.identifier, x: x1, y: y1 }
        touch2Ref.current   = { id: t2.identifier, x: x2, y: y2, dist }
        panStartRef.current = { mx, my, tx: v.tx, ty: v.ty }
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
        const v = viewRef.current
        // Dampen pinch zoom on touch too
        const rawRatio = newDist / touch2Ref.current.dist
        const dampedRatio = 1 + (rawRatio - 1) * 0.6
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * dampedRatio))
        const { mx: omx, my: omy, tx: otx, ty: oty } = panStartRef.current!
        const ratio = newScale / v.scale
        viewRef.current = {
          scale: newScale,
          tx: mx - ratio * (omx - otx) - (omx - mx),
          ty: my - ratio * (omy - oty) - (omy - my),
        }
        touch2Ref.current = { ...touch2Ref.current, x: x1, y: y1, dist: newDist }
        scheduleRender()
      } else if (e.touches.length === 1) {
        const t  = e.touches[0]
        const sx = t.clientX - rect.left, sy = t.clientY - rect.top
        const v  = viewRef.current
        if (isPanRef.current && panStartRef.current) {
          const { mx, my, tx, ty } = panStartRef.current
          viewRef.current = { ...v, tx: tx + (sx - mx), ty: ty + (sy - my) }
          scheduleRender()
        } else if (activePtsRef.current) {
          const [wx, wy] = screenToWorld(sx, sy, v)
          activePtsRef.current.push([wx, wy])
          scheduleRender()
        }
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        onPointerUp()
        isPanRef.current    = false
        panStartRef.current = null
        touch1Ref.current   = null
        touch2Ref.current   = null
      }
    }

    canvas.addEventListener('touchstart',  onTouchStart, { passive: false })
    canvas.addEventListener('touchmove',   onTouchMove,  { passive: false })
    canvas.addEventListener('touchend',    onTouchEnd,   { passive: false })
    canvas.addEventListener('touchcancel', onTouchEnd,   { passive: false })
    return () => {
      canvas.removeEventListener('touchstart',  onTouchStart)
      canvas.removeEventListener('touchmove',   onTouchMove)
      canvas.removeEventListener('touchend',    onTouchEnd)
      canvas.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [onPointerUp, tool, canEdit, scheduleRender])

  // ── Spacebar pan ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        if ((e.target as HTMLElement).tagName === 'INPUT') return
        isSpaceRef.current = true
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') { isSpaceRef.current = false; isPanRef.current = false }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup',   onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [])

  // ── Delete / Undo ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!canEdit) return
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdRef.current) {
        elementsRef.current   = elementsRef.current.filter(el => el.id !== selectedIdRef.current)
        selectedIdRef.current = null
        setSelectedId(null)
        scheduleRender()
        scheduleSave()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (elementsRef.current.length === 0) return
        elementsRef.current = elementsRef.current.slice(0, -1)
        scheduleRender()
        scheduleSave()
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
      const file = imgItem.getAsFile()
      if (!file) return

      const ext  = file.type.split('/')[1] || 'png'
      const path = `${boardId}/${uid()}.${ext}`
      const { data: uploaded, error } = await supabase.storage
        .from('whiteboard-images')
        .upload(path, file, { contentType: file.type })

      const url = (!error && uploaded)
        ? supabase.storage.from('whiteboard-images').getPublicUrl(path).data.publicUrl
        : URL.createObjectURL(file)

      const img = new Image()
      img.onload = () => {
        imgCache.current.set(url, img)
        const canvas = canvasRef.current!
        const v = viewRef.current
        const vw    = canvas.width  / v.scale
        const vh    = canvas.height / v.scale
        const scale = Math.min(vw * 0.6 / img.width, vh * 0.6 / img.height, 1)
        const w = img.width * scale, h = img.height * scale
        const cx = (canvas.width  / 2 - v.tx) / v.scale
        const cy = (canvas.height / 2 - v.ty) / v.scale
        const newEl: WBImage = { id: uid(), type: 'image', url, x: cx - w / 2, y: cy - h / 2, w, h }
        elementsRef.current = [...elementsRef.current, newEl]
        scheduleRender()
        scheduleSave()
      }
      img.src = url
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [canEdit, boardId, scheduleRender, scheduleSave]) // eslint-disable-line

  // ── Sync on window focus (picks up edits made by others) ─────────────────
  useEffect(() => {
    const onFocus = async () => {
      // Don't disrupt an active drawing/drag/resize
      if (activePtsRef.current || resizeRef.current || dragRef.current) return
      try {
        const res  = await fetch(`/api/whiteboards/${boardId}`)
        const data = await res.json()
        if (data?.canvas_json) {
          const parsed = JSON.parse(data.canvas_json)
          elementsRef.current = parsed.elements ?? []
          for (const el of elementsRef.current) {
            if (el.type === 'image' && !imgCache.current.has(el.url)) {
              const img = new Image()
              img.src = el.url
              imgCache.current.set(el.url, img)
            }
          }
          scheduleRender()
        }
      } catch { /* silent — don't break anything if network fails */ }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [boardId, scheduleRender])

  // ── Commit text input ─────────────────────────────────────────────────────
  const commitText = useCallback(() => {
    if (!textPos || !textInput.trim()) { setTextPos(null); return }
    const newEl: TextEl = {
      id: uid(), type: 'text',
      text: textInput.trim(),
      x: textPos.wx, y: textPos.wy,
      color: textColor, size: textSize,
      bold: textBold, italic: textItalic,
    }
    elementsRef.current = [...elementsRef.current, newEl]
    setTextPos(null)
    setTextInput('')
    scheduleRender()
    scheduleSave()
  }, [textPos, textInput, textColor, textSize, textBold, textItalic, scheduleRender, scheduleSave])

  // ── Board name save ───────────────────────────────────────────────────────
  const saveName = useCallback(async (name: string) => {
    if (!isOwner) return
    await fetch(`/api/whiteboards/${boardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  }, [boardId, isOwner])

  // ── Sharing ───────────────────────────────────────────────────────────────
  const loadShares = useCallback(async () => {
    setShareError(null)
    try {
      const res  = await fetch(`/api/whiteboards/${boardId}/share`)
      const data = await res.json()
      if (Array.isArray(data)) {
        setShares(data)
      } else {
        setShareError(data?.error || 'Failed to load shares')
      }
    } catch {
      setShareError('Network error')
    }
  }, [boardId])

  const doShare = useCallback(async () => {
    if (shareTarget.size === 0) return
    setSharing(true)
    await fetch(`/api/whiteboards/${boardId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds: [...shareTarget], accessLevel: shareAccess }),
    })
    await loadShares()
    setShareTarget(new Set())
    setSharing(false)
  }, [boardId, shareTarget, shareAccess, loadShares])

  const revokeShare = useCallback(async (shareId: string) => {
    // Find the boardId for this share
    await fetch(`/api/whiteboards/${boardId}/share?shareId=${shareId}`, { method: 'DELETE' })
    await loadShares()
  }, [boardId, loadShares])

  const changeAccess = useCallback(async (shareId: string, level: 'view'|'edit') => {
    await fetch(`/api/whiteboards/${boardId}/share`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareId, accessLevel: level }),
    })
    setShares(prev => prev.map(s => s.id === shareId ? { ...s, access_level: level } : s))
  }, [boardId])

  const shareWithTeacher = useCallback(async () => {
    setSharing(true)
    await fetch(`/api/whiteboards/${boardId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withTeacher: true }),
    })
    await loadShares()
    setSharing(false)
  }, [boardId, loadShares])

  // ── Cursor ────────────────────────────────────────────────────────────────
  const cursor = isSpaceRef.current || tool === 'pan' ? 'grab'
    : tool === 'select'  ? 'default'
    : tool === 'text'    ? 'text'
    : tool === 'eraser'  ? 'cell'
    : 'crosshair'

  // ── Zoom buttons ──────────────────────────────────────────────────────────
  const zoom = (delta: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cx = canvas.width / 2, cy = canvas.height / 2
    const v  = viewRef.current
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * delta))
    const ratio    = newScale / v.scale
    viewRef.current = { scale: newScale, tx: cx - ratio * (cx - v.tx), ty: cy - ratio * (cy - v.ty) }
    scheduleRender()
  }
  const resetView = () => { viewRef.current = { tx: 0, ty: 0, scale: 1 }; scheduleRender() }

  // Text overlay screen position
  const textScreenPos = textPos ? worldToScreen(textPos.wx, textPos.wy, viewRef.current) : null

  // Re-render when tool/color changes
  useEffect(() => { scheduleRender() }, [tool, color, hlColor, thickness, scheduleRender])

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
          <input
            value={boardName}
            onChange={e => setBoardName(e.target.value)}
            onBlur={e => saveName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className="font-semibold text-sm bg-transparent border-b outline-none min-w-0 flex-1 max-w-xs"
            style={{ color: 'var(--foreground)', borderColor: 'var(--border)' }}
          />
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

        {/* Zoom controls */}
        <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
          <button onClick={() => zoom(0.8)} className="w-7 h-7 rounded-lg border text-sm flex items-center justify-center"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>−</button>
          <button onClick={resetView}
            className="text-xs px-2 py-1 rounded-lg border min-w-[48px] text-center"
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
          onPointerLeave={onPointerUp}
        />

        {/* Text input overlay */}
        {textPos && textScreenPos && (
          <div className="absolute pointer-events-none" style={{
            left: 0, top: 0, width: '100%', height: '100%',
          }}>
            <input
              ref={textInputRef}
              autoFocus
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onBlur={commitText}
              onKeyDown={e => {
                if (e.key === 'Enter')  { e.preventDefault(); commitText() }
                if (e.key === 'Escape') { setTextPos(null); setTextInput('') }
                // Bold / italic shortcuts
                if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); setTextBold(b => !b) }
                if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); setTextItalic(i => !i) }
              }}
              className="pointer-events-auto absolute"
              style={{
                left:       textScreenPos[0],
                top:        textScreenPos[1] - textSize * viewRef.current.scale,
                fontSize:   `${textSize * viewRef.current.scale}px`,
                fontFamily: '-apple-system, sans-serif',
                fontWeight: textBold   ? 'bold'   : 'normal',
                fontStyle:  textItalic ? 'italic' : 'normal',
                color:      textColor,
                background: 'rgba(255,255,255,0.85)',
                border:     '2px solid #3b5bdb',
                borderRadius: 4,
                padding:    '2px 6px',
                outline:    'none',
                minWidth:   100,
                whiteSpace: 'nowrap',
                caretColor: textColor,
                boxShadow:  '0 2px 8px rgba(0,0,0,0.15)',
              }}
              placeholder="Type here…"
            />
          </div>
        )}
      </div>

      {/* ── Bottom toolbar ─────────────────────────────────────────────────── */}
      {canEdit && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 border-t flex-wrap"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

          {/* Tool buttons */}
          {([
            { id: 'select',      title: 'Select / move / resize',
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-7-7m0 0h5m-5 0v5" />
                </svg>
              )},
            { id: 'pan',         title: 'Pan (or hold Space)',
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
                </svg>
              )},
            { id: 'pen',         title: 'Pen',
              icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              )},
            { id: 'highlighter', title: 'Highlighter',
              icon: (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              )},
            { id: 'eraser',      title: 'Eraser',
              icon: (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 20H7L3 16l10-10 7 7-3.5 3.5" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.5 17.5l4-4" />
                </svg>
              )},
            { id: 'text',        title: 'Text',
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

          {/* Colors */}
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
            <button key={c} onClick={() => setHlColor(c)} title={c}
              className="w-7 h-5 rounded border-2 flex-shrink-0"
              style={{ background: c, borderColor: hlColor === c ? 'var(--foreground)' : 'transparent' }} />
          ))}

          {tool === 'text' && (
            <>
              {PEN_COLORS.slice(0, -1).map(c => (
                <button key={c} onClick={() => setTextColor(c)}
                  className="w-6 h-6 rounded-full border-2 flex-shrink-0"
                  style={{ background: c, borderColor: textColor === c ? 'var(--foreground)' : 'transparent' }} />
              ))}
              <select value={textSize} onChange={e => setTextSize(Number(e.target.value))}
                className="text-xs rounded-lg border px-1 py-1"
                style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}>
                {[10,12,14,16,18,22,28,36,48,64].map(s => <option key={s} value={s}>{s}px</option>)}
              </select>
              {/* Bold */}
              <button onClick={() => setTextBold(b => !b)} title="Bold (⌘B)"
                className="w-9 h-9 rounded-xl border text-sm font-bold flex items-center justify-center"
                style={{
                  background:  textBold ? 'var(--accent)' : 'var(--background)',
                  borderColor: textBold ? 'var(--accent)' : 'var(--border)',
                  color:       textBold ? '#fff' : 'var(--foreground)',
                }}>B</button>
              {/* Italic */}
              <button onClick={() => setTextItalic(i => !i)} title="Italic (⌘I)"
                className="w-9 h-9 rounded-xl border text-sm italic flex items-center justify-center"
                style={{
                  background:  textItalic ? 'var(--accent)' : 'var(--background)',
                  borderColor: textItalic ? 'var(--accent)' : 'var(--border)',
                  color:       textItalic ? '#fff' : 'var(--foreground)',
                }}>I</button>
            </>
          )}

          {tool === 'pen' && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Size</span>
              <input type="range" min={1} max={20} value={thickness}
                onChange={e => setThickness(Number(e.target.value))}
                className="w-20 accent-blue-600" />
              <span className="text-xs w-4" style={{ color: 'var(--text-muted)' }}>{thickness}</span>
            </div>
          )}

          {tool === 'select' && selectedId && (
            <button
              onClick={() => {
                elementsRef.current   = elementsRef.current.filter(el => el.id !== selectedId)
                selectedIdRef.current = null
                setSelectedId(null)
                scheduleRender()
                scheduleSave()
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
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                            {name}
                          </p>
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
                          }}
                          className="accent-blue-600" />
                        <span className="text-sm flex-1 truncate" style={{ color: 'var(--foreground)' }}>
                          {st.full_name || st.email}
                        </span>
                        {alreadyShared && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Already shared</span>
                        )}
                      </label>
                    )
                  })}
                </div>
                {shareTarget.size > 0 && (
                  <div className="mt-3 flex items-center gap-3">
                    {shareTarget.size === 1 && (
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        Access:
                        <select value={shareAccess}
                          onChange={e => setShareAccess(e.target.value as 'view'|'edit')}
                          className="rounded-lg border px-2 py-1"
                          style={{ borderColor: 'var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}>
                          <option value="view">View only</option>
                          <option value="edit">Can edit</option>
                        </select>
                      </div>
                    )}
                    {shareTarget.size > 1 && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Multiple recipients → view only
                      </span>
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
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                      style={{ background: 'var(--background)' }}>
                      <svg className="w-4 h-4 flex-shrink-0" style={{ color: '#16a34a' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                        Already shared with your teacher
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={async () => { await shareWithTeacher(); setShowShare(false) }}
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
