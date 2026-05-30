import { NextRequest, NextResponse } from 'next/server'
import { normalizeQuestion } from '@/lib/latex-parser/normalizer'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const result = normalizeQuestion(body)
  return NextResponse.json({ original: body, normalized: result })
}
