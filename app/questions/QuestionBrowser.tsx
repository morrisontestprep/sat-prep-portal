'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Image from 'next/image'

type Tag = { id: number; name: string; color: string }

type Question = {
  id: string
  subject: string
  domain: string
  skill: string
  difficulty: string
  correct_answer: string
  question_image_url: string
  answer_image_url: string
}

type Filters = {
  subject: string
  domain: string
  difficulty: string
  tags: number[]   // tag IDs — AND logic
}

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Unrated']

function diffBg(d: string | null | undefined) {
  if (d === 'Easy')   return '#f0fdf4'
  if (d === 'Medium') return '#fffbeb'
  if (d === 'Hard')   return '#fef2f2'
  return '#f3f4f6'
}
function diffCol(d: string | null | undefined) {
  if (d === 'Easy')   return 'var(--success)'
  if (d === 'Medium') return 'var(--warning)'
  if (d === 'Hard')   return 'var(--danger)'
  return '#6b7280'
}
function diffLabel(d: string | null | undefined) {
  return d || 'Unrated'
}

// 20 visually distinct colors for tags
const TAG_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316',
  '#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6',
  '#a855f7','#f43f5e','#10b981','#0ea5e9','#84cc16',
  '#f59e0b','#e879f9','#34d399','#60a5fa','#fb923c',
]

const AI_EXAMPLES = [
  '10 medium Algebra questions',
  '8 hard grammar questions',
  '6 easy Math word problems',
  '12 Standard English Conventions',
  '5 hard Advanced Math questions',
]

function tagBg(color: string) {
  return color + '22'   // 13% opacity hex
}

