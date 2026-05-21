// src/lib/latex-parser/parser.test.ts
// Test thủ công parser — chạy bằng: npx tsx src/lib/latex-parser/parser.test.ts

import { parseTexFile } from './file-parser'
import { parseCategoryCode } from './category-parser'
import { detectQuestionType, detectCorrectAnswer, detectTFAnswer, detectMCAnswer } from './answer-parser'

// ═══════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════

const TEST_MC = `\\begin{ex}%[2D1N3-1]
\t\\immini[thm]{Cho hàm số $y=f(x)$ có đồ thị như hình vẽ. Tổng bằng
\t\t\\choice[2]
\t\t\t{\$-5\$}
\t\t\t{\$0\$}
\t\t\t{\\True \$-6\$}
\t\t\t{\$-1\$}}
\t\t\t{
\t\t\t\\begin{tikzpicture}[scale=0.7]
\t\t\t\\draw[->] (-2,0)--(2,0);
\t\t\t\\end{tikzpicture}
\t\t\t}
\t\\loigiai{Quan sát đồ thị...}
\\end{ex}`

const TEST_TF = `\\begin{ex}%[2H5V1-5]
\tCho hình hộp chữ nhật $ABCD.A'B'C'D'$.
\t\\begin{center}
\t\t\\begin{tikzpicture}[scale=.7]
\t\t\\draw (0,0)--(4,0);
\t\t\\end{tikzpicture}
\t\\end{center}
\t\\choiceTF
\t\t{\\True Tọa độ của điểm \$D\$ là \$(0;3;12)\$}
\t\t{Tọa độ của vectơ \$\\overrightarrow{MD}\$ là \$(2;-3;0)\$}
\t\t{\\True Một vectơ pháp tuyến có tọa độ là \$(3;2;1)\$}
\t\t{Khoảng cách từ điểm \$A'\$ lớn hơn \$5\$}
\t\t{\\begin{tikzpicture}\\draw(0,0)--(1,1);\\end{tikzpicture}}
\t\\loigiai{...}
\\end{ex}`

const TEST_SHORT = `\\begin{ex}%[1D6V3-5]
\tSau khi một loại thuốc kháng sinh được tiêm vào cơ thể...
\t\\par
\t\\shortans{9}
\t\\loigiai{Tại thời điểm \$t=0\$...}
\\end{ex}`

const TEST_ESSAY = `\\begin{ex}%[2D4C3-2]
\t\\immini[thm]{Cho bài thi tự luận
\t}{
\t\\begin{tikzpicture}
\t\\draw (0,0)--(1,0);
\t\\end{tikzpicture}
\t}
\t\\loigiai{Lời giải tự luận...}
\\end{ex}`

const TEST_NO_ID = `\\begin{ex}%[Đại số tổ hợp - VD]
\tCâu không có ID chuẩn
\t\\loigiai{...}
\\end{ex}`

const TEST_MULTIPLE = TEST_MC + '\n\\dc{15}\n' + TEST_TF + '\n' + TEST_SHORT

// ═══════════════════════════════════════════════════
// CHẠY TEST
// ═══════════════════════════════════════════════════

function printSeparator(title: string) {
  console.log('\n' + '═'.repeat(60))
  console.log(`  ${title}`)
  console.log('═'.repeat(60))
}

// TEST 1: parseCategoryCode
printSeparator('TEST 1: parseCategoryCode')
const testCodes = ['2D1N3-1', '1H8V2-4', '0D8V2-5', '2H5V1-5', 'invalid', 'ĐS - VD']
testCodes.forEach(code => {
  const result = parseCategoryCode(code)
  console.log(`  "${code}" → ${result ? JSON.stringify(result) : 'null (invalid)'}`)
})

// TEST 2: detectQuestionType
printSeparator('TEST 2: detectQuestionType')
console.log('MC:    ', detectQuestionType(TEST_MC))
console.log('TF:    ', detectQuestionType(TEST_TF))
console.log('Short: ', detectQuestionType(TEST_SHORT))
console.log('Essay: ', detectQuestionType(TEST_ESSAY))

// TEST 3: detectCorrectAnswer
printSeparator('TEST 3: detectCorrectAnswer')
console.log('MC answer:    ', detectMCAnswer(TEST_MC), '(expected: C)')
console.log('TF answer:    ', detectTFAnswer(TEST_TF), '(expected: ĐSĐS)')
console.log('Short answer: ', detectCorrectAnswer(TEST_SHORT, 'short_answer'), '(expected: 9)')
console.log('Essay answer: ', detectCorrectAnswer(TEST_ESSAY, 'essay'), '(expected: null)')

