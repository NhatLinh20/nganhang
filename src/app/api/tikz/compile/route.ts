import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const apiUrl = process.env.TIKZ_API_URL || process.env.NEXT_PUBLIC_TIKZ_API_URL
  if (!apiUrl) {
    return NextResponse.json({ error: 'TIKZ_API_URL is not configured' }, { status: 500 })
  }

  try {
    const { tikzCode } = await req.json()
    const response = await fetch(`${apiUrl}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tikzCode })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(errorData, { status: response.status })
    }

    const svgText = await response.text()
    return new NextResponse(svgText, {
      headers: { 'Content-Type': 'image/svg+xml' }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
