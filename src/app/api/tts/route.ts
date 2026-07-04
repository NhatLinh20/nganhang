// src/app/api/tts/route.ts
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { text, voice } = body

    const vpsUrl = process.env.NEXT_PUBLIC_VPS_URL || process.env.NEXT_PUBLIC_TIKZ_API_URL || 'http://42.96.15.5:3001'
    
    // Proxy request to VPS
    const response = await fetch(`${vpsUrl}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    })

    if (!response.ok) {
      throw new Error(`VPS TTS API failed with status ${response.status}`)
    }

    const data = await response.json()
    
    // The VPS returns { audio_url: '/audio/filename.mp3' }
    // The client SlideshowClient.tsx currently expects data.audio_url and prepends vpsUrl
    // Wait, if I return data, the client will still try to prepend vpsUrl and might get mixed content again!
    // No, the audio file itself needs to be served.
    // If the audio URL is `http://42.96.15.5:3001/audio/...`, the browser will still block it!
    
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('TTS Proxy error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
