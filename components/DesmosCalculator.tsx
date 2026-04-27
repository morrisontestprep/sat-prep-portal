'use client'

import { useEffect, useRef, useState } from 'react'
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
}

export default function DesmosCalculator() {
  const [open, setOpen] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [mode, setMode] = useState<'graphing' | 'scientific'>('graphing')
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<DesmosInstance | null>(null)
  const prevModeRef = useRef(mode)

  // Initialise or re-initialise the calculator whenever the panel is open
  // and the script is ready, or when the mode changes.
  useEffect(() => {
    if (!open || !scriptLoaded || !window.Desmos) return

    const el = containerRef.current
    if (!el) return

    // Destroy previous instance before re-creating (mode switch)
    if (instanceRef.current) {
      instanceRef.current.destroy()
      instanceRef.current = null
    }

    const options = {
      keypad: true,
      expressions: mode === 'graphing',
      settingsMenu: true,
      zoomButtons: true,
      lockViewport: false,
    }

    instanceRef.current =
      mode === 'graphing'
        ? window.Desmos.GraphingCalculator(el, options)
        : window.Desmos.ScientificCalculator(el, options)

    prevModeRef.current = mode
  }, [open, scriptLoaded, mode])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      instanceRef.current?.destroy()
    }
  }, [])

  return (
    <>
      {/* Desmos API script — loads once, lazily */}
      <Script
        src="https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6"
        strategy="lazyOnload"
        onLoad={() => setScriptLoaded(true)}
      />

      {/* Floating toggle button — bottom-right corner */}
      <button
        onClick={() => setOpen(v => !v)}
        title={open ? 'Close calculator' : 'Open calculator'}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110"
        style={{
          background: open ? 'var(--foreground)' : 'var(--accent)',
          color: 'white',
        }}
      >
        {open ? (
          // X icon
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          // Calculator icon
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M9 7H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-2M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M9 7h6" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" />
          </svg>
        )}
      </button>

      {/* Calculator panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-40 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{
            width: 'min(520px, calc(100vw - 48px))',
            height: 'min(600px, calc(100vh - 160px))',
            background: 'var(--card)',
            border: '1px solid var(--border)',
          }}
        >
          {/* Panel header */}
          <div
            className="flex items-center justify-between px-4 py-2.5 flex-shrink-0 border-b"
            style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
          >
            <div className="flex items-center gap-1 rounded-lg p-0.5"
              style={{ background: 'var(--background)' }}>
              <button
                onClick={() => setMode('graphing')}
                className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: mode === 'graphing' ? 'var(--accent)' : 'transparent',
                  color: mode === 'graphing' ? 'white' : 'var(--text-muted)',
                }}>
                Graphing
              </button>
              <button
                onClick={() => setMode('scientific')}
                className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: mode === 'scientific' ? 'var(--accent)' : 'transparent',
                  color: mode === 'scientific' ? 'white' : 'var(--text-muted)',
                }}>
                Scientific
              </button>
            </div>

            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ color: 'var(--text-muted)' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Calculator mount point */}
          <div ref={containerRef} className="flex-1 w-full" style={{ minHeight: 0 }} />

          {/* Loading state */}
          {!scriptLoaded && (
            <div className="absolute inset-0 flex items-center justify-center"
              style={{ background: 'var(--card)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading calculator…</p>
            </div>
          )}
        </div>
      )}
    </>
  )
}