export default function QuestionBrowser({
  mathDomains,
  englishDomains,
}: {
  mathDomains: string[]
  englishDomains: string[]
}) {
  const supabase = createClient()
  const router = useRouter()

  // ── Data state ─────────────────────────────────────────────────────────────
  const [questions, setQuestions] = useState<Question[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)

  // All available tags (fetched once)
  const [allTags, setAllTags] = useState<Tag[]>([])
  // Per-question tags: { [questionId]: Tag[] }
  const [questionTags, setQuestionTags] = useState<Record<string, Tag[]>>({})

  // ── UI state ───────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAnswer, setShowAnswer] = useState<string | null>(null)
  const [tagSearch, setTagSearch] = useState('')
  const [tagsOpen, setTagsOpen] = useState(true)

  // Inline tag editor state
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [tagDropdown, setTagDropdown] = useState(false)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // Find & replace tag state
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [findTagId, setFindTagId] = useState<number | null>(null)
  const [replaceTagId, setReplaceTagId] = useState<number | null>(null)
  const [replaceNewName, setReplaceNewName] = useState('')
  const [replacingTags, setReplacingTags] = useState(false)
  const [frMode, setFrMode] = useState<'replace' | 'delete'>('replace')

  const [filters, setFilters] = useState<Filters>({
    subject: '', domain: '', difficulty: '', tags: [],
  })

  // ── AI Worksheet Builder state ─────────────────────────────────────────────
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiCount, setAiCount] = useState(10)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMode, setAiMode] = useState(false)
  const [aiQuestions, setAiQuestions] = useState<Question[]>([])
  const [aiFilterLabels, setAiFilterLabels] = useState<string[]>([])
  const [aiTotal, setAiTotal] = useState(0)
  const [aiMessage, setAiMessage] = useState('')
  const [aiFiltersOpen, setAiFiltersOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Find Similar state ─────────────────────────────────────────────────────
  const [similarMode, setSimilarMode] = useState(false)
  const [seedQuestions, setSeedQuestions] = useState<Question[]>([])
  const [suggestedQuestions, setSuggestedQuestions] = useState<Question[]>([])
  const [similarLoading, setSimilarLoading] = useState(false)
  const [findSimilarOpen, setFindSimilarOpen] = useState(false)
  const [findSimilarCount, setFindSimilarCount] = useState(10)
  const [findSimilarSameDiff, setFindSimilarSameDiff] = useState(false)

  const PAGE_SIZE = 20

  const domains = filters.subject === 'math'
    ? mathDomains
    : filters.subject === 'english'
    ? englishDomains
    : [...mathDomains, ...englishDomains]

  // ── Fetch all tags once ────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('tags').select('id, name, color').order('name')
      .then(({ data }) => setAllTags(data ?? []))
  }, [supabase])

  // ── Fetch questions ────────────────────────────────────────────────────────
  const fetchQuestions = useCallback(async (f: Filters, p: number) => {
    setLoading(true)

    let query = supabase.from('questions').select('*', { count: 'exact' })

    if (f.subject)    query = query.eq('subject', f.subject)
    if (f.domain)     query = query.eq('domain', f.domain)
    if (f.difficulty) {
      if (f.difficulty === 'Unrated') {
        query = query.or('difficulty.is.null,difficulty.eq.')
      } else {
        query = query.eq('difficulty', f.difficulty)
      }
    }

    if (f.tags.length > 0) {
      const { data: taggedRows } = await supabase
        .from('question_tags')
        .select('question_id, tag_id')
        .in('tag_id', f.tags)

      if (!taggedRows) { setQuestions([]); setTotal(0); setLoading(false); return }

      const tagsByQ: Record<string, Set<number>> = {}
      taggedRows.forEach(r => {
        if (!tagsByQ[r.question_id]) tagsByQ[r.question_id] = new Set()
        tagsByQ[r.question_id].add(r.tag_id)
      })
      const matchingIds = Object.entries(tagsByQ)
        .filter(([, tagSet]) => f.tags.every(tid => tagSet.has(tid)))
        .map(([qid]) => qid)

      if (matchingIds.length === 0) { setQuestions([]); setTotal(0); setLoading(false); return }
      query = query.in('id', matchingIds)
    }

    query = query.range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1).order('id')

    const { data, count } = await query
    const qs = data ?? []
    setQuestions(qs)
    setTotal(count ?? 0)
    setLoading(false)

    if (qs.length > 0) {
      const ids = qs.map(q => q.id)
      const { data: qtRows } = await supabase
        .from('question_tags')
        .select('question_id, tag_id, tags(id, name, color)')
        .in('question_id', ids)

      const map: Record<string, Tag[]> = {}
      ;(qtRows ?? []).forEach((r: { question_id: string; tags: unknown }) => {
        const tag = r.tags as Tag | null
        if (!tag) return
        if (!map[r.question_id]) map[r.question_id] = []
        map[r.question_id].push(tag)
      })
      setQuestionTags(prev => ({ ...prev, ...map }))
    }
  }, [supabase])

  useEffect(() => {
    if (!aiMode) fetchQuestions(filters, page)
  }, [filters, page, fetchQuestions, aiMode])

  // ── AI Query ───────────────────────────────────────────────────────────────
  const runAiQuery = useCallback(async (prompt: string, count: number) => {
    if (!prompt.trim() || prompt.trim().length < 4) return
    setAiLoading(true)
    setAiMessage('')

    try {
      const res = await fetch('/api/ai-select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), count }),
      })
      const data = await res.json()

      if (data.error) {
        setAiMessage(data.error)
        setAiMode(false)
      } else if (data.questions?.length > 0) {
        setAiQuestions(data.questions)
        setAiFilterLabels(data.filterLabels ?? [])
        setAiTotal(data.total)
        setAiMessage(data.message ?? '')
        // Auto-select all AI-recommended questions
        setSelected(new Set(data.questions.map((q: Question) => q.id)))
        setAiMode(true)
        setExpandedId(null)

        // Fetch tags for AI questions
        const ids = data.questions.map((q: Question) => q.id)
        const { data: qtRows } = await supabase
          .from('question_tags')
          .select('question_id, tag_id, tags(id, name, color)')
          .in('question_id', ids)

        const map: Record<string, Tag[]> = {}
        ;(qtRows ?? []).forEach((r: { question_id: string; tags: unknown }) => {
          const tag = r.tags as Tag | null
          if (!tag) return
          if (!map[r.question_id]) map[r.question_id] = []
          map[r.question_id].push(tag)
        })
        setQuestionTags(prev => ({ ...prev, ...map }))
      } else {
        setAiQuestions([])
        setAiMode(false)
        setAiMessage(data.message ?? 'No questions matched. Try rephrasing.')
      }
    } catch {
      setAiMessage('Something went wrong. Please try again.')
      setAiMode(false)
    } finally {
      setAiLoading(false)
    }
  }, [supabase])

  // Debounce AI query as user types
  useEffect(() => {
    if (!aiPrompt.trim() || aiPrompt.trim().length < 4) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runAiQuery(aiPrompt, aiCount)
    }, 800)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [aiPrompt, aiCount, runAiQuery])

  const clearAiMode = () => {
    setAiMode(false)
    setSimilarMode(false)
    setAiQuestions([])
    setSeedQuestions([])
    setSuggestedQuestions([])
    setAiFilterLabels([])
    setAiMessage('')
    setAiTotal(0)
    setSelected(new Set())
  }

  // ── Find Similar ───────────────────────────────────────────────────────────
  const runFindSimilar = async () => {
    const selectedIds = Array.from(selected)
    if (selectedIds.length === 0) return

    setFindSimilarOpen(false)
    setSimilarLoading(true)
    setAiMode(true)
    setSimilarMode(true)
    setAiQuestions([])
    setExpandedId(null)

    try {
      const res = await fetch('/api/find-similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionIds: selectedIds,
          count: findSimilarCount,
          sameDifficulty: findSimilarSameDiff,
        }),
      })
      const data = await res.json()

      if (data.error) {
        alert(data.error)
        setSimilarMode(false)
        setAiMode(false)
        return
      }

      setSeedQuestions(data.seedQuestions ?? [])
      setSuggestedQuestions(data.suggestedQuestions ?? [])

      // Keep seeds selected + auto-select all suggestions
      const newSelected = new Set(selectedIds)
      ;(data.suggestedQuestions ?? []).forEach((q: Question) => newSelected.add(q.id))
      setSelected(newSelected)

      // Fetch tags for all returned questions
      const allIds = [
        ...(data.seedQuestions ?? []),
        ...(data.suggestedQuestions ?? []),
      ].map((q: Question) => q.id)

      if (allIds.length > 0) {
        const { data: qtRows } = await supabase
          .from('question_tags')
          .select('question_id, tag_id, tags(id, name, color)')
          .in('question_id', allIds)

        const map: Record<string, Tag[]> = {}
        ;(qtRows ?? []).forEach((r: { question_id: string; tags: unknown }) => {
          const tag = r.tags as Tag | null
          if (!tag) return
          if (!map[r.question_id]) map[r.question_id] = []
          map[r.question_id].push(tag)
        })
        setQuestionTags(prev => ({ ...prev, ...map }))
      }
    } catch (err) {
      console.error('Find similar error:', err)
      setSimilarMode(false)
      setAiMode(false)
    } finally {
      setSimilarLoading(false)
    }
  }

  // ── Filter helpers ─────────────────────────────────────────────────────────
  const setFilter = (key: keyof Filters, value: string) => {
    setPage(0)
    setFilters(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'subject') next.domain = ''
      return next
    })
  }

  const toggleTagFilter = (tagId: number) => {
    setPage(0)
    setFilters(prev => {
      const next = prev.tags.includes(tagId)
        ? prev.tags.filter(id => id !== tagId)
        : [...prev.tags, tagId]
      return { ...prev, tags: next }
    })
  }

  // ── Difficulty editing ─────────────────────────────────────────────────────
  const [editingDiffFor, setEditingDiffFor] = useState<string | null>(null)
  const [savingDiff, setSavingDiff] = useState<string | null>(null)

  const setDifficulty = async (questionId: string, difficulty: string) => {
    setSavingDiff(questionId)
    const patch = (q: Question) => q.id === questionId ? { ...q, difficulty } : q
    setQuestions(prev => prev.map(patch))
    setAiQuestions(prev => prev.map(patch))
    setSeedQuestions(prev => prev.map(patch))
    setSuggestedQuestions(prev => prev.map(patch))
    setEditingDiffFor(null)
    await supabase.from('questions').update({ difficulty }).eq('id', questionId)
    setSavingDiff(null)
  }

  // ── Selection ──────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  // ── Inline tag editor ──────────────────────────────────────────────────────
  const addTagToQuestion = async (questionId: string, tag: Tag) => {
    setQuestionTags(prev => {
      const existing = prev[questionId] ?? []
      if (existing.some(t => t.id === tag.id)) return prev
      return { ...prev, [questionId]: [...existing, tag] }
    })

    const { error } = await supabase.from('question_tags').upsert(
      { question_id: questionId, tag_id: tag.id },
      { onConflict: 'question_id,tag_id', ignoreDuplicates: true }
    )

    if (error) {
      console.error('Error adding tag to question:', error)
      setQuestionTags(prev => ({
        ...prev,
        [questionId]: (prev[questionId] ?? []).filter(t => t.id !== tag.id),
      }))
    }
  }

  const removeTagFromQuestion = async (questionId: string, tagId: number) => {
    setQuestionTags(prev => ({
      ...prev,
      [questionId]: (prev[questionId] ?? []).filter(t => t.id !== tagId),
    }))
    await supabase.from('question_tags')
      .delete()
      .eq('question_id', questionId)
      .eq('tag_id', tagId)
  }

  const createAndAddTag = async (questionId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      const colorIdx = trimmed.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % TAG_COLORS.length
      const color = TAG_COLORS[colorIdx]

      const { data: existing, error: existingError } = await supabase.from('tags').select('id,name,color').eq('name', trimmed).maybeSingle()
      if (existingError) throw existingError

      let tag: Tag
      if (existing) {
        tag = existing
      } else {
        const { data: created, error: createError } = await supabase.from('tags').insert({ name: trimmed, color }).select().single()
        if (createError) throw createError
        if (!created) return
        tag = created
        setAllTags(prev => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)))
      }
      await addTagToQuestion(questionId, tag)
    } catch (err) {
      console.error('Error adding tag:', err)
    }
  }

  const tagSuggestions = allTags.filter(t => {
    const alreadyHas = (questionTags[editingTagsFor ?? ''] ?? []).some(qt => qt.id === t.id)
    if (alreadyHas) return false
    if (tagInput.length === 0) return true
    return t.name.toLowerCase().includes(tagInput.toLowerCase())
  }).slice(0, 10)

  // ── Find & replace ─────────────────────────────────────────────────────────
  const handleFindReplace = async () => {
    if (!findTagId) return
    setReplacingTags(true)

    try {
      const { data: tagPairs } = await supabase
        .from('question_tags')
        .select('question_id')
        .eq('tag_id', findTagId)

      const questionIds = (tagPairs ?? []).map(p => p.question_id)
      if (questionIds.length === 0) { setReplacingTags(false); return }

      await supabase.from('question_tags').delete().eq('tag_id', findTagId).in('question_id', questionIds)

      if (frMode === 'replace') {
        let targetTagId = replaceTagId

        if (!targetTagId && replaceNewName.trim()) {
          const trimmed = replaceNewName.trim()
          const { data: existing } = await supabase.from('tags').select('id').eq('name', trimmed).maybeSingle()
          if (existing) {
            targetTagId = existing.id
          } else {
            const colorIdx = trimmed.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % TAG_COLORS.length
            const { data: created } = await supabase.from('tags').insert({ name: trimmed, color: TAG_COLORS[colorIdx] }).select().single()
            if (created) {
              targetTagId = created.id
              setAllTags(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
            }
          }
        }

        if (targetTagId && targetTagId !== findTagId) {
          const newRows = questionIds.map(qid => ({ question_id: qid, tag_id: targetTagId }))
          await supabase.from('question_tags').upsert(newRows, { onConflict: 'question_id,tag_id', ignoreDuplicates: true })
        }
      }

      await fetchQuestions(filters, page)
      setShowFindReplace(false)
      setFindTagId(null)
      setReplaceTagId(null)
      setReplaceNewName('')
      setFrMode('replace')
    } catch (err) {
      console.error('Find & replace error:', err)
    } finally {
      setReplacingTags(false)
    }
  }

  const affectedCount = findTagId
    ? Object.values(questionTags).filter(tags => tags.some(t => t.id === findTagId)).length
    : 0

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const visibleTags = allTags.filter(t =>
    t.name.toLowerCase().includes(tagSearch.toLowerCase())
  )

  // Questions to render in the main list
  const displayQuestions = similarMode
    ? [...seedQuestions, ...suggestedQuestions]
    : aiMode ? aiQuestions : questions
  const isAiSelected = (id: string) => aiMode && (
    aiQuestions.some(q => q.id === id) ||
    seedQuestions.some(q => q.id === id) ||
    suggestedQuestions.some(q => q.id === id)
  )
  // ID of the last seed question — used to render the divider in similar mode
  const lastSeedId = similarMode && seedQuestions.length > 0
    ? seedQuestions[seedQuestions.length - 1].id
    : null

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── Left Sidebar (filters) ───────────────────────────────────────────── */}
      <aside className="w-60 border-r flex-shrink-0 p-4 overflow-y-auto" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <h2 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Filters</h2>

        {/* Subject */}
        <div className="mb-5">
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--foreground)' }}>Subject</p>
          <div className="flex flex-col gap-1">
            {[{ v: '', l: 'All' }, { v: 'math', l: 'Math' }, { v: 'english', l: 'English' }].map(opt => (
              <button key={opt.v} onClick={() => setFilter('subject', opt.v)}
                className="text-left px-3 py-1.5 rounded-lg text-sm transition-colors"
                style={{
                  background: filters.subject === opt.v ? 'var(--accent-light)' : 'transparent',
                  color: filters.subject === opt.v ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: filters.subject === opt.v ? '500' : '400',
                }}>
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        {/* Domain */}
        <div className="mb-5">
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--foreground)' }}>Domain</p>
          <div className="flex flex-col gap-1">
            <button onClick={() => setFilter('domain', '')}
              className="text-left px-3 py-1.5 rounded-lg text-sm"
              style={{ background: filters.domain === '' ? 'var(--accent-light)' : 'transparent', color: filters.domain === '' ? 'var(--accent)' : 'var(--text-muted)' }}>
              All
            </button>
            {domains.map(d => (
              <button key={d} onClick={() => setFilter('domain', d)}
                className="text-left px-3 py-1.5 rounded-lg text-sm leading-tight"
                style={{
                  background: filters.domain === d ? 'var(--accent-light)' : 'transparent',
                  color: filters.domain === d ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: filters.domain === d ? '500' : '400',
                }}>
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div className="mb-5">
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--foreground)' }}>Difficulty</p>
          <div className="flex flex-col gap-1">
            <button onClick={() => setFilter('difficulty', '')}
              className="text-left px-3 py-1.5 rounded-lg text-sm"
              style={{ background: filters.difficulty === '' ? 'var(--accent-light)' : 'transparent', color: filters.difficulty === '' ? 'var(--accent)' : 'var(--text-muted)' }}>
              All
            </button>
            {DIFFICULTIES.map(d => (
              <button key={d} onClick={() => setFilter('difficulty', d)}
                className="text-left px-3 py-1.5 rounded-lg text-sm"
                style={{
                  background: filters.difficulty === d ? 'var(--accent-light)' : 'transparent',
                  color: filters.difficulty === d ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: filters.difficulty === d ? '500' : '400',
                }}>
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Tags filter */}
        <div className="mb-2">
          <button
            onClick={() => setTagsOpen(o => !o)}
            className="w-full flex items-center justify-between text-xs font-medium mb-2"
            style={{ color: 'var(--foreground)' }}
          >
            <span>Tags {filters.tags.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-white text-xs" style={{ background: 'var(--accent)', fontSize: 10 }}>{filters.tags.length}</span>}</span>
            <svg className={`w-3 h-3 transition-transform ${tagsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {tagsOpen && (
            <>
              <input
                value={tagSearch}
                onChange={e => setTagSearch(e.target.value)}
                placeholder="Search tags…"
                className="w-full text-xs px-2 py-1.5 rounded-lg border mb-2 outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
              />
              {filters.tags.length > 0 && (
                <button
                  onClick={() => { setPage(0); setFilters(prev => ({ ...prev, tags: [] })) }}
                  className="text-xs mb-2 underline"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Clear tag filters
                </button>
              )}
              <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto pr-1">
                {visibleTags.map(tag => {
                  const isActive = filters.tags.includes(tag.id)
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTagFilter(tag.id)}
                      className="text-left px-2 py-1 rounded-md text-xs flex items-center gap-1.5 transition-colors"
                      style={{
                        background: isActive ? tagBg(tag.color) : 'transparent',
                        color: isActive ? tag.color : 'var(--text-muted)',
                        fontWeight: isActive ? '600' : '400',
                        border: isActive ? `1px solid ${tag.color}44` : '1px solid transparent',
                      }}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tag.color }} />
                      {tag.name}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {allTags.length > 0 && (
            <button
              onClick={() => setShowFindReplace(true)}
              className="w-full mt-3 text-xs px-2 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--accent)', background: 'var(--accent-light)' }}
            >
              Find & Replace Tags
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Header bar */}
        <div className="px-6 py-3 border-b flex items-center justify-between" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {aiMode
                ? <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#7e22ce' }} />
                    {similarMode
                      ? `Similar mode · ${seedQuestions.length} selected + ${suggestedQuestions.length} suggestions`
                      : `AI mode · ${aiQuestions.length} recommendations`
                    }
                  </span>
                : loading ? 'Loading…' : `${total.toLocaleString()} questions`
              }
            </p>
            {aiMode && (
              <button
                onClick={clearAiMode}
                className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                ← Back to browser
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <>
                {/* Find Similar button + popover */}
                <div className="relative">
                  <button
                    onClick={() => setFindSimilarOpen(o => !o)}
                    disabled={similarLoading}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: findSimilarOpen ? 'var(--accent-light)' : 'transparent' }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {similarLoading ? 'Searching…' : 'Find Similar'}
                  </button>

                  {findSimilarOpen && (
                    <>
                      {/* Backdrop to close popover */}
                      <div className="fixed inset-0 z-40" onClick={() => setFindSimilarOpen(false)} />
                      <div
                        className="absolute right-0 top-full mt-2 z-50 rounded-xl border shadow-xl p-4 w-64"
                        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                      >
                        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
                          Find similar problems
                        </p>
                        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                          Using {selected.size} selected question{selected.size !== 1 ? 's' : ''} as reference
                        </p>

                        {/* Count */}
                        <div className="flex items-center gap-2 mb-3">
                          <label className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Suggestions:</label>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={findSimilarCount}
                            onChange={e => setFindSimilarCount(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
                            className="w-16 rounded-lg border px-2 py-1 text-sm text-center focus:outline-none"
                            style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                          />
                        </div>

                        {/* Difficulty toggle */}
                        <div className="flex items-center gap-2 mb-4">
                          <button
                            onClick={() => setFindSimilarSameDiff(v => !v)}
                            className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                            style={{ background: findSimilarSameDiff ? 'var(--accent)' : '#d1d5db' }}
                          >
                            <span
                              className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
                              style={{ transform: findSimilarSameDiff ? 'translateX(16px)' : 'translateX(2px)' }}
                            />
                          </button>
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Match difficulty only
                          </span>
                        </div>

                        <button
                          onClick={runFindSimilar}
                          className="w-full py-2 rounded-lg text-sm font-medium text-white"
                          style={{ background: 'var(--accent)' }}
                        >
                          Find {findSimilarCount} Similar Questions
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Create Worksheet */}
                <button
                  onClick={() => {
                    const ids = Array.from(selected).join(',')
                    router.push(`/worksheets/new?q=${ids}`)
                  }}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-colors flex items-center gap-1.5"
                  style={{ background: 'var(--accent)' }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Create Worksheet ({selected.size})
                </button>
              </>
            )}
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {selected.size > 0 ? `${selected.size} selected` : ''}
            </span>
          </div>
        </div>

        {/* Question list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {(loading && !aiMode) && (
            <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
              <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
            </div>
          )}

          {similarLoading && (
            <div className="flex items-center justify-center py-12 gap-3" style={{ color: 'var(--text-muted)' }}>
              <div className="w-5 h-5 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
              <span className="text-sm">Finding similar questions…</span>
            </div>
          )}

          {!loading && !similarLoading && displayQuestions.map(q => {
            const isSelected = selected.has(q.id)
            const isExpanded = expandedId === q.id
            const isShowingAnswer = showAnswer === q.id
            const qTags = questionTags[q.id] ?? []
            const isEditingTags = editingTagsFor === q.id
            const isAiRec = isAiSelected(q.id)
            const isEditingDiff = editingDiffFor === q.id

            return (
              <div key={q.id}>
              {/* Divider between seed and suggested questions in similar mode */}
              {similarMode && q.id === lastSeedId && suggestedQuestions.length > 0 && (
                <div className="flex items-center gap-3 py-4 mt-2">
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  <span
                    className="text-xs font-medium px-3 py-1 rounded-full flex-shrink-0"
                    style={{ background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--border)' }}
                  >
                    ✦ {suggestedQuestions.length} similar questions suggested
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                </div>
              )}
              <div
                className="rounded-xl border transition-shadow"
                style={{
                  background: 'var(--card)',
                  borderColor: isAiRec && isSelected
                    ? '#7e22ce'
                    : isSelected
                    ? 'var(--accent)'
                    : 'var(--border)',
                  boxShadow: isAiRec && isSelected
                    ? '0 0 0 1px #7e22ce'
                    : isSelected
                    ? '0 0 0 1px var(--accent)'
                    : undefined,
                }}
              >
                {/* Row header */}
                <div className="px-4 py-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(q.id)}
                    className="w-4 h-4 rounded flex-shrink-0 cursor-pointer"
                    style={{ accentColor: isAiRec ? '#7e22ce' : 'var(--accent)' }}
                  />

                  <button
                    onClick={() => setExpandedId(isExpanded ? null : q.id)}
                    className="flex items-center gap-2 text-left min-w-0"
                  >
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{
                      background: q.subject === 'math' ? '#eff6ff' : '#fdf4ff',
                      color: q.subject === 'math' ? '#1d4ed8' : '#7e22ce',
                    }}>
                      {q.subject === 'math' ? 'Math' : 'English'}
                    </span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{q.domain}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>·</span>
                    <span className="text-xs flex-shrink-0 truncate max-w-40" style={{ color: 'var(--text-muted)' }}>{q.skill}</span>
                    {/* Clickable difficulty badge with inline picker */}
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); setEditingDiffFor(isEditingDiff ? null : q.id) }}
                        title="Click to change difficulty"
                        className="text-xs px-2 py-0.5 rounded-full transition-opacity hover:opacity-75"
                        style={{
                          background: diffBg(q.difficulty),
                          color: diffCol(q.difficulty),
                          opacity: savingDiff === q.id ? 0.5 : 1,
                        }}
                      >
                        {savingDiff === q.id ? '…' : diffLabel(q.difficulty)}
                      </button>
                      {isEditingDiff && (
                        <div
                          className="absolute right-0 top-full mt-1 z-50 rounded-xl border shadow-xl p-2 flex flex-col gap-1 min-w-[110px]"
                          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                        >
                          <p className="text-xs px-1 mb-0.5 font-medium" style={{ color: 'var(--text-muted)' }}>Set difficulty</p>
                          {['Easy', 'Medium', 'Hard'].map(d => (
                            <button
                              key={d}
                              onClick={e => { e.stopPropagation(); setDifficulty(q.id, d) }}
                              className="text-xs px-3 py-1.5 rounded-lg text-left font-medium transition-opacity hover:opacity-80"
                              style={{ background: diffBg(d), color: diffCol(d) }}
                            >
                              {d}
                            </button>
                          ))}
                          <button
                            onClick={e => { e.stopPropagation(); setEditingDiffFor(null) }}
                            className="text-xs px-3 py-1 rounded-lg text-left mt-0.5"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
                    {qTags.map(tag => (
                      <span key={tag.id}
                        className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 group/tag"
                        style={{ background: tagBg(tag.color), color: tag.color, border: `1px solid ${tag.color}33` }}>
                        <button
                          onClick={e => { e.stopPropagation(); toggleTagFilter(tag.id) }}
                          className="hover:underline"
                          title={`Filter by "${tag.name}"`}
                        >
                          {tag.name}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); removeTagFromQuestion(q.id, tag.id) }}
                          className="opacity-0 group-hover/tag:opacity-100 transition-opacity ml-0.5 hover:opacity-60 font-bold leading-none"
                          title="Remove tag"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>

                  <button
                    onClick={() => setExpandedId(isExpanded ? null : q.id)}
                    className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  <button
                    onClick={() => {
                      if (isEditingTags) { setEditingTagsFor(null); setTagDropdown(false) }
                      else { setEditingTagsFor(q.id); setTagInput(''); setTagDropdown(false) }
                    }}
                    title={isEditingTags ? 'Done editing tags' : 'Edit tags'}
                    className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                    style={{
                      background: isEditingTags ? 'var(--accent-light)' : 'transparent',
                      color: isEditingTags ? 'var(--accent)' : 'var(--text-muted)',
                    }}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </button>
                </div>

                {/* Inline tag editing */}
                {isEditingTags && (
                  <div className="border-t px-4 py-3 flex flex-wrap items-center gap-1.5"
                    style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>

                    {qTags.map(tag => (
                      <span key={tag.id}
                        className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full group/tag"
                        style={{ background: tagBg(tag.color), color: tag.color, border: `1px solid ${tag.color}44` }}>
                        {tag.name}
                        <button
                          onClick={() => removeTagFromQuestion(q.id, tag.id)}
                          className="opacity-0 group-hover/tag:opacity-100 transition-opacity hover:opacity-60 font-bold leading-none"
                          title="Remove tag"
                        >
                          ✕
                        </button>
                      </span>
                    ))}

                    <div className="relative flex items-center gap-1">
                      <input
                        ref={tagInputRef}
                        autoFocus
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={async e => {
                          if (e.key === 'Enter' && tagInput.trim()) {
                            e.preventDefault()
                            const exact = allTags.find(t => t.name.toLowerCase() === tagInput.trim().toLowerCase())
                            if (exact) await addTagToQuestion(q.id, exact)
                            else await createAndAddTag(q.id, tagInput)
                            setTagInput('')
                          }
                          if (e.key === 'Escape') { setEditingTagsFor(null) }
                        }}
                        placeholder="Type to search or create tags…"
                        className="text-xs px-2.5 py-1 rounded-lg border outline-none w-48"
                        style={{ borderColor: 'var(--accent)', background: 'var(--card)', color: 'var(--foreground)' }}
                      />
                      <button
                        onClick={() => { setEditingTagsFor(null); setTagDropdown(false) }}
                        className="text-xs px-2 py-0.5 rounded-lg"
                        style={{ color: 'var(--accent)' }}
                      >
                        Done
                      </button>

                      {(tagSuggestions.length > 0 || tagInput.trim().length > 0) && (
                        <div className="absolute top-full left-0 mt-1 z-[9999] rounded-xl border-2 shadow-2xl overflow-hidden w-56 max-h-60 overflow-y-auto"
                          style={{ background: 'var(--card)', borderColor: 'var(--accent)' }}>
                          {tagSuggestions.length > 0 && (
                            <p className="px-3 py-1.5 text-xs font-medium border-b"
                              style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'var(--background)' }}>
                              {tagInput ? 'Matching tags' : 'Available tags'}
                            </p>
                          )}
                          {tagSuggestions.map(tag => (
                            <button
                              key={tag.id}
                              onMouseDown={() => { addTagToQuestion(q.id, tag); setTagInput(''); }}
                              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors"
                              style={{ color: 'var(--foreground)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-light)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: tag.color }} />
                              {tag.name}
                            </button>
                          ))}
                          {tagInput.trim() && !allTags.some(t => t.name.toLowerCase() === tagInput.trim().toLowerCase()) && (
                            <button
                              onMouseDown={() => { createAndAddTag(q.id, tagInput); }}
                              className="w-full text-left px-3 py-2 text-xs border-t font-medium"
                              style={{ borderColor: 'var(--border)', color: 'var(--accent)', background: 'var(--accent-light)' }}
                            >
                              + Create &quot;{tagInput.trim()}&quot;
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {qTags.length === 0 && !tagInput && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No tags yet — type to add one</span>
                    )}
                  </div>
                )}

                {/* Expanded view */}
                {isExpanded && (
                  <div className="border-t px-4 py-4" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Question</p>
                        <Image
                          src={q.question_image_url}
                          alt="Question"
                          width={600} height={300}
                          className="rounded-lg w-full object-contain"
                          style={{ maxHeight: 400 }}
                          unoptimized
                        />
                      </div>
                      {isShowingAnswer && (
                        <div className="flex-1">
                          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Answer</p>
                          <Image
                            src={q.answer_image_url}
                            alt="Answer"
                            width={600} height={300}
                            className="rounded-lg w-full object-contain"
                            style={{ maxHeight: 400 }}
                            unoptimized
                          />
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <button
                        onClick={() => setShowAnswer(isShowingAnswer ? null : q.id)}
                        className="text-sm px-3 py-1.5 rounded-lg border transition-colors flex-shrink-0"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                      >
                        {isShowingAnswer ? 'Hide answer' : 'Show answer'}
                      </button>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Correct: <strong style={{ color: 'var(--foreground)' }}>{q.correct_answer}</strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>
              </div> // closes outer wrapper div
            )
          })}

          {!loading && displayQuestions.length === 0 && !aiMode && (
            <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
              <p className="text-sm">No questions match these filters.</p>
            </div>
          )}

          {!aiLoading && aiMode && aiQuestions.length === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
              <p className="text-sm">{aiMessage || 'No questions matched. Try rephrasing your prompt.'}</p>
            </div>
          )}
        </div>

        {/* Pagination (normal mode only) */}
        {!aiMode && totalPages > 1 && (
          <div className="border-t px-6 py-3 flex items-center justify-between" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-sm px-3 py-1.5 rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
              Previous
            </button>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="text-sm px-3 py-1.5 rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
              Next
            </button>
          </div>
        )}

        {/* Find & Replace Tags Modal */}
        {showFindReplace && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ background: 'var(--card)' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg" style={{ color: 'var(--foreground)' }}>Find & Replace Tags</h2>
                <button onClick={() => setShowFindReplace(false)} style={{ color: 'var(--text-muted)' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Find tag</p>
                  <select
                    value={findTagId ?? ''}
                    onChange={e => setFindTagId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full text-sm px-3 py-2 rounded-lg border outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                  >
                    <option value="">Select a tag…</option>
                    {allTags.map(tag => (
                      <option key={tag.id} value={tag.id}>{tag.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setFrMode('replace')}
                    className="flex-1 text-sm py-2 rounded-lg border font-medium transition-colors"
                    style={{
                      borderColor: frMode === 'replace' ? 'var(--accent)' : 'var(--border)',
                      background: frMode === 'replace' ? 'var(--accent-light)' : 'transparent',
                      color: frMode === 'replace' ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    Replace with…
                  </button>
                  <button
                    onClick={() => setFrMode('delete')}
                    className="flex-1 text-sm py-2 rounded-lg border font-medium transition-colors"
                    style={{
                      borderColor: frMode === 'delete' ? '#ef4444' : 'var(--border)',
                      background: frMode === 'delete' ? '#fef2f2' : 'transparent',
                      color: frMode === 'delete' ? '#ef4444' : 'var(--text-muted)',
                    }}
                  >
                    Delete from all
                  </button>
                </div>

                {frMode === 'replace' && (
                  <div>
                    <p className="text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Replace with</p>
                    <select
                      value={replaceTagId ?? ''}
                      onChange={e => { setReplaceTagId(e.target.value ? parseInt(e.target.value) : null); setReplaceNewName('') }}
                      className="w-full text-sm px-3 py-2 rounded-lg border outline-none mb-2"
                      style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                    >
                      <option value="">Select existing tag…</option>
                      {allTags.map(tag => (
                        <option key={tag.id} value={tag.id}>{tag.name}</option>
                      ))}
                    </select>
                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Or type a new tag name:</p>
                    <input
                      value={replaceNewName}
                      onChange={e => { setReplaceNewName(e.target.value); setReplaceTagId(null) }}
                      placeholder="New tag name…"
                      className="w-full text-sm px-3 py-2 rounded-lg border outline-none"
                      style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                    />
                  </div>
                )}

                {findTagId && (
                  <div className="p-3 rounded-lg" style={{ background: frMode === 'delete' ? '#fef2f2' : 'var(--background)' }}>
                    <p className="text-xs" style={{ color: frMode === 'delete' ? '#ef4444' : 'var(--text-muted)' }}>
                      {frMode === 'delete'
                        ? <>This will remove the tag from <strong>{affectedCount}</strong> question{affectedCount !== 1 ? 's' : ''}</>
                        : <>This will update <strong style={{ color: 'var(--foreground)' }}>{affectedCount}</strong> question{affectedCount !== 1 ? 's' : ''}</>
                      }
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowFindReplace(false)}
                  disabled={replacingTags}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border disabled:opacity-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleFindReplace}
                  disabled={!findTagId || (frMode === 'replace' && !replaceTagId && !replaceNewName.trim()) || replacingTags}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: frMode === 'delete' ? '#ef4444' : 'var(--accent)' }}
                >
                  {replacingTags ? 'Working…' : frMode === 'delete' ? 'Delete from All' : 'Replace All'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel: AI Worksheet Builder ───────────────────────────────── */}
      <aside
        className="w-72 border-l flex-shrink-0 flex flex-col overflow-hidden"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      >
        {/* Panel header */}
        <div className="px-4 pt-4 pb-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
          <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: '#fdf4ff' }}>
            <svg className="w-3.5 h-3.5" style={{ color: '#7e22ce' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>AI Worksheet Builder</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Describe what you need</p>
          </div>
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Prompt textarea */}
          <div>
            <textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder="e.g. 10 medium Algebra problems on linear equations…"
              rows={4}
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
              style={{
                background: 'var(--background)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Results update automatically as you type
            </p>
          </div>

          {/* Count */}
          <div className="flex items-center gap-2">
            <label className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Questions:</label>
            <input
              type="number"
              min={1}
              max={30}
              value={aiCount}
              onChange={e => setAiCount(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-16 rounded-lg border px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-300"
              style={{
                background: 'var(--background)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
            />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>max 30</span>
          </div>

          {/* Example prompts */}
          <div>
            <p className="text-xs mb-2 font-medium" style={{ color: 'var(--text-muted)' }}>Examples</p>
            <div className="flex flex-col gap-1.5">
              {AI_EXAMPLES.map(ex => (
                <button
                  key={ex}
                  onClick={() => setAiPrompt(ex)}
                  className="text-left text-xs px-2.5 py-1.5 rounded-lg border transition-colors hover:opacity-80"
                  style={{
                    background: '#fdf4ff',
                    borderColor: '#e9d5ff',
                    color: '#7e22ce',
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Loading */}
          {aiLoading && (
            <div className="flex items-center gap-2 py-2">
              <div className="w-4 h-4 border-2 rounded-full animate-spin flex-shrink-0"
                style={{ borderColor: '#e9d5ff', borderTopColor: '#7e22ce' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Finding questions…</span>
            </div>
          )}

          {/* Similar mode summary */}
          {similarMode && !similarLoading && (seedQuestions.length > 0 || suggestedQuestions.length > 0) && (
            <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--accent-light)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                Similar questions found
              </p>
              <p className="text-xs" style={{ color: 'var(--accent)' }}>
                {seedQuestions.length} seed · {suggestedQuestions.length} suggestions
              </p>
              <p className="text-xs" style={{ color: 'var(--accent)', opacity: 0.8 }}>
                Uncheck any you don&apos;t want, then create your worksheet.
              </p>
              <button onClick={clearAiMode} className="text-xs underline mt-1" style={{ color: 'var(--accent)' }}>
                Clear &amp; start over
              </button>
            </div>
          )}

          {/* Results summary */}
          {aiMode && !aiLoading && !similarMode && aiQuestions.length > 0 && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: '#fdf4ff' }}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold" style={{ color: '#7e22ce' }}>
                  {aiQuestions.length} questions selected
                </p>
                <button
                  onClick={clearAiMode}
                  className="text-xs underline"
                  style={{ color: '#7e22ce' }}
                >
                  Clear
                </button>
              </div>
              <p className="text-xs" style={{ color: '#6b21a8' }}>
                Pool of {aiTotal} · uncheck any you don&apos;t want
              </p>

              {/* Filter breakdown */}
              {aiFilterLabels.length > 0 && (
                <div>
                  <button
                    className="text-xs underline mb-1"
                    style={{ color: '#7e22ce' }}
                    onClick={() => setAiFiltersOpen(o => !o)}
                  >
                    {aiFiltersOpen ? 'Hide' : 'Show'} filters applied
                  </button>
                  {aiFiltersOpen && (
                    <div className="flex flex-col gap-1">
                      {aiFilterLabels.map(label => (
                        <span key={label} className="text-xs" style={{ color: '#6b21a8' }}>· {label}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* No match message */}
          {!aiLoading && aiMessage && !aiMode && (
            <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--background)', color: 'var(--text-muted)' }}>
              {aiMessage}
            </div>
          )}

          {/* Build worksheet CTA */}
          {aiMode && selected.size > 0 && (
            <button
              onClick={() => {
                const ids = Array.from(selected).join(',')
                router.push(`/worksheets/new?q=${ids}`)
              }}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2"
              style={{ background: '#7e22ce' }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Build Worksheet ({selected.size})
            </button>
          )}
        </div>
      </aside>

    </div>
  )
}
