// src/lib/latex-parser/category-parser.ts
// Parser mã phân loại 6 tham số từ comment %[...]

import type { Difficulty, SubjectArea, ImageType, QuestionType } from '@/types'

// ═══════════════════════════════════════════════════
// REGEX PATTERN cho ID 6 tham số
// Format: [Lớp][Phân môn][Chương][Mức độ][Bài]-[Dạng]
// Ví dụ: 2D1N3-1, 1H8V2-4, 0D8V2-5
//   - Lớp: 0=THCS chung, 1=lớp 11, 2=lớp 12
//   - Phân môn: D=Đại số, H=Hình học, C=Chuyên đề
//   - Chương: 0-9
//   - Mức độ: N=Nhận biết, H=Thông hiểu, V=Vận dụng, C=VD cao
//   - Bài: 0-9
//   - Dạng: 0-9
// ═══════════════════════════════════════════════════
const CATEGORY_CODE_REGEX = /^([012])([DHC])(\d)([NHVC])(\d)-([\d])$/

/**
 * Bảng tra cứu đầy đủ: key = "GradeSbjectChapter" (VD: "0D1"),
 * value = Record<lesson, variant[]> — danh sách bài → các dạng hợp lệ.
 * Trích xuất từ mucluc-ID.txt
 */
export const VALID_VARIANTS: Record<string, Record<string, string[]>> = {
  // ─── ĐẠI SỐ/THỐNG KÊ 10 ────────────────────────
  // Chương 1: Mệnh đề. Tập hợp
  '0D1': {
    '1': ['1','2','3','4','5','6'],  // §1. Mệnh đề
    '2': ['1','2','3'],              // §2. Tập hợp
    '3': ['1','2','3','4','5'],      // §3. Các phép toán tập hợp
  },
  // Chương 2: BPT và hệ BPT bậc nhất hai ẩn
  '0D2': {
    '1': ['1','2','3'],              // §1. BPT bậc nhất hai ẩn
    '2': ['1','2','3'],              // §2. Hệ BPT bậc nhất hai ẩn
  },
  // Chương 3: Hàm số bậc hai và đồ thị
  '0D3': {
    '1': ['1','2','3','4','5','6','7'], // §1. Hàm số và đồ thị
    '2': ['1','2','3','4','5','6'],     // §2. Hàm số bậc hai
  },
  // Chương 6: Thống kê
  '0D6': {
    '1': ['1','2','3','4'],          // §1. Số gần đúng. Sai số
    '2': ['1','2','3','4'],          // §2. Mô tả và biểu diễn dữ liệu
    '3': ['1','2','3','4','5'],      // §3. Số đặc trưng xu thế trung tâm
    '4': ['1','2','3','4'],          // §4. Số đặc trưng phân tán
  },
  // Chương 7: Bất phương trình bậc 2
  '0D7': {
    '1': ['1','2','3','4','5'],      // §1. Dấu của tam thức bậc 2
    '2': ['1','2','3','4','5','6','7'], // §2. Giải BPT bậc 2
    '3': ['1','2','3','4','5','6'],  // §3. PT quy về PT bậc hai
  },
  // Chương 8: Đại số tổ hợp
  '0D8': {
    '1': ['1','2','3','4','5','6'],  // §1. Quy tắc cộng-nhân
    '2': ['1','2','3','4','5','6','7','8','9'], // §2. Hoán vị. Chỉnh hợp. Tổ hợp
    '3': ['1','2','3','4','5','6'],  // §3. Nhị thức Newton
  },
  // Chương 10 (mã 0): Xác suất
  '0D0': {
    '1': ['1','2','3'],              // §1. Không gian mẫu và biến cố
    '2': ['1','2','3','4','5','6','7','8','9'], // §2. Xác suất của biến cố
  },

  // ─── HÌNH HỌC 10 ────────────────────────────────
  // Chương 4: Hệ thức lượng trong tam giác
  '0H4': {
    '1': ['1','2','3'],              // §1. Giá trị lượng giác
    '2': ['1','2','3','4'],          // §2. Định lý sin và côsin
    '3': ['1','2'],                  // §3. Giải tam giác
  },
  // Chương 5: Véctơ (chưa xét tọa độ)
  '0H5': {
    '1': ['1','2','3','4','5','6'],  // §1. Khái niệm véctơ
    '2': ['1','2','3','4','5','6'],  // §2. Tổng và hiệu
    '3': ['1','2','3','4','5','6','7','8','9'], // §3. Tích của một số với véctơ
    '4': ['1','2','3','4','5','6','7'], // §4. Tích vô hướng
  },
  // Chương 9: PP toạ độ trong mặt phẳng (Oxy)
  '0H9': {
    '1': ['1','2','3','4','5','6'],  // §1. Toạ độ của véctơ
    '2': ['1','2','3','4','5','6','7'], // §2. Tích vô hướng (theo tọa độ)
    '3': ['1','2','3','4','5','6','7','8','9'], // §3. Đường thẳng
    '4': ['1','2','3','4','5','6','7'], // §4. Đường tròn
    '5': ['0','1','2','3','4','5','6','7','8','9'], // §5. Ba đường conic (có dạng 0)
  },

  // ─── CHUYÊN ĐỀ 10 ───────────────────────────────
  '0C1': {
    '1': ['1','2','3'],              // §1. Hệ PT bậc nhất 3 ẩn
  },
  '0C2': {
    '1': ['1','2'],                  // §1. Quy nạp toán học
  },

  // ─── ĐẠI SỐ & GIẢI TÍCH/THỐNG KÊ 11 ────────────
  // Chương 1: Hàm số lượng giác và PT lượng giác
  '1D1': {
    '1': ['1','2','3','4','5','6'],  // §1. Góc lượng giác
    '2': ['1','2','3','4','5'],      // §2. Giá trị lượng giác
    '3': ['1','2','3','4','5','6','7'], // §3. Các công thức lượng giác
    '4': ['1','2','3','4','5','6','7','8'], // §4. Hàm số lượng giác và đồ thị
    '5': ['1','2','3','4','5','6'],  // §5. PT lượng giác cơ bản
    '6': ['1','2','3','4','5','6','7','8'], // §6. [Giảm] PT lượng giác thường gặp
  },
  // Chương 2: Dãy số. CSC. CSN
  '1D2': {
    '1': ['1','2','3','4','5','6'],  // §1. Dãy số
    '2': ['1','2','3','4','5','6','7'], // §2. CSC
    '3': ['1','2','3','4','5','6','7','8'], // §3. CSN
  },
  // Chương 3: Giới hạn. Hàm số liên tục
  '1D3': {
    '1': ['1','2','3','4','5','6'],  // §1. Giới hạn dãy số
    '2': ['1','2','3','4','5','6','7','8'], // §2. Giới hạn hàm số
    '3': ['1','2','3','4','5','6'],  // §3. Hàm số liên tục
  },
  // Chương 5: Số đặc trưng xu thế trung tâm ghép nhóm
  '1D5': {
    '1': ['1','2','3','4'],          // §1. Số trung bình và mốt
    '2': ['1','2','3'],              // §2. Trung vị và tứ phân vị
  },
  // Chương 6: Hàm số mũ và lôgarít
  '1D6': {
    '1': ['1','2','3','4'],          // §1. Phép tính luỹ thừa
    '2': ['1','2','3','4','5'],      // §2. Phép tính lôgarít
    '3': ['1','2','3','4','5'],      // §3. Hàm số mũ. Hàm số lôgarít
    '4': ['1','2','3','4','5','6'],  // §4. PT, BPT mũ và lôgarít
    '5': ['1','2','3','4','5'],      // §5. [Giảm] PP giải được giảm tải
  },
  // Chương 7: Đạo hàm
  '1D7': {
    '1': ['1','2','3','4','5'],      // §1. Đạo hàm
    '2': ['1','2','3','4','5','6','7','8'], // §2. Các quy tắc đạo hàm
    '3': ['1','2','3'],              // §3. Đạo hàm cấp hai
  },
  // Chương 9: Xác suất
  '1D9': {
    '1': ['1','2','3','4'],          // §1. Biến cố giao và quy tắc nhân
    '2': ['1','2','3','4','5'],      // §2. Biến cố hợp và quy tắc cộng
  },

  // ─── HÌNH HỌC 11 ────────────────────────────────
  // Chương 4: Đường thẳng, mặt phẳng. Quan hệ song song
  '1H4': {
    '1': ['1','2','3','4','5','6','7'], // §1. Điểm, đường thẳng và mặt phẳng
    '2': ['1','2','3','4','5','6','7','8'], // §2. Hai đường thẳng song song
    '3': ['1','2','3','4','5','6','7','8'], // §3. Đường thẳng và mặt phẳng song song
    '4': ['1','2','3','4','5','6','7'], // §4. Hai mặt phẳng song song
    '5': ['1','2','3','4'],          // §5. Hình lăng trụ và hình hộp
    '6': ['1','2','3','4','5'],      // §6. Phép chiếu song song
  },
  // Chương 8: Quan hệ vuông góc trong không gian
  '1H8': {
    '1': ['1','2','3','4'],          // §1. Hai đường thẳng vuông góc
    '2': ['1','2','3','4','5','6'],  // §2. Đường thẳng vuông góc mặt phẳng
    '3': ['1','2','3'],              // §3. Phép chiếu vuông góc
    '4': ['1','2','3','4','5','6','7'], // §4. Hai mặt phẳng vuông góc
    '5': ['1','2','3','4','5','6'],  // §5. Khoảng cách
    '6': ['1','2','3','4','5','6','7'], // §6. Góc giữa đường thẳng và mặt phẳng
    '7': ['1','2','3','4','5','6','7','8'], // §7. Hình lăng trụ đứng. Hình chóp đều. Thể tích
  },

  // ─── CHUYÊN ĐỀ 11 ───────────────────────────────
  '1C1': {
    '1': ['1','2','3'],              // §1. Phép biến hình, phép dời hình
    '2': ['1','2','3'],              // §2. Phép tịnh tiến
    '3': ['1','2','3','4'],          // §3. Phép đối xứng trục
    '4': ['1','2','3','4'],          // §4. Phép đối xứng tâm
    '5': ['1','2','3','4'],          // §5. Phép quay
    '6': ['1','2','3','4'],          // §6. Phép vị tự
    '7': ['1','2'],                  // §7. Phép đồng dạng
  },
  '1C2': {
    '1': ['1','2','3'],              // §1. Đồ thị
    '2': ['1','2','3'],              // §2. Đường đi Euler và Harmilton
    '3': ['1','2'],                  // §3. Bài toán tìm đường đi ngắn nhất
  },
  '1C3': {
    '1': ['1','2','3','4'],          // §1. Hình biểu diễn
    '2': ['1','2','3'],              // §2. Bản vẽ kỹ thuật
  },

  // ─── GIẢI TÍCH/THỐNG KÊ 12 ──────────────────────
  // Chương 1: Ứng dụng đạo hàm để khảo sát hàm số
  '2D1': {
    '1': ['1','2','3','4','5'],      // §1. Sự đồng biến và nghịch biến
    '2': ['1','2','3','4','5','6','7'], // §2. Cực trị
    '3': ['1','2','3','4','5','6'],  // §3. GTLN, GTNN
    '4': ['1','2','3','4'],          // §4. Đường tiệm cận
    '5': ['1','2','3','4','5','6','7','8'], // §5. Khảo sát sự biến thiên và vẽ đồ thị
  },
  // Chương 3: Số đặc trưng phân tán ghép nhóm
  '2D3': {
    '1': ['1','2','3','4'],          // §1. Khoảng biến thiên, tứ phân vị
    '2': ['1','2','3'],              // §2. Phương sai, độ lệch chuẩn
  },
  // Chương 4: Nguyên hàm, tích phân
  '2D4': {
    '1': ['1','2','3','4','5','6'],  // §1. Nguyên hàm
    '2': ['1','2','3','4','5','6'],  // §2. Tích phân
    '3': ['1','2','3','4','5'],      // §3. Ứng dụng tích phân
  },
  // Chương 6: Một số yếu tố xác suất
  '2D6': {
    '1': ['1','2','3','4'],          // §1. Xác suất có điều kiện
    '2': ['1','2','3','4'],          // §2. XS toàn phần. Bayes
  },

  // ─── HÌNH HỌC 12 ────────────────────────────────
  // Chương 2: Tọa độ véc-tơ trong không gian
  '2H2': {
    '1': ['1','2','3','4'],          // §1. Véc-tơ và các phép toán (chưa toạ độ)
    '2': ['1','2','3','4','5','6'],  // §2. Toạ độ của véc-tơ và các công thức
  },
  // Chương 5: PT mặt phẳng, đường thẳng, mặt cầu
  '2H5': {
    '1': ['1','2','3','4','5','6','7'], // §1. PT mặt phẳng
    '2': ['1','2','3','4','5','6','7','8'], // §2. PT đường thẳng
    '3': ['1','2','3','4'],          // §3. PT mặt cầu
  },
}

