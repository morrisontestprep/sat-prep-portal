'use client'

import { useState } from 'react'
import Link from 'next/link'

type OwnBoard    = { id: string; name: string; created_at: string; updated_at: string }
type SharedBoard = { id: string; name: string; updated_at: string; shareId: string; accessLevel: string }

type Props = {
  ownBoards:    OwnBoard[]
  sharedBoards: SharedBoard[]
  isTeacher:    boolean
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function BoardCard({ board, badge, onDelete }: {
  board: { id: string; name: string; updated_at: string }
  badge?: React.ReactNode
  onDelete?: () => void
}) {
  return (
    <div className="rounded-2xl border group flex items-center gap-4 px-5 py-4 hover:shadow-sm transition-shadow"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      {/* Icon */}
      <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
        style={{ background: 'var(--accent-light)' }}>
        <svg className="w-5 h-5" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate" style={{ color: 'var(--foreground)' }}>
          {board.name || 'Untitled Board'}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Updated {fmt(board.updated_at)}
        </p>
      </div>

      {badge}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link href={`/whiteboards/${board.id}`}
          className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
          style={{ background: 'var(--accent)' }}>
          Open
        </Link>
        {onDelete && (
          <button onClick={onDelete}
            className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: '#fef2f2', color: '#ef4444' }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

export default function WhiteboardsClient({ ownBoards: initial, sharedBoards, isTeacher }: Props) {
  const [ownBoards, setOwnBoards] = useState<OwnBoard[]>(initial)

  const deleteBoard = async (boardId: string) => {
    if (!confirm('Delete this board? This cannot be undone.')) return
    await fetch(`/api/whiteboards/${boardId}`, { method: 'DELETE' })
    setOwnBoards(prev => prev.filter(b => b.id !== boardId))
  }

  return (
    <div className="space-y-8">

      {/* My boards */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            {isTeacher ? 'My Boards' : 'My Private Boards'}
          </h2>
          <Link href="/whiteboards/new" target="_blank" rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
            style={{ background: 'var(--accent)' }}>
            + New Board
          </Link>
        </div>

        {ownBoards.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed flex flex-col items-center py-12 text-center"
            style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>No boards yet</p>
            <p className="text-xs mt-1 mb-4" style={{ color: 'var(--text-muted)' }}>
              Create a board and start drawing
            </p>
            <Link href="/whiteboards/new" target="_blank" rel="noopener noreferrer"
              className="text-sm px-4 py-2 rounded-xl font-medium text-white"
              style={{ background: 'var(--accent)' }}>
              + New Board
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {ownBoards.map(b => (
              <BoardCard key={b.id} board={b} onDelete={() => deleteBoard(b.id)} />
            ))}
          </div>
        )}
      </section>

      {/* Shared with me */}
      {sharedBoards.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--text-muted)' }}>
            {isTeacher ? 'Shared With Me (by students)' : 'Shared With Me (by teacher)'}
          </h2>
          <div className="space-y-3">
            {sharedBoards.map(b => (
              <BoardCard key={b.id} board={b} badge={
                <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    background: b.accessLevel === 'edit' ? 'var(--accent-light)' : 'var(--background)',
                    color:      b.accessLevel === 'edit' ? 'var(--accent)' : 'var(--text-muted)',
                    border:     '1px solid var(--border)',
                  }}>
                  {b.accessLevel === 'edit' ? 'Can edit' : 'View only'}
                </span>
              } />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
