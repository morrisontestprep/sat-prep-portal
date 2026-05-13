/**
 * Teacher notification helper — inserts directly into teacher_notifications via admin client.
 * Call from any server-side API route to notify the teacher of student activity.
 */
import { createAdminClient } from '@/utils/supabase/admin'

export type TeacherNotifType =
  | 'assignment_submitted'
  | 'sat_rush_started'
  | 'sat_rush_completed'
  | 'practice_completed'
  | 'student_signup_pending'   // new student waiting for approval

export interface TeacherNotifData {
  studentName?: string
  studentEmail?: string
  studentId?: string
  // Assignment submissions
  worksheetTitle?: string
  worksheetId?: string
  assignmentId?: string
  score?: string           // e.g. "8/12 (67%)"
  // SAT Rush
  totalScore?: number
  questionsAttempted?: number
  questionsCorrect?: number
  // Practice sessions
  sessionId?: string
  questionCount?: number
}

export async function notifyTeacher(
  type: TeacherNotifType,
  data: TeacherNotifData,
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('teacher_notifications').insert({ type, data })
  } catch (err) {
    // Never let this crash the calling route
    console.error('notifyTeacher error:', err)
  }
}