// Derive VALID_CHAPTERS from VALID_VARIANTS for backward compatibility
export const VALID_CHAPTERS: Record<string, Record<string, string[]>> = (() => {
  const result: Record<string, Record<string, string[]>> = { '0': {}, '1': {}, '2': {} }
  for (const key of Object.keys(VALID_VARIANTS)) {
    const grade = key[0]
    const subject = key[1]
    const chapter = key[2]
    if (!result[grade][subject]) result[grade][subject] = []
    result[grade][subject].push(chapter)
  }
  return result
})()

export function validateCategoryCode(code: string): { valid: boolean; error?: string } {
  const trimmed = code.trim()
  const match = trimmed.match(CATEGORY_CODE_REGEX)
  
  if (!match) {
    return { valid: false, error: 'Không đúng định dạng ID 6 tham số' }
  }

  const [, gradeCode, subjectArea, chapterStr, , lessonStr, variantStr] = match
  const subjectName = subjectArea === 'D' ? 'Đại số' : subjectArea === 'H' ? 'Hình học' : 'Chuyên đề'
  const gradeName = gradeCode === '0' ? '10' : gradeCode === '1' ? '11' : '12'

  // Kiểm tra lớp
  const validForGrade = VALID_CHAPTERS[gradeCode]
  if (!validForGrade) return { valid: false, error: 'Lớp không hợp lệ' }
  
  // Kiểm tra phân môn
  const validChapters = validForGrade[subjectArea]
  if (!validChapters) return { valid: false, error: `Phân môn ${subjectName} không tồn tại ở lớp ${gradeName}` }
  
  // Kiểm tra chương
  if (!validChapters.includes(chapterStr)) {
    return { 
      valid: false, 
      error: `Chương ${chapterStr} không thuộc môn ${subjectName} lớp ${gradeName}` 
    }
  }

  // Kiểm tra bài (lesson)
  const chapterKey = `${gradeCode}${subjectArea}${chapterStr}`
  const validLessons = VALID_VARIANTS[chapterKey]
  if (!validLessons) {
    return { valid: false, error: `Không tìm thấy dữ liệu bài cho ${chapterKey}` }
  }

  const validVariantsForLesson = validLessons[lessonStr]
  if (!validVariantsForLesson) {
    const availableLessons = Object.keys(validLessons).join(', ')
    return { 
      valid: false, 
      error: `Bài ${lessonStr} không tồn tại trong Chương ${chapterStr} ${subjectName} lớp ${gradeName} (các bài hợp lệ: ${availableLessons})` 
    }
  }

  // Kiểm tra dạng (variant)
  if (!validVariantsForLesson.includes(variantStr)) {
    const availableVariants = validVariantsForLesson.join(', ')
    return { 
      valid: false, 
      error: `Dạng ${variantStr} không tồn tại trong Bài ${lessonStr}, Chương ${chapterStr} ${subjectName} lớp ${gradeName} (các dạng hợp lệ: ${availableVariants})` 
    }
  }
  
  return { valid: true }
}

