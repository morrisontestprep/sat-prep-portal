import nodemailer from 'nodemailer'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL || 'morrisontestprep@gmail.com'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: TEACHER_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

// ── Notify teacher: new student signed up ────────────────────────────────────
export async function sendStudentSignupNotification(studentName: string, studentEmail: string) {
  await transporter.sendMail({
    from: `"Morrison Test Prep" <${TEACHER_EMAIL}>`,
    to: TEACHER_EMAIL,
    subject: `New student signed up: ${studentName || studentEmail}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#4f46e5">New Student Sign-Up</h2>
        <p>A new student just created an account on the SAT Prep Portal.</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0">
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px">Name</td>
            <td style="padding:8px 0;font-size:14px;font-weight:600">${studentName || '(not set)'}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px">Email</td>
            <td style="padding:8px 0;font-size:14px">${studentEmail}</td>
          </tr>
        </table>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://sat-prep-portal.vercel.app'}/students"
          style="display:inline-block;background:#4f46e5;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px">
          View Students
        </a>
      </div>
    `,
  })
}

// ── Notify teacher: student submitted a worksheet ────────────────────────────
export async function sendWorksheetSubmissionNotification(
  studentName: string,
  studentEmail: string,
  worksheetTitle: string,
  correctCount: number,
  totalQuestions: number,
  worksheetId: string,
) {
  const pct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0
  const color = pct >= 70 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sat-prep-portal.vercel.app'

  await transporter.sendMail({
    from: `"Morrison Test Prep" <${TEACHER_EMAIL}>`,
    to: TEACHER_EMAIL,
    subject: `${studentName || studentEmail} submitted "${worksheetTitle}" — ${pct}%`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#4f46e5">Worksheet Submitted</h2>
        <p><strong>${studentName || studentEmail}</strong> just completed a worksheet.</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0">
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px">Worksheet</td>
            <td style="padding:8px 0;font-size:14px;font-weight:600">${worksheetTitle}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px">Score</td>
            <td style="padding:8px 0;font-size:14px">
              <span style="font-weight:700;color:${color}">${pct}%</span>
              <span style="color:#6b7280"> (${correctCount}/${totalQuestions} correct)</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px">Student</td>
            <td style="padding:8px 0;font-size:14px">${studentEmail}</td>
          </tr>
        </table>
        <a href="${appUrl}/worksheets/${worksheetId}"
          style="display:inline-block;background:#4f46e5;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px">
          View Results
        </a>
      </div>
    `,
  })
}

// ── Notify student: worksheet assigned ───────────────────────────────────────
export async function sendWorksheetAssignedNotification(
  studentEmail: string,
  studentName: string,
  worksheetTitle: string,
  dueDate: string | null,
  assignmentId: string,
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sat-prep-portal.vercel.app'
  const dueLine = dueDate
    ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Due</td><td style="padding:8px 0;font-size:14px">${new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td></tr>`
    : ''

  await transporter.sendMail({
    from: `"Morrison Test Prep" <${TEACHER_EMAIL}>`,
    to: studentEmail,
    subject: `New worksheet assigned: "${worksheetTitle}"`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#4f46e5">New Worksheet Assigned</h2>
        <p>Hi ${studentName || 'there'},</p>
        <p>Your tutor has assigned you a new SAT practice worksheet.</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0">
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px">Worksheet</td>
            <td style="padding:8px 0;font-size:14px;font-weight:600">${worksheetTitle}</td>
          </tr>
          ${dueLine}
        </table>
        <a href="${appUrl}/take/${assignmentId}"
          style="display:inline-block;background:#4f46e5;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px">
          Start Worksheet
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">
          Morrison Test Prep · <a href="${appUrl}" style="color:#9ca3af">${appUrl}</a>
        </p>
      </div>
    `,
  })
}
