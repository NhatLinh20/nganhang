// src/app/api/ai/chat/route.ts
import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { SYSTEM_INSTRUCTION } from '@/lib/ai-system-instruction'

// Tăng giới hạn timeout tối đa cho Vercel (Hobby tier hỗ trợ max 60s)
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const messagesRaw = formData.get('messages') as string | null
    const uploadedFiles = formData.getAll('files') as File[]
    const modelName = (formData.get('model') as string) || 'gemini-3.5-flash'
    const customApiKey = formData.get('custom_api_key') as string | null

    if (!messagesRaw) {
      return new Response(JSON.stringify({ error: 'Thiếu nội dung tin nhắn' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let messages: { role: string; parts: { text?: string }[] }[]
    try {
      messages = JSON.parse(messagesRaw)
    } catch {
      return new Response(JSON.stringify({ error: 'Dữ liệu messages không hợp lệ' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Build Gemini SDK
    const apiKey = customApiKey?.trim() || process.env.GEMINI_API_KEY!
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_INSTRUCTION,
    })

    // Prepare the last user message content (may include image)
    const lastMessage = messages[messages.length - 1]
    const history = messages.slice(0, -1)

    // Build content parts for the last message
    const lastParts: any[] = []

    // Add files if provided
    for (const file of uploadedFiles) {
      if (file && file.size > 0) {
        const fileBytes = await file.arrayBuffer()
        const base64File = Buffer.from(fileBytes).toString('base64')
        lastParts.push({
          inlineData: { data: base64File, mimeType: file.type },
        })
      }
    }

    // Add text
    if (lastMessage?.parts?.[0]?.text) {
      lastParts.push({ text: lastMessage.parts[0].text })
    }

    // Start chat with history
    const chat = model.startChat({
      history: history.map((msg) => ({
        role: msg.role as 'user' | 'model',
        parts: msg.parts as any[],
      })),
    })

    // Generate streaming response
    const result = await chat.sendMessageStream(lastParts)

    // Create a ReadableStream to stream the response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) {
              controller.enqueue(encoder.encode(text))
            }
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Streaming error'
          controller.enqueue(encoder.encode(`\n\n[LỖI]: ${errorMsg}`))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (err) {
    console.error('AI Chat error:', err)
    return new Response(
      JSON.stringify({
        error: 'Lỗi hệ thống: ' + (err instanceof Error ? err.message : 'Unknown'),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
