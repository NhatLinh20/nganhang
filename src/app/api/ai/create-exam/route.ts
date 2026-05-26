// src/app/api/ai/create-exam/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Dùng SDK cho embedding - tự động chọn đúng API endpoint
const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

// ── Kiểm tra embedding đã sẵn sàng chưa ─────────────────────────────────────
async function hasEmbeddings(): Promise<boolean> {
  const { data } = await supabase
    .from('questions')
    .select('id')
    .not('embedding', 'is', null)
    .limit(1)
  return (data?.length ?? 0) > 0
}


// ── Gọi Gemini Embedding qua SDK ─────────────────────────────────────────────
async function getEmbedding(text: string, apiKey?: string): Promise<number[]> {
  const activeGenAI = apiKey ? new GoogleGenerativeAI(apiKey) : genAI
  const activeEmbeddingModel = activeGenAI.getGenerativeModel({ model: 'gemini-embedding-001' })
  const result = await activeEmbeddingModel.embedContent({
    content: { parts: [{ text }], role: 'user' },
    taskType: 'RETRIEVAL_QUERY' as any,
    outputDimensionality: 768,
  } as any)
  return result.embedding.values
}


const SYSTEM_PROMPT = `Bạn là chuyên gia phân tích ma trận đề thi Toán từ ảnh. Nhiệm vụ của bạn là bóc tách bảng thành JSON cấu trúc chuẩn.

Cấu trúc chương trình Toán THPT và Bản đồ mã hóa Chương - Bài (BẮT BUỘC TUÂN THỦ TUYỆT ĐỐI):

LỚP 12:
- Khảo sát hàm số (subject_area: "D", chapter: 1):
  * Bài 1: Tính đơn điệu / đồng biến, nghịch biến (lesson: 1)
  * Bài 2: Cực trị hàm số (lesson: 2)
  * Bài 3: Giá trị lớn nhất, giá trị nhỏ nhất (lesson: 3)
  * Bài 4: Đường tiệm cận đứng, tiệm cận ngang (lesson: 4)
  * Bài 5: Khảo sát sự biến thiên và đồ thị hàm số (lesson: 5)
- Thống kê ghép nhóm (subject_area: "D", chapter: 3):
  * Bài 1: Khoảng biến thiên, khoảng tứ phân vị mẫu số liệu ghép nhóm (lesson: 1)
  * Bài 2: Phương sai, độ lệch chuẩn mẫu số liệu ghép nhóm (lesson: 2)
- Nguyên hàm - Tích phân (subject_area: "D", chapter: 4):
  * Bài 1: Nguyên hàm (lesson: 1)
  * Bài 2: Tích phân (lesson: 2)
  * Bài 3: Ứng dụng thực tế và hình học của tích phân tính diện tích, thể tích (lesson: 3)
- Xác suất có điều kiện (subject_area: "D", chapter: 6):
  * Bài 1: Xác suất có điều kiện (lesson: 1)
  * Bài 2: Công thức xác suất toàn phần và công thức Bayes (lesson: 2)
- Vectơ trong không gian (subject_area: "H", chapter: 2):
  * Bài 1: Vectơ và các phép toán vectơ trong không gian (lesson: 1)
  * Bài 2: Tọa độ của vectơ và các công thức trong không gian (lesson: 2)
- Phương pháp tọa độ trong không gian Oxyz (subject_area: "H", chapter: 5):
  * Bài 1: Phương trình mặt phẳng (lesson: 1)
  * Bài 2: Phương trình đường thẳng trong không gian (lesson: 2)
  * Bài 3: Phương trình mặt cầu trong không gian (lesson: 3)

LỚP 11:
- Lượng giác (subject_area: "D", chapter: 1):
  * Bài 1: Góc lượng giác, số đo góc lượng giác (lesson: 1)
  * Bài 2: Các giá trị lượng giác của góc lượng giác (lesson: 2)
  * Bài 3: Các công thức lượng giác (công thức cộng, nhân đôi, biến đổi tích thành tổng, tổng thành tích, rút gọn lượng giác) (lesson: 3)
  * Bài 4: Hàm số lượng giác và đồ thị (lesson: 4)
  * Bài 5: Phương trình lượng giác cơ bản (sinx=m, cosx=m, tanx=m, cotx=m, họ nghiệm, số nghiệm) (lesson: 5)
  * Bài 6: Phương trình lượng giác thường gặp (bậc hai theo một HSLG, bậc nhất đối với sin và cos) (lesson: 6)
- Dãy số, Cấp số cộng, Cấp số nhân (subject_area: "D", chapter: 2):
  * Bài 1: Dãy số (lesson: 1)
  * Bài 2: Cấp số cộng (lesson: 2)
  * Bài 3: Cấp số nhân (lesson: 3)
- Giới hạn, liên tục (subject_area: "D", chapter: 3):
  * Bài 1: Giới hạn của dãy số (lesson: 1)
  * Bài 2: Giới hạn của hàm số (lesson: 2)
  * Bài 3: Hàm số liên tục (lesson: 3)
- Thống kê ghép nhóm (subject_area: "D", chapter: 5):
  * Bài 1: Số trung bình và mốt của mẫu số liệu ghép nhóm (lesson: 1)
  * Bài 2: Trung vị và tứ phân vị của mẫu số liệu ghép nhóm (lesson: 2)
- Hàm số mũ và Hàm số logarit (subject_area: "D", chapter: 6):
  * Bài 1: Phép tính lũy thừa (lesson: 1)
  * Bài 2: Phép tính logarit (lesson: 2)
  * Bài 3: Hàm số mũ và hàm số logarit (bao gồm Tập xác định, đạo hàm, đồ thị hàm số mũ/logarit) (lesson: 3)
  * Bài 4: Phương trình, bất phương trình mũ và logarit cơ bản / cùng cơ số (lesson: 4)
  * Bài 5: Các phương pháp giải PT, BPT mũ và logarit phức tạp khác (đặt ẩn phụ, logarit hóa, đánh giá) (lesson: 5)
- Đạo hàm (subject_area: "D", chapter: 7):
  * Bài 1: Định nghĩa, ý nghĩa đạo hàm (ý nghĩa hình học, vật lý, tiếp tuyến tại một điểm) (lesson: 1)
  * Bài 2: Các quy tắc tính đạo hàm và viết phương trình tiếp tuyến (lesson: 2)
  * Bài 3: Đạo hàm cấp hai (lesson: 3)
- Xác suất (subject_area: "D", chapter: 9):
  * Bài 1: Biến cố giao, biến cố độc lập, công thức nhân xác suất (lesson: 1)
  * Bài 2: Biến cố hợp, quy tắc cộng xác suất, hai biến cố xung khắc (lesson: 2)
- Quan hệ song song trong không gian (subject_area: "H", chapter: 4):
  * Bài 1: Điểm, đường thẳng, mặt phẳng trong không gian, giao tuyến, giao điểm, thiết diện (lesson: 1)
  * Bài 2: Hai đường thẳng song song trong không gian (lesson: 2)
  * Bài 3: Đường thẳng và mặt phẳng song song (lesson: 3)
  * Bài 4: Hai mặt phẳng song song (lesson: 4)
  * Bài 5: Hình lăng trụ và hình hộp (lesson: 5)
  * Bài 6: Phép chiếu song song (lesson: 6)
- Quan hệ vuông góc trong không gian (subject_area: "H", chapter: 8):
  * Bài 1: Hai đường thẳng vuông góc trong không gian (lesson: 1)
  * Bài 2: Đường thẳng vuông góc với mặt phẳng (lesson: 2)
  * Bài 3: Phép chiếu vuông góc (lesson: 3)
  * Bài 4: Hai mặt phẳng vuông góc, góc phẳng nhị diện (lesson: 4)
  * Bài 5: Khoảng cách trong không gian (từ điểm đến mp, giữa hai đường chéo nhau) (lesson: 5)
  * Bài 6: Góc giữa đường thẳng và mặt phẳng (lesson: 6)
  * Bài 7: Hình lăng trụ đứng, hình chóp đều, tính thể tích khối chóp, lăng trụ (lesson: 7)

LỚP 10:
- Xác suất cổ điển (subject_area: "D", chapter: 0):
  * Bài 1: Không gian mẫu, biến cố, mô tả không gian mẫu (lesson: 1)
  * Bài 2: Công thức tính xác suất, xác suất của biến cố đối, quy tắc nhân/cộng xác suất cổ điển (lesson: 2)
- Mệnh đề và tập hợp (subject_area: "D", chapter: 1):
  * Bài 1: Mệnh đề, mệnh đề phủ định, tính đúng sai, mệnh đề kéo theo/đảo (lesson: 1)
  * Bài 2: Tập hợp, tập hợp con, hai tập hợp bằng nhau (lesson: 2)
  * Bài 3: Các phép toán trên tập hợp (giao, hợp, hiệu, phần bù trên tập rời rạc hoặc khoảng, đoạn) (lesson: 3)
- Bất phương trình và hệ bất phương trình bậc nhất hai ẩn (subject_area: "D", chapter: 2):
  * Bài 1: Bất phương trình bậc nhất hai ẩn, miền nghiệm (lesson: 1)
  * Bài 2: Hệ bất phương trình bậc nhất hai ẩn, miền nghiệm, toán thực tế tối ưu hóa (lesson: 2)
- Hàm số bậc hai và đồ thị (subject_area: "D", chapter: 3):
  * Bài 1: Hàm số và đồ thị (Tập xác định, tính đồng biến/nghịch biến, đồ thị hàm số thường) (lesson: 1)
  * Bài 2: Hàm số bậc hai (Bảng biến thiên, đỉnh, trục đối xứng, vẽ đồ thị HSBH, cực trị/max/min, tương giao, toán thực tế) (lesson: 2)
- Sai số, số gần đúng, thống kê số liệu không ghép nhóm (subject_area: "D", chapter: 6):
  * Bài 1: Số gần đúng, sai số tuyệt đối, sai số tương đối (lesson: 1)
  * Bài 2: Mô tả và biểu diễn dữ liệu (bảng số liệu, biểu đồ) (lesson: 2)
  * Bài 3: Số đặc trưng đo xu thế trung tâm (số trung bình, trung vị, tứ phân vị, mốt) (lesson: 3)
  * Bài 4: Số đặc trưng đo mức độ phân tán (khoảng biến thiên, khoảng tứ phân vị, phương sai, độ lệch chuẩn, giá trị bất thường) (lesson: 4)
- Tam thức bậc hai và phương trình quy về bậc hai (subject_area: "D", chapter: 7):
  * Bài 1: Dấu của tam thức bậc hai và ứng dụng xét dấu (lesson: 1)
  * Bài 2: Giải bất phương trình bậc hai một ẩn, hệ bất phương trình bậc 2 (lesson: 2)
  * Bài 3: Phương trình quy về phương trình bậc hai (phương trình chứa căn thức √(f(x))=√(g(x)) hoặc √(f(x))=g(x)) (lesson: 3)
- Đại số tổ hợp, Nhị thức Newton (subject_area: "D", chapter: 8):
  * Bài 1: Quy tắc cộng, quy tắc nhân, sơ đồ hình cây (lesson: 1)
  * Bài 2: Hoán vị, chỉnh hợp, tổ hợp (công thức tính và đếm chọn người, vật, xếp chỗ) (lesson: 2)
  * Bài 3: Nhị thức Newton (khai triển, tìm hệ số hoặc số hạng trong khai triển) (lesson: 3)
- Hệ thức lượng trong tam giác (subject_area: "H", chapter: 4):
  * Bài 1: Giá trị lượng giác của một góc từ 0 đến 180 độ, xét dấu, tính giá trị (lesson: 1)
  * Bài 2: Định lý cô-sin, định lý sin trong tam giác (lesson: 2)
  * Bài 3: Giải tam giác, các ứng dụng thực tế và công thức diện tích tam giác (lesson: 3)
- Vectơ trong mặt phẳng (subject_area: "H", chapter: 5):
  * Bài 1: Khái niệm vectơ, phương, hướng, hai vectơ bằng nhau, đối nhau, độ dài (lesson: 1)
  * Bài 2: Tổng và hiệu của hai vectơ (thu gọn đẳng thức, tính độ dài tổng hiệu) (lesson: 2)
  * Bài 3: Tích của một số với vectơ, cùng phương, phân tích một vectơ theo hai vectơ không cùng phương (lesson: 3)
  * Bài 4: Tích vô hướng (chưa xét tọa độ), góc giữa hai vectơ, điều kiện vuông góc, cực trị (lesson: 4)
- Phương pháp tọa độ Oxy (subject_area: "H", chapter: 9):
  * Bài 1: Toạ độ của vectơ và các phép toán vectơ trong mặt phẳng Oxy (lesson: 1)
  * Bài 2: Tích vô hướng theo tọa độ Oxy, góc, độ dài vectơ, điều kiện vuông góc (lesson: 2)
  * Bài 3: Đường thẳng trong mặt phẳng toạ độ (Vectơ pháp tuyến, vectơ chỉ phương, viết phương trình đường thẳng, góc và khoảng cách, vị trí tương đối) (lesson: 3)
  * Bài 4: Đường tròn trong mặt phẳng toạ độ (xác định tâm, bán kính, viết phương trình đường tròn, tiếp tuyến, vị trí tương đối) (lesson: 4)
  * Bài 5: Ba đường conic trong mặt phẳng toạ độ (Elip, Hypebol, Parabol, phương trình chính tắc và các yếu tố đỉnh, tiêu điểm, tiêu cự) (lesson: 5)


QUY TẮC ĐỌC BẢNG (VÔ CÙNG QUAN TRỌNG):
1. CÁCH NHẬN DIỆN VÀ GỘP CÂU HỎI THEO TỪNG PHẦN:
- PHẦN 1 (Trắc nghiệm nhiều phương án): Các dòng có cột "Câu" được ghi bằng SỐ (1, 2, 3, 4...). Mỗi số là 1 câu. Bạn tạo mỗi dòng 1 object với \`phan: 1\`, \`question_type: "multiple_choice"\`.
- PHẦN 2 (Trắc nghiệm Đúng/Sai): Các dòng có cột "Câu" được ghi bằng CHỮ CÁI (a, b, c, d). ĐÂY LÀ ĐIỂM DỄ SAI NHẤT: Cứ 4 dòng a, b, c, d thuộc về MỘT câu hỏi duy nhất! Bạn PHẢI GỘP 4 dòng a,b,c,d này lại thành CHỈ 1 OBJECT (so_luong = 1, \`phan: 2\`, \`question_type: "true_false"\`). Phần \`query_text\` hãy tóm tắt nội dung chung của cả 4 dòng.
- PHẦN 3 (Trả lời ngắn): Các dòng được ghi bằng SỐ (1, 2, 3...). Bạn tạo mỗi dòng 1 object với \`phan: 3\`, \`question_type: "short_answer"\`.
- PHẦN 4 (Tự luận): Các dòng được ghi bài tập tự luận. Bạn tạo mỗi dòng 1 object với \`phan: 4\`, \`question_type: "essay"\`.

2. CÁCH XÁC ĐỊNH SỐ LƯỢNG (so_luong):
- Nếu ô giao giữa dòng và cột mức độ (NB, TH, VD, VDC) ghi dấu X hoặc dấu tích: \`so_luong\` = 1.
- Nếu ô GHI CHỮ SỐ (Ví dụ ghi số 2, 3, 4): \`so_luong\` = CHÍNH SỐ ĐÓ. TUYỆT ĐỐI không mặc định là 1.
- Dòng TỔNG SỐ CÂU: Bạn bắt buộc phải cộng dồn \`so_luong\` của các object lại xem có khớp với dòng Tổng ở cuối bảng không. (Ví dụ ma trận mẫu: Phần 1 có 12 câu, Phần 2 có 4 cụm abcd tương đương 4 câu, Phần 3 có 6 câu).

Các field bắt buộc trong mỗi object của matrix:
- phan: 1, 2, hoặc 3
- query_text: BẮT BUỘC MỞ RỘNG TỪ KHÓA. Đừng chỉ copy tiêu đề ngắn ngủn trong ảnh. Hãy thêm các từ khóa toán học, công thức đặc trưng của dạng bài đó. (Ví dụ ảnh ghi "Phương trình lượng giác cơ bản" -> Bạn ghi: "Phương trình lượng giác cơ bản sinx=m, cosx=m, tìm họ nghiệm, giải phương trình". Ảnh ghi "Cấp số cộng" -> Bạn ghi: "Cấp số cộng, cấp số nhân, công sai, công bội, số hạng tổng quát"). Điều này cực kỳ quan trọng để hệ thống AI tìm đúng câu hỏi!
- grade: 10, 11 hoặc 12 (Tự suy luận dựa theo Cấu trúc chương trình GDPT 2018 nêu trên. Chú ý: Hàm số mũ/logarit thuộc lớp 11. Thống kê: số liệu không ghép nhóm thuộc lớp 10, số đặc trưng đo xu thế trung tâm ghép nhóm thuộc lớp 11, số đặc trưng đo độ phân tán ghép nhóm thuộc lớp 12)
- subject_area: "D" (Đại số), "H" (Hình học), "C" (Chuyên đề)
- chapter: Chương của kiến thức dưới dạng số nguyên (Ví dụ: Nguyên hàm/Tích phân thuộc Lớp 12 Đại số Chương 4 -> chapter: 4; Oxyz thuộc Lớp 12 Hình học Chương 5 -> chapter: 5; Khảo sát hàm số thuộc Lớp 12 Đại số Chương 1 -> chapter: 1; Mũ và Logarit thuộc Lớp 11 Đại số Chương 6 -> chapter: 6).
- lesson: Bài học cụ thể dưới dạng số nguyên (Ví dụ: Nguyên hàm -> lesson: 1; Tích phân -> lesson: 2; Ứng dụng tích phân -> lesson: 3; Phương trình mặt phẳng -> lesson: 2; Phương trình đường thẳng -> lesson: 3; Phương trình mặt cầu -> lesson: 1 hoặc 2 tùy theo bài học).
- variant: Dạng bài cụ thể dưới dạng số nguyên hoặc null. Mỗi bài học (lesson) có thể có nhiều dạng bài (variant). Nếu yêu cầu chỉ định rõ dạng bài cụ thể (ví dụ: "dùng radian" trong PT lượng giác cơ bản → variant: 3, "dùng độ" → variant: 4), hãy ghi số variant. Nếu không rõ hoặc không cần chỉ định dạng bài cụ thể, để null.
- difficulty: "N" (Nhận biết), "H" (Thông hiểu), "V" (Vận dụng), "C" (VD cao)
- question_type: "multiple_choice", "true_false", "short_answer", "essay"
- so_luong: Số lượng câu hỏi

Format JSON bắt buộc (Không chứa text nào khác ngoài JSON này):
{"exam_info":{"title":"...","grade":12,"duration":90},"matrix":[{"phan":1,"query_text":"Hàm số bậc 4 chiều biến thiên nhận biết lớp 12","grade":12,"subject_area":"D","chapter":1,"lesson":1,"variant":null,"difficulty":"N","question_type":"multiple_choice","so_luong":2}]}`

// ── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const prompt = formData.get('prompt') as string | null
    const imageFile = formData.get('image') as File | null

    if (!prompt && !imageFile) {
      return NextResponse.json({ error: 'Cần cung cấp prompt hoặc ảnh ma trận' }, { status: 400 })
    }

    const aiModelName = (formData.get('model') as string) || 'gemini-flash-latest'
    const aiTempStr = formData.get('temperature') as string | null
    const aiTemp = aiTempStr ? parseFloat(aiTempStr) : 0.3

    // Số đề cần tạo (mặc định 1)
    const examCountStr = formData.get('exam_count') as string | null
    const examCount = Math.max(1, Math.min(10, parseInt(examCountStr || '1') || 1))

    const customApiKey = formData.get('custom_api_key') as string | null
    const activeGenAI = customApiKey ? new GoogleGenerativeAI(customApiKey) : genAI

    // ── Bước 1: Gọi Gemini Chat để parse ma trận ──────────────────────────
    const chatModel = activeGenAI.getGenerativeModel({
      model: aiModelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: aiTemp,
      },
    })

    let aiResult
    if (imageFile) {
      const imageBytes = await imageFile.arrayBuffer()
      const base64Image = Buffer.from(imageBytes).toString('base64')
      const isPdf = imageFile.type === 'application/pdf'
      const fileLabel = isPdf ? 'file PDF ma trận' : 'ảnh ma trận'
      const textPrompt = prompt
        ? `${SYSTEM_PROMPT}\n\nYêu cầu bổ sung: ${prompt}\n\nHãy đọc ma trận đề thi trong ${fileLabel} và tạo JSON:`
        : `${SYSTEM_PROMPT}\n\nHãy đọc ma trận đề thi trong ${fileLabel} và tạo JSON theo format trên:`
      aiResult = await chatModel.generateContent([
        textPrompt,
        { inlineData: { data: base64Image, mimeType: imageFile.type } },
      ])
    } else {
      aiResult = await chatModel.generateContent([
        SYSTEM_PROMPT,
        `\n\nYêu cầu của giáo viên:\n${prompt}`,
      ])
    }

    const responseText = aiResult.response.text()

    // Debug: log response in development only
    if (process.env.NODE_ENV === 'development') {
      console.log('[AI Debug] Response length:', responseText.length)
    }

    let examMatrix
    try {
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      examMatrix = JSON.parse(cleaned)
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/)
      if (match) {
        try { examMatrix = JSON.parse(match[0]) }
        catch { return NextResponse.json({ error: 'AI trả về JSON không hợp lệ.', raw: responseText }, { status: 422 }) }
      } else {
        return NextResponse.json({ error: 'AI không thể phân tích yêu cầu.', raw: responseText }, { status: 422 })
      }
    }

    // Nếu AI trả về một mảng (ví dụ: mảng chứa đề gốc và đề tương tự, hoặc nhiều đề)
    if (Array.isArray(examMatrix)) {
      if (examMatrix.length > 1) {
        const similarIndex = examMatrix.findIndex(item => 
          item.exam_info?.title?.toLowerCase().includes('tương tự') || 
          item.exam_info?.title?.toLowerCase().includes('mới') ||
          item.exam_info?.title?.toLowerCase().includes('de tuong tu')
        )
        if (similarIndex !== -1) {
          examMatrix = examMatrix[similarIndex]
        } else {
          examMatrix = examMatrix[examMatrix.length - 1]
        }
      } else if (examMatrix.length > 0) {
        examMatrix = examMatrix[0]
      } else {
        return NextResponse.json({ error: 'AI trả về mảng rỗng.', raw: responseText }, { status: 422 })
      }
    }

    if (!examMatrix || !Array.isArray(examMatrix.matrix)) {
      return NextResponse.json({ 
        error: 'Cấu trúc ma trận AI trả về không hợp lệ (thiếu danh sách matrix).', 
        raw: responseText 
      }, { status: 422 })
    }

    // Chuẩn hóa lại phan: Đảm bảo tự luận luôn là phần 4, trả lời ngắn luôn là phần 3
    examMatrix.matrix.forEach((row: any) => {
      if (row.question_type === 'essay') {
        row.phan = 4;
      } else if (row.question_type === 'short_answer') {
        row.phan = 3;
      }
    });

    // ── Bước 2: Kiểm tra có thể dùng pgvector không ────────────────────────
    const useVector = await hasEmbeddings()

    // ── Bước 3: Bốc câu hỏi cho N đề ──────────────────────────────────────
    // usedIds dùng chung cho tất cả các đề → đảm bảo không trùng câu hỏi giữa các đề
    const globalUsedIds = new Set<string>()
    const totalRequested = examMatrix.matrix.reduce((sum: number, r: { so_luong: number }) => sum + r.so_luong, 0)

    const exams: { questions: Record<string, unknown>[]; stats: { requested: number; found: number; method: string } }[] = []

    for (let examIdx = 0; examIdx < examCount; examIdx++) {
      const questions: Record<string, unknown>[] = []

      for (const row of examMatrix.matrix) {
        const needed = row.so_luong as number
        const fetchCount = needed * 5

        if (useVector && row.query_text) {
          // ── Semantic search qua pgvector ──────────────────────────────────
          try {
            const embedding = await getEmbedding(row.query_text, customApiKey || undefined)
            const vectorStr = `[${embedding.join(',')}]`

            let { data, error } = await supabase.rpc('match_questions', {
              query_embedding: vectorStr,
              match_count: fetchCount * examCount,
              filter_grade: row.grade ?? null,
              filter_subject: row.subject_area ?? null,
              filter_chapter: row.chapter ?? null,
              filter_lesson: row.lesson ?? null,
              filter_difficulty: row.difficulty ?? null,
              filter_type: row.question_type ?? null,
              filter_variant: row.variant ?? null,
            })

            if (error) throw error

            let available = (data || []).filter((q: { id: string }) => !globalUsedIds.has(q.id))

            // Nếu không đủ câu hỏi, thử relax lesson trong vector search (vẫn giữ chapter!)
            if (available.length < needed && row.lesson != null) {
              const relaxedRes = await supabase.rpc('match_questions', {
                query_embedding: vectorStr,
                match_count: fetchCount * examCount,
                filter_grade: row.grade ?? null,
                filter_subject: row.subject_area ?? null,
                filter_chapter: row.chapter ?? null,
                filter_lesson: null,
                filter_difficulty: row.difficulty ?? null,
                filter_type: row.question_type ?? null,
                filter_variant: null,
              })
              if (!relaxedRes.error && relaxedRes.data?.length) {
                const relaxedData = relaxedRes.data.filter((q: { id: string }) => !globalUsedIds.has(q.id))
                const existingIds = new Set(available.map((q: { id: string }) => q.id))
                relaxedData.forEach((q: Record<string, unknown>) => {
                  if (!existingIds.has(q.id as string)) {
                    available.push(q as any)
                  }
                })
              }
            }

            const selected = available.slice(0, needed)
            selected.forEach((q: Record<string, unknown>) => {
              globalUsedIds.add(q.id as string)
              questions.push({ ...q, phan: row.phan, mo_ta: row.mo_ta || row.query_text })
            })

            // Nếu vector search không đủ câu → fallback về exact match
            if (selected.length < needed) {
              console.log(`⚠️ [Đề ${examIdx + 1}] Vector search chỉ tìm được ${selected.length}/${needed} câu cho: ${row.query_text}. Dùng exact match bổ sung.`)
              await exactMatchFill(row, needed - selected.length, globalUsedIds, questions)
            }
            continue
          } catch (vectorErr) {
            console.error('Vector search error, falling back to exact match:', vectorErr)
          }
        }

        // ── Exact match fallback ──────────────────────────────────────────────
        await exactMatchFill(row, needed, globalUsedIds, questions)
      }

      exams.push({
        questions,
        stats: {
          requested: totalRequested,
          found: questions.length,
          method: useVector ? 'semantic_search' : 'exact_match',
        },
      })
    }

    return NextResponse.json({
      exam_info: examMatrix.exam_info,
      matrix: examMatrix.matrix,
      exam_count: examCount,
      // Cho tương thích ngược: Đề đầu tiên vẫn nằm ở root level
      questions: exams[0]?.questions || [],
      stats: exams[0]?.stats || { requested: totalRequested, found: 0, method: useVector ? 'semantic_search' : 'exact_match' },
      // Tất cả các đề (bao gồm cả đề đầu tiên)
      exams,
    })
  } catch (err) {
    console.error('AI Exam error:', err)
    return NextResponse.json(
      { error: 'Lỗi hệ thống: ' + (err instanceof Error ? err.message : 'Unknown') },
      { status: 500 }
    )
  }
}

