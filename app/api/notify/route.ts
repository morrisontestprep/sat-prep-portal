import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
  sendStudentSignupNotification,
  sendWorksheetSubmissionNotification,
  sendWorksheetAssignedNotification,
  sendNotesUpdatedNotification,
  sendStudentCommentNotification,
} from '@/utils/email'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { type } = body

    // Signup notifications come from auth/callback before a session exists,
    // so we skip auth for this type only.
    if (type === 'signup') {
      const { studentName, studentEmail } = body
      await sendStudentSignupNotification(studentName ?? '', studentEmail ?? '')
      return NextResponse.json({ ok: true })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

    if (type === 'notes_updated') {
      const { studentEmail, studentName } = body
      await sendNotesUpdatedNotification(studentEmail, studentName)
      return NextResponse.json({ ok: true })
    }

    if (type === 'student_comment') {
      const { studentName, commentText, quotedText } = body
      await sendStudentCommentNotification(studentName, commentText, quotedText ?? null)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown notification type' }, { status: 400 })
  } catch (err) {
    console.error('Notify error:', err)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}
