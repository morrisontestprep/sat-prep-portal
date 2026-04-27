'use client'

import { useState, useEffect } from 'react'

interface Step {
  text:       string
  canvasData: string | null
}

interface ExplanationViewerProps {
  /** Pre-fetched steps — passed in by parent to avoid per-question API calls */
  steps: Step[]
}

export default function ExplanationViewer({ steps }: ExplanationViewerProps) {
  const [open, setOpen] = useState(false)

  if (!steps || steps.length === 0) return null

  return (
    <div className="border-t" style={{ borderColor: 'var(--border)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:opacity-80 transition-opacity"
        style={{ background: '#f0f9ff', color: '#0369a1' }}
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        Instructor explanation ({steps.length} step{steps.length !== 1 ? 's' : ''})
        <svg
          className="w-3.5 h-3.5 ml-auto flex-shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 py-4 space-y-6"
          style={{ background: '#f0f9ff' }}>
          {steps.map((step, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md"
                  style={{ background: '#0369a1', color: 'white' }}>
                  Step {idx + 1}
                </span>
              </div>

              {step.text && (
                <p className="text-sm whitespace-pre-wrap px-1"
                  style={{ color: '#0c4a6e' }}>
                  {step.text}
                </p>
              )}

              {step.canvasData && (
                <img
                  src={step.canvasData}
                  alt={`Step ${idx + 1} drawing`}
                  className="w-full rounded-xl border object-contain"
                  style={{ maxHeight: 400, background: 'white', borderColor: '#bae6fd' }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
