// src/app/api/scan-omr/route.ts
// API route nhận ảnh phiếu → gọi Gemini Vision → trả JSON đáp án
// Không cần client xử lý ảnh gì cả

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    // 3. Prepare FormData for Python backend
    const arrayBuffer = await imageFile.arrayBuffer()
    const pythonFormData = new FormData()
    pythonFormData.append('file', new Blob([arrayBuffer], { type: imageFile.type }), imageFile.name)
    pythonFormData.append('mcCount', mcCount.toString())
    pythonFormData.append('tfCount', tfCount.toString())
    pythonFormData.append('saCount', saCount.toString())

    // 4. Call Python OMR Service
    console.log('Sending to Python OMR service at http://localhost:8000/scan...')
    const startTime = Date.now()
    
    const pythonRes = await fetch('http://localhost:8000/scan', {
      method: 'POST',
      body: pythonFormData,
    })

    if (!pythonRes.ok) {
      throw new Error(`Python service returned status ${pythonRes.status}`)
    }

    const result = await pythonRes.json()
    
    if (result.error) {
       throw new Error(result.error)
    }

    const processingTimeMs = Date.now() - startTime

    // 5. Return result
    return NextResponse.json({
      ...result,
      processingTimeMs,
    })

  } catch (err) {
    console.error('scan-omr API error:', err)
    const message = err instanceof Error ? err.message : 'Lỗi không xác định'
    
    return NextResponse.json({ error: `Lỗi kết nối Python OMR: ${message}` }, { status: 500 })
  }
}
