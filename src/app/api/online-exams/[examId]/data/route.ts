import { NextResponse } from 'next/server'

// GET: Lấy nội dung đề thi (questions + image_map) từ VPS
// Proxy này giúp tránh lỗi Mixed Content (HTTPS gọi HTTP) khi deploy Vercel
export async function GET(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  try {
    const { examId } = await params
    
    const vpsUrl = process.env.VPS_URL || process.env.NEXT_PUBLIC_VPS_URL || process.env.NEXT_PUBLIC_TIKZ_API_URL || 'http://42.96.15.5:3001'
    
    const response = await fetch(`${vpsUrl}/api/exams/${examId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: errorData.error || 'Failed to fetch exam data from VPS' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
