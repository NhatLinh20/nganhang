import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const apiUrl = process.env.TIKZ_API_URL || process.env.NEXT_PUBLIC_TIKZ_API_URL
  if (!apiUrl) {
    return NextResponse.json({ error: 'TIKZ_API_URL is not configured' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const response = await fetch(`${apiUrl}/compile-zip`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(errorData, { status: response.status })
    }

    const pdfBlob = await response.blob()
    return new NextResponse(pdfBlob, {
      headers: { 'Content-Type': 'application/pdf' }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
