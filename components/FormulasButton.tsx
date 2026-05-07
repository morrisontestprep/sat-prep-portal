'use client'

import { useState } from 'react'

// ─── Inline SVG shapes ────────────────────────────────────────────────────────

function CircleSVG() {
  return (
    <svg viewBox="0 0 80 80" width="70" height="70" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="40" cy="40" r="28" />
      <circle cx="40" cy="40" r="2" fill="currentColor" />
      <line x1="40" y1="40" x2="68" y2="40" />
      <text x="52" y="36" fontSize="11" fill="currentColor" stroke="none" fontStyle="italic">r</text>
    </svg>
  )
}

function RectSVG() {
  return (
    <svg viewBox="0 0 90 70" width="80" height="65" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="10" y="15" width="70" height="40" />
      <text x="40" y="10" fontSize="11" fill="currentColor" stroke="none" fontStyle="italic" textAnchor="middle">l</text>
      <text x="84" y="38" fontSize="11" fill="currentColor" stroke="none" fontStyle="italic">w</text>
    </svg>
  )
}

function TriangleSVG() {
  return (
    <svg viewBox="0 0 80 80" width="70" height="70" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="10,70 70,70 40,15" />
      <line x1="40" y1="15" x2="40" y2="70" strokeDasharray="4 3" />
      <text x="43" y="50" fontSize="11" fill="currentColor" stroke="none" fontStyle="italic">h</text>
      <text x="38" y="80" fontSize="11" fill="currentColor" stroke="none" fontStyle="italic" textAnchor="middle">b</text>
    </svg>
  )
}

function RightTriSVG() {
  return (
    <svg viewBox="0 0 80 75" width="70" height="65" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="10,65 65,65 10,10" />
      <rect x="10" y="55" width="10" height="10" />
      <text x="2" y="40" fontSize="11" fill="currentColor" stroke="none" fontStyle="italic">a</text>
      <text x="35" y="78" fontSize="11" fill="currentColor" stroke="none" fontStyle="italic">b</text>
      <text x="42" y="35" fontSize="11" fill="currentColor" stroke="none" fontStyle="italic">c</text>
    </svg>
  )
}

function Tri3060SVG() {
  return (
    <svg viewBox="0 0 100 80" width="90" height="72" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="10,70 90,70 10,10" />
      <rect x="10" y="60" width="10" height="10" />
      <text x="14" y="46" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">x√3</text>
      <text x="42" y="80" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">x</text>
      <text x="48" y="40" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">2x</text>
      <text x="12" y="26" fontSize="9" fill="currentColor" stroke="none">60°</text>
      <text x="12" y="64" fontSize="9" fill="currentColor" stroke="none">30°</text>
    </svg>
  )
}

function Tri4545SVG() {
  return (
    <svg viewBox="0 0 85 80" width="75" height="72" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="10,70 75,70 75,10" />
      <rect x="65" y="60" width="10" height="10" />
      <text x="2" y="46" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">s√2</text>
      <text x="42" y="80" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">s</text>
      <text x="65" y="40" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">s</text>
      <text x="14" y="64" fontSize="9" fill="currentColor" stroke="none">45°</text>
      <text x="62" y="26" fontSize="9" fill="currentColor" stroke="none">45°</text>
    </svg>
  )
}

function BoxSVG() {
  return (
    <svg viewBox="0 0 90 75" width="80" height="68" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="15,60 65,60 65,20 15,20" />
      <polygon points="15,20 30,8 80,8 65,20" />
      <polygon points="65,20 80,8 80,48 65,60" />
      <line x1="15" y1="60" x2="15" y2="20" />
      <text x="36" y="72" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">l</text>
      <text x="68" y="40" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">w</text>
      <text x="3" y="42" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">h</text>
    </svg>
  )
}

function CylinderSVG() {
  return (
    <svg viewBox="0 0 80 85" width="70" height="75" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="40" cy="20" rx="28" ry="10" />
      <ellipse cx="40" cy="65" rx="28" ry="10" />
      <line x1="12" y1="20" x2="12" y2="65" />
      <line x1="68" y1="20" x2="68" y2="65" />
      <line x1="40" y1="20" x2="68" y2="20" strokeDasharray="4 3" />
      <text x="51" y="18" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">r</text>
      <text x="71" y="46" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">h</text>
    </svg>
  )
}

function SphereSVG() {
  return (
    <svg viewBox="0 0 80 80" width="70" height="70" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="40" cy="40" r="28" />
      <ellipse cx="40" cy="40" rx="28" ry="10" strokeDasharray="4 3" />
      <circle cx="40" cy="40" r="2" fill="currentColor" />
      <line x1="40" y1="40" x2="68" y2="40" strokeDasharray="4 3" />
      <text x="52" y="36" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">r</text>
    </svg>
  )
}

