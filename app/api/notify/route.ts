import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  sendWorksheetSubmissionNotification,
  sendWorksheetAssignedNotification,
} from '@/utils/email'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { type } = body

    if (type === 'submission') {
      const { worksheetTitle, correctCount, totalQuestions, worksheetId } = body

      // Get student profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single()

      await sendWorksheetSubmissionNotification(
        profile?.full_name ?? '',
        profile?.email ?? user.email ?? '',
        worksheetTitle,
        correctCount,
        totalQuestions,
        worksheetId,
      )
      return NextResponse.json({ ok: true })
    }

    if (type === 'assignment') {
      const { assignments } = body
      // assignments: Array<{ studentId, studentName, studentEmail, worksheetTitle, dueDate, assignmentId }>
      await Promise.allSettled(
        assignments.map((a: {
          studentEmail: string
          studentName: string
          worksheetTitle: string
          dueDate: string | null
          assignmentId: string
        }) =>
          sendWorksheetAssignedNotification(
            a.studentEmail,
            a.studentName,
            a.worksheetTitle,
            a.dueDate,
            a.assignmentId,
          )
        )
      )
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown notification type' }, { status: 400 })
  } catch (err) {
    console.error('Notify error:', err)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}