export interface CategoryInfo {
  category_code: string
  grade: 10 | 11 | 12
  subject_area: SubjectArea
  chapter: number
  difficulty: Difficulty
  lesson: number
  variant: number
}

/**
 * Parse mã phân loại 6 tham số từ string
 * @param code - VD: '2D1N3-1'
 * @returns CategoryInfo hoặc null nếu không hợp lệ
 */
export function parseCategoryCode(code: string): CategoryInfo | null {
  const trimmed = code.trim()
  const validation = validateCategoryCode(trimmed)
  
  if (!validation.valid) return null

  const match = trimmed.match(CATEGORY_CODE_REGEX)!
  const [, gradeCode, subjectArea, chapterStr, difficulty, lessonStr, variantStr] = match

  // Map grade code → actual grade
  const gradeMap: Record<string, 10 | 11 | 12> = {
    '0': 10,   // lớp 10 hoặc THCS chung (dùng 10 làm mặc định)
    '1': 11,
    '2': 12,
  }

  return {
    category_code: trimmed,
    grade: gradeMap[gradeCode],
    subject_area: subjectArea as SubjectArea,
    chapter: parseInt(chapterStr),
    difficulty: difficulty as Difficulty,
    lesson: parseInt(lessonStr),
    variant: parseInt(variantStr),
  }
}

