import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const targetUrl = searchParams.get('url')

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  try {
    const response = await fetch(targetUrl)

    if (!response.ok) {
      throw new Error(`Failed to fetch audio, status: ${response.status}`)
    }

    const headers = new Headers(response.headers)
    // Make sure we forward the content type properly
    const contentType = headers.get('content-type') || 'audio/mpeg'
    
    return new NextResponse(response.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Allow caching
        'Cache-Control': 'public, max-age=31536000',
      },
    })
  } catch (error: any) {
    console.error('Audio proxy error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
