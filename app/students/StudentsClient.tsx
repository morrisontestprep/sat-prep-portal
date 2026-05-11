'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import MasterFileModal from '@/components/MasterFileModal'

type Assignment = {
  id: string
  student_id: string
  worksheet_id: string | null
  attempt_number: number | null
  assigned_at: string
  due_date: string | null
  status: string
  completed_at: string | null
  worksheets: { id: string; title: string } | null
}

type Student = {
  id: string
  full_name: string | null
  email: string | null
  created_at: string
}

type GuideInfo = {
  id: string
  title: string
  subject: string | null
  domain: string | null
}

type Props = {
  students: Student[]
  assignmentsByStudent: Record<string, Assignment[]>
  allGuides: GuideInfo[]
  sharesByStudent: Record<string, string[]>
}

// Group assignments by worksheet so redos collapse into one row
type GroupedAssignment = {
  worksheetId: string | null
  worksheet: { id: string; title: string } | null
  // First assignment = original (for assigned date + due date editing)
  firstAssignment: Assignment
  // All assignments in order (earliest first)
  all: Assignment[]
  // Convenience
  completedRows: { completedAt: string | null }[]  // one entry per completed attempt
  hasPending: boolean
  currentDueDate: string | null  // from first/most-relevant assignment
}

function groupAssignments(assignments: Assignment[]): GroupedAssignment[] {
  const map = new Map<string, Assignment[]>()
  for (const a of assignments) {
    const key = a.worksheet_id ?? a.id  // fallback to id if no worksheet
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(a)
  }

  return Array.from(map.entries()).map(([, rows]) => {
    // Sort by assigned_at ascending (original first)
    const sorted = [...rows].sort(
      (a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime()
    )
    const first = sorted[0]
    const completedRows = sorted
      .filter(r => r.status === 'complete')
      .map(r => ({ completedAt: r.completed_at }))
    const hasPending = sorted.some(r => r.status === 'pending')

    return {
      worksheetId: first.worksheet_id,
      worksheet: first.worksheets,
      firstAssignment: first,
      all: sorted,
      completedRows,
      hasPending,
      currentDueDate: first.due_date,
    }
  })
  // Sort groups by most recent assigned_at descending
  .sort(
    (a, b) =>
      new Date(b.firstAssignment.assigned_at).getTime() -
      new Date(a.firstAssignment.assigned_at).getTime()
  )
}

const SUBJECT_COLORS: Record<string, { bg: string; color: string }> = {
  'Math':             { bg: '#ede9fe', color: '#7c3aed' },
  'English':          { bg: '#dbeafe', color: '#1d4ed8' },
  'General Strategy': { bg: '#dcfce7', color: '#16a34a' },
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtWithYear(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StudentCard({
  student, assignments, allGuides, initialSharedIds, onDeleted,
}: {
  student: Student
  assignments: Assignment[]
  allGuides: GuideInfo[]
  initialSharedIds: string[]
  onDeleted: (id: string) => void
}) {
  const supabase = createClient()
  const [expanded, setExpanded]           = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [showMasterFile, setShowMasterFile] = useState(false)
  const [showGuides, setShowGuides]       = useState(false)
  const [sharedIds, setSharedIds]         = useState<Set<string>>(new Set(initialSharedIds))
  const [togglingId, setTogglingId]       = useState<string | null>(null)
  const [notifyOnShare, setNotifyOnShare] = useState(true)

  // Due date editing
  const [editingDueDateId, setEditingDueDateId] = useState<string | null>(null)
  const [dueDateInput, setDueDateInput]         = useState('')
  const [savingDueDate, setSavingDueDate]       = useState(false)
  // Local overrides for due dates (assignmentId -> date string)
  const [dueDateOverrides, setDueDateOverrides] = useState<Record<string, string | null>>({})

  const grouped = groupAssignments(assignments)

  const completedCount = assignments.filter(a => a.status === 'complete').length
  const pendingCount   = assignments.filter(a => a.status === 'pending').length
  const joinedDate = fmtWithYear(student.created_at)

  const handleDelete = async () => {
    setDeleting(true)
    const res = await fetch('/api/students', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: student.id }),
    })
    if (!res.ok) { alert('Failed to delete student. Please try again.'); setDeleting(false); return }
    onDeleted(student.id)
  }

  const toggleGuide = async (guide: GuideInfo) => {
    setTogglingId(guide.id)
    const isShared = sharedIds.has(guide.id)

    if (isShared) {
      const { error } = await supabase.from('guide_shares').delete()
        .eq('guide_id', guide.id).eq('student_id', student.id)
      if (error) { alert(`Failed to unshare: ${error.message}`); setTogglingId(null); return }
      setSharedIds(prev => { const s = new Set(prev); s.delete(guide.id); return s })
    } else {
      const { error } = await supabase.from('guide_shares')
        .upsert({ guide_id: guide.id, student_id: student.id }, { onConflict: 'guide_id,student_id', ignoreDuplicates: true })
      if (error) { alert(`Failed to share: ${error.message}`); setTogglingId(null); return }
      setSharedIds(prev => new Set([...prev, guide.id]))
      if (notifyOnShare && student.email) {
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'guide_share',
            studentEmail: student.email,
            studentName: student.full_name || student.email,
            guideTitle: guide.title,
          }),
        }).catch(console.error)
      }
    }
    setTogglingId(null)
  }

  const startEditDueDate = (assignmentId: string, currentDue: string | null, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingDueDateId(assignmentId)
    // Pre-fill with existing date in YYYY-MM-DD format for the input
    setDueDateInput(currentDue ? currentDue.slice(0, 10) : '')
  }

  const saveDueDate = async (assignmentId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSavingDueDate(true)
    const newDueDate = dueDateInput ? dueDateInput : null
    const res = await fetch('/api/students', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignmentId,
        dueDate: newDueDate,
        studentEmail: student.email,
        studentName: student.full_name || student.email,
      }),
    })
    setSavingDueDate(false)
    if (!res.ok) {
      alert('Failed to update due date. Please try again.')
      return
    }
    setDueDateOverrides(prev => ({ ...prev, [assignmentId]: newDueDate }))
    setEditingDueDateId(null)
  }

  const cancelEditDueDate = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingDueDateId(null)
  }

  const sharedCount = allGuides.filter(g => sharedIds.has(g.id)).length

  return (
    <>
    <div className="rounded-2xl border overflow-hidden group"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

      {/* Student header row */}
      <div
        className="px-6 py-4 flex items-center justify-between gap-4 cursor-pointer select-none"
        onClick={() => assignments.length > 0 && setExpanded(e => !e)}
        style={{ userSelect: 'none' }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}>
            {(student.full_name || student.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: 'var(--foreground)' }}>
              {student.full_name || 'No name'}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{student.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Master File button */}
          <button
            onClick={e => { e.stopPropagation(); setShowMasterFile(true) }}
            className="text-xs px-2.5 py-1 rounded-lg font-medium border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--foreground)', background: 'var(--background)' }}
          >
            Master File
          </button>

          {/* Guides button */}
          <button
            onClick={e => { e.stopPropagation(); setShowGuides(o => !o) }}
            className="text-xs px-2.5 py-1 rounded-lg font-medium border transition-colors flex items-center gap-1.5"
            style={{
              borderColor: showGuides ? 'var(--accent)' : 'var(--border)',
              color: showGuides ? 'var(--accent)' : 'var(--foreground)',
              background: showGuides ? 'var(--accent-light)' : 'var(--background)',
            }}
          >
            Guides
            {sharedCount > 0 && (
              <span className="px-1.5 py-0 rounded-full text-white leading-5"
                style={{ background: 'var(--accent)', fontSize: 10 }}>
                {sharedCount}
              </span>
            )}
          </button>

          {/* Stats badges */}
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
              {assignments.length} assigned
            </span>
            {completedCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                {completedCount} complete
              </span>
            )}
            {pendingCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#fffbeb', color: '#d97706' }}>
                {pendingCount} pending
              </span>
            )}
          </div>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Joined {joinedDate}</span>

          {assignments.length > 0 && (
            <svg className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
              style={{ color: 'var(--text-muted)', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}

          <Link href={`/students/${student.id}/analytics`} onClick={e => e.stopPropagation()}
            className="text-xs px-2.5 py-1 rounded-lg font-medium flex-shrink-0"
            style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
            Analytics
          </Link>

          <button onClick={e => { e.stopPropagation(); setShowDeleteConfirm(true) }}
            title="Remove student"
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: '#fef2f2', color: '#ef4444' }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Guides panel */}
      {showGuides && (
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="px-6 py-3 flex items-center justify-between" style={{ background: 'var(--background)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Instructional Guides
            </p>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
              <input
                type="checkbox"
                checked={notifyOnShare}
                onChange={e => setNotifyOnShare(e.target.checked)}
              />
              Notify student when sharing
            </label>
          </div>
          {allGuides.length === 0 ? (
            <p className="px-6 py-4 text-sm" style={{ color: 'var(--text-muted)' }}>No guides created yet.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {allGuides.map(guide => {
                const isShared  = sharedIds.has(guide.id)
                const toggling  = togglingId === guide.id
                const subStyle  = guide.subject ? SUBJECT_COLORS[guide.subject] : null
                return (
                  <div key={guide.id} className="px-6 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {subStyle ? (
                        <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
                          style={{ background: subStyle.bg, color: subStyle.color }}>
                          {guide.subject}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: 'var(--background)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                          General
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
                          {guide.title}
                        </p>
                        {guide.domain && (
                          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{guide.domain}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleGuide(guide)}
                      disabled={toggling}
                      className="flex-shrink-0 text-xs px-3 py-1 rounded-lg font-medium transition-colors disabled:opacity-50"
                      style={isShared ? {
                        background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
                      } : {
                        background: 'var(--accent)', color: '#fff',
                      }}
                    >
                      {toggling ? '...' : isShared ? 'Shared' : 'Share'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Collapsible assignments list */}
      {expanded && grouped.length > 0 && (
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--background)' }}>
                <th className="text-left text-xs font-medium px-6 py-2" style={{ color: 'var(--text-muted)' }}>Worksheet</th>
                <th className="text-left text-xs font-medium px-4 py-2" style={{ color: 'var(--text-muted)' }}>Assigned</th>
                <th className="text-left text-xs font-medium px-4 py-2" style={{ color: 'var(--text-muted)' }}>Due</th>
                <th className="text-left text-xs font-medium px-4 py-2" style={{ color: 'var(--text-muted)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g, i) => {
                const aid = g.firstAssignment.id
                const isEditing = editingDueDateId === aid
                // Use local override if available, otherwise original
                const effectiveDueDate = aid in dueDateOverrides
                  ? dueDateOverrides[aid]
                  : g.currentDueDate

                return (
                  <tr key={aid} className={i < grouped.length - 1 ? 'border-b' : ''} style={{ borderColor: 'var(--border)' }}>
                    {/* Worksheet */}
                    <td className="px-6 py-2.5">
                      {g.worksheet ? (
                        <Link href={`/worksheets/${g.worksheet.id}`} className="hover:underline truncate block max-w-xs"
                          style={{ color: 'var(--accent)' }} onClick={e => e.stopPropagation()}>
                          {g.worksheet.title}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Deleted worksheet</span>
                      )}
                    </td>

                    {/* Assigned */}
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {fmt(g.firstAssignment.assigned_at)}
                    </td>

                    {/* Due — editable */}
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          <input
                            type="date"
                            value={dueDateInput}
                            onChange={e => setDueDateInput(e.target.value)}
                            className="text-xs rounded-md px-2 py-1 border"
                            style={{
                              borderColor: 'var(--border)',
                              background: 'var(--background)',
                              color: 'var(--foreground)',
                              outline: 'none',
                            }}
                            autoFocus
                          />
                          <button
                            onClick={e => saveDueDate(aid, e)}
                            disabled={savingDueDate}
                            className="text-xs px-2 py-1 rounded-md font-medium disabled:opacity-50"
                            style={{ background: 'var(--accent)', color: '#fff' }}
                          >
                            {savingDueDate ? '…' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEditDueDate}
                            className="text-xs px-2 py-1 rounded-md"
                            style={{ color: 'var(--text-muted)', background: 'var(--background)', border: '1px solid var(--border)' }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : effectiveDueDate ? (
                        <div className="flex items-center gap-1 group/due">
                          <span style={{ color: 'var(--text-muted)' }}>
                            {fmt(effectiveDueDate)}
                          </span>
                          <button
                            onClick={e => startEditDueDate(aid, effectiveDueDate, e)}
                            title="Edit due date"
                            className="opacity-0 group-hover/due:opacity-100 transition-opacity w-5 h-5 rounded flex items-center justify-center"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={e => startEditDueDate(aid, null, e)}
                          className="text-xs px-2 py-0.5 rounded-md border transition-colors"
                          style={{
                            borderColor: 'var(--border)',
                            color: 'var(--accent)',
                            background: 'var(--background)',
                          }}
                          title="Set due date"
                        >
                          + Set date
                        </button>
                      )}
                    </td>

                    {/* Status + completion dates */}
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-1">
                        {/* Completed attempts — show date if available, just badge if not */}
                        {g.completedRows.map((r, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
                              style={{ background: '#f0fdf4', color: '#16a34a' }}>
                              Complete
                            </span>
                            {r.completedAt && (
                              <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                                {fmt(r.completedAt)}
                              </span>
                            )}
                          </div>
                        ))}
                        {/* Pending */}
                        {g.hasPending && (
                          <span className="text-xs px-2 py-0.5 rounded-full self-start whitespace-nowrap"
                            style={{ background: '#fffbeb', color: '#d97706' }}>
                            Pending
                          </span>
                        )}
                        {/* Fallback */}
                        {g.completedRows.length === 0 && !g.hasPending && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>

    {showMasterFile && <MasterFileModal student={student} onClose={() => setShowMasterFile(false)} />}

    {showDeleteConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
        <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ background: 'var(--card)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#fef2f2' }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#ef4444">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--foreground)' }}>Remove student?</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>This cannot be undone.</p>
            </div>
          </div>
          <p className="text-sm mb-2 rounded-lg px-3 py-2.5" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
            {student.full_name || student.email}
          </p>
          <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
            Removes their profile and all assignment history. They can sign in again to create a fresh account.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border disabled:opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
              Cancel
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
              style={{ background: '#ef4444' }}>
              {deleting ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

export default function StudentsClient({ students: initialStudents, assignmentsByStudent, allGuides, sharesByStudent }: Props) {
  const [students, setStudents] = useState(initialStudents)
  const handleDeleted = (id: string) => setStudents(prev => prev.filter(s => s.id !== id))

  if (students.length === 0) {
    return (
      <div className="text-center py-20 rounded-2xl border-2 border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        <p className="font-medium">No students yet</p>
        <p className="text-sm mt-1">Students will appear here once they sign in with Google.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {students.map(student => (
        <StudentCard
          key={student.id}
          student={student}
          assignments={assignmentsByStudent[student.id] ?? []}
          allGuides={allGuides}
          initialSharedIds={sharesByStudent[student.id] ?? []}
          onDeleted={handleDeleted}
        />
      ))}
    </div>
  )
}
