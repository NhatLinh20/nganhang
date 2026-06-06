// src/app/api/practice-exams/[id]/route.ts
// API: GET chi tiết, PUT cập nhật, DELETE xóa đề thi luyện tập

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    const isAdmin = profile?.role === 'admin'

    const queryClient = isAdmin ? createAdminClient() : supabase
    let query = queryClient
      .from('practice_exams')
      .select('*')
      .eq('id', id)

    // Student chỉ thấy đề đã published
    if (!isAdmin) {
      query = query.eq('is_published', true)
    }

    const { data, error } = await query.single()

    if (error || !data) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi' }, { status: 404 })
    }

    // Nếu là student, ẩn đáp án đúng
    if (!isAdmin) {
      const sanitizedQuestions = (data.questions || []).map((q: Record<string, unknown>) => ({
        order: q.order,
        type: q.type,
        score: q.score,
        // Ẩn correct_answer và sub_answers
      }))
      data.questions = sanitizedQuestions
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('GET practice_exam error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
    }

    const body = await request.json()
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

    // Chỉ cập nhật các field được gửi
    const allowedFields = ['title', 'exam_type', 'grade', 'duration_minutes', 'total_questions', 'total_score', 'questions', 'is_published', 'pdf_url', 'pdf_filename']
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('practice_exams')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('PUT practice_exam error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('PUT practice_exam error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
    }

    const adminClient = createAdminClient()

    // Lấy thông tin đề để xóa PDF trên storage
    const { data: exam } = await adminClient
      .from('practice_exams')
      .select('pdf_url')
      .eq('id', id)
      .single()

    if (exam?.pdf_url) {
      // Xóa file PDF trên storage
      const path = exam.pdf_url.split('/exam-pdfs/')[1]
      if (path) {
        await adminClient.storage.from('exam-pdfs').remove([path])
      }
    }

    const { error } = await adminClient
      .from('practice_exams')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE practice_exam error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Đã xóa đề thi' })
  } catch (err) {
    console.error('DELETE practice_exam error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    )
  }
}
