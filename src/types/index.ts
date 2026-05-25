// src/types/index.ts
// Toàn bộ TypeScript types cho dự án

// ═══════════════════════════════════
// USER & AUTH
// ═══════════════════════════════════
export type UserRole = 'admin' | 'teacher'

export interface User {
  id: string
  email: string
  full_name: string
  role: UserRole
  avatar_url?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// ═══════════════════════════════════
// QUESTION (Câu hỏi)
// ═══════════════════════════════════
export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'essay'
export type ImageType = 'none' | 'center' | 'immini'
export type Difficulty = 'N' | 'H' | 'V' | 'C'
export type SubjectArea = 'D' | 'H' | 'C'

export interface Question {
  id: string
  // Nội dung
  latex_content: string        // Raw LaTeX nguyên bản \begin{ex}...\end{ex}
  // Phân loại 6 tham số
  category_code: string        // VD: '2D1N3-1'
  grade: 10 | 11 | 12
  subject_area: SubjectArea
  chapter: number
  difficulty: Difficulty
  lesson: number
  variant: number
  // Loại câu & hình
  question_type: QuestionType
  has_image: boolean
  image_type: ImageType
  // Đáp án
  correct_answer: string | null  // MC: 'C' | TF: 'ĐSĐS' | Short: '-3' | Essay: null
  // Nguồn gốc
  source_file?: string
  source_project?: string
  source_exam?: string
  source_teacher?: string
  // Quản lý
  tags?: string[]
  usage_count: number
  last_used_at?: string
  is_active: boolean
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
}

// Filter khi tìm kiếm
export interface QuestionFilter {
  grade?: 10 | 11 | 12
  subject_area?: SubjectArea
  chapter?: number
  difficulty?: Difficulty
  lesson?: number
  variant?: number
  question_type?: QuestionType
  has_image?: boolean
  category_code?: string
  search?: string
  is_active?: boolean
}

// ═══════════════════════════════════
// CHAPTER / LESSON / VARIANT (Danh mục)
// ═══════════════════════════════════
export interface Chapter {
  id: number
  grade: number
  subject_area: SubjectArea
  chapter_number: number
  chapter_name: string
}

export interface Lesson {
  id: number
  grade: number
  subject_area: SubjectArea
  chapter_number: number
  lesson_number: number
  lesson_name: string
}

export interface VariantType {
  id: number
  grade: number
  subject_area: SubjectArea
  chapter_number: number
  lesson_number: number
  variant_number: number
  variant_name: string
}

// ═══════════════════════════════════
// EXAM (Đề thi)
// ═══════════════════════════════════
export type ExamSection = 'multiple_choice' | 'true_false' | 'short_answer' | 'essay'

export interface ExamSectionConfig {
  type: ExamSection
  label: string           // 'Phần I', 'Phần II'...
  latex_marker: string    // '\caulc', '\cauds', '\caukq', '\tl'
  questions: string[]     // Array of question IDs
}

export interface ExamMatrix {
  nhan_biet?: number      // % hoặc số câu
  thong_hieu?: number
  van_dung?: number
  van_dung_cao?: number
}

export interface Exam {
  id: string
  title: string
  description?: string
  exam_type?: string      // 'kiểm tra 15p', 'giữa kỳ', 'cuối kỳ', 'thi thử'
  grade: 10 | 11 | 12
  duration_minutes: number
  total_questions: number
  matrix?: ExamMatrix
  sections: ExamSectionConfig[]
  created_by: string
  is_published: boolean
  created_at: string
  updated_at: string
}

// ═══════════════════════════════════
// EXAM VARIANT (Mã đề - Trộn đề)
// ═══════════════════════════════════
export interface ExamVariant {
  id: string
  exam_id: string
  variant_code: string      // '001', '002'...
  question_mapping: Record<number, number>  // {vị_trí_mới: vị_trí_gốc}
  latex_output?: string     // File .tex hoàn chỉnh
  pdf_url?: string
}

// ═══════════════════════════════════
// EXAM SESSION (Phiên thi của học sinh)
// ═══════════════════════════════════
export type SessionStatus = 'pending' | 'in_progress' | 'submitted' | 'graded'

export interface ExamSession {
  id: string
  exam_id: string
  variant_id?: string
  student_id: string
  teacher_id?: string
  start_time?: string
  end_time?: string
  submitted_at?: string
  status: SessionStatus
  answers?: Record<string, string>  // {question_id: answer}
  score?: number
  total_correct?: number
  total_questions: number
  created_at: string
}

// ═══════════════════════════════════
// IMPORT (Parser)
// ═══════════════════════════════════
export interface ParsedQuestion {
  latex_content: string
  category_code: string
  grade: number
  subject_area: string
  chapter: number
  difficulty: string
  lesson: number
  variant: number
  question_type: QuestionType
  has_image: boolean
  image_type: ImageType
  correct_answer: string | null
  source_file?: string
  source_project?: string
  source_exam?: string
  source_teacher?: string
  is_active?: boolean
}

export interface ImportResult {
  total: number
  success: number
  skipped: number     // Trùng lặp
  errors: ImportError[]
}

export interface ImportError {
  line?: number
  content?: string
  reason: string      // 'no_valid_id' | 'duplicate' | 'parse_error' | 'empty_content'
  detail?: string     // Chi tiết lỗi
}

// ═══════════════════════════════════
// API RESPONSES
// ═══════════════════════════════════
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

// ═══════════════════════════════════
// EXAM CREATOR (Tạo đề thi thủ công)
// ═══════════════════════════════════
export interface ExamQuestionSelection {
  grade: number
  subject_area: string
  chapter: number
  lesson: number
  variant: number
  difficulty: Difficulty
  question_type: QuestionType
  count: number
}

export interface ExamGenerateRequest {
  title: string
  grade: number
  duration_minutes?: number
  num_exams: number
  selections: ExamQuestionSelection[]
}

export interface VariantStatsRow {
  lesson: number
  lesson_name: string
  variant: number
  variant_name: string
  question_type: QuestionType
  counts: Record<Difficulty, number>
  total: number
}
