export type Choice = 'A' | 'B' | 'C' | 'D'

export interface AIQuestion {
  id: string
  subject: 'math' | 'reading_and_writing'
  domain: string
  skill: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  passage?: string | null
  stem: string
  choices: Record<Choice, string>
  correct_answer: Choice
  distractor_notes: Partial<Record<Choice, string>>
  seed_question_ids: string[]
  status: 'pending' | 'approved' | 'discarded'
  generated_at: string
}
