'use client'

import { useState } from 'react'
import Link from 'next/link'

type Assignment = {
  id: string
  student_id: string
  assigned_at: string
  due_date: string | null
  status: string
  worksheets: { id: string; title: string } | null
}

type Student = {
  id: string
  full_name: string | null
  email: string | null
  created_at: string
}

type Props = {
  students: Student[]
  assignmentsByStudent: Record<string, Assignment[]>
}

function StudentCard({ student, assignments }: { student: Student; assignments: Assignment[] }) {
  const [expanded, setExpanded] = useState(false)
  const completedCount = assignments.filter(a => a.status === 'complete').length
  const pendingCount = assignments.filter(a => a.status === 'pending').length
  const joinedDate = new Date(student.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="rounded-2xl border overflow-hidden"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>

      {/* Student header — clicking toggles the worksheet list */}
      <div
        className="px-6 py-4 flex items-center justify-between gap-4 cursor-pointer select-none"
        onClick={() => assignments.length > 0 && setExpanded(e => !e)}
        style={{ userSelect: 'none' }}
      >
        <div className="flex items-center gap-4 min-w-0">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}>
            {(student.full_name || student.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: 'var(--foreground)' }}>
              {student.full_name || 'No name'}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              {student.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Stats badges */}
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
              {assignments.length} assigned
            </span>
            {completedCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: '#f0fdf4', color: '#16a34a' }}>
                {completedCount} complete
              </span>
            )}
            {pendingCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: '#fffbeb', color: '#d97706' }}>
                {pendingCount} pending
              </span>
            )}
          </div>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Joined {joinedDate}
          </span>

          {/* Chevron — only shown if there are assignments */}
          {assignments.length > 0 && (
            <svg
              className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
              style={{
                color: 'var(--text-muted)',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </div>

      {/* Collapsible assignments list */}
      {expanded && assignments.length > 0 && (
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
              {assignments.map((a, i) => {
                const ws = a.worksheets as { id: string; title: string } | null
                return (
                  <tr key={a.id}
                    className={i < assignments.length - 1 ? 'border-b' : ''}
                    style={{ borderColor: 'var(--border)' }}>
                    <td className="px-6 py-2.5">
                      {ws ? (
                        <Link href={`/worksheets/${ws.id}`}
                          className="hover:underline truncate block max-w-xs"
                          style={{ color: 'var(--accent)' }}
                          onClick={e => e.stopPropagation()}>
                          {ws.title}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Deleted worksheet</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
                      {new Date(a.assigned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
                      {a.due_date
                        ? new Date(a.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: a.status === 'complete' ? '#f0fdf4' : '#fffbeb',
                          color: a.status === 'complete' ? '#16a34a' : '#d97706',
                        }}>
                        {a.status === 'complete' ? 'Complete' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function StudentsClient({ students, assignmentsByStudent }: Props) {
  if (students.length === 0) {
    return (
      <div className="text-center py-20 rounded-2xl border-2 border-dashed"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
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
        />
      ))}
    </div>
  )
}
