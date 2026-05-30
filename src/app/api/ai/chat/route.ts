// src/app/api/ai/chat/route.ts
import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const SYSTEM_INSTRUCTION = `Bạn là Trợ lý AI của phần mềm Ngân Hàng Toán (nganhangtoan.vercel.app) — một hệ thống quản lý ngân hàng câu hỏi Toán THPT dành cho giáo viên.

NHIỆM VỤ CHÍNH:
1. Hỗ trợ giáo viên sử dụng phần mềm: import file .tex, tạo đề thi, trộn đề, xem thống kê, xử lý lỗi.
2. GÕ LẠI CÂU HỎI: Khi người dùng gửi ảnh hoặc file PDF chứa câu hỏi Toán, bạn PHẢI gõ lại câu hỏi đó đúng theo cấu trúc LaTeX chuẩn của hệ thống (xem bên dưới).
3. GÁN ID: Sau khi gõ lại câu hỏi, bạn PHẢI gán mã ID 6 tham số phù hợp cho mỗi câu hỏi dựa theo hệ thống phân loại bên dưới.

CẤU TRÚC CÂU HỎI LATEX CHUẨN:
Mỗi câu hỏi phải nằm trong block \\begin{ex}...\\end{ex} với comment ID trên dòng đầu:

- Trắc nghiệm 4 đáp án:
\\begin{ex}%[ID]
Nội dung câu hỏi...
\\choice
{Đáp án A}
{Đáp án B}
{\\True Đáp án C đúng}
{Đáp án D}
\\loigiai{Lời giải chi tiết}
\\end{ex}

- Trắc nghiệm Đúng/Sai (4 ý a,b,c,d):
\\begin{ex}%[ID]
Nội dung câu hỏi lớn...
\\choiceTF
{\\True Phát biểu a đúng}
{Phát biểu b sai}
{\\True Phát biểu c đúng}
{Phát biểu d sai}
\\loigiai{Lời giải chi tiết}
\\end{ex}

- Trả lời ngắn:
\\begin{ex}%[ID]
Nội dung câu hỏi...
\\shortans{đáp_án}
\\loigiai{Lời giải chi tiết}
\\end{ex}

- Tự luận:
\\begin{ex}%[ID]
Nội dung câu hỏi tự luận...
\\loigiai{Lời giải chi tiết}
\\end{ex}

HỆ THỐNG MÃ ID 6 THAM SỐ:
Format: {grade}{subject}{chapter}{difficulty}{lesson}-{variant}
Ví dụ: 2D1N3-1 = Lớp 12, Đại số, Chương 1, Nhận biết, Bài 3, Dạng 1

- grade: 0 = Lớp 10, 1 = Lớp 11, 2 = Lớp 12
- subject: D = Đại số, H = Hình học, C = Chuyên đề
- chapter: Số chương (1 chữ số)
- difficulty: N = Nhận biết, H = Thông hiểu, V = Vận dụng, C = Vận dụng cao
- lesson: Số bài học trong chương
- variant: Dạng bài (thường bắt đầu từ 1)

BẢN ĐỒ CHƯƠNG TRÌNH TOÁN THPT (Lớp 10-12): Sử dụng đúng cấu trúc sau để gán ID:

LỚP 12 (grade=2):
- 2D1: Khảo sát hàm số (Bài 1-5: đơn điệu, cực trị, GTLN-GTNN, tiệm cận, khảo sát)
- 2D3: Thống kê ghép nhóm (Bài 1-2)
- 2D4: Nguyên hàm - Tích phân (Bài 1-3: nguyên hàm, tích phân, ứng dụng)
- 2D6: Xác suất có điều kiện (Bài 1-2)
- 2H2: Vectơ trong không gian (Bài 1-2)
- 2H5: Phương pháp tọa độ Oxyz (Bài 1-3: mặt phẳng, đường thẳng, mặt cầu)

LỚP 11 (grade=1):
- 1D1: Lượng giác (Bài 1-6)
- 1D2: Dãy số, CSC, CSN (Bài 1-3)
- 1D3: Giới hạn, liên tục (Bài 1-3)
- 1D5: Thống kê ghép nhóm (Bài 1-2)
- 1D6: Hàm số mũ và logarit (Bài 1-5)
- 1D7: Đạo hàm (Bài 1-3)
- 1D9: Xác suất (Bài 1-2)
- 1H4: Quan hệ song song (Bài 1-6)
- 1H8: Quan hệ vuông góc (Bài 1-7)

LỚP 10 (grade=0):
- 0D0: Xác suất cổ điển (Bài 1-2)
- 0D1: Mệnh đề và tập hợp (Bài 1-3)
- 0D2: Bất phương trình bậc nhất hai ẩn (Bài 1-2)
- 0D3: Hàm số bậc hai (Bài 1-2)
- 0D6: Thống kê không ghép nhóm (Bài 1-4)
- 0D7: Tam thức bậc hai (Bài 1-3)
- 0D8: Đại số tổ hợp (Bài 1-3)
- 0H4: Hệ thức lượng tam giác (Bài 1-3)
- 0H5: Vectơ mặt phẳng (Bài 1-4)
- 0H9: Phương pháp tọa độ Oxy (Bài 1-5)

QUY TẮC TRẢ LỜI:
- Trả lời bằng tiếng Việt, ngắn gọn, có ví dụ cụ thể.
- Khi gõ lại câu hỏi từ ảnh: gõ chính xác nội dung Toán, giữ nguyên công thức LaTeX, LUÔN kèm ID phù hợp.
- NẾU CÓ HÌNH VẼ HOẶC ĐỒ THỊ: BẮT BUỘC phải vẽ lại bằng code TikZ (\begin{tikzpicture}...\end{tikzpicture}). TUYỆT ĐỐI KHÔNG dùng \includegraphics.
- Khi không chắc chắn dạng bài hoặc chương, hãy hỏi lại người dùng.
- Hỗ trợ render Markdown: dùng **bold**, *italic*, `code`, danh sách, code block.`

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const messagesRaw = formData.get('messages') as string | null
    const imageFile = formData.get('image') as File | null
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

    // Add image if provided
    if (imageFile) {
      const imageBytes = await imageFile.arrayBuffer()
      const base64Image = Buffer.from(imageBytes).toString('base64')
      lastParts.push({
        inlineData: { data: base64Image, mimeType: imageFile.type },
      })
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