function ConeSVG() {
  return (
    <svg viewBox="0 0 80 85" width="70" height="75" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="40" cy="65" rx="28" ry="10" />
      <line x1="12" y1="65" x2="40" y2="12" />
      <line x1="68" y1="65" x2="40" y2="12" />
      <line x1="40" y1="12" x2="40" y2="65" strokeDasharray="4 3" />
      <line x1="40" y1="65" x2="68" y2="65" strokeDasharray="4 3" />
      <text x="51" y="62" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">r</text>
      <text x="42" y="42" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">h</text>
    </svg>
  )
}

function PyramidSVG() {
  return (
    <svg viewBox="0 0 90 80" width="80" height="70" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="45,8 80,55 10,55" />
      <polygon points="45,8 80,55 72,68 16,68 10,55" strokeDasharray="none" />
      <line x1="45" y1="8" x2="44" y2="65" strokeDasharray="4 3" />
      <line x1="10" y1="55" x2="16" y2="68" />
      <line x1="80" y1="55" x2="72" y2="68" />
      <line x1="16" y1="68" x2="72" y2="68" />
      <text x="47" y="40" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">h</text>
      <text x="36" y="76" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">l</text>
      <text x="74" y="64" fontSize="10" fill="currentColor" stroke="none" fontStyle="italic">w</text>
    </svg>
  )
}

// ─── Formula card ─────────────────────────────────────────────────────────────

function FormulaCard({
  shape, formulas,
}: {
  shape: React.ReactNode
  formulas: string[]
}) {
  return (
    <div
      className="flex flex-col items-center gap-2 p-3 rounded-xl border"
      style={{ background: 'var(--background)', borderColor: 'var(--border)', minWidth: 120 }}>
      <div style={{ color: 'var(--foreground)', opacity: 0.85 }}>{shape}</div>
      <div className="text-center space-y-0.5">
        {formulas.map((f, i) => (
          <p key={i} className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{f}</p>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FormulasButton({ hasCalculator = false }: { hasCalculator?: boolean }) {
  const [open, setOpen] = useState(false)

  // Stack above the calculator button if both are present
  const bottomClass = hasCalculator ? 'bottom-20' : 'bottom-6'

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title={open ? 'Close formulas' : 'SAT Math Reference Sheet'}
        className={`fixed ${bottomClass} right-6 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110 text-white font-bold text-sm`}
        style={{ background: open ? '#374151' : '#7c3aed' }}>
        {open ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <span style={{ fontFamily: 'serif', fontSize: 15 }}>∑</span>
        )}
      </button>

      {/* Formula sheet overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>

          <div
            className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
            style={{ background: 'var(--card)', maxHeight: '88vh' }}>

            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0"
              style={{ borderColor: 'var(--border)' }}>
              <div>
                <h2 className="font-bold text-base" style={{ color: 'var(--foreground)' }}>
                  SAT Math Reference Sheet
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Available on the digital SAT
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>
                ×
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

              {/* 2D Shapes */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3"
                  style={{ color: 'var(--text-muted)' }}>Areas & Perimeters</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  <FormulaCard shape={<CircleSVG />}    formulas={['A = πr²', 'C = 2πr']} />
                  <FormulaCard shape={<RectSVG />}      formulas={['A = lw']} />
                  <FormulaCard shape={<TriangleSVG />}  formulas={['A = ½bh']} />
                  <FormulaCard shape={<RightTriSVG />}  formulas={['c² = a² + b²']} />
                </div>
              </div>

              {/* Special Right Triangles */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3"
                  style={{ color: 'var(--text-muted)' }}>Special Right Triangles</p>
                <div className="grid grid-cols-2 gap-2">
                  <FormulaCard shape={<Tri3060SVG />} formulas={['30° – 60° – 90°']} />
                  <FormulaCard shape={<Tri4545SVG />} formulas={['45° – 45° – 90°']} />
                </div>
              </div>

              {/* 3D Shapes */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3"
                  style={{ color: 'var(--text-muted)' }}>Volumes</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  <FormulaCard shape={<BoxSVG />}      formulas={['V = lwh']} />
                  <FormulaCard shape={<CylinderSVG />} formulas={['V = πr²h']} />
                  <FormulaCard shape={<SphereSVG />}   formulas={['V = ⁴⁄₃πr³']} />
                  <FormulaCard shape={<ConeSVG />}     formulas={['V = ⅓πr²h']} />
                  <FormulaCard shape={<PyramidSVG />}  formulas={['V = ⅓lwh']} />
                </div>
              </div>

              {/* Key facts */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3"
                  style={{ color: 'var(--text-muted)' }}>Key Facts</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['360°', 'Degrees in a circle'],
                    ['2π', 'Radians in a circle'],
                    ['180°', 'Degrees in a triangle'],
                  ].map(([val, label]) => (
                    <div key={label}
                      className="flex flex-col items-center p-3 rounded-xl border text-center"
                      style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
                      <p className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>{val}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  )
}
