// src/app/api/practice-exams/route.ts
// API: GET danh sách đề thi luyện tập, POST tạo đề mới

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const grade = searchParams.get('grade')
    const exam_type = searchParams.get('exam_type')
    const search = searchParams.get('search')
    const published_only = searchParams.get('published_only')

    // Dùng admin client để bypass RLS nếu là admin, ngược lại dùng user client
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    const isAdmin = profile?.role === 'admin'

    const queryClient = isAdmin ? createAdminClient() : supabase
    let query = queryClient
      .from('practice_exams')
      .select('id, title, exam_type, grade, duration_minutes, total_questions, total_score, pdf_url, is_published, created_at')
      .order('created_at', { ascending: false })

    if (grade) query = query.eq('grade', parseInt(grade))
    if (exam_type && exam_type !== 'all') query = query.eq('exam_type', exam_type)
    if (search) query = query.ilike('title', `%${search}%`)
    if (published_only === 'true' || !isAdmin) query = query.eq('is_published', true)

    const { data, error } = await query

    if (error) {
      console.error('GET practice_exams error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (err) {
    console.error('GET practice_exams error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    // Chỉ admin mới được tạo đề
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
    }

    const body = await request.json()
    const { title, exam_type, grade, duration_minutes, total_questions, total_score, questions } = body

    if (!title || !grade) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc (title, grade)' }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('practice_exams')
      .insert({
        title,
        exam_type: exam_type || 'Kiểm tra thường xuyên',
        grade,
        duration_minutes: duration_minutes || 45,
        total_questions: total_questions || 0,
        total_score: total_score || 10,
        questions: questions || [],
        created_by: user.id,
        is_published: false,
      })
      .select()
      .single()

    if (error) {
      console.error('POST practice_exams error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('POST practice_exams error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    )
  }
}
