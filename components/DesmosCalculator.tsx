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

const MIN_W = 320
const MIN_H = 280
const DEFAULT_W = 520
const DEFAULT_H = 580

export default function DesmosCalculator() {
  const [open, setOpen] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [mode, setMode] = useState<'graphing' | 'scientific'>('graphing')

  // Position & size — stored as refs AND state so renders are triggered only
  // at the end of a drag/resize, keeping it smooth during mouse move.
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H })
  const posRef = useRef(pos)
  const sizeRef = useRef(size)

  const posInitialized = useRef(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<DesmosInstance | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Drag
  const dragging = useRef(false)
  const dragOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  // Resize
  const resizing = useRef(false)
  const resizeOrigin = useRef({ mx: 0, my: 0, w: 0, h: 0 })

  // ── Position the panel at bottom-right on first open ─────────────────────
  useEffect(() => {
    if (open && !posInitialized.current) {
      const w = window.innerWidth
      const h = window.innerHeight
      const panelW = Math.min(DEFAULT_W, w - 48)
      const panelH = Math.min(DEFAULT_H, h - 120)
      const x = w - panelW - 24
      const y = h - panelH - 88        // clear the toggle button
      posRef.current = { x, y }
      sizeRef.current = { w: panelW, h: panelH }
      setPos({ x, y })
      setSize({ w: panelW, h: panelH })
      posInitialized.current = true
    }
  }, [open])

  // ── Global mouse-move / mouse-up handler ──────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current) {
        const dx = e.clientX - dragOrigin.current.mx
        const dy = e.clientY - dragOrigin.current.my
        const x = Math.max(0, Math.min(dragOrigin.current.px + dx, window.innerWidth - sizeRef.current.w))
        const y = Math.max(0, Math.min(dragOrigin.current.py + dy, window.innerHeight - 50))
        posRef.current = { x, y }
        // Move the panel directly via ref for smoothness — no state update mid-drag
        if (panelRef.current) {
          panelRef.current.style.left = `${x}px`
          panelRef.current.style.top = `${y}px`
        }
      }
      if (resizing.current) {
        const dx = e.clientX - resizeOrigin.current.mx
        const dy = e.clientY - resizeOrigin.current.my
        const w = Math.max(MIN_W, Math.min(resizeOrigin.current.w + dx, window.innerWidth - 48))
        const h = Math.max(MIN_H, Math.min(resizeOrigin.current.h + dy, window.innerHeight - 80))
        sizeRef.current = { w, h }
        if (panelRef.current) {
          panelRef.current.style.width = `${w}px`
          panelRef.current.style.height = `${h}px`
        }
        // Tell Desmos to re-measure
        instanceRef.current?.resize()
      }
    }

    const onUp = () => {
      if (dragging.current || resizing.current) {
        // Commit final position/size to React state
        setPos({ ...posRef.current })
        setSize({ ...sizeRef.current })
        dragging.current = false
        resizing.current = false
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
  }, [])

  // ── Drag start (header) ───────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return   // don't drag on mode/close buttons
    dragging.current = true
    dragOrigin.current = { mx: e.clientX, my: e.clientY, px: posRef.current.x, py: posRef.current.y }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'
    e.preventDefault()
  }, [])

  // ── Resize start (corner handle) ─────────────────────────────────────────
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    resizing.current = true
    resizeOrigin.current = { mx: e.clientX, my: e.clientY, w: sizeRef.current.w, h: sizeRef.current.h }
    document.body.style.userSelect = 'none'
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // ── Initialise / re-initialise Desmos ─────────────────────────────────────
  useEffect(() => {
    if (!open || !scriptLoaded || !window.Desmos) return
    const el = containerRef.current
    if (!el) return

    instanceRef.current?.destroy()

    instanceRef.current =
      mode === 'graphing'
        ? window.Desmos.GraphingCalculator(el, {
            keypad: true,
            expressions: true,
            settingsMenu: true,
            zoomButtons: true,
          })
        : window.Desmos.ScientificCalculator(el, {
            keypad: true,
            settingsMenu: false,
          })
  }, [open, scriptLoaded, mode])

  // ── Clean up on unmount ───────────────────────────────────────────────────
  useEffect(() => () => { instanceRef.current?.destroy() }, [])

  // ── Notify Desmos when the panel size changes (from state commit) ─────────
  useEffect(() => {
    if (open) instanceRef.current?.resize()
  }, [size, open])

  return (
    <>
      <Script
        src="https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6"
        strategy="lazyOnload"
        onLoad={() => setScriptLoaded(true)}
      />

      {/* ── Toggle button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        title={open ? 'Close calculator' : 'Open Desmos calculator'}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110"
        style={{ background: open ? '#374151' : 'var(--accent)', color: 'white' }}
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

      {/* ── Calculator panel ──────────────────────────────────────────────── */}
      {open && (
        <div
          ref={panelRef}
          className="fixed z-40 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{
            left: pos.x,
            top: pos.y,
            width: size.w,
            height: size.h,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            minWidth: MIN_W,
            minHeight: MIN_H,
          }}
        >
          {/* ── Header (drag handle) ────────────────────────────────────── */}
          <div
            onMouseDown={onDragStart}
            className="flex items-center justify-between px-3 py-2 flex-shrink-0 border-b select-none"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--card)',
              cursor: 'grab',
            }}
          >
            {/* Drag grip dots */}
            <div className="flex items-center gap-2.5">
              <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor"
                style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                <circle cx="4" cy="4" r="1.5"/><circle cx="4" cy="8" r="1.5"/><circle cx="4" cy="12" r="1.5"/>
                <circle cx="9" cy="4" r="1.5"/><circle cx="9" cy="8" r="1.5"/><circle cx="9" cy="12" r="1.5"/>
              </svg>

              {/* Mode switcher */}
              <div className="flex items-center gap-0.5 rounded-md p-0.5"
                style={{ background: 'var(--background)' }}>
                {(['graphing', 'scientific'] as const).map(m => (
                  <button
                    key={m}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => setMode(m)}
                    className="px-2.5 py-0.5 rounded text-xs font-medium transition-colors"
                    style={{
                      background: mode === m ? 'var(--accent)' : 'transparent',
                      color: mode === m ? 'white' : 'var(--text-muted)',
                    }}>
                    {m === 'graphing' ? 'Graphing' : 'Scientific'}
                  </button>
                ))}
              </div>
            </div>

            {/* Close */}
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded flex items-center justify-center hover:opacity-70"
              style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ── Calculator mount ─────────────────────────────────────────── */}
          <div ref={containerRef} className="flex-1 w-full" style={{ minHeight: 0 }} />

          {/* Loading overlay */}
          {!scriptLoaded && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl"
              style={{ background: 'var(--card)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading calculator…</p>
            </div>
          )}

          {/* ── Resize handle (bottom-right corner) ─────────────────────── */}
          <div
            onMouseDown={onResizeStart}
            className="absolute bottom-0 right-0 w-5 h-5 flex items-end justify-end pb-1 pr-1"
            style={{ cursor: 'nwse-resize', zIndex: 10 }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M9 1L1 9M9 5L5 9M9 9" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
            </svg>
          </div>
        </div>
      )}
    </>
  )
}
