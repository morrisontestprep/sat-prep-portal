'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function AssignmentActions({
  worksheetId,
  studentId,
  nextAttemptNumber,
}: {
  worksheetId: string
  studentId: string
  nextAttemptNumber: number
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleRedo = async () => {
    setLoading(true)

    // Double-check the next attempt number from DB
    const { data: existing } = await supabase
      .from('student_assignments')
      .select('attempt_number')
      .eq('worksheet_id', worksheetId)
      .eq('student_id', studentId)
      .order('attempt_number', { ascending: false })
      .limit(1)

    const nextAttempt = existing && existing.length > 0
      ? ((existing[0] as any).attempt_number ?? 1) + 1
      : nextAttemptNumber

    const { data: newAssignment, error } = await supabase
      .from('student_assignments')
      .insert({
        worksheet_id: worksheetId,
        student_id: studentId,
        attempt_number: nextAttempt,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) {
      console.error('Redo failed:', error.message, error.details, error.hint, error.code)
      alert(`Could not start a new attempt: ${error.message}`)
      setLoading(false)
      return
    }

    router.push(`/take/${newAssignment.id}`)
  }

  return (
    <button
      onClick={handleRedo}
      disabled={loading}
      className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-opacity"
      style={{
        borderColor: 'var(--accent)',
        color: 'var(--accent)',
        opacity: loading ? 0.5 : 1,
      }}
    >
      {loading ? 'Starting...' : 'Redo'}
    </button>
  )
}
