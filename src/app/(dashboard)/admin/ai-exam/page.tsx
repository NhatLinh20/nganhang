'use client'
import { useState, useRef, useCallback, useEffect, Fragment } from 'react'
import Header from '@/components/layout/Header'
import styles from './ai-exam.module.css'
import tableStyles from '../questions/questions.module.css'
import { VARIANT_NAMES, CHAPTER_NAMES, LESSON_NAMES } from '@/lib/curriculum-labels'
import { CURRICULUM } from '../questions/QuestionsClient'
import { createClient } from '@/lib/supabase/client'

interface ExamQuestion {
  id: string
  category_code: string
  grade: number
  subject_area: string
  chapter: number
  lesson: number
  variant: number
  difficulty: string
  question_type: string
  correct_answer: string | null
  has_image: boolean
  latex_content: string
  phan?: number
  mo_ta?: string
}

interface MatrixRow {
  phan: number
  mo_ta: string
  query_text?: string
  grade: number
  subject_area: string
  chapter: number | null
  lesson: number | null
  variant: number | null
  difficulty: string
  question_type: string
  so_luong: number
}

interface ExamExamEntry {
  questions: ExamQuestion[]
  stats: { requested: number; found: number }
}

interface ExamResult {
  exam_info: { title: string; grade: number; duration: number }
  matrix: MatrixRow[]
  questions: ExamQuestion[]
  stats: { requested: number; found: number }
  exam_count?: number
  exams?: ExamExamEntry[]
}

const DIFFICULTY_LABELS: Record<string, string> = {
  N: 'Nhận biết', H: 'Thông hiểu', V: 'Vận dụng', C: 'VD cao'
}
const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'TN', true_false: 'Đ/S', short_answer: 'Ngắn', essay: 'Tự luận'
}
const SUBJECT_LABELS: Record<string, string> = { D: 'Đại số', H: 'Hình học', C: 'Chuyên đề' }
const TYPE_ICONS: Record<string, string> = { multiple_choice: '⏺', true_false: '☑', short_answer: '✍', essay: '📝' }

