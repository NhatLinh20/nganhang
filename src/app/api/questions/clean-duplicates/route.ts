// src/app/api/questions/clean-duplicates/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { ApiResponse } from '@/types'

export const maxDuration = 60 // Allow up to 60 seconds

function normalize(str: string): string {
  if (!str) return ''
  return str
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\s+/g, ' ') // Strip multiple spaces
    .trim()
}

// GET: Scan for duplicates and return the duplicate list
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    
    // Fetch all questions using pagination (1000 items per page)
    let allQuestions: any[] = []
    let page = 0
    const PAGE_SIZE = 1000
    
    while (true) {
      const { data, error } = await supabase
        .from('questions')
        .select('id, category_code, latex_content, created_at')
        .order('created_at', { ascending: true }) // Oldest first
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (error) {
        console.error('Error fetching questions page:', error)
        return NextResponse.json(
          { error: `Lỗi tải câu hỏi: ${error.message}` } satisfies ApiResponse<never>,
          { status: 500 }
        )
      }

      if (!data || data.length === 0) break
      allQuestions = allQuestions.concat(data)
      if (data.length < PAGE_SIZE) break
      page++
    }

    const map = new Map<string, any>()
    const duplicates: any[] = []

    for (const q of allQuestions) {
      const norm = normalize(q.latex_content)
      if (map.has(norm)) {
        duplicates.push({
          id: q.id,
          category_code: q.category_code,
          created_at: q.created_at,
          original_id: map.get(norm).id,
          original_created_at: map.get(norm).created_at,
        })
      } else {
        map.set(norm, q)
      }
    }

    return NextResponse.json({
      data: {
        total: allQuestions.length,
        duplicateCount: duplicates.length,
        duplicates: duplicates.slice(0, 100), // Return top 100 duplicate examples
      }
    })

  } catch (err) {
    console.error('Clean duplicates error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown error'}` } satisfies ApiResponse<never>,
      { status: 500 }
    )
  }
}

// POST: Execute the duplicate deletion
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    
    // Fetch all questions to analyze duplicates
    let allQuestions: any[] = []
    let page = 0
    const PAGE_SIZE = 1000
    
    while (true) {
      const { data, error } = await supabase
        .from('questions')
        .select('id, latex_content, created_at')
        .order('created_at', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (error) {
        return NextResponse.json(
          { error: `Lỗi tải câu hỏi: ${error.message}` } satisfies ApiResponse<never>,
          { status: 500 }
        )
      }

      if (!data || data.length === 0) break
      allQuestions = allQuestions.concat(data)
      if (data.length < PAGE_SIZE) break
      page++
    }

    const map = new Map<string, any>()
    const idsToDelete: string[] = []

    for (const q of allQuestions) {
      const norm = normalize(q.latex_content)
      if (map.has(norm)) {
        idsToDelete.push(q.id)
      } else {
        map.set(norm, q)
      }
    }

    if (idsToDelete.length === 0) {
      return NextResponse.json({
        message: 'Không tìm thấy câu hỏi trùng lặp nào.',
        data: { deletedCount: 0 }
      })
    }

    // Delete in batches of 100 to prevent timeout/DB issues
    const BATCH_SIZE = 100
    let deletedCount = 0
    
    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      const batch = idsToDelete.slice(i, i + BATCH_SIZE)
      const { error: delErr } = await supabase
        .from('questions')
        .delete()
        .in('id', batch)

      if (delErr) {
        console.error('Delete batch error:', delErr)
        return NextResponse.json(
          { error: `Lỗi xóa câu hỏi: ${delErr.message}` } satisfies ApiResponse<never>,
          { status: 500 }
        )
      }
      deletedCount += batch.length
    }

    return NextResponse.json({
      message: `Đã dọn dẹp và xóa thành công ${deletedCount} câu hỏi trùng lặp!`,
      data: { deletedCount }
    })

  } catch (err) {
    console.error('Clean duplicates post error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown error'}` } satisfies ApiResponse<never>,
      { status: 500 }
    )
  }
}
