// This API route has been removed because PDF compilation requires pdflatex
// which is not available on Vercel. Use the LaTeX export feature instead.
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Tính năng biên dịch PDF đã bị gỡ bỏ. Vui lòng sử dụng chức năng Xuất LaTeX (.tex) thay thế.' },
    { status: 410 }
  )
}