const EXAMPLE_PROMPTS = [
  'MA TRẬN THI THỬ TỐT NGHIỆP THPT\nPHẦN 1: TRẮC NGHIỆM 4 ĐÁP ÁN (12 CÂU)\n- Câu 1: Phương trình lượng giác cơ bản (Mức độ: Hiểu)\n- Câu 2: Tìm nghiệm của phương trình mũ, logarit cơ bản (Mức độ: Hiểu)\n- Câu 3: Cấp số cộng, cấp số nhân, dãy số (Mức độ: Hiểu)\n- Câu 4: Giá trị lớn nhất, nhỏ nhất của hàm số trên đoạn [a;b] (Mức độ: Hiểu)\n- Câu 5: Số đường tiệm cận đứng, tiệm cận ngang dựa vào bbt (Bảng biến thiên) (Mức độ: Biết)\n- Câu 6: Phép toán vector (Mức độ: Hiểu)\n- Câu 7: Khoảng biến thiên, tìm tứ phân vị (Mức độ: Biết)\n- Câu 8: Họ nguyên hàm (Mức độ: Biết)\n- Câu 9: Tính chất tích phân (Trong hình ghi "Tích chất" - có thể là lỗi đánh máy của "Tính chất") (Mức độ: Hiểu)\n- Câu 10: Diện tích hình phẳng cho bài toán cụ thể (Mức độ: Hiểu)\n- Câu 11: Lập phương trình mặt cầu biết tâm và bán kính (Mức độ: Hiểu)\n- Câu 12: Công thức hoặc bài toán xác suất có điều kiện, toàn phần (Mức độ: Biết)\nPHẦN 2: CÂU HỎI ĐÚNG/SAI (4 BÀI, MỖI BÀI 4 Ý a,b,c,d)\nBÀI 1: Nội dung - Các câu hỏi liên quan đến khảo sát hàm số y = (ax+b)/(cx+d) hoặc y = (ax^2+bx+c)/(mx+n)\n- Ý a: (Mức độ: Biết)\n- Ý b: (Mức độ: Hiểu)\n- Ý c: (Mức độ: Hiểu)\n- Ý d: (Mức độ: Vận dụng thấp)\nBÀI 2: Nội dung - Bài toán thực tế về phương trình đường thẳng, mặt phẳng, mặt cầu trong không gian Oxyz\n- Ý a: (Mức độ: Biết)\n- Ý b: (Mức độ: Hiểu)\n- Ý c: (Mức độ: Hiểu)\n- Ý d: (Mức độ: Vận dụng thấp)\nBÀI 3: Nội dung - Bài toán chuyển động vận dụng đạo hàm, nguyên hàm, tích phân\n- Ý a: (Mức độ: Biết)\n- Ý b: (Mức độ: Hiểu)\n- Ý c: (Mức độ: Hiểu)\n- Ý d: (Mức độ: Vận dụng thấp)\nBÀI 4: Nội dung - Bài toán thực tế về xác suất có điều kiện\n- Ý a: (Mức độ: Biết)\n- Ý b: (Mức độ: Hiểu)\n- Ý c: (Mức độ: Hiểu)\n- Ý d: (Mức độ: Vận dụng thấp)\nPHẦN 3: CÂU HỎI TRẢ LỜI NGẮN (6 CÂU)\n- Câu 1: Tính khoảng cách giữa 2 đường thẳng chéo nhau, đường thẳng với mặt phẳng. Góc của đường thẳng với mặt, mặt với mặt. Góc nhị diện. Thể tích. (Mức độ: Hiểu)\n- Câu 2: Ứng dụng cấp số cộng, cấp số nhân giải quyết bài toán thực tế. (Mức độ: Hiểu)\n- Câu 3: Bài toán về lợi nhuận lớn nhất, chi phí thấp nhất. (Mức độ: Vận dụng thấp)\n- Câu 4: Xác suất cổ điển (Mức độ: Vận dụng cao)\n- Câu 5: Tính diện tích, thể tích (Mức độ: Vận dụng cao)\n- Câu 6: Công thức xác suất toàn phần, công thức Bayes. (Mức độ: Vận dụng thấp)',
  'MA TRẬN ĐỀ THI CUỐI KÌ 2 TOÁN 10\n\nPHẦN I: TRẮC NGHIỆM KHÁCH QUAN (TNKQ) - TỔNG 20 CÂU\n\nCHỦ ĐỀ 1: Phương pháp tọa độ trong mặt phẳng\n- Đường thẳng trong mặt phẳng tọa độ: 1 câu (Mức độ: Biết)\n- Vị trí tương đối giữa hai đường thẳng, Góc và khoảng cách: 2 câu (1 câu Biết, 1 câu Hiểu)\n- Đường tròn trong mặt phẳng tọa độ: 2 câu (1 câu Biết, 1 câu Hiểu)\n- Ba đường conic trong mặt phẳng tọa độ: 2 câu (Mức độ: Biết)\n\nCHỦ ĐỀ 2: Đại số tổ hợp\n- Quy tắc cộng và quy tắc nhân: 3 câu (1 câu Biết, 2 câu Hiểu)\n- Hoán vị, Chỉnh hợp, Tổ hợp: 3 câu (1 câu Biết, 2 câu Hiểu)\n- Nhị thức Newton: 2 câu (1 câu Biết, 1 câu Hiểu)\n\nCHỦ ĐỀ 3: Tính xác suất theo định nghĩa cổ điển\n- Biến cố và định nghĩa cổ điển của xác suất: 3 câu (2 câu Biết, 1 câu Hiểu)\n- Tính xác suất theo định nghĩa cổ điển: 2 câu (Mức độ: Biết)\n\nPHẦN II: TRẮC NGHIỆM ĐÚNG/SAI (Gồm 2 câu hỏi lớn, mỗi câu thường có 4 ý a,b,c,d)\n\n- Câu hỏi 1: Nội dung kết hợp "Quy tắc cộng và quy tắc nhân" & "Hoán vị, Chỉnh hợp, Tổ hợp".\n  Cấu trúc mức độ: Gồm 2 ý mức độ Biết và 2 ý mức độ Hiểu.\n\n- Câu hỏi 2: Nội dung kết hợp "Biến cố và định nghĩa cổ điển của xác suất" & "Tính xác suất theo định nghĩa cổ điển".\n  Cấu trúc mức độ: Gồm 2 ý mức độ Biết và 2 ý mức độ Hiểu.\n\nPHẦN III: TỰ LUẬN\n\nCHỦ ĐỀ 1: Phương pháp tọa độ trong mặt phẳng\n- Câu 1a: Nội dung về "Đường thẳng trong mặt phẳng tọa độ" (Mức độ: Vận dụng - VD)\n- Câu 1b: Nội dung về "Đường tròn trong mặt phẳng tọa độ" (Mức độ: Vận dụng - VD)\n\nCHỦ ĐỀ 2: Đại số tổ hợp\n- Câu 2: Nội dung kết hợp "Quy tắc đếm" và "Hoán vị, Chỉnh hợp, Tổ hợp" (Mức độ: Vận dụng - VD)\n\nCHỦ ĐỀ 3: Tính xác suất theo định nghĩa cổ điển\n- Câu 3: Nội dung kết hợp "Biến cố, định nghĩa cổ điển của xác suất" và "Tính xác suất" (Mức độ: Vận dụng cao - VDC)',
  'MA TRẬN ĐỀ THI CUỐI KÌ 1 TOÁN 11\nTổng quan cấu trúc đề thi (10 điểm):\n- Phần I (Trắc nghiệm nhiều phương án lựa chọn): 20 câu (5.0 điểm)\n- Phần II (Trắc nghiệm Đúng/Sai): 8 ý/câu (2.0 điểm)\n- Phần III (Trắc nghiệm trả lời ngắn/Tự luận): 5 câu (3.0 điểm)\n\nPHẦN I: TRẮC NGHIỆM 4 ĐÁP ÁN (TỔNG 20 CÂU)\n* Mức độ Nhận biết (16 câu):\n- Bài 1. Giá trị lượng giác của góc lượng giác (1 câu)\n- Bài 2. Công thức lượng giác (1 câu)\n- Bài 3. Hàm số lượng giác (1 câu)\n- Bài 4. Phương trình lượng giác cơ bản (1 câu)\n- Bài 5. Dãy số (1 câu)\n- Bài 6. Cấp số cộng (1 câu)\n- Bài 7. Cấp số nhân (1 câu)\n- Bài 8. Mẫu số liệu ghép nhóm (1 câu)\n- Bài 9. Các số đặc trưng đo xu thế trung tâm (1 câu)\n- Bài 10. Đường thẳng và mặt phẳng trong không gian (1 câu)\n- Bài 11. Hai đường thẳng song song (1 câu)\n- Bài 12. Đường thẳng và mặt phẳng song song (1 câu)\n- Bài 13. Hai mặt phẳng song song (1 câu)\n- Bài 14. Phép chiếu song song (1 câu)\n- Bài 16. Giới hạn của hàm số (1 câu)\n- Bài 17. Hàm số liên tục (1 câu)\n\n* Mức độ Thông hiểu (4 câu):\n- Bài 5. Dãy số (1 câu)\n- Bài 9. Các số đặc trưng đo xu thế trung tâm (1 câu)\n- Bài 10. Đường thẳng và mặt phẳng trong không gian (1 câu)\n- Bài 12. Đường thẳng và mặt phẳng song song (1 câu)\n\n\nPHẦN II: CÂU HỎI ĐÚNG/SAI (TỔNG 8 Ý/CÂU)\n* Mức độ Nhận biết (4 ý):\n- Bài 10. Đường thẳng và mặt phẳng trong không gian (1 ý)\n- Bài 13. Hai mặt phẳng song song (1 ý)\n- Bài 15. Giới hạn của dãy số (1 ý)\n- Bài 16. Giới hạn của hàm số (1 ý)\n\n* Mức độ Thông hiểu (4 ý):\n- Bài 11. Hai đường thẳng song song (1 ý)\n- Bài 12. Đường thẳng và mặt phẳng song song (1 ý)\n- Bài 15. Giới hạn của dãy số (1 ý)\n- Bài 16. Giới hạn của hàm số (1 ý)\n\nPHẦN III: CÂU HỎI TRẢ LỜI NGẮN / TỰ LUẬN (TỔNG 5 CÂU)\n\n* Mức độ Vận dụng (4 câu):\n- Bài 10. Đường thẳng và mặt phẳng trong không gian (1 câu)\n- Bài 13. Hai mặt phẳng song song (1 câu)\n- Bài 16. Giới hạn của hàm số (1 câu)\n- Bài 17. Hàm số liên tục (1 câu)\n\n* Mức độ Vận dụng cao (1 câu):\n- Bài 15. Giới hạn của dãy số (1 câu)',
  'Đề thi bao gồm 3 phần: Phần I (Trắc nghiệm 4 đáp án), Phần II (Trắc nghiệm Đúng/Sai), và Phần III (Tự luận).\n\n⬛ PHẦN I: TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN\n\n(Gồm 20 câu, mỗi câu 0,25 điểm. Học sinh chọn 1 đáp án đúng trong 4 đáp án A, B,\nC, D)\n\nKhối 1: Chương I - Mệnh đề và Tập hợp (6 câu)\n\n  - Câu 1, Câu 2 (Nhận biết): Phát biểu/nhận diện các mệnh đề toán học cơ bản\n    (mệnh đề phủ định, đảo, tương đương, chứa kí hiệu \\\\forall, \\\\exists, điều\n    kiện cần/đủ).\n  - Câu 3, Câu 4 (Nhận biết): Nhận biết các khái niệm cơ bản về tập hợp (tập\n    con, tập rỗng, hai tập hợp bằng nhau) và nhận diện cách sử dụng các kí hiệu\n    \\\\subset, \\\\supset, \\\\emptyset.\n  - Câu 5 (Thông hiểu): Thực hiện phép toán trên tập hợp (hợp, giao, hiệu, phần\n    bù) hoặc dùng biểu đồ Ven để biểu diễn trong trường hợp cụ thể.\n  - Câu 6 (Vận dụng): Giải quyết một bài toán thực tế đơn giản gắn với phép toán\n    tập hợp (ví dụ: bài toán đếm số phần tử của hợp các tập hợp).\n\nKhối 2: Chương II - Bất phương trình và Hệ Bất phương trình bậc nhất 2 ẩn (7\ncâu)\n\n  - Câu 7, Câu 8 (Nhận biết): Nhận diện/định dạng đúng bất phương trình bậc nhất\n    hai ẩn.\n  - Câu 9, Câu 10 (Thông hiểu): Biểu diễn hoặc nhận diện miền nghiệm của bất\n    phương trình bậc nhất hai ẩn trên mặt phẳng tọa độ.\n  - Câu 11, Câu 12 (Nhận biết): Nhận diện/định dạng đúng hệ bất phương trình bậc\n    nhất hai ẩn.\n  - Câu 13 (Thông hiểu): Biểu diễn hoặc nhận diện miền nghiệm của hệ bất phương\n    trình bậc nhất hai ẩn trên mặt phẳng tọa độ.\n\nKhối 3: Chương III - Hệ thức lượng trong tam giác (7 câu)\n\n  - Câu 14, Câu 15 (Nhận biết): Nhận biết giá trị lượng giác của một góc từ\n    0^\\\\circ đến 180^\\\\circ (thường là các góc đặc biệt).\n  - Câu 16 (Thông hiểu): Tính giá trị lượng giác bằng máy tính cầm tay hoặc áp\n    dụng mối liên hệ giữa các góc phụ nhau, bù nhau.\n  - Câu 17, Câu 18 (Nhận biết): Nhận biết các hệ thức lượng cơ bản trong tam\n    giác (định lí sin, định lí côsin, công thức tính diện tích).\n  - Câu 19, Câu 20 (Thông hiểu): Áp dụng định lí sin, định lí côsin, công thức\n    diện tích để tính toán các đại lượng cơ bản trong tam giác.\n\n⬛ PHẦN II: TRẮC NGHIỆM ĐÚNG/SAI\n\n(Gồm 2 câu lớn, mỗi câu có 4 ý a, b, c, d. Học sinh xét tính Đúng/Sai cho từng\ný. Tổng 2.0 điểm)\n\nKhối 4: Câu 1 - Thuộc chủ đề Tập hợp\n\n  - Ý a (Nhận biết): Xét tính đúng/sai của một mệnh đề hoặc nhận diện khái niệm,\n    kí hiệu tập hợp.\n  - Ý b, c (Thông hiểu): Xét tính đúng/sai của kết quả khi thực hiện các phép\n    toán trên tập hợp (giao, hợp, hiệu, phần bù).\n  - Ý d (Vận dụng): Giải quyết một vấn đề phức tạp hơn về tập hợp (ví dụ: tìm\n    điều kiện của tham số để hai tập hợp có giao khác rỗng, hoặc bài toán tập\n    hợp ở mức độ khó hơn).\n\nKhối 5: Câu 2 - Thuộc chủ đề Lượng giác và Hệ thức lượng\n\n  - Ý a (Thông hiểu - Bài 5): Xét tính đúng/sai của một đẳng thức lượng giác dựa\n    vào tính chất góc bù nhau, phụ nhau.\n  - Ý b (Nhận biết - Bài 6): Xét tính đúng/sai của một công thức hệ thức lượng\n    (định lí Sin, Cosin...).\n  - Ý c, d (trong ảnh ghi nhầm là 2d, e) (Thông hiểu - Bài 6): Tính toán cụ thể\n    một cạnh, một góc hoặc diện tích tam giác và xét xem kết quả đưa ra đúng hay\n    sai.\n\n⬛ PHẦN III: TỰ LUẬN\n\n(Gồm 3 câu lớn, học sinh trình bày lời giải chi tiết. Tổng 3.0 điểm)\n\nKhối 6: Bài tập Vận dụng & Vận dụng cao\n\n  - Câu 1 (1.0 điểm): Chia làm 2 ý nhỏ\n\n      - Câu 1a (0.5 điểm - Vận dụng): Bài tập về tập hợp. Yêu cầu học sinh vận\n        dụng các khái niệm và phép toán tập hợp để giải một bài toán (có thể\n        là dạng toán đếm bằng biểu đồ Ven hoặc tìm giao/hợp của các tập hợp\n        số).\n      - Câu 1b (0.5 điểm - Vận dụng): Bài tập về Giá trị lượng giác. Yêu cầu\n        tính toán, rút gọn biểu thức hoặc chứng minh một hệ thức lượng giác có\n        độ phức tạp vừa phải.\n\n  - Câu 2 (1.0 điểm - Vận dụng):\n\n      - Chủ đề: Hệ bất phương trình bậc nhất hai ẩn.\n      - Nội dung: Đây là dạng bài toán tối ưu hóa thực tế. Học sinh phải từ đề\n        bài thực tế lập ra hệ bất phương trình, vẽ miền nghiệm (đa giác) và tìm\n        giá trị lớn nhất/nhỏ nhất của biểu thức F = ax + by (ví dụ: bài toán tìm\n        chi phí thấp nhất, lợi nhuận cao nhất).\n\n  - Câu 3 (1.0 điểm - Vận dụng cao):\n\n      - Chủ đề: Hệ thức lượng trong tam giác.\n      - Nội dung: Bài toán thực tiễn phức hợp. Mô tả cách giải tam giác để giải\n        quyết các vấn đề như: xác định khoảng cách giữa hai địa điểm có vật cản,\n        xác định chiều cao của một tòa nhà/ngọn núi khi không thể đo trực\n        tiếp,... Yêu cầu học sinh phải tự dựng hình hoặc mô hình hóa bài toán\n        thực tế về tam giác để áp dụng định lí Sin, Cosin.'
]

