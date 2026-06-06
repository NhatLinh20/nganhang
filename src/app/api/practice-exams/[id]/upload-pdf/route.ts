// src/app/api/practice-exams/[id]/upload-pdf/route.ts
// API: Upload PDF file cho đề thi luyện tập

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(
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

    const formData = await request.formData()
    const file = formData.get('pdf') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Chưa chọn file PDF' }, { status: 400 })
    }

    if (!file.type.includes('pdf')) {
      return NextResponse.json({ error: 'File phải là PDF' }, { status: 400 })
    }

    // Giới hạn 50MB
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File quá lớn (tối đa 50MB)' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Xóa PDF cũ nếu có
    const { data: existingExam } = await adminClient
      .from('practice_exams')
      .select('pdf_url')
      .eq('id', id)
      .single()

    if (existingExam?.pdf_url) {
      const oldPath = existingExam.pdf_url.split('/exam-pdfs/')[1]
      if (oldPath) {
        await adminClient.storage.from('exam-pdfs').remove([oldPath])
      }
    }

    // Upload file mới
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${id}/${timestamp}-${safeName}`

    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await adminClient.storage
      .from('exam-pdfs')
      .upload(filePath, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Lỗi upload: ' + uploadError.message }, { status: 500 })
    }

    // Lấy public URL
    const { data: urlData } = adminClient.storage
      .from('exam-pdfs')
      .getPublicUrl(filePath)

    const publicUrl = urlData?.publicUrl || ''

    // Cập nhật record
    const { data, error: updateError } = await adminClient
      .from('practice_exams')
      .update({
        pdf_url: publicUrl,
        pdf_filename: file.name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ data, pdf_url: publicUrl })
  } catch (err) {
    console.error('Upload PDF error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    )
  }
}
