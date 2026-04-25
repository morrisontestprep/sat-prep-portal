import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email !== process.env.TEACHER_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse CSV (lives one level above the portal folder)
  // Uses a proper RFC 4180 parser to handle quoted fields like "per" = coefficient
  const csvPath = join(process.cwd(), '..', 'tags.csv')
  const raw = readFileSync(csvPath, 'utf-8').trim()

  function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let cur = '', inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        result.push(cur); cur = ''
      } else {
        cur += ch
      }
    }
    result.push(cur)
    return result
  }

  const lines = raw.split('\n').slice(1)
  const pairs: { question_id: string; tag: string }[] = lines.map(line => {
    const cols = parseCSVLine(line)
    return { question_id: cols[3]?.trim(), tag: cols[4]?.trim() }
  }).filter(p => p.question_id && p.tag)

  // 1. Upsert unique tag names
  const uniqueTagNames = [...new Set(pairs.map(p => p.tag))]
  const { error: tagErr } = await supabase
    .from('tags')
    .upsert(uniqueTagNames.map(name => ({ name })), { onConflict: 'name', ignoreDuplicates: true })
  if (tagErr) return NextResponse.json({ error: 'tags insert failed', detail: tagErr }, { status: 500 })

  // 2. Fetch tag name -> id map
  const { data: tagRows, error: fetchErr } = await supabase.from('tags').select('id, name')
  if (fetchErr) return NextResponse.json({ error: 'tags fetch failed', detail: fetchErr }, { status: 500 })
  const tagMap = Object.fromEntries((tagRows ?? []).map((r: { name: string; id: number }) => [r.name, r.id]))

  // 3. Fetch all valid question IDs (paginate — Supabase default limit is 1000)
  let validQids = new Set<string>()
  let qPage = 0
  const Q_PAGE = 1000
  while (true) {
    const { data: qChunk } = await supabase
      .from('questions').select('id')
      .range(qPage * Q_PAGE, (qPage + 1) * Q_PAGE - 1)
    if (!qChunk || qChunk.length === 0) break
    qChunk.forEach((r: { id: string }) => validQids.add(r.id))
    if (qChunk.length < Q_PAGE) break
    qPage++
  }

  const qtRows = pairs
    .map(p => ({ question_id: p.question_id, tag_id: tagMap[p.tag] }))
    .filter(r => r.tag_id != null && validQids.has(r.question_id))

  const BATCH = 500
  let inserted = 0
  for (let i = 0; i < qtRows.length; i += BATCH) {
    const batch = qtRows.slice(i, i + BATCH)
    const { error: batchErr } = await supabase
      .from('question_tags')
      .upsert(batch, { onConflict: 'question_id,tag_id', ignoreDuplicates: true })
    if (batchErr) return NextResponse.json({ error: `batch ${i} failed`, detail: batchErr }, { status: 500 })
    inserted += batch.length
  }

  return NextResponse.json({
    ok: true,
    tags_seeded: uniqueTagNames.length,
    question_tags_seeded: inserted,
  })
}
