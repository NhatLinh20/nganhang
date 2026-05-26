// src/app/api/ai/swap-question/route.ts
// API thay thế 1 câu hỏi bằng câu khác cùng dạng (cùng grade, subject, chapter, lesson, difficulty, type)
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

async function hasEmbeddings(): Promise<boolean> {
  const { data } = await supabase
    .from('questions')
    .select('id')
    .not('embedding', 'is', null)
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function getEmbedding(text: string): Promise<number[]> {
  const result = await embeddingModel.embedContent({
    content: { parts: [{ text }], role: 'user' },
    taskType: 'RETRIEVAL_QUERY' as any,
    outputDimensionality: 768,
  } as any)
  return result.embedding.values
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      grade,
      subject_area,
      chapter,
      lesson,
      variant,
      difficulty,
      question_type,
      excludeIds,   // IDs hiện tại trong đề → không được lấy trùng
      query_text,   // Mô tả nội dung gốc từ ma trận → dùng cho vector search
    } = body

    if (!grade || !question_type) {
      return NextResponse.json(
        { error: 'Thiếu thông tin grade hoặc question_type' },
        { status: 400 }
      )
    }

    const excluded = new Set<string>(excludeIds || [])
    const useVector = await hasEmbeddings()

    // ── Bước 1: Thử tìm bằng pgvector (semantic search) ──────────────────
    if (useVector && query_text) {
      try {
        const embedding = await getEmbedding(query_text)
        const vectorStr = `[${embedding.join(',')}]`

        const { data, error } = await supabase.rpc('match_questions', {
          query_embedding: vectorStr,
          match_count: 20,
          filter_grade: grade,
          filter_subject: subject_area ?? null,
          filter_chapter: chapter ?? null,
          filter_lesson: lesson ?? null,
          filter_difficulty: difficulty ?? null,
          filter_type: question_type,
          filter_variant: variant ?? null,
        })

        if (!error && data?.length) {
          let available = data.filter(
            (q: { id: string; variant?: number }) => !excluded.has(q.id)
          )
          if (variant != null) {
            available = available.filter(
              (q: { variant?: number }) => q.variant === variant
            )
          }
          if (available.length > 0) {
            // Pick a random candidate from the top 5 best matches to provide variety
            const poolSize = Math.min(5, available.length)
            const picked = available[Math.floor(Math.random() * poolSize)]
            return NextResponse.json({ question: picked })
          }
        }
      } catch (vectorErr) {
        console.error('Swap: vector search error, falling back:', vectorErr)
      }
    }

    // ── Bước 2: Fallback exact match ──────────────────────────────────────
    let query = supabase
      .from('questions')
      .select('id, category_code, grade, subject_area, chapter, lesson, variant, difficulty, question_type, correct_answer, has_image, latex_content')
      .eq('grade', grade)
      .eq('question_type', question_type)

    if (subject_area) query = query.eq('subject_area', subject_area)
    if (chapter != null) query = query.eq('chapter', chapter)
    if (lesson != null) query = query.eq('lesson', lesson)
    if (variant != null) query = query.eq('variant', variant)
    if (difficulty) query = query.eq('difficulty', difficulty)

    const { data: exactData, error: exactErr } = await query.limit(30)

    if (exactErr || !exactData?.length) {
      // Fallback rộng hơn: bỏ chapter/lesson
      let broadQuery = supabase
        .from('questions')
        .select('id, category_code, grade, subject_area, chapter, lesson, variant, difficulty, question_type, correct_answer, has_image, latex_content')
        .eq('grade', grade)
        .eq('question_type', question_type)

      if (subject_area) broadQuery = broadQuery.eq('subject_area', subject_area)
      if (difficulty) broadQuery = broadQuery.eq('difficulty', difficulty)

      const { data: broadData, error: broadErr } = await broadQuery.limit(30)

      if (broadErr || !broadData?.length) {
        return NextResponse.json(
          { error: 'Không tìm thấy câu hỏi thay thế phù hợp.' },
          { status: 404 }
        )
      }

      const available = broadData.filter(q => !excluded.has(q.id))
      if (available.length === 0) {
        return NextResponse.json(
          { error: 'Đã hết câu hỏi cùng dạng trong ngân hàng.' },
          { status: 404 }
        )
      }

      // Chọn ngẫu nhiên 1 câu
      const picked = available[Math.floor(Math.random() * available.length)]
      return NextResponse.json({ question: picked })
    }

    const available = exactData.filter(q => !excluded.has(q.id))
    if (available.length === 0) {
      return NextResponse.json(
        { error: 'Đã hết câu hỏi cùng dạng trong ngân hàng.' },
        { status: 404 }
      )
    }

    const picked = available[Math.floor(Math.random() * available.length)]
    return NextResponse.json({ question: picked })

  } catch (err) {
    console.error('Swap question error:', err)
    return NextResponse.json(
      { error: 'Lỗi hệ thống: ' + (err instanceof Error ? err.message : 'Unknown') },
      { status: 500 }
    )
  }
}
