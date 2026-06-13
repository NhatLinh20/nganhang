// src/lib/omr/types.ts
// Toàn bộ TypeScript types cho module quét phiếu trả lời trắc nghiệm (OMR)

// ═══════════════════════════════════
// CONFIG
// ═══════════════════════════════════

/** Cấu hình cho một phiên quét phiếu */
export interface OMRConfig {
  mcCount: number          // Số câu trắc nghiệm 4 lựa chọn (1-40)
  tfCount: number          // Số câu đúng sai (0-8)
  saCount: number          // Số câu trả lời ngắn (0-6)
  answerKey: AnswerKey     // Đáp án đúng để so khớp
  thresholdLevel?: number  // Ngưỡng nhận dạng tô (0-1, default 0.4)
  scoringConfig?: ScoringConfig // Cấu hình thang điểm
}

/** Đáp án đúng cho một đề thi */
export interface AnswerKey {
  mc: string[]             // ['A', 'C', 'B', ...] — đáp án MC (length = mcCount)
  tf: string[]             // ['ĐSĐS', 'ĐĐSS', ...] — đáp án TF (length = tfCount)
  sa: string[]             // ['3', '-2,5', ...] — đáp án SA (length = saCount)
}

/** Cấu hình thang điểm */
export interface ScoringConfig {
  totalScore: number       // Tổng điểm (mặc định 10)
  mcPointPerQ: number      // Điểm mỗi câu MC (mặc định = totalScore / tổng câu)
  tfPointPerQ: number      // Điểm mỗi câu TF
  saPointPerQ: number      // Điểm mỗi câu SA
}

// ═══════════════════════════════════
// STUDENT ANSWERS (Kết quả nhận dạng)
// ═══════════════════════════════════

/** Câu trả lời của thí sinh, được nhận dạng từ phiếu */
export interface StudentAnswers {
  mc: (string | null)[]    // ['A', null, 'C', ...] (null = không tô / không rõ)
  tf: (string | null)[]    // ['ĐSĐS', null, ...] (chuỗi 4 ký tự Đ/S cho mỗi câu)
  sa: (string | null)[]    // ['3', '-2,5', ...]
}

// ═══════════════════════════════════
// SCORING (Chấm điểm)
// ═══════════════════════════════════

/** Kết quả chấm điểm */
export interface ScoreResult {
  total: number            // Tổng điểm đạt được
  maxScore: number         // Điểm tối đa
  mcCorrect: number        // Số câu MC đúng
  mcTotal: number          // Tổng số câu MC
  tfScore: number          // Điểm TF (tính theo mức)
  tfMaxScore: number       // Điểm TF tối đa
  saCorrect: number        // Số câu SA đúng
  saTotal: number          // Tổng số câu SA
  details: QuestionResult[] // Chi tiết từng câu
}

/** Chi tiết kết quả từng câu hỏi */
export interface QuestionResult {
  index: number            // Thứ tự câu (0-indexed)
  type: 'mc' | 'tf' | 'sa'
  studentAnswer: string | null
  correctAnswer: string
  isCorrect: boolean
  score: number
  maxScore: number
}

// ═══════════════════════════════════
// OMR RESULT (Kết quả toàn bộ pipeline)
// ═══════════════════════════════════

/** Kết quả xử lý một phiếu trả lời */
export interface OMRResult {
  examCode: string | null        // Mã đề nhận dạng được (4 chữ số)
  studentId: string | null       // Số báo danh (8 chữ số, nếu có)
  answers: StudentAnswers        // Câu trả lời của thí sinh
  score: ScoreResult             // Kết quả điểm
  confidence: number             // Độ tin cậy tổng thể (0-1)
  warnings: string[]             // Cảnh báo (ô tô mờ, tô 2 đáp án, v.v.)
  processingTimeMs: number       // Thời gian xử lý (ms)
}

// ═══════════════════════════════════
// BUBBLE DETECTION
// ═══════════════════════════════════

/** Trạng thái một bong bóng */
export interface BubbleState {
  x: number                // Tọa độ pixel tâm X
  y: number                // Tọa độ pixel tâm Y
  radius: number           // Bán kính pixel
  fillRatio: number        // Tỷ lệ pixel đen (0-1)
  isFilled: boolean        // Đã tô hay chưa
  label: string            // Nhãn (A/B/C/D, Đ/S, 0-9, -, ,)
}

/** Kết quả nhận dạng một nhóm bong bóng (một câu hỏi) */
export interface BubbleGroup {
  questionIndex: number
  type: 'mc' | 'tf_sub' | 'sa_digit'
  bubbles: BubbleState[]
  selectedLabel: string | null  // Nhãn được chọn (tô đậm nhất)
  multipleSelected: boolean     // True nếu tô nhiều hơn 1
}

// ═══════════════════════════════════
// COORDINATE MAP
// ═══════════════════════════════════

/** Tọa độ tương đối (0-1) so với kích thước phiếu */
export interface RelativePoint {
  x: number  // 0-1 (trái → phải)
  y: number  // 0-1 (trên → dưới)
}

/** Tọa độ tương đối của một bong bóng */
export interface BubbleCoord extends RelativePoint {
  label: string  // Nhãn (A/B/C/D, Đ/S, 0-9, -, ,)
}

/** Bản đồ tọa độ tương đối cho toàn bộ phiếu */
export interface SheetCoordinateMap {
  // Tracking marks
  cornerMarkers: RelativePoint[]       // 8 ô vuông lớn
  smallMarkers: RelativePoint[]        // Các ô vuông nhỏ

  // Mã đề: 4 cột × 10 hàng
  examCodeBubbles: BubbleCoord[][]     // [col][row] → bubble

  // SBD: 8 cột × 10 hàng
  studentIdBubbles: BubbleCoord[][]    // [col][row] → bubble

  // Phần I MC: tối đa 40 câu, mỗi câu 4 bong bóng A/B/C/D
  mcBubbles: BubbleCoord[][]           // [question][option] → bubble

  // Phần II TF: tối đa 8 câu, mỗi câu 4 ý (a/b/c/d), mỗi ý 2 bong bóng (Đ/S)
  tfBubbles: BubbleCoord[][][]         // [question][sub(a/b/c/d)][option(Đ/S)] → bubble

  // Phần III SA: tối đa 6 câu, mỗi câu có dấu trừ + dấu phẩy + 4 cột số
  saBubbles: {
    minusSign: BubbleCoord             // Dấu trừ
    commas: BubbleCoord[]              // 2 vị trí dấu phẩy
    digits: BubbleCoord[][]            // [position][digit 0-9] → bubble
  }[]
}

// ═══════════════════════════════════
// SCAN SESSION (Phiên quét hàng loạt)
// ═══════════════════════════════════

/** Một bài đã quét trong phiên */
export interface ScannedSheet {
  id: string               // UUID
  imageDataUrl: string     // Ảnh preview (data URL)
  result: OMRResult        // Kết quả quét
  timestamp: number        // Thời điểm quét (ms)
  manualOverrides?: Record<string, string>  // Sửa tay {câu: đáp_án}
}

/** Tổng hợp kết quả một phiên quét */
export interface ScanSession {
  config: OMRConfig
  sheets: ScannedSheet[]
  startedAt: number
  stats: {
    totalScanned: number
    averageScore: number
    maxScore: number
    minScore: number
    distribution: Record<string, number>  // {"0-1": 2, "1-2": 5, ...}
  }
}