// ── Helper: Exact match từ Supabase ─────────────────────────────────────────
async function exactMatchFill(
  row: Record<string, unknown>,
  needed: number,
  usedIds: Set<string>,
  questions: Record<string, unknown>[]
) {
  // Tier 1: Strict match including chapter and lesson
  let query = supabase
    .from('questions')
    .select('id, category_code, grade, subject_area, chapter, lesson, variant, difficulty, question_type, correct_answer, has_image, latex_content')
    .eq('grade', row.grade)

  if (row.subject_area) query = query.eq('subject_area', row.subject_area)
  if (row.chapter != null) query = query.eq('chapter', row.chapter)
  if (row.lesson != null) query = query.eq('lesson', row.lesson)
  if (row.variant != null) query = query.eq('variant', row.variant)
  if (row.difficulty) query = query.eq('difficulty', row.difficulty)
  if (row.question_type) query = query.eq('question_type', row.question_type)

  let { data, error } = await query.limit(needed * 10)

  // Tier 2: Fallback (relaxed lesson, but KEEP same chapter)
  if (error || !data?.length) {
    let query2 = supabase
      .from('questions')
      .select('id, category_code, grade, subject_area, chapter, lesson, variant, difficulty, question_type, correct_answer, has_image, latex_content')
      .eq('grade', row.grade)

    if (row.subject_area) query2 = query2.eq('subject_area', row.subject_area)
    if (row.chapter != null) query2 = query2.eq('chapter', row.chapter)
    if (row.difficulty) query2 = query2.eq('difficulty', row.difficulty)
    if (row.question_type) query2 = query2.eq('question_type', row.question_type)

    const res2 = await query2.limit(needed * 10)
    if (!res2.error && res2.data?.length) {
      data = res2.data
      error = null
    }
  }

  // Tier 3: Fallback (relaxed chapter and lesson)
  if (error || !data?.length) {
    let relaxedQuery = supabase
      .from('questions')
      .select('id, category_code, grade, subject_area, chapter, lesson, variant, difficulty, question_type, correct_answer, has_image, latex_content')
      .eq('grade', row.grade)

    if (row.subject_area) relaxedQuery = relaxedQuery.eq('subject_area', row.subject_area)
    if (row.difficulty) relaxedQuery = relaxedQuery.eq('difficulty', row.difficulty)
    if (row.question_type) relaxedQuery = relaxedQuery.eq('question_type', row.question_type)

    const relaxedRes = await relaxedQuery.limit(needed * 10)
    data = relaxedRes.data
    error = relaxedRes.error
  }

  if (error || !data?.length) return

  const available = data.filter((q) => !usedIds.has(q.id as string))
  const shuffled = available.sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, needed)

  selected.forEach((q) => {
    usedIds.add(q.id as string)
    questions.push({ ...q, phan: row.phan, mo_ta: row.mo_ta || row.query_text })
  })
}
