// src/app/api/scan-omr/route.ts
// API route nhận ảnh phiếu → gọi Gemini Vision → trả JSON đáp án
// Không cần client xử lý ảnh gì cả

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scanWithGemini } from '@/lib/omr/gemini-scanner'

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse multipart form data
    const formData = await request.formData()
    const imageFile = formData.get('image') as File | null
    const mcCount = parseInt(formData.get('mcCount') as string || '0')
    const tfCount = parseInt(formData.get('tfCount') as string || '0')
    const saCount = parseInt(formData.get('saCount') as string || '0')

    if (!imageFile) {
      return NextResponse.json({ error: 'Thiếu file ảnh' }, { status: 400 })
    }

    // Kiểm tra kích thước ảnh (max 10MB)
    if (imageFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Ảnh quá lớn (tối đa 10MB)' }, { status: 400 })
    }

    // Kiểm tra loại file
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(imageFile.type)) {
      return NextResponse.json({ error: 'Chỉ hỗ trợ JPG, PNG, WEBP' }, { status: 400 })
    }

    // 3. Chuyển file → base64
    const arrayBuffer = await imageFile.arrayBuffer()
    const imageBase64 = Buffer.from(arrayBuffer).toString('base64')

    // 4. Gọi Gemini Vision
    const startTime = Date.now()
    const geminiResult = await scanWithGemini({
      imageBase64,
      mimeType: imageFile.type,
      mcCount,
      tfCount,
      saCount,
    })
    const processingTimeMs = Date.now() - startTime

    // 5. Trả về kết quả
    return NextResponse.json({
      ...geminiResult,
      processingTimeMs,
    })

  } catch (err) {
    console.error('scan-omr API error:', err)
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    
    // Trả về lỗi raw để dễ debug
    return NextResponse.json({ error: `Chi tiết lỗi: ${message}` }, { status: 500 })
  }
}