const dataURLtoFile = (dataurl: string, filename: string): File => {
  const arr = dataurl.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], filename, { type: mime })
}

// Generate a random 4-digit exam code (1000-9999)
const generateExamCode = (): string => {
  return String(Math.floor(1000 + Math.random() * 9000))
}

// Generate N unique random 4-digit exam codes
const generateUniqueExamCodes = (count: number): string[] => {
  const codes = new Set<string>()
  while (codes.size < count) {
    codes.add(generateExamCode())
  }
  return Array.from(codes)
}

export default function AiExamPage() {
  const [activeTab, setActiveTab] = useState<'chat' | 'upload'>('chat')
  const [prompt, setPrompt] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [result, setResult] = useState<ExamResult | null>(null)
  const [questions, setQuestions] = useState<ExamQuestion[]>([])

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [swappingId, setSwappingId] = useState<string | null>(null)
  const [swappedOutIds, setSwappedOutIds] = useState<string[]>([])

  // Export modal states
  const [showExportModal, setShowExportModal] = useState(false)
  const [headerLabels, setHeaderLabels] = useState<string[]>([
    'SỞ GDĐT ...',
    'TRƯỜNG THPT ...',
    '(Đề gồm ... trang, ... câu)',
    'ĐỀ KIỂM TRA HỌC KỲ',
    'Môn: TOÁN 12',
    'Thời gian làm bài: 90 phút (không kể thời gian phát đề)'
  ])
  const [examCodes, setExamCodes] = useState<string[]>([''])

  // Multi-exam states
  const [examCount, setExamCount] = useState(1)
  const [activeExamIndex, setActiveExamIndex] = useState(0)
  const [allExamsQuestions, setAllExamsQuestions] = useState<ExamQuestion[][]>([])
  
  // Custom Swap Modal states
  const [customSwapQuestion, setCustomSwapQuestion] = useState<ExamQuestion | null>(null)
  const [customAddPhan, setCustomAddPhan] = useState<number | null>(null)
  const [customGrade, setCustomGrade] = useState<number>(12)
  const [customSubject, setCustomSubject] = useState<string>('D')
  const [customChapter, setCustomChapter] = useState<string>('')
  const [customLesson, setCustomLesson] = useState<string>('')
  const [customType, setCustomType] = useState<string>('multiple_choice')
  const [customDifficulty, setCustomDifficulty] = useState<string>('H')
  const [customVariant, setCustomVariant] = useState<string>('')
  
  // AI Settings state
  const [aiModel, setAiModel] = useState('gemini-3.5-flash')
  const [temperature, setTemperature] = useState('0.7')
  const [customApiKey, setCustomApiKey] = useState('')
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isLoaded, setIsLoaded] = useState(false)
  const [userRole, setUserRole] = useState('')

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      setUserRole(data?.user?.user_metadata?.role || '')
    }
    fetchUser()
  }, [])

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ai-exam-state')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.activeTab) setActiveTab(parsed.activeTab)
        if (parsed.prompt !== undefined) setPrompt(parsed.prompt)
        if (parsed.imagePreview) {
          setImagePreview(parsed.imagePreview)
          try {
            const file = dataURLtoFile(parsed.imagePreview, 'matrix_image.png')
            setImageFile(file)
          } catch (e) {
            console.error('Error restoring image file:', e)
          }
        }
        if (parsed.result !== undefined) setResult(parsed.result)
        if (parsed.questions !== undefined) setQuestions(parsed.questions)
        if (parsed.swappedOutIds !== undefined) setSwappedOutIds(parsed.swappedOutIds)
        if (parsed.headerLabels !== undefined) setHeaderLabels(parsed.headerLabels)
        if (parsed.examCodes !== undefined) setExamCodes(parsed.examCodes)
        if (parsed.examCount !== undefined) setExamCount(parsed.examCount)
        if (parsed.activeExamIndex !== undefined) setActiveExamIndex(parsed.activeExamIndex)
        if (parsed.allExamsQuestions !== undefined) setAllExamsQuestions(parsed.allExamsQuestions)
        if (parsed.aiModel) {
          if (parsed.aiModel.includes('pro')) {
            setAiModel('gemini-3.5-flash')
          } else {
            setAiModel(parsed.aiModel)
          }
        }
        if (parsed.temperature !== undefined) setTemperature(parsed.temperature)
      }
    } catch (e) {
      console.error('Failed to load state', e)
    }
    setIsLoaded(true)
  }, [])

  // Save state to localStorage when states change
  useEffect(() => {
    if (!isLoaded) return

    const stateToSave = {
      activeTab,
      prompt,
      headerLabels,
      examCodes,
      imagePreview,
      result,
      questions,
      swappedOutIds,
      aiModel,
      temperature,
      examCount,
      activeExamIndex,
      allExamsQuestions
    }
    try {
      localStorage.setItem('ai-exam-state', JSON.stringify(stateToSave))
    } catch (e) {
      console.error('Failed to save state', e)
    }
  }, [activeTab, prompt, imagePreview, result, questions, swappedOutIds, aiModel, temperature, isLoaded, examCount, activeExamIndex, allExamsQuestions, headerLabels, examCodes])

  // Reset all states and clear localStorage
  const handleReset = () => {
    if (window.confirm('Bạn có chắc chắn muốn làm mới trang? Toàn bộ dữ liệu đang làm việc sẽ bị xóa.')) {
      localStorage.removeItem('ai-exam-state')
      setActiveTab('chat')
      setPrompt('')
      setImageFile(null)
      setImagePreview(null)
      setResult(null)
      setQuestions([])
      setSwappedOutIds([])
      setExpandedId(null)
      setActiveExamIndex(0)
      setAllExamsQuestions([])

    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleGenerate()
    }
  }

  // Handle image drop/select
  const handleImageSelect = useCallback((file: File) => {
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
      handleImageSelect(file)
    }
  }, [handleImageSelect])

  // Generate exam
  const handleGenerate = async () => {
    if (!prompt.trim() && !imageFile) return

    setLoading(true)
    setLoadingStep(1)
    setResult(null)
    setSwappedOutIds([])
    setActiveExamIndex(0)
    setAllExamsQuestions([])

    try {
      const formData = new FormData()
      if (prompt.trim()) formData.append('prompt', prompt)
      if (imageFile) formData.append('image', imageFile)
      
      // Append AI settings so backend could use them (optional)
      formData.append('model', aiModel)
      formData.append('temperature', temperature)
      formData.append('exam_count', String(examCount))
      if (customApiKey.trim()) {
        formData.append('custom_api_key', customApiKey.trim())
      }

      setLoadingStep(2)
      const res = await fetch('/api/ai/create-exam', {
        method: 'POST',
        body: formData,
      })

      setLoadingStep(3)
      const data = await res.json()

      if (!res.ok) {
        alert('❌ Lỗi: ' + (data.error || 'Không rõ lỗi'))
        return
      }

      setResult(data)

      // Khi có nhiều đề, lưu tất cả và hiển thị đề đầu tiên
      if (data.exams && data.exams.length > 1) {
        const allQs = data.exams.map((e: ExamExamEntry) => e.questions as ExamQuestion[])
        setAllExamsQuestions(allQs)
        setQuestions(allQs[0])
        setActiveExamIndex(0)
        // Generate unique random 4-digit exam codes
        const codes = generateUniqueExamCodes(allQs.length)
        setExamCodes(codes)
      } else {
        setAllExamsQuestions([data.questions])
        setQuestions(data.questions)
        setActiveExamIndex(0)
        setExamCodes([generateExamCode()])
      }
    } catch (err) {
      alert('Lỗi kết nối: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setLoading(false)
      setLoadingStep(0)
    }
  }

  // Sync current questions back to allExamsQuestions when they change
  useEffect(() => {
    if (allExamsQuestions.length > 0 && questions.length > 0) {
      setAllExamsQuestions(prev => {
        if (prev[activeExamIndex] === questions) return prev
        const next = [...prev]
        next[activeExamIndex] = questions
        return next
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions])

  // Remove a question
  const handleRemoveQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id))
  }

  // Swap a question with another of the same type
  const handleSwapQuestion = async (question: ExamQuestion) => {
    if (swappingId) return
    setSwappingId(question.id)

    try {
      const matrixRow = result?.matrix?.find(
        (r: MatrixRow) =>
          r.question_type === question.question_type &&
          r.difficulty === question.difficulty &&
          r.phan === question.phan
      )

      const res = await fetch('/api/ai/swap-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: question.grade,
          subject_area: question.subject_area,
          chapter: question.chapter,
          lesson: question.lesson,
          difficulty: question.difficulty,
          question_type: question.question_type,
          excludeIds: [...questions.map(q => q.id), ...swappedOutIds],
          query_text: matrixRow?.query_text || matrixRow?.mo_ta || '',
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert('\u26a0\ufe0f ' + (data.error || 'Kh\u00f4ng th\u1ec3 thay th\u1ebf c\u00e2u h\u1ecfi.'))
        return
      }

      setQuestions(prev =>
        prev.map(q =>
          q.id === question.id
            ? { ...data.question, phan: question.phan, mo_ta: question.mo_ta }
            : q
        )
      )
      setSwappedOutIds(prev => [...prev, question.id])
    } catch (err) {
      alert('L\u1ed7i k\u1ebft n\u1ed1i: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setSwappingId(null)
    }
  }

  // Custom Swap a question with user-defined parameters
  const handleCustomAddQuestion = async () => {
    if (customAddPhan === null) return
    const phan = customAddPhan
    setCustomAddPhan(null) // Close modal
    
    if (swappingId) return
    setSwappingId('adding_new')

    try {
      const res = await fetch('/api/ai/swap-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: customGrade,
          subject_area: customSubject,
          chapter: customChapter ? parseInt(customChapter) : null,
          lesson: customLesson ? parseInt(customLesson) : null,
          variant: customVariant ? parseInt(customVariant) : null,
          difficulty: customDifficulty,
          question_type: customType,
          excludeIds: [...questions.map(q => q.id), ...swappedOutIds],
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert('⚠️ ' + (data.error || 'Không tìm thấy câu hỏi phù hợp với bộ lọc.'))
        return
      }

      setQuestions(prev => [
        ...prev,
        {
          ...data.question,
          phan: phan,
          mo_ta: `Thêm mới tùy chỉnh (${customGrade} - Bài ${customLesson || '?'}${customVariant ? ` - Dạng ${customVariant}` : ''})`
        }
      ])
    } catch (err) {
      alert('Lỗi kết nối: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setSwappingId(null)
    }
  }

  const handleCustomSwapQuestion = async () => {
    if (!customSwapQuestion) return
    const targetQ = customSwapQuestion
    setCustomSwapQuestion(null) // Close modal
    
    if (swappingId) return
    setSwappingId(targetQ.id)

    try {
      const res = await fetch('/api/ai/swap-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: customGrade,
          subject_area: customSubject,
          chapter: customChapter ? parseInt(customChapter) : null,
          lesson: customLesson ? parseInt(customLesson) : null,
          variant: customVariant ? parseInt(customVariant) : null,
          difficulty: customDifficulty,
          question_type: customType,
          excludeIds: [...questions.map(q => q.id), ...swappedOutIds],
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert('⚠️ ' + (data.error || 'Không tìm thấy câu hỏi phù hợp với bộ lọc.'))
        return
      }

      setQuestions(prev =>
        prev.map(q =>
          q.id === targetQ.id
            ? { ...data.question, phan: targetQ.phan, mo_ta: `Thay đổi tùy chỉnh (${customGrade} - Bài ${customLesson || '?'}${customVariant ? ` - Dạng ${customVariant}` : ''})` }
            : q
        )
      )
      setSwappedOutIds(prev => [...prev, targetQ.id])
    } catch (err) {
      alert('Lỗi kết nối: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setSwappingId(null)
    }
  }



  // Export created exam as a ZIP containing main.tex, khaibaochung.tex, ma_tran_de_thi_toanN.tex and sty packages
  const handleExportTex = async () => {
    if (questions.length === 0) return;

    const currentAllExams = [...allExamsQuestions];
    if (currentAllExams.length > 0) currentAllExams[activeExamIndex] = questions;

    // --- GIỚI HẠN GIÁO VIÊN: TỐI ĐA 30 CÂU/ĐỀ VÀ TỪNG PHẦN ---
    if (userRole !== 'admin') {
      const examsToCheck = currentAllExams.length > 0 ? currentAllExams : [questions];
      
      for (let i = 0; i < examsToCheck.length; i++) {
        const qs = examsToCheck[i];
        
        // Giới hạn tổng
        if (qs.length > 30) {
          alert('Tài khoản giáo viên chỉ được phép xuất tối đa 30 câu/đề. Vui lòng giảm số lượng câu hỏi và thử lại.');
          return;
        }

        // Giới hạn từng phần
        const mcCount = qs.filter(q => q.question_type === 'multiple_choice').length;
        const tfCount = qs.filter(q => q.question_type === 'true_false').length;
        const saCount = qs.filter(q => q.question_type === 'short_answer').length;
        const esCount = qs.filter(q => q.question_type === 'essay').length;

        if (mcCount > 25 || tfCount > 4 || saCount > 6 || esCount > 6) {
          alert(`Tài khoản giáo viên bị giới hạn số câu ở đề số ${i+1}:\n- Trắc nghiệm: tối đa 25 câu (đang có ${mcCount})\n- Đúng/Sai: tối đa 4 câu (đang có ${tfCount})\n- Trả lời ngắn: tối đa 6 câu (đang có ${saCount})\n- Tự luận: tối đa 6 câu (đang có ${esCount})\n\nVui lòng giảm bớt câu hỏi để tiếp tục.`);
          return;
        }
      }
    }

    const title = result?.exam_info?.title || 'Đề thi mới';
    
    try {
      const bodyPayload: Record<string, unknown> = {
        title: title,
        headerLabels: headerLabels,
        examCodes: examCodes,
        duration: result?.exam_info?.duration || 90,
        grade: result?.exam_info?.grade || 12,
      };

      if (currentAllExams.length > 1) {
        // Multi-exam: gửi tất cả các đề
        bodyPayload.exams = currentAllExams.map(qs => ({
          questions: qs.map(q => ({
            id: q.id,
            latex_content: q.latex_content,
            question_type: q.question_type,
            phan: q.phan,
          })),
        }));
      } else {
        // Single exam
        bodyPayload.questions = questions.map(q => ({
          id: q.id,
          latex_content: q.latex_content,
          question_type: q.question_type,
          phan: q.phan,
        }));
      }

      const res = await fetch('/api/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      if (!res.ok) {
        const json = await res.json();
        alert('❌ Xuất ZIP thất bại: ' + (json.error || 'Lỗi chưa xác định'));
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Standardize filename
      const sanitizedTitle = title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove tone marks
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .toLowerCase();

      link.download = `${sanitizedTitle || 'exam_package'}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Lỗi kết nối: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  };

  // Get available chapters for the selected custom grade and subject
  const customChaptersMap = CURRICULUM[customGrade]?.[customSubject] || {}
  const availableChapters = Object.keys(customChaptersMap).map(Number)
  
  // Get available lessons for the selected chapter
  const customLessonsMap = (customChapter !== '' && customChaptersMap[Number(customChapter)]) || {}
  const availableLessons = Object.keys(customLessonsMap).map(Number)

  // Get available variants for the selected custom lesson
  const availableVariants = CURRICULUM[customGrade]?.[customSubject]?.[Number(customChapter)]?.[Number(customLesson)] || []


  // Group questions by phan
  const grouped = questions.reduce((acc, q) => {
    const key = q.phan ?? 0
    if (!acc[key]) acc[key] = []
    acc[key].push(q)
    return acc
  }, {} as Record<number, ExamQuestion[]>)

  return (
    <div className={styles.page}>
      <Header
        title="AI Tạo Đề Thi"
        subtitle="Tạo đề từ ma trận, tạo đề tương tự từ đề có sẵn bằng file ảnh/PDF"
        actions={
          <button
            onClick={handleReset}
            className={styles.resetBtn}
            title="Làm mới trang (Xóa toàn bộ dữ liệu đang làm việc)"
          >
            🧹 Làm mới
          </button>
        }
      />

      <div className={styles.layout}>
        {/* ═══ LEFT PANEL ═══ */}
        <div className={styles.leftPanel}>


          <div className={styles.chatContainer}>
            {/* Number of Exams - Moved to top */}
            <div style={{ padding: '10px 14px', margin: '16px 16px 0 16px', display: 'flex', alignItems: 'center', gap: '12px', background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
              <div className={styles.settingsLabel} style={{ margin: 0, color: '#1e40af' }}>Số đề cần tạo:</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number"
                  min={1}
                  max={userRole !== 'admin' ? 4 : 20}
                  value={examCount}
                  onChange={(e) => {
                    let v = parseInt(e.target.value) || 1
                    if (userRole !== 'admin' && v > 4) v = 4
                    setExamCount(Math.max(1, v))
                  }}
                  style={{
                    width: '64px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid #93c5fd',
                    fontSize: '14px',
                    textAlign: 'center',
                    background: 'white',
                    color: '#1e3a8a',
                    fontWeight: 600,
                  }}
                />
                <span style={{ fontSize: '13px', color: '#1e40af', fontWeight: 500 }}>đề (tối đa {userRole !== 'admin' ? 4 : 20})</span>
              </div>
            </div>

            {/* Unified Input Area */}
            <div className={styles.chatInputArea}>
              <div 
                className={`${styles.chatInputWrapper} ${isDragging ? styles.chatInputWrapperDragging : ''}`}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
              >
                {/* Image Thumbnail inside input box */}
                {imagePreview && (
                  <div className={styles.imageThumbnailContainer}>
                    <div className={styles.imageThumbnailWrapper}>
                      {imageFile?.type === 'application/pdf' ? (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          background: '#f1f5f9',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13px',
                          color: '#334155',
                          fontWeight: 500,
                          maxWidth: '220px',
                        }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                          </svg>
                          <span style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {imageFile.name}
                          </span>
                        </div>
                      ) : (
                        <img src={imagePreview} className={styles.imageThumbnail} alt="Preview" />
                      )}
                      <button 
                        type="button"
                        className={styles.imageThumbnailRemoveBtn} 
                        onClick={() => { setImageFile(null); setImagePreview(null) }}
                        title="Xóa file"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                <textarea
                  className={styles.chatInputTextarea}
                  placeholder={isDragging ? "Kéo thả ảnh hoặc file PDF ma trận vào đây..." : "Nhập yêu cầu đề thi hoặc kéo thả ảnh/file PDF ma trận tại đây..."}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                
                <div className={styles.chatInputBottom}>
                  <div className={styles.chatInputLeftActions}>
                    {imageFile && (
                      <span className={styles.imageAttachedBadge}>
                        📎 {imageFile.name}
                      </span>
                    )}
                  </div>
                  <div className={styles.chatInputRightActions}>
                    <button
                      type="button"
                      className={styles.chatActionBtn}
                      title="Tính năng giọng nói (Chưa khả dụng)"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={styles.chatActionBtn}
                      title="Đính kèm ảnh hoặc file PDF ma trận"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) handleImageSelect(file)
                      }}
                    />
                    <button
                      type="button"
                      className={styles.unifiedRunBtn}
                      onClick={handleGenerate}
                      disabled={loading || (!prompt.trim() && !imageFile)}
                      title="Tạo đề thi bằng AI (Ctrl + Enter)"
                    >
                      {loading ? 'Đang chạy...' : 'Chạy AI ↵'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI Settings (Mimicking Google AI Studio) */}
          <div className={styles.aiSettings}>
            <div className={styles.settingsGroup} style={{ background: '#fce7f3', border: '1px solid #fbcfe8', borderRadius: '8px', padding: '12px' }}>
              <div className={styles.settingsLabel} style={{ color: '#be185d' }}>Model Selection</div>
              <select 
                className={styles.selectBox} 
                value={aiModel} 
                onChange={(e) => setAiModel(e.target.value)}
                style={{ 
                  background: 'white', 
                  color: '#9d174d', 
                  borderColor: '#f9a8d4', 
                  fontWeight: 500,
                  marginTop: '8px'
                }}
              >
                <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                <option value="gemini-flash-latest">Gemini Flash Latest</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              </select>
              <div className={styles.settingsLabel} style={{ color: '#be185d', marginTop: '12px' }}>API Key (không bắt buộc)</div>
              <input 
                type="password"
                className={styles.selectBox}
                placeholder="Nhập API Key của bạn..."
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                style={{ 
                  background: 'white', 
                  color: '#9d174d', 
                  borderColor: '#f9a8d4', 
                  fontWeight: 400,
                  marginTop: '8px'
                }}
              />
              <div style={{ fontSize: '12px', color: '#be185d', marginTop: '8px', lineHeight: '1.4' }}>
                Không bắt buộc, trang web có sẵn API key hoặc bạn có thể tự nhập API key cá nhân của mình (dùng trong trường hợp sever quá tải)
              </div>
            </div>


            <div className={styles.settingsGroup}>
              <div className={styles.settingsLabel}>Temperature</div>
              <div className={styles.sliderRow}>
                <input 
                  type="range" 
                  min="0" max="2" step="0.1" 
                  value={temperature} 
                  onChange={(e) => setTemperature(e.target.value)}
                  className={styles.sliderInput} 
                />
                <span className={styles.sliderValue}>{temperature}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT PANEL ═══ */}
        <div className={styles.rightPanel}>
          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.loadingSpinner} />
              <div className={styles.loadingText}>
                {loadingStep === 1 && 'Đang gửi yêu cầu đến Gemini AI...'}
                {loadingStep === 2 && 'Gemini đang phân tích và tạo ma trận...'}
                {loadingStep === 3 && `Đang bốc câu hỏi từ ngân hàng${examCount > 1 ? ` cho ${examCount} đề...` : '...'}`}
              </div>
              <div className={styles.loadingSteps}>
                <div style={{ 
                  width: '100%', 
                  maxWidth: '320px', 
                  height: '10px', 
                  background: 'var(--color-gray-200)', 
                  borderRadius: '5px', 
                  overflow: 'hidden', 
                  margin: '16px auto 0' 
                }}>
                  <div style={{ 
                    height: '100%', 
                    background: 'var(--color-primary-600)', 
                    width: loadingStep === 1 ? '33%' : loadingStep === 2 ? '66%' : loadingStep === 3 ? '100%' : '0%',
                    transition: 'width 0.5s ease-in-out',
                    borderRadius: '5px'
                  }} />
                </div>
              </div>
            </div>
          ) : !result ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px' }}>
              {/* Quick Suggestions at Top Left */}
              <div className={styles.exampleSection} style={{ borderBottom: 'none', width: '100%', maxWidth: '600px', padding: 0 }}>
                <div className={styles.exampleLabel} style={{ textAlign: 'left', marginBottom: '12px' }}>💡 HOẶC BẤM VÀO CÁC GỢI Ý NHANH DƯỚI ĐÂY:</div>
                <div className={styles.exampleChips}>
                  {EXAMPLE_PROMPTS.map((ex, i) => (
                    <button
                      key={i}
                      className={styles.exampleChip}
                      onClick={() => setPrompt(ex)}
                    >
                      {ex.slice(0, 80)}...
                    </button>
                  ))}
                </div>
              </div>

              {/* Centered Empty State */}
              <div className={styles.emptyState} style={{ padding: 0, marginTop: 'auto', marginBottom: 'auto' }}>
                <div className={styles.emptyIcon}>🤖</div>
                <div className={styles.emptyTitle}>Sẵn sàng tạo đề thi</div>
                <div className={styles.emptySubtitle}>
                  Nhập yêu cầu đề thi hoặc upload ảnh ma trận ở bên trái.<br />
                  Hoặc bạn có thể mô tả chi tiết từng câu giống như gợi ý nhanh phía trên.
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.resultPanel}>
              {/* Result Toolbar */}
              <div className={styles.resultToolbar}>
                <div>
                  <div className={styles.resultTitle}>
                    {result.exam_info?.title || 'Đề thi mới'}
                    {allExamsQuestions.length > 1 && (
                      <span style={{ fontSize: '14px', fontWeight: 400, color: '#64748b', marginLeft: '8px' }}>
                        — Đề {activeExamIndex + 1}/{allExamsQuestions.length}
                      </span>
                    )}
                  </div>
                  <div className={styles.resultStats}>
                    <div className={styles.statBadge}>
                      Yêu cầu <span className={styles.count}>{result.stats.requested} câu</span>
                    </div>
                    <div className={styles.statBadge}>
                      Đã bốc <span className={result.stats.found < result.stats.requested ? styles.countWarn : styles.count}>{questions.length} câu</span>
                    </div>
                    {result.exam_info?.duration && (
                      <div className={styles.statBadge}>
                        ⏱ {result.exam_info.duration} phút
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles.resultActions}>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={handleGenerate}
                    disabled={loading}
                  >
                    🔄 Bốc lại
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      // Ensure exam codes exist for all exams
                      const numExams = allExamsQuestions.length || 1
                      if (examCodes.length !== numExams || examCodes.some(c => !c)) {
                        const newCodes = generateUniqueExamCodes(numExams)
                        // Preserve existing valid codes
                        const merged = newCodes.map((nc, i) => (examCodes[i] && examCodes[i].length === 4) ? examCodes[i] : nc)
                        setExamCodes(merged)
                      }
                      setShowExportModal(true)
                    }}
                    disabled={questions.length === 0}
                    style={{ background: '#10b981', color: 'white', border: 'none' }}
                  >
                    📥 Xuất LaTeX (.tex)
                  </button>

                </div>
              </div>

              {/* Exam Tabs (when multiple exams) */}
              {allExamsQuestions.length > 1 && (
                <div style={{
                  display: 'flex',
                  gap: '0',
                  padding: '0 16px',
                  background: '#f1f5f9',
                  borderBottom: '2px solid #e2e8f0',
                  overflowX: 'auto',
                }}>
                  {allExamsQuestions.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        // Lưu lại câu hỏi hiện tại vào mảng trước khi chuyển tab
                        setAllExamsQuestions(prev => {
                          const next = [...prev]
                          next[activeExamIndex] = questions
                          return next
                        })
                        setActiveExamIndex(idx)
                        setQuestions(allExamsQuestions[idx])
                        setExpandedId(null)
                      }}
                      style={{
                        padding: '10px 20px',
                        fontSize: '13px',
                        fontWeight: activeExamIndex === idx ? 700 : 500,
                        color: activeExamIndex === idx ? '#0369a1' : '#64748b',
                        background: activeExamIndex === idx ? 'white' : 'transparent',
                        border: 'none',
                        borderBottom: activeExamIndex === idx ? '2px solid #0369a1' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        whiteSpace: 'nowrap',
                        marginBottom: '-2px',
                      }}
                    >
                      📋 Đề {idx + 1}
                      <span style={{
                        marginLeft: '6px',
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        background: activeExamIndex === idx ? '#dbeafe' : '#e2e8f0',
                        color: activeExamIndex === idx ? '#0369a1' : '#64748b',
                      }}>
                        {allExamsQuestions[idx]?.length || 0} câu
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Compact Statistics Bar */}
              {questions.length > 0 && (
                <div style={{ display: 'flex', gap: '24px', padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>Cấu trúc:</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span className={styles.statBadge} style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>TN: {questions.filter(q => q.question_type === 'multiple_choice').length}</span>
                      <span className={styles.statBadge} style={{ background: '#fce7f3', color: '#be185d', border: '1px solid #fbcfe8' }}>Đ/S: {questions.filter(q => q.question_type === 'true_false').length}</span>
                      <span className={styles.statBadge} style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>Ngắn: {questions.filter(q => q.question_type === 'short_answer').length}</span>
                      <span className={styles.statBadge} style={{ background: '#f3e8ff', color: '#7e22ce', border: '1px solid #e9d5ff' }}>TL: {questions.filter(q => q.question_type === 'essay').length}</span>
                    </div>
                  </div>
                  
                  <div style={{ width: '1px', height: '24px', background: '#cbd5e1' }} />
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>Mức độ:</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {['N', 'H', 'V', 'C'].map(diff => {
                        const count = questions.filter(q => q.difficulty === diff).length;
                        const pct = questions.length ? Math.round((count / questions.length) * 100) : 0;
                        return count > 0 ? (
                          <span key={diff} className={`badge badge-${diff}`} style={{ padding: '4px 8px', fontSize: '12px' }}>
                            {DIFFICULTY_LABELS[diff]}: {count} ({pct}%)
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Question List */}
              <div className={tableStyles.tableArea} style={{ padding: 0, flex: 1, overflowY: 'auto' }}>
                <div className={tableStyles.tableContainer} style={{ border: 'none', borderRadius: 0 }}>
                  <table className={`${tableStyles.table} ${styles.aiExamTable}`}>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>Phần</th>
                        <th>Mã ID</th>
                        <th>Lớp</th>
                        <th>Phân môn</th>
                        <th>Chương</th>
                        <th>Bài</th>
                        <th>Mức độ</th>
                        <th>Loại câu</th>
                        <th>Đáp án</th>
                        <th style={{ width: 40 }}>🖼</th>
                        <th style={{ width: 80 }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(grouped)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .flatMap(([phan, phanQuestions], index) => {
                          const partNum = Number(phan)
                          const romanNumerals = ['I', 'II', 'III', 'IV']
                          const displayRoman = romanNumerals[index] || 'I'
                          const titleType = 
                            partNum === 1 ? 'TRẮC NGHIỆM 4 ĐÁP ÁN' :
                            partNum === 2 ? 'CÂU HỎI ĐÚNG/SAI (MỖI CÂU 4 Ý)' :
                            partNum === 3 ? 'CÂU HỎI TRẢ LỜI NGẮN' : 'TỰ LUẬN'
                          const partTitle = `PHẦN ${displayRoman}: ${titleType}`

                          return [
                            // Dòng tiêu đề phân loại phần
                            <tr key={`part-header-${phan}`} style={{ background: '#edf2f7', borderBottom: '2px solid #cbd5e1' }}>
                              <td colSpan={12} style={{ padding: '12px 16px', fontWeight: 700, color: '#2d3748', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>📁 {partTitle} ({phanQuestions.length} câu)</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setCustomAddPhan(partNum)
                                      // Set default question type corresponding to this part
                                      if (partNum === 1) {
                                        setCustomType('multiple_choice')
                                      } else if (partNum === 2) {
                                        setCustomType('true_false')
                                      } else if (partNum === 3) {
                                        setCustomType('short_answer')
                                      } else {
                                        setCustomType('essay')
                                      }
                                    }}
                                    title="Thêm câu hỏi mới vào phần này"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      width: '24px',
                                      height: '24px',
                                      borderRadius: '50%',
                                      border: '1px solid #cbd5e1',
                                      background: 'white',
                                      color: '#0284c7',
                                      cursor: 'pointer',
                                      fontWeight: 'bold',
                                      fontSize: '16px',
                                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                                      transition: 'all 0.2s',
                                    }}
                                    onMouseOver={(e) => {
                                      e.currentTarget.style.background = '#0284c7'
                                      e.currentTarget.style.color = 'white'
                                    }}
                                    onMouseOut={(e) => {
                                      e.currentTarget.style.background = 'white'
                                      e.currentTarget.style.color = '#0284c7'
                                    }}
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                            </tr>,
                            // Danh sách câu hỏi
                            ...phanQuestions.map((q, idx) => (
                              <Fragment key={q.id}>
                                <tr
                                  className={`${tableStyles.tableRow} ${expandedId === q.id ? tableStyles.tableRowExpanded : ''}`}
                                  onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                                >
                                  <td>{idx + 1}</td>
                                  <td>P{phan}</td>
                                <td><span className={tableStyles.categoryCode}>{q.category_code}</span></td>
                                <td>{q.grade}</td>
                                <td>{SUBJECT_LABELS[q.subject_area] || q.subject_area}</td>
                                <td>{q.chapter === 0 ? 10 : q.chapter}</td>
                                <td>{q.lesson}</td>
                                <td><span className={`badge badge-${q.difficulty}`}>{DIFFICULTY_LABELS[q.difficulty]}</span></td>
                                <td>
                                  <span className={`${tableStyles.typeTag} badge-${q.question_type === 'multiple_choice' ? 'mc' : q.question_type === 'true_false' ? 'tf' : q.question_type === 'short_answer' ? 'short' : 'essay'}`}>
                                    {TYPE_ICONS[q.question_type]} {TYPE_LABELS[q.question_type]}
                                  </span>
                                </td>
                                <td><span className={tableStyles.answerCell}>{q.correct_answer || '—'}</span></td>
                                <td><span className={tableStyles.imageIcon}>{q.has_image ? '🖼' : ''}</span></td>
                                <td>
                                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <button
                                      title="Thay câu khác cùng dạng"
                                      onClick={(e) => { e.stopPropagation(); handleSwapQuestion(q) }}
                                      disabled={swappingId !== null}
                                      style={{
                                        padding: '3px 6px', borderRadius: '4px', border: 'none', cursor: swappingId ? 'not-allowed' : 'pointer',
                                        background: swappingId === q.id ? '#dbeafe' : '#e0f2fe',
                                        color: '#0369a1', fontSize: '11px', lineHeight: 1,
                                        opacity: (swappingId && swappingId !== q.id) ? 0.4 : 1,
                                      }}
                                    >
                                      {swappingId === q.id ? '⏳' : '🔄'}
                                    </button>
                                    <button
                                      title="Hoán đổi tùy chỉnh (chọn lớp, chương, bài, mức độ...)"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        const targetGrade = q.grade || 12
                                        const targetSubject = q.subject_area || 'D'
                                        const chsMap = CURRICULUM[targetGrade]?.[targetSubject] || {}
                                        const chapterExists = q.chapter !== null && chsMap[q.chapter] !== undefined
                                        const initialChapter = chapterExists ? String(q.chapter) : (Object.keys(chsMap)[0] || '')
                                        const lessonsMap = chsMap[Number(initialChapter)] || {}
                                        const lessonExists = q.lesson !== null && lessonsMap[q.lesson] !== undefined
                                        const initialLesson = lessonExists ? String(q.lesson) : (Object.keys(lessonsMap)[0] || '')

                                        setCustomSwapQuestion(q)
                                        setCustomGrade(targetGrade)
                                        setCustomSubject(targetSubject)
                                        setCustomChapter(initialChapter)
                                        setCustomLesson(initialLesson)
                                        setCustomVariant(q.variant !== null && q.variant !== undefined ? String(q.variant) : '')
                                        setCustomType(q.question_type || 'multiple_choice')
                                        setCustomDifficulty(q.difficulty || 'H')
                                      }}
                                      disabled={swappingId !== null}
                                      style={{
                                        padding: '3px 6px', borderRadius: '4px', border: 'none', cursor: swappingId ? 'not-allowed' : 'pointer',
                                        background: '#fef08a', color: '#854d0e', fontSize: '11px', lineHeight: 1,
                                        opacity: swappingId ? 0.4 : 1,
                                      }}
                                    >
                                      🎲
                                    </button>
                                    <button
                                      title="Xóa câu này"
                                      onClick={(e) => { e.stopPropagation(); handleRemoveQuestion(q.id) }}
                                      style={{ padding: '3px 6px', borderRadius: '4px', border: 'none', background: '#fee2e2', color: '#ef4444', cursor: 'pointer', fontSize: '11px', lineHeight: 1 }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {/* Expanded row - LaTeX preview */}
                              {expandedId === q.id && (
                                <tr className={tableStyles.expandedRow}>
                                  <td colSpan={12} style={{ padding: 0 }}>
                                    <div className={tableStyles.expandedContent} style={{ padding: '16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                      <div className={tableStyles.expandedHeader} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span className={tableStyles.expandedTitle} style={{ fontWeight: 600, fontSize: '13px', color: '#475569' }}>
                                          Raw LaTeX — {q.category_code} • {TYPE_LABELS[q.question_type]}
                                        </span>
                                      </div>
                                      <pre 
                                        className={tableStyles.latexCode} 
                                        onCopy={(e) => {
                                          if (userRole !== 'admin') {
                                            e.preventDefault()
                                            alert('Tính năng copy mã nguồn chỉ dành cho quản trị viên.')
                                          }
                                        }}
                                        onContextMenu={(e) => {
                                          if (userRole !== 'admin') {
                                            e.preventDefault()
                                          }
                                        }}
                                        onKeyDown={(e) => {
                                          if (userRole !== 'admin' && (e.ctrlKey || e.metaKey) && e.key === 'c') {
                                            e.preventDefault()
                                          }
                                        }}
                                        style={{ 
                                          margin: 0, padding: '12px', background: 'white', 
                                          border: '1px solid #cbd5e1', borderRadius: '6px', 
                                          fontSize: '13px', whiteSpace: 'pre-wrap', 
                                          fontFamily: 'monospace', color: '#334155',
                                          WebkitUserSelect: userRole !== 'admin' ? 'none' : 'auto',
                                          MozUserSelect: userRole !== 'admin' ? 'none' : 'auto',
                                          msUserSelect: userRole !== 'admin' ? 'none' : 'auto',
                                          userSelect: userRole !== 'admin' ? 'none' : 'auto'
                                        }}
                                      >
                                        {q.latex_content}
                                      </pre>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          ))
                        ]
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>



      {/* Export LaTeX Modal – 6 header fields */}
      {showExportModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', width: '100%', maxWidth: '680px',
            padding: '28px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            border: '1px solid #e2e8f0', color: '#0f172a',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#0f172a' }}>📝 Nội dung tiêu đề đề thi</h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Chỉnh sửa 6 dòng nội dung hiển thị ở phần đầu đề thi trước khi xuất file LaTeX</p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            {/* Two-column layout matching the exam header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px',
              marginBottom: '20px',
            }}>
              {/* Left column */}
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#991b1b', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>🔴 Cột trái</div>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ marginBottom: i < 2 ? '10px' : 0 }}>
                    <label style={{
                      display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px',
                      color: i === 0 ? '#dc2626' : i === 1 ? '#2563eb' : '#475569',
                    }}>
                      {i === 0 ? 'Dòng 1 (đỏ, in hoa, đậm)' : i === 1 ? 'Dòng 2 (xanh, đậm)' : 'Dòng 3 (nghiêng)'}
                    </label>
                    <input
                      type="text"
                      value={headerLabels[i]}
                      onChange={e => {
                        const newLabels = [...headerLabels]
                        newLabels[i] = e.target.value
                        setHeaderLabels(newLabels)
                      }}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: '8px',
                        border: '1px solid #d1d5db', fontSize: '14px',
                        background: 'white', color: '#0f172a',
                        fontWeight: i === 0 ? 700 : i === 1 ? 600 : 400,
                        fontStyle: i === 2 ? 'italic' : 'normal',
                        ...(i === 0 ? { color: '#dc2626', textTransform: 'uppercase' as const } : {}),
                        ...(i === 1 ? { color: '#2563eb' } : {}),
                      }}
                      placeholder={i === 0 ? 'VD: SỞ GDĐT AN GIANG' : i === 1 ? 'VD: TRƯỜNG THPT ...' : 'VD: (Đề gồm ... trang, ... câu)'}
                    />
                  </div>
                ))}
              </div>

              {/* Right column */}
              <div style={{
                background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '16px',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e40af', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>🔵 Cột phải</div>
                {[3, 4, 5].map(i => (
                  <div key={i} style={{ marginBottom: i < 5 ? '10px' : 0 }}>
                    <label style={{
                      display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px',
                      color: i === 3 ? '#0f172a' : i === 4 ? '#0f172a' : '#475569',
                    }}>
                      {i === 3 ? 'Dòng 4 (in hoa, đậm)' : i === 4 ? 'Dòng 5 (đậm)' : 'Dòng 6 (nghiêng)'}
                    </label>
                    <input
                      type="text"
                      value={headerLabels[i]}
                      onChange={e => {
                        const newLabels = [...headerLabels]
                        newLabels[i] = e.target.value
                        setHeaderLabels(newLabels)
                      }}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: '8px',
                        border: '1px solid #d1d5db', fontSize: '14px',
                        background: 'white', color: '#0f172a',
                        fontWeight: i <= 4 ? 700 : 400,
                        fontStyle: i === 5 ? 'italic' : 'normal',
                        ...(i === 3 ? { textTransform: 'uppercase' as const } : {}),
                      }}
                      placeholder={i === 3 ? 'VD: ĐỀ KIỂM TRA HỌC KỲ' : i === 4 ? 'VD: Môn: TOÁN 12' : 'VD: Thời gian làm bài: 90 phút ...'}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px',
              padding: '16px', marginBottom: '20px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '10px', textTransform: 'uppercase' }}>👁 Xem trước tiêu đề đề thi</div>
              <div style={{ display: 'flex', gap: '0' }}>
                {/* Left preview */}
                <div style={{ flex: '0 0 40%', textAlign: 'center', padding: '8px' }}>
                  <div style={{ color: '#dc2626', fontWeight: 700, fontSize: '14px', textTransform: 'uppercase' }}>{headerLabels[0] || '...'}</div>
                  <div style={{ color: '#2563eb', fontWeight: 600, fontSize: '13px' }}>{headerLabels[1] || '...'}</div>
                  <div style={{ fontStyle: 'italic', fontSize: '12px', color: '#475569' }}>{headerLabels[2] || '...'}</div>
                </div>
                {/* Right preview */}
                <div style={{ flex: '0 0 60%', textAlign: 'center', padding: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', textTransform: 'uppercase' }}>{headerLabels[3] || '...'}</div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{headerLabels[4] || '...'}</div>
                  <div style={{ fontStyle: 'italic', fontSize: '12px', color: '#475569' }}>{headerLabels[5] || '...'}</div>
                </div>
              </div>
              <div style={{ borderTop: '2px double #94a3b8', marginTop: '8px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
                <span style={{ fontStyle: 'italic' }}>Họ và tên thí sinh: .........................</span>
                <span style={{ fontStyle: 'italic' }}>Số báo danh: ....................</span>
                <span style={{ fontWeight: 700, border: '1px solid #333', padding: '2px 8px', fontSize: '13px', color: '#2563eb' }}>{examCodes[0] || '1234'}</span>
              </div>
            </div>

            {/* Exam Codes */}
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px',
              padding: '16px', marginBottom: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.03em' }}>🔢 Mã đề thi</div>
                <button
                  type="button"
                  onClick={() => {
                    const newCodes = generateUniqueExamCodes(examCodes.length)
                    setExamCodes(newCodes)
                  }}
                  style={{
                    padding: '4px 12px', borderRadius: '6px', border: '1px solid #86efac',
                    background: 'white', color: '#166534', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = '#166534'; e.currentTarget.style.color = 'white' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#166534' }}
                >
                  🎲 Tạo mã ngẫu nhiên
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {examCodes.map((code, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {examCodes.length > 1 && (
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>Đề {idx + 1}:</label>
                    )}
                    <input
                      type="text"
                      value={code}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 4)
                        const newCodes = [...examCodes]
                        newCodes[idx] = val
                        setExamCodes(newCodes)
                      }}
                      maxLength={4}
                      style={{
                        width: '72px', padding: '8px 10px', borderRadius: '8px',
                        border: '2px solid #86efac', fontSize: '16px', fontWeight: 700,
                        textAlign: 'center', background: 'white', color: '#166534',
                        fontFamily: 'monospace', letterSpacing: '2px',
                      }}
                      placeholder="1234"
                    />
                  </div>
                ))}
              </div>
              {examCodes.length > 1 && new Set(examCodes).size !== examCodes.length && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#dc2626', fontWeight: 500 }}>
                  ⚠️ Có mã đề bị trùng! Vui lòng chỉnh sửa để các mã đề khác nhau.
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowExportModal(false)}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1',
                  background: '#f8fafc', color: '#475569', cursor: 'pointer', fontSize: '14px', fontWeight: 500
                }}
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => { setShowExportModal(false); handleExportTex(); }}
                style={{
                  padding: '10px 24px', borderRadius: '8px', border: 'none',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white',
                  cursor: 'pointer', fontSize: '14px', fontWeight: 700,
                  boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)',
                  transition: 'all 0.2s',
                }}
              >
                📥 Xuất file .tex
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Swap Modal */}
      {(customSwapQuestion || customAddPhan !== null) && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'white', borderRadius: '12px', width: '100%', maxWidth: '440px',
            padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #e2e8f0', color: '#0f172a'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#0f172a' }}>{customSwapQuestion ? '🎲 Hoán đổi tùy chỉnh' : `➕ Thêm câu hỏi mới (Phần ${customAddPhan === 1 ? 'I' : customAddPhan === 2 ? 'II' : customAddPhan === 3 ? 'III' : 'IV'})`}</h3>
              <button
                onClick={() => { setCustomSwapQuestion(null); setCustomAddPhan(null); }}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', lineHeight: 1.4 }}>
              Hãy chọn các điều kiện lọc mới dưới đây. Hệ thống sẽ lấy ngẫu nhiên 1 câu hỏi tương ứng trong ngân hàng câu hỏi.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Lớp</label>
                <select
                  value={customGrade}
                  onChange={(e) => {
                    const newGrade = Number(e.target.value)
                    setCustomGrade(newGrade)
                    const chsMap = CURRICULUM[newGrade]?.[customSubject] || {}
                    const chKeys = Object.keys(chsMap)
                    if (chKeys.length > 0) {
                      const firstCh = chKeys[0]
                      setCustomChapter(firstCh)
                      const lesKeys = Object.keys(chsMap[Number(firstCh)] || {})
                      if (lesKeys.length > 0) {
                        setCustomLesson(lesKeys[0])
                      } else {
                        setCustomLesson('')
                      }
                    } else {
                      setCustomChapter('')
                      setCustomLesson('')
                    }
                    setCustomVariant('')
                  }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff', color: '#0f172a' }}
                >
                  <option value={10}>Lớp 10</option>
                  <option value={11}>Lớp 11</option>
                  <option value={12}>Lớp 12</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Phân môn</label>
                <select
                  value={customSubject}
                  onChange={(e) => {
                    const newSubject = e.target.value
                    setCustomSubject(newSubject)
                    const chsMap = CURRICULUM[customGrade]?.[newSubject] || {}
                    const chKeys = Object.keys(chsMap)
                    if (chKeys.length > 0) {
                      const firstCh = chKeys[0]
                      setCustomChapter(firstCh)
                      const lesKeys = Object.keys(chsMap[Number(firstCh)] || {})
                      if (lesKeys.length > 0) {
                        setCustomLesson(lesKeys[0])
                      } else {
                        setCustomLesson('')
                      }
                    } else {
                      setCustomChapter('')
                      setCustomLesson('')
                    }
                    setCustomVariant('')
                  }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff', color: '#0f172a' }}
                >
                  <option value="D">Đại số</option>
                  <option value="H">Hình học</option>
                </select>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Chương (Chapter)</label>
                <select
                  value={customChapter}
                  onChange={(e) => {
                    const newCh = e.target.value
                    setCustomChapter(newCh)
                    const chsMap = CURRICULUM[customGrade]?.[customSubject] || {}
                    const lesKeys = Object.keys(chsMap[Number(newCh)] || {})
                    if (lesKeys.length > 0) {
                      setCustomLesson(lesKeys[0])
                    } else {
                      setCustomLesson('')
                    }
                    setCustomVariant('')
                  }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff', color: '#0f172a' }}
                >
                  {availableChapters.map(ch => {
                    const name = CHAPTER_NAMES[customGrade]?.[customSubject]?.[ch] || `Chương ${ch}`
                    return <option key={ch} value={ch}>{name}</option>
                  })}
                  {availableChapters.length === 0 && <option value="">Không có chương tương ứng</option>}
                </select>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Bài (Lesson)</label>
                <select
                  value={customLesson}
                  onChange={(e) => {
                    setCustomLesson(e.target.value)
                    setCustomVariant('')
                  }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff', color: '#0f172a' }}
                >
                  {availableLessons.map(l => {
                    const name = LESSON_NAMES[customGrade]?.[customSubject]?.[Number(customChapter)]?.[l] || `Bài ${l}`
                    return <option key={l} value={l}>{name}</option>
                  })}
                  {availableLessons.length === 0 && <option value="">Không có bài tương ứng</option>}
                </select>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Phân dạng</label>
                <select
                  value={customVariant}
                  onChange={(e) => setCustomVariant(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff', color: '#0f172a' }}
                >
                  <option value="">Tất cả phân dạng</option>
                  {availableVariants.map(v => {
                    const variantLabel = VARIANT_NAMES[Number(customGrade)]?.[customSubject]?.[Number(customChapter)]?.[Number(customLesson)]?.[Number(v)]
                    return (
                      <option key={v} value={v}>
                        Dạng {v}: {variantLabel || `Dạng ${v}`}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Loại câu hỏi</label>
                <select
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff', color: '#0f172a' }}
                >
                  <option value="multiple_choice">Trắc nghiệm 4 đáp án</option>
                  <option value="true_false">Đúng / Sai</option>
                  <option value="short_answer">Trắc nghiệm trả lời ngắn</option>
                  <option value="essay">Tự luận</option>
                </select>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Mức độ nhận thức</label>
                <select
                  value={customDifficulty}
                  onChange={(e) => setCustomDifficulty(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff', color: '#0f172a' }}
                >
                  <option value="N">Nhận biết</option>
                  <option value="H">Thông hiểu</option>
                  <option value="V">Vận dụng</option>
                  <option value="C">Vận dụng cao</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => { setCustomSwapQuestion(null); setCustomAddPhan(null); }}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1',
                  background: '#f8fafc', color: '#475569', cursor: 'pointer', fontSize: '14px'
                }}
              >
                Hủy bỏ
              </button>
              <button
                onClick={customSwapQuestion ? handleCustomSwapQuestion : handleCustomAddQuestion}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: 'none',
                  background: '#0284c7', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: 600
                }}
              >
                Lấy câu ngẫu nhiên 🎲
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