// TEST 3b: \shortans với các dạng đặc biệt
printSeparator('TEST 3b: \\shortans các dạng đặc biệt')

const makeShortBlock = (cmd: string) =>
  `\\begin{ex}%[2D1N3-1]\n\tCâu hỏi.\n\t${cmd}\n\t\\loigiai{...}\n\\end{ex}`

const cases = [
  { input: '\\shortans{9}',       expected: '9'    },
  { input: '\\shortans{2,5}',     expected: '2,5'  },
  { input: '\\shortans[]{2,5}',   expected: '2,5'  },
  { input: '\\shortans[oly]{34}', expected: '34'   },
  { input: '\\shortans{2{,}45}',  expected: '2,45' },
  { input: '\\shortans{-3}',      expected: '-3'   },
  { input: '\\shortans{\\dfrac{1}{2}}', expected: '\\dfrac{1}{2}' },
  { input: '\\shortans{4\\,097}', expected: '4097' },
  { input: '\\shortans []{$0{,}5$}', expected: '0,5' },
  { input: '\\shortans[]{$9$}',   expected: '9' },
]

for (const { input, expected } of cases) {
  const block = makeShortBlock(input)
  const result = detectCorrectAnswer(block, 'short_answer')
  const ok = result === expected ? '✅' : '❌'
  console.log(`  ${ok} ${input.padEnd(28)} → "${result}" (expected: "${expected}")`)
}

// TEST 4: parseTexFile với nhiều câu + \dc{}
printSeparator('TEST 4: parseTexFile (multiple questions)')
const { questions, result, rawBlocks } = parseTexFile(TEST_MULTIPLE, {
  sourceFile: 'test.tex',
})
console.log(`Blocks tìm thấy: ${rawBlocks.length}`)
console.log(`Parse thành công: ${result.success}`)
console.log(`Lỗi: ${result.errors.length}`)
questions.forEach((q, i) => {
  console.log(`  Câu ${i + 1}: [${q.category_code}] ${q.question_type} | answer=${q.correct_answer} | image=${q.image_type}`)
})

// TEST 5: Câu không có ID
printSeparator('TEST 5: Câu không có ID chuẩn')
const { result: noIdResult } = parseTexFile(TEST_NO_ID)
console.log(`Errors:`, noIdResult.errors.map(e => e.reason + ': ' + (e.detail || '')))

// TEST 6: Nhiều câu cùng category_code nhưng nội dung khác — đều được chấp nhận
printSeparator('TEST 6: Nhiều câu CÙNG category_code 2D1N3-1 (nội dung khác nhau)')
const sameIdBlocks = Array.from({ length: 5 }, (_, i) =>
  // Cùng ID 2D1N3-1, nội dung đề bài khác nhau → KHÔNG phải duplicate
  `\\begin{ex}%[2D1N3-1]\n\tCâu hỏi số ${i + 1} về GTLN GTNN. Khác nhau hoàn toàn.\n\t\\choice\n\t\t{A${i}}\n\t\t{B${i}}\n\t\t{\\True C${i}}\n\t\t{D${i}}\n\t\\loigiai{Lời giải ${i + 1}}\n\\end{ex}`
).join('\n')

const { result: sameIdResult } = parseTexFile(sameIdBlocks, { skipDuplicates: true })
console.log(`5 câu cùng ID 2D1N3-1, nội dung khác:`)
console.log(`  → Import thành công: ${sameIdResult.success} câu (expected: 5)`)
console.log(`  → Bị từ chối: ${sameIdResult.skipped} câu (expected: 0)`)

// TEST 7: Câu trùng HOÀN TOÀN (cùng nội dung) mới bị từ chối
printSeparator('TEST 7: Câu trùng nội dung HOÀN TOÀN → bị từ chối')
const dupContent = `\\begin{ex}%[2D1N3-1]\n\tCùng nội dung này.\n\t\\shortans{42}\n\t\\loigiai{...}\n\\end{ex}`
const dupBlocks = [dupContent, dupContent, dupContent].join('\n')  // 3 câu giống hệt

const { result: dupResult } = parseTexFile(dupBlocks, { skipDuplicates: true })
console.log(`3 câu nội dung giống hệt nhau:`)
console.log(`  → Import thành công: ${dupResult.success} câu (expected: 1)`)
console.log(`  → Bị từ chối (duplicate): ${dupResult.skipped} câu (expected: 2)`)

console.log('\n✅ Tất cả test đã chạy xong!\n')

