import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const pythonUrl = process.env.PYTHON_OMR_URL || 'http://127.0.0.1:8000/scan'
    const healthUrl = pythonUrl.replace('/scan', '/health')

    // Fire and forget (timeout nhanh để không block)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)

    try {
      await fetch(healthUrl, { signal: controller.signal, cache: 'no-store' })
      clearTimeout(timeoutId)
    } catch (e) {
      // Bỏ qua lỗi timeout vì server có thể đang mất 30s để thức dậy
    }

    return NextResponse.json({ success: true, message: 'Ping sent' })
  } catch (err) {
    return NextResponse.json({ success: false })
  }
}
