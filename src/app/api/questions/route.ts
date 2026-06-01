// src/app/api/questions/route.ts
// API lấy danh sách câu hỏi phía server (dùng Service Role Key, bypass RLS → cực nhanh)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)

    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '30')

    // Build query lấy dữ liệu
    let query = supabase
      .from('questions')
      .select('*')
      .order('created_at', { ascending: false })

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
    const search_id = searchParams.get('search_id')
    const search_content = searchParams.get('search_content')

    if (grade) query = query.eq('grade', parseInt(grade))
    if (subject_area) query = query.eq('subject_area', subject_area)
    if (chapter) query = query.eq('chapter', parseInt(chapter))
    if (lesson) query = query.eq('lesson', parseInt(lesson))
    if (variant) query = query.eq('variant', parseInt(variant))
    if (difficulty) query = query.eq('difficulty', difficulty)
    if (question_type) query = query.eq('question_type', question_type)
    if (has_image) query = query.eq('has_image', has_image === 'true')
    if (category_code) query = query.eq('category_code', category_code)
    if (search_id) query = query.ilike('category_code', `${search_id}%`)
    if (search_content) query = query.ilike('latex_content', `%${search_content}%`)

    // Phân trang
    const from = (page - 1) * pageSize
    query = query.range(from, from + pageSize - 1)

    const { data, error } = await query

    if (error) {
      console.error('Questions fetch error:', error)
      return NextResponse.json({ data: [], error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    console.error('Questions API error:', err)
    return NextResponse.json({ data: [], error: err.message }, { status: 500 })
  }
}
