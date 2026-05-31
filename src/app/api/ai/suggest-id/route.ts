// src/app/api/ai/suggest-id/route.ts
// API gợi ý ID dựa trên vector search (semantic similarity)
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

  const result = await embeddingModel.embedContent({
    content: { parts: [{ text }], role: 'user' },
    taskType: 'RETRIEVAL_QUERY' as any,
    outputDimensionality: 768,
  } as any)
  return result.embedding.values
}

// Trích xuất phần text thuần từ LaTeX để tạo query tốt hơn cho embedding
function extractQueryFromLatex(latex: string): string {
  let text = latex
  // Bỏ \begin{ex}...\end{ex} wrapper
  text = text.replace(/\\begin\{ex\}.*?\n/g, '')
  text = text.replace(/\\end\{ex\}/g, '')
  // Bỏ phần \loigiai{...} (lời giải dài, không cần cho search)
  text = text.replace(/\\loigiai\{[\s\S]*$/g, '')
  // Bỏ \choice, \choiceTF, \shortans và các đáp án
  text = text.replace(/\\choice[\s\S]*?(?=\\loigiai|\\end\{ex\}|$)/g, '')
  text = text.replace(/\\choiceTF[\s\S]*?(?=\\loigiai|\\end\{ex\}|$)/g, '')
  text = text.replace(/\\shortans\{[^}]*\}/g, '')
  // Bỏ các lệnh LaTeX formatting nhưng giữ nội dung
  text = text.replace(/\\(?:True|bf|it|textbf|textit|mathrm|mathbf)\s*/g, '')
  text = text.replace(/%\[.*?\]/g, '') // Bỏ comment ID
  // Giữ lại text thuần
  text = text.replace(/\s+/g, ' ').trim()
  // Giới hạn độ dài để embedding hiệu quả
  return text.slice(0, 500)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { latex_content, custom_api_key } = body

    if (!latex_content || typeof latex_content !== 'string') {
      return NextResponse.json(
        { error: 'Thiếu latex_content' },
        { status: 400 }
      )
    }

    const apiKey = custom_api_key?.trim() || process.env.GEMINI_API_KEY
    if (!apiKey) {
       return NextResponse.json(
        { error: 'Thiếu API Key' },
        { status: 400 }
      )
    }

    // Trích xuất query text từ LaTeX
    const queryText = extractQueryFromLatex(latex_content)
    if (queryText.length < 10) {
      return NextResponse.json(
        { error: 'Nội dung câu hỏi quá ngắn để tìm kiếm' },
        { status: 400 }
      )
    }

    // Tạo embedding
    const embedding = await getEmbedding(queryText, apiKey)
    const vectorStr = `[${embedding.join(',')}]`

    // Tìm câu tương tự nhất (không filter để tìm toàn bộ ngân hàng)
    const { data, error } = await supabase.rpc('match_questions', {
      query_embedding: vectorStr,
      match_count: 5,
      filter_grade: null,
      filter_chapter: null,
      filter_lesson: null,
      filter_variant: null
    })

    if (error) {
      console.error('Vector search error:', error)
      return NextResponse.json(
        { error: 'Lỗi tìm kiếm vector: ' + error.message },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ best_id: null, suggestions: [] })
    }

    // Trả về ID có similarity cao nhất
    const best = data[0]
    return NextResponse.json({
      best_id: best.category_code,
      similarity: best.similarity,
      suggestions: data.map((q: any) => ({
        category_code: q.category_code,
        similarity: q.similarity,
      })),
    })
  } catch (err) {
    console.error('Suggest ID error:', err)
    return NextResponse.json(
      { error: 'Lỗi hệ thống: ' + (err instanceof Error ? err.message : 'Unknown') },
      { status: 500 }
    )
  }
}