/**
 * Trích xuất tất cả comment %[...] từ block \begin{ex}...\end{ex}
 * Trả về mảng các string trong dấu %[...]
 */
export function extractComments(latexBlock: string): string[] {
  const results: string[] = []
  // Regex: %[nội dung] — có thể có khoảng trắng xung quanh
  const regex = /%\[([^\]]+)\]/g
  let match
  while ((match = regex.exec(latexBlock)) !== null) {
    results.push(match[1].trim())
  }
  return results
}

/**
 * Tìm category_code hợp lệ trong danh sách comments
 * Trả về CategoryInfo đầu tiên tìm thấy, hoặc null
 */
export function findValidCategoryCode(comments: string[]): CategoryInfo | null {
  for (const comment of comments) {
    const info = parseCategoryCode(comment)
    if (info) return info
  }
  return null
}

/**
 * Detect loại hình ảnh trong block LaTeX
 */
export function detectImageType(latexBlock: string): { has_image: boolean; image_type: ImageType } {
  // \immini[...]{...}{...} — hình nằm cạnh đề
  if (/\\immini/.test(latexBlock)) {
    return { has_image: true, image_type: 'immini' }
  }
  // \begin{center}...\begin{tikzpicture} hoặc \includegraphics trong center
  if (/\\begin\{center\}[\s\S]*?(\\begin\{tikzpicture\}|\\includegraphics)/m.test(latexBlock)) {
    return { has_image: true, image_type: 'center' }
  }
  return { has_image: false, image_type: 'none' }
}
