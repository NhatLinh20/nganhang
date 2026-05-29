// src/lib/export-limiter.ts
// Centralized constants & utility functions for teacher export limits
// VIP và Admin không bị giới hạn — chỉ teacher bị giới hạn

export const TEACHER_LIMITS = {
  // Tạo đề thi
  MAX_EXAMS_PER_BATCH: 2,        // Số đề tối đa / lượt (Admin/VIP: 20)
  MAX_QUESTIONS_PER_EXAM: 26,    // Tổng câu tối đa / đề
  MAX_MC: 20,                    // Trắc nghiệm / đề
  MAX_TF: 4,                     // Đúng/Sai / đề
  MAX_SA: 6,                     // Trả lời ngắn / đề
  MAX_ES: 6,                     // Tự luận / đề

  // Tạo bài học
  MAX_LESSONS_PER_MONTH: 1,      // Bài học / tháng
  MAX_QUESTIONS_PER_LESSON: 25,  // Tổng câu / bài học
  MAX_MC_LESSON: 20,             // Trắc nghiệm / bài học
  MAX_TF_LESSON: 4,              // Đúng/Sai / bài học
  MAX_SA_LESSON: 6,              // Trả lời ngắn / bài học
  MAX_ES_LESSON: 6,              // Tự luận / bài học

  // Xuất file chung
  MAX_EXPORTS_PER_DAY: 1,        // Xuất file / ngày (tính chung tất cả trang)

  // Liên hệ
  ADMIN_PHONE: '0812878792',
}

/**
 * Kiểm tra role có bị giới hạn hay không.
 * Chỉ teacher bị giới hạn. VIP và Admin không bị.
 */
export function isLimitedRole(role: string | null | undefined): boolean {
  return role !== 'admin' && role !== 'vip'
}

/**
 * Kiểm tra giới hạn số câu hỏi cho đề thi (exam).
 * Trả về null nếu OK, hoặc string mô tả lỗi nếu vượt giới hạn.
 */
export function checkExamQuestionLimits(
  questions: { question_type: string }[],
  examIndex?: number
): string | null {
  const L = TEACHER_LIMITS
  const total = questions.length

  if (total > L.MAX_QUESTIONS_PER_EXAM) {
    return `Tài khoản giáo viên chỉ được phép xuất tối đa ${L.MAX_QUESTIONS_PER_EXAM} câu/đề. Hiện tại có ${total} câu.`
  }

  const mcCount = questions.filter(q => q.question_type === 'multiple_choice').length
  const tfCount = questions.filter(q => q.question_type === 'true_false').length
  const saCount = questions.filter(q => q.question_type === 'short_answer').length
  const esCount = questions.filter(q => q.question_type === 'essay').length

  if (mcCount > L.MAX_MC || tfCount > L.MAX_TF || saCount > L.MAX_SA || esCount > L.MAX_ES) {
    const prefix = examIndex !== undefined ? `Đề số ${examIndex + 1} vượt giới hạn` : 'Vượt giới hạn'
    return `${prefix}: TN ${mcCount}/${L.MAX_MC}, Đ/S ${tfCount}/${L.MAX_TF}, Ngắn ${saCount}/${L.MAX_SA}, TL ${esCount}/${L.MAX_ES}.`
  }

  return null
}

/**
 * Kiểm tra giới hạn số câu hỏi cho bài học (lesson).
 * Trả về null nếu OK, hoặc string mô tả lỗi.
 */
export function checkLessonQuestionLimits(
  questions: { question_type: string }[]
): string | null {
  const L = TEACHER_LIMITS
  const total = questions.length

  if (total > L.MAX_QUESTIONS_PER_LESSON) {
    return `Tài khoản giáo viên chỉ được phép xuất tối đa ${L.MAX_QUESTIONS_PER_LESSON} câu/bài học. Hiện tại có ${total} câu.`
  }

  const mcCount = questions.filter(q => q.question_type === 'multiple_choice').length
  const tfCount = questions.filter(q => q.question_type === 'true_false').length
  const saCount = questions.filter(q => q.question_type === 'short_answer').length
  const esCount = questions.filter(q => q.question_type === 'essay').length

  if (mcCount > L.MAX_MC_LESSON || tfCount > L.MAX_TF_LESSON || saCount > L.MAX_SA_LESSON || esCount > L.MAX_ES_LESSON) {
    return `Vượt giới hạn bài học: TN ${mcCount}/${L.MAX_MC_LESSON}, Đ/S ${tfCount}/${L.MAX_TF_LESSON}, Ngắn ${saCount}/${L.MAX_SA_LESSON}, TL ${esCount}/${L.MAX_ES_LESSON}.`
  }

  return null
}

/**
 * Gọi API kiểm tra còn lượt xuất file không.
 * @param type - optional: 'lesson' để kiểm tra riêng bài học/tháng
 * @returns { allowed, count, limit, remaining, message }
 */
export async function checkExportQuota(type?: string): Promise<{
  allowed: boolean
  count: number
  limit: number
  remaining: number
  message?: string
}> {
  try {
    const params = type ? `?type=${type}` : ''
    const res = await fetch(`/api/export-log${params}`)
    if (!res.ok) {
      return { allowed: true, count: 0, limit: 999, remaining: 999 } // Fallback: cho phép
    }
    const data = await res.json()
    return data
  } catch {
    return { allowed: true, count: 0, limit: 999, remaining: 999 } // Fallback
  }
}

/**
 * Ghi log 1 lần xuất file thành công.
 */
export async function logExport(exportType: string, pageSource: string): Promise<boolean> {
  try {
    const res = await fetch('/api/export-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ export_type: exportType, page_source: pageSource }),
    })
    return res.ok
  } catch {
    return false
  }
}
