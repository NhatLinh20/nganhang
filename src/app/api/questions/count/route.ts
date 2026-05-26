// src/app/api/questions/count/route.ts
// API đếm tổng số câu hỏi phía server (dùng Service Role Key, bypass RLS → cực nhanh)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)

    // Build query chỉ đếm (head: true = không trả về dữ liệu, chỉ đếm)
    let query = supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })

    // Áp dụng các bộ lọc (nếu có)
    const grade = searchParams.get('grade')
    const subject_area = searchParams.get('subject_area')
    const chapter = searchParams.get('chapter')
    const lesson = searchParams.get('lesson')
    const variant = searchParams.get('variant')
    const difficulty = searchParams.get('difficulty')
    const question_type = searchParams.get('question_type')
    const has_image = searchParams.get('has_image')
    const category_code = searchParams.get('category_code')
    const search = searchParams.get('search')

    if (grade) query = query.eq('grade', parseInt(grade))
    if (subject_area) query = query.eq('subject_area', subject_area)
    if (chapter) query = query.eq('chapter', parseInt(chapter))
    if (lesson) query = query.eq('lesson', parseInt(lesson))
    if (variant) query = query.eq('variant', parseInt(variant))
    if (difficulty) query = query.eq('difficulty', difficulty)
    if (question_type) query = query.eq('question_type', question_type)
    if (has_image) query = query.eq('has_image', has_image === 'true')
    if (category_code) query = query.eq('category_code', category_code)
    if (search) query = query.ilike('category_code', `${search}%`)

    const { count, error } = await query

    if (error) {
      console.error('Count error:', error)
      return NextResponse.json({ count: 0, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ count: count || 0 })
  } catch (err: any) {
    console.error('Count API error:', err)
    return NextResponse.json({ count: 0, error: err.message }, { status: 500 })
  }
}
