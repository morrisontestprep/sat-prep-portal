import nodemailer from 'nodemailer'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL || 'morrisontestprep@gmail.com'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: TEACHER_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

// ── Notify teacher: new student needs approval ───────────────────────────────
export async function sendStudentSignupNotification(studentName: string, studentEmail: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sat-prep-portal.vercel.app'
  await transporter.sendMail({
    from: `"Morrison Test Prep" <${TEACHER_EMAIL}>`,
    to: TEACHER_EMAIL,
    subject: `New student needs your approval: ${studentName || studentEmail}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#4f46e5">New Student Requesting Access</h2>
        <p>A new student just signed in with Google and is waiting for your approval before they can access the portal.</p>
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
        <p style="font-size:13px;color:#6b7280;margin-bottom:16px">
          The student is currently seeing a "pending review" screen. Once you approve them, they'll automatically be redirected into the portal.
        </p>
        <a href="${appUrl}/students"
          style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
          Review &amp; Approve in Portal →
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Morrison Test Prep &middot; <a href="${appUrl}" style="color:#9ca3af">${appUrl}</a></p>
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

// ── Notify student: teacher updated their master file ────────────────────────
export async function sendNotesUpdatedNotification(
  studentEmail: string,
  studentName: string,
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sat-prep-portal.vercel.app'
  await transporter.sendMail({
    from: `"Morrison Test Prep" <${TEACHER_EMAIL}>`,
    to: studentEmail,
    subject: 'Your tutor updated your Notes',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#4f46e5">Notes Updated</h2>
        <p>Hi ${studentName || 'there'},</p>
        <p>Your tutor just updated your Master File with new notes. Head over to review them and leave any questions as comments.</p>
        <a href="${appUrl}/notes"
          style="display:inline-block;background:#4f46e5;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;margin-top:8px">
          View Notes
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Morrison Test Prep &middot; <a href="${appUrl}" style="color:#9ca3af">${appUrl}</a></p>
      </div>
    `,
  })
}

// ── Notify teacher: student left a comment ────────────────────────────────────
export async function sendStudentCommentNotification(
  studentName: string,
  commentText: string,
  quotedText: string | null,
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sat-prep-portal.vercel.app'
  const quoteBlock = quotedText
    ? `<blockquote style="border-left:3px solid #4f46e5;margin:12px 0;padding:6px 12px;color:#6b7280;font-style:italic">&ldquo;${quotedText}&rdquo;</blockquote>`
    : ''
  await transporter.sendMail({
    from: `"Morrison Test Prep" <${TEACHER_EMAIL}>`,
    to: TEACHER_EMAIL,
    subject: `${studentName || 'A student'} left a comment on their Master File`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#4f46e5">New Student Comment</h2>
        <p><strong>${studentName || 'A student'}</strong> commented on their Master File:</p>
        ${quoteBlock}
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:12px 0">
          <p style="margin:0;font-size:15px">${commentText}</p>
        </div>
        <a href="${appUrl}/students"
          style="display:inline-block;background:#4f46e5;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px">
          Open Master File
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Morrison Test Prep &middot; <a href="${appUrl}" style="color:#9ca3af">${appUrl}</a></p>
      </div>
    `,
  })
}

// ── Notify one student: a guide was shared with them ─────────────────────────
export async function sendGuideSharedNotification(
  studentEmail: string,
  studentName: string,
  guideTitle: string,
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sat-prep-portal.vercel.app'
  await transporter.sendMail({
    from: `"Morrison Test Prep" <${TEACHER_EMAIL}>`,
    to: studentEmail,
    subject: `New guide shared with you: "${guideTitle}"`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#4f46e5">New Instructional Guide</h2>
        <p>Hi ${studentName || 'there'},</p>
        <p>Your tutor just shared a new instructional guide with you: <strong>${guideTitle}</strong>.</p>
        <p>You can find it in the <strong>Extra Materials</strong> section of your portal.</p>
        <a href="${appUrl}/my-assignments"
          style="display:inline-block;background:#4f46e5;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;margin-top:8px">
          Open Portal
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Morrison Test Prep &middot; <a href="${appUrl}" style="color:#9ca3af">${appUrl}</a></p>
      </div>
    `,
  })
}

// ── Notify all students: new instructional guide published ───────────────────
export async function sendNewGuideNotification(
  guideTitle: string,
  students: { email: string; name: string }[],
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sat-prep-portal.vercel.app'
  await Promise.allSettled(
    students.map(s =>
      transporter.sendMail({
        from: `"Morrison Test Prep" <${TEACHER_EMAIL}>`,
        to: s.email,
        subject: `New guide available: "${guideTitle}"`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#4f46e5">New Instructional Guide</h2>
            <p>Hi ${s.name || 'there'},</p>
            <p>Your tutor just published a new instructional guide: <strong>${guideTitle}</strong>.</p>
            <p>You can find it in the <strong>Extra Materials</strong> section of your portal.</p>
            <a href="${appUrl}/my-assignments"
              style="display:inline-block;background:#4f46e5;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;margin-top:8px">
              Open Portal
            </a>
            <p style="color:#9ca3af;font-size:12px;margin-top:24px">Morrison Test Prep &middot; <a href="${appUrl}" style="color:#9ca3af">${appUrl}</a></p>
          </div>
        `,
      })
    )
  )
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

// ── Notify student: due date set or updated ───────────────────────────────────
export async function sendDueDateUpdatedNotification(
  studentEmail: string,
  studentName: string,
  worksheetTitle: string,
  dueDate: string,          // pre-formatted, e.g. "May 15, 2026"
  assignmentId: string,
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sat-prep-portal.vercel.app'
  await transporter.sendMail({
    from: `"Morrison Test Prep" <${TEACHER_EMAIL}>`,
    to: studentEmail,
    subject: `Due date set for "${worksheetTitle}": ${dueDate}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#4f46e5">Due Date Updated</h2>
        <p>Hi ${studentName || 'there'},</p>
        <p>Your tutor has set a due date for your worksheet.</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0">
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px">Worksheet</td>
            <td style="padding:8px 0;font-size:14px;font-weight:600">${worksheetTitle}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px">Due</td>
            <td style="padding:8px 0;font-size:14px;font-weight:600;color:#d97706">${dueDate}</td>
          </tr>
        </table>
        <a href="${appUrl}/take/${assignmentId}"
          style="display:inline-block;background:#4f46e5;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px">
          Open Worksheet
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Morrison Test Prep &middot; <a href="${appUrl}" style="color:#9ca3af">${appUrl}</a></p>
      </div>
    `,
  })
}
