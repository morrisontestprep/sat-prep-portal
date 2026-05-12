'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Script from 'next/script'

declare global {
  interface Window {
    Desmos?: {
      GraphingCalculator: (el: HTMLElement, options?: object) => DesmosInstance
      ScientificCalculator: (el: HTMLElement, options?: object) => DesmosInstance
    }
  }
}

interface DesmosInstance {
  destroy: () => void
  resize: () => void
}

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const MIN_W = 320
const MIN_H = 280
const DEFAULT_W = 520
const DEFAULT_H = 580
const PANEL_DEFAULT_W = 480
const PANEL_MIN_W     = 340
const PANEL_MAX_W     = 860

const DIR_CURSOR: Record<ResizeDir, string> = {
  n: 'ns-resize', s: 'ns-resize',
  e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  nw: 'nwse-resize', se: 'nwse-resize',
}

type Props = {
  /** 'float' = draggable popup (default). 'panel' = docked right-side pane. */
  variant?: 'float' | 'panel'
  /** Called whenever the calculator opens or closes (panel mode only). */
  onOpenChange?: (open: boolean) => void
  /** Called when the panel width changes (panel mode only, in px). */
  onWidthChange?: (width: number) => void
}

export default function DesmosCalculator({ variant = 'float', onOpenChange, onWidthChange }: Props) {
  const [open, setOpen]           = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [mode, setMode]           = useState<'graphing' | 'scientific'>('graphing')
  const [isMobile, setIsMobile]   = useState(false)

  // float-mode position & size
  const [pos,  setPos]  = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H })
  const posRef  = useRef(pos)
  const sizeRef = useRef(size)
  const posInitialized = useRef(false)

  // panel-mode width (draggable)
  const [panelWidth, setPanelWidth]   = useState(PANEL_DEFAULT_W)
  const panelWidthRef                 = useRef(PANEL_DEFAULT_W)
  const panelDragging                 = useRef(false)
  const panelDragOrigin               = useRef({ mx: 0, startW: 0 })

  const containerRef  = useRef<HTMLDivElement>(null)
  const instanceRef   = useRef<DesmosInstance | null>(null)
  const panelRef      = useRef<HTMLDivElement>(null)   // float mode
  const panelModeRef  = useRef<HTMLDivElement>(null)   // panel mode

  // Drag / resize refs (float mode)
  const dragging     = useRef(false)
  const dragOrigin   = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const resizing     = useRef(false)
  const resizeDirRef = useRef<ResizeDir | null>(null)
  const resizeOrigin = useRef({ mx: 0, my: 0, w: 0, h: 0, px: 0, py: 0 })

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Whether we're actually in panel mode (panel prop + not mobile)
  const isPanel = variant === 'panel' && !isMobile

  // Notify parent when open/close changes in panel mode
  useEffect(() => {
    if (isPanel) onOpenChange?.(open)
  }, [open, isPanel, onOpenChange])

  // ── Float: position the panel at bottom-right on first open ─────────────
  useEffect(() => {
    if (!isPanel && open && !posInitialized.current) {
      const w = window.innerWidth
      const h = window.innerHeight
      const panelW = Math.min(DEFAULT_W, w - 48)
      const panelH = Math.min(DEFAULT_H, h - 120)
      const x = w - panelW - 24
      const y = h - panelH - 88
      posRef.current  = { x, y }
      sizeRef.current = { w: panelW, h: panelH }
      setPos({ x, y })
      setSize({ w: panelW, h: panelH })
      posInitialized.current = true
    }
  }, [open, isPanel])

  // ── Float: global mouse handlers ─────────────────────────────────────────
  useEffect(() => {
    if (isPanel) return
    const onMove = (e: MouseEvent) => {
      if (dragging.current) {
        const dx = e.clientX - dragOrigin.current.mx
        const dy = e.clientY - dragOrigin.current.my
        const x  = Math.max(0, Math.min(dragOrigin.current.px + dx, window.innerWidth - sizeRef.current.w))
        const y  = Math.max(0, Math.min(dragOrigin.current.py + dy, window.innerHeight - 50))
        posRef.current = { x, y }
        if (panelRef.current) {
          panelRef.current.style.left = `${x}px`
          panelRef.current.style.top  = `${y}px`
        }
        return
      }
      if (resizing.current && resizeDirRef.current) {
        const dir = resizeDirRef.current
        const dx  = e.clientX - resizeOrigin.current.mx
        const dy  = e.clientY - resizeOrigin.current.my
        let newW = resizeOrigin.current.w, newH = resizeOrigin.current.h
        let newX = resizeOrigin.current.px, newY = resizeOrigin.current.py
        if (dir.includes('e')) newW = Math.max(MIN_W, resizeOrigin.current.w + dx)
        if (dir.includes('w')) { const raw = resizeOrigin.current.w - dx; newW = Math.max(MIN_W, raw); newX = resizeOrigin.current.px + (resizeOrigin.current.w - newW) }
        if (dir === 's' || dir === 'se' || dir === 'sw') newH = Math.max(MIN_H, resizeOrigin.current.h + dy)
        if (dir === 'n' || dir === 'ne' || dir === 'nw') { const raw = resizeOrigin.current.h - dy; newH = Math.max(MIN_H, raw); newY = resizeOrigin.current.py + (resizeOrigin.current.h - newH) }
        newW = Math.min(newW, window.innerWidth  - newX - 4)
        newH = Math.min(newH, window.innerHeight - newY - 4)
        newX = Math.max(0, newX); newY = Math.max(0, newY)
        sizeRef.current = { w: newW, h: newH }
        posRef.current  = { x: newX, y: newY }
        if (panelRef.current) {
          panelRef.current.style.width  = `${newW}px`
          panelRef.current.style.height = `${newH}px`
          panelRef.current.style.left   = `${newX}px`
          panelRef.current.style.top    = `${newY}px`
        }
        instanceRef.current?.resize()
      }
    }
    const onUp = () => {
      if (dragging.current || resizing.current) {
        setPos({ ...posRef.current }); setSize({ ...sizeRef.current })
        dragging.current = false; resizing.current = false; resizeDirRef.current = null
        document.body.style.userSelect = ''; document.body.style.cursor = ''
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [isPanel])

  // ── Panel: left-edge drag-to-resize ─────────────────────────────────────
  useEffect(() => {
    if (!isPanel) return
    const onMove = (e: MouseEvent) => {
      if (!panelDragging.current) return
      const dx = panelDragOrigin.current.mx - e.clientX   // drag left → wider
      const newW = Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, panelDragOrigin.current.startW + dx))
      panelWidthRef.current = newW
      if (panelModeRef.current) panelModeRef.current.style.width = `${newW}px`
      instanceRef.current?.resize()
      onWidthChange?.(newW)
    }
    const onUp = () => {
      if (panelDragging.current) {
        panelDragging.current = false
        setPanelWidth(panelWidthRef.current)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isPanel, onWidthChange])

  const onPanelResizeStart = useCallback((e: React.MouseEvent) => {
    panelDragging.current = true
    panelDragOrigin.current = { mx: e.clientX, startW: panelWidthRef.current }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'ew-resize'
    e.preventDefault()
  }, [])

  const onDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragging.current = true
    dragOrigin.current = { mx: e.clientX, my: e.clientY, px: posRef.current.x, py: posRef.current.y }
    document.body.style.userSelect = 'none'; document.body.style.cursor = 'grabbing'
    e.preventDefault()
  }, [])

  const onResizeStart = useCallback((dir: ResizeDir) => (e: React.MouseEvent) => {
    resizing.current = true; resizeDirRef.current = dir
    resizeOrigin.current = { mx: e.clientX, my: e.clientY, w: sizeRef.current.w, h: sizeRef.current.h, px: posRef.current.x, py: posRef.current.y }
    document.body.style.userSelect = 'none'; document.body.style.cursor = DIR_CURSOR[dir]
    e.preventDefault(); e.stopPropagation()
  }, [])

  // ── Initialise / re-initialise Desmos ────────────────────────────────────
  useEffect(() => {
    if (!open || !scriptLoaded || !window.Desmos) return
    const el = containerRef.current
    if (!el) return
    instanceRef.current?.destroy()
    instanceRef.current =
      mode === 'graphing'
        ? window.Desmos.GraphingCalculator(el, {
            keypad:            true,
            expressions:       true,
            expressionsTopbar: true,   // shows +table, regression bar, etc.
            settingsMenu:      true,
            zoomButtons:       true,
          })
        : window.Desmos.ScientificCalculator(el, {
            keypad:       true,
            settingsMenu: false,
          })
  }, [open, scriptLoaded, mode])

  useEffect(() => () => { instanceRef.current?.destroy() }, [])

  useEffect(() => { if (open) instanceRef.current?.resize() }, [size, open])

  // ── Panel mode: resize Desmos after slide-in animation + on window resize ─
  useEffect(() => {
    if (!isPanel || !open) return
    // Delay matches the 0.2s CSS transition — ensures Desmos measures full width
    const t = setTimeout(() => instanceRef.current?.resize(), 220)
    const onResize = () => instanceRef.current?.resize()
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', onResize)
    }
  }, [isPanel, open])

  // Shared header content
  const Header = ({ onClose }: { onClose: () => void }) => (
    <div
      onMouseDown={isPanel ? undefined : onDragStart}
      className="flex items-center justify-between px-3 py-2 flex-shrink-0 border-b select-none"
      style={{ borderColor: 'var(--border)', background: 'var(--card)', cursor: isPanel ? 'default' : 'grab' }}
    >
      <div className="flex items-center gap-2.5">
        {!isPanel && (
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor"
            style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
            <circle cx="4" cy="4" r="1.5"/><circle cx="4" cy="8" r="1.5"/><circle cx="4" cy="12" r="1.5"/>
            <circle cx="9" cy="4" r="1.5"/><circle cx="9" cy="8" r="1.5"/><circle cx="9" cy="12" r="1.5"/>
          </svg>
        )}
        <div className="flex items-center gap-0.5 rounded-md p-0.5" style={{ background: 'var(--background)' }}>
          {(['graphing', 'scientific'] as const).map(m => (
            <button key={m} onMouseDown={e => e.stopPropagation()} onClick={() => setMode(m)}
              className="px-2.5 py-0.5 rounded text-xs font-medium transition-colors"
              style={{ background: mode === m ? 'var(--accent)' : 'transparent', color: mode === m ? 'white' : 'var(--text-muted)' }}>
              {m === 'graphing' ? 'Graphing' : 'Scientific'}
            </button>
          ))}
        </div>
      </div>
      <button onMouseDown={e => e.stopPropagation()} onClick={onClose}
        className="w-6 h-6 rounded flex items-center justify-center hover:opacity-70"
        style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )

  const ToggleBtn = () => (
    <button
      onClick={() => setOpen(v => !v)}
      title={open ? 'Close calculator' : 'Open Desmos calculator'}
      className="fixed bottom-6 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110"
      style={{
        right: isPanel && open ? panelWidth + 12 : 24,
        background: open ? '#374151' : 'var(--accent)',
        color: 'white',
        transition: 'right 0.2s ease, background 0.15s',
      }}
    >
      {open ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <rect x="4" y="3" width="16" height="18" rx="2" strokeWidth="1.8" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M8 7h8M8 11h2m4 0h2M8 15h2m4 0h2M8 19h2m4 0h2" />
        </svg>
      )}
    </button>
  )

  return (
    <>
      <Script
        src="https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6"
        strategy="lazyOnload"
        onLoad={() => setScriptLoaded(true)}
      />

      <ToggleBtn />

      {/* ── PANEL MODE ──────────────────────────────────────────────────────── */}
      {isPanel && (
        <div
          ref={panelModeRef}
          className="fixed z-40 flex flex-col border-l"
          style={{
            right: 0,
            top: 0,
            bottom: 0,
            width: panelWidth,
            transform: open ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.2s ease',
            background: 'var(--card)',
            borderColor: 'var(--border)',
          }}
        >
          {/* Left-edge drag handle */}
          <div
            onMouseDown={onPanelResizeStart}
            title="Drag to resize"
            style={{
              position: 'absolute', left: -4, top: 0, bottom: 0, width: 8,
              cursor: 'ew-resize', zIndex: 50,
              background: 'transparent',
            }}
          />

          <Header onClose={() => setOpen(false)} />
          <div ref={containerRef} className="flex-1 w-full" style={{ minHeight: 0 }} />
          {!scriptLoaded && (
            <div className="absolute inset-0 flex items-center justify-center"
              style={{ background: 'var(--card)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading calculator…</p>
            </div>
          )}
        </div>
      )}

      {/* ── FLOAT MODE ──────────────────────────────────────────────────────── */}
      {!isPanel && open && (
        <div
          ref={panelRef}
          className="fixed z-40 rounded-2xl shadow-2xl flex flex-col"
          style={{
            left: pos.x, top: pos.y, width: size.w, height: size.h,
            background: 'var(--card)', border: '1px solid var(--border)',
            minWidth: MIN_W, minHeight: MIN_H, overflow: 'visible',
          }}
        >
          {/* Resize handles */}
          <div onMouseDown={onResizeStart('n')}  className="absolute" style={{ top: -4,    left: 12,  right: 12,  height: 8,  cursor: 'ns-resize', zIndex: 20 }} />
          <div onMouseDown={onResizeStart('s')}  className="absolute" style={{ bottom: -4, left: 12,  right: 12,  height: 8,  cursor: 'ns-resize', zIndex: 20 }} />
          <div onMouseDown={onResizeStart('w')}  className="absolute" style={{ left: -4,   top: 12,   bottom: 12, width: 8,   cursor: 'ew-resize', zIndex: 20 }} />
          <div onMouseDown={onResizeStart('e')}  className="absolute" style={{ right: -4,  top: 12,   bottom: 12, width: 8,   cursor: 'ew-resize', zIndex: 20 }} />
          <div onMouseDown={onResizeStart('nw')} className="absolute" style={{ top: -4,    left: -4,  width: 16,  height: 16, cursor: 'nwse-resize', zIndex: 21 }} />
          <div onMouseDown={onResizeStart('ne')} className="absolute" style={{ top: -4,    right: -4, width: 16,  height: 16, cursor: 'nesw-resize', zIndex: 21 }} />
          <div onMouseDown={onResizeStart('sw')} className="absolute" style={{ bottom: -4, left: -4,  width: 16,  height: 16, cursor: 'nesw-resize', zIndex: 21 }} />
          <div onMouseDown={onResizeStart('se')} className="absolute flex items-end justify-end pb-1 pr-1"
            style={{ bottom: -4, right: -4, width: 16, height: 16, cursor: 'nwse-resize', zIndex: 21 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
            </svg>
          </div>

          <div className="flex flex-col w-full h-full rounded-2xl overflow-hidden">
            <Header onClose={() => setOpen(false)} />
            <div ref={containerRef} className="flex-1 w-full" style={{ minHeight: 0 }} />
            {!scriptLoaded && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl"
                style={{ background: 'var(--card)' }}>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading calculator…</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
