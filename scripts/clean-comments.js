#!/usr/bin/env node
/**
 * scripts/clean-comments.js
 *
 * Xóa các chú thích %[...] thừa trong latex_content,
 * chỉ giữ lại ID 6 tham số (VD: 1D5H2-3, 2D3H1-3, 12D1N3-1).
 *
 * Cách dùng:
 *   node scripts/clean-comments.js          # DRY-RUN (chỉ xem, không ghi DB)
 *   node scripts/clean-comments.js --apply  # Ghi thực sự vào DB
 */

const { createClient } = require('@supabase/supabase-js')

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://emidsfdgujxlnwrqizvo.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtaWRzZmRndWp4bG53cnFpenZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA3MTI1MywiZXhwIjoyMDk0NjQ3MjUzfQ.FPZvfIJ6sE4K7aI0F-4X4gt8yspyfOtTHapirBv0KYY'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const DRY_RUN = !process.argv.includes('--apply')
const BATCH_SIZE = 500

// ── Regex nhận diện ID 6 tham số ────────────────────────────────────────────
// Khớp: 1D5H2-3, 2D3H1-3, 12D1N3-1, 2D3V2-2, v.v.
const ID_REGEX = /^\d+[A-Z]\d+[A-Z]\d+-\d+$/

/**
 * Xử lý một chuỗi latex_content:
 * - Tìm tất cả các dòng chứa \begin{ex} hoặc \begin{bt}
 * - Tìm tất cả các cụm %[...] trên dòng đó.
 * - Xóa cụm đó nếu nội dung không khớp định dạng ID 6 tham số.
 * - Trả về chuỗi đã xử lý (hoặc null nếu không thay đổi)
 */
function cleanLatexContent(content) {
  if (!content) return null

  let changed = false
  const lines = content.split('\n')
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    if (line.includes('\\begin{ex}') || line.includes('\\begin{bt}')) {
      
      const originalLine = line;
      let nonIdFound = false;
      
      // Tìm và thay thế tất cả các cụm %[...] trên dòng này
      const newLine = line.replace(/%\[([^\]]*)\]/g, (match, innerText) => {
        const text = innerText.trim()
        // Kiểm tra xem có phải ID không (hỗ trợ cả chữ hoa và chữ thường, nới lỏng chút)
        // VD: 1D5H2-3, 0D3V2-6, 12D1N3-1
        if (/^\d+[a-zA-Z]\d+[a-zA-Z]\d+-\d+$/.test(text)) {
          return match // Giữ nguyên
        } else {
          nonIdFound = true;
          return '' // Xóa bỏ cụm này
        }
      })
      
      if (nonIdFound && newLine !== originalLine) {
        changed = true;
        // Dọn dẹp khoảng trắng thừa nếu có (vd: '%[ID] %[rác]' -> '%[ID] ')
        // Dùng regex để thay thế các khoảng trắng thừa thành 1 khoảng trắng, nhưng cẩn thận không làm hỏng code
        // Tốt nhất chỉ cần trim phần cuối dòng
        lines[i] = newLine.replace(/ +(?=%)/g, '').trimRight()
      }
    }
  }

  return changed ? lines.join('\n') : null
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log(DRY_RUN
    ? '🔍 CHẾ ĐỘ DRY-RUN: Chỉ xem trước, KHÔNG ghi vào database.'
    : '✏️  CHẾ ĐỘ APPLY: Sẽ GHI THỰC SỰ vào database!'
  )
  console.log('═══════════════════════════════════════════════════════════\n')

  let offset = 0
  let totalScanned = 0
  let totalChanged = 0
  let totalNoId = 0
  let totalSkipped = 0
  const previewSamples = [] // lưu tối đa 10 mẫu để in ra

  while (true) {
    const { data: questions, error } = await supabase
      .from('questions')
      .select('id, category_code, latex_content')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) {
      console.error('❌ Lỗi fetch:', error.message)
      break
    }

    if (!questions || questions.length === 0) break

    const updates = []

    for (const q of questions) {
      totalScanned++

      if (!q.latex_content) {
        totalSkipped++
        continue
      }

      const cleaned = cleanLatexContent(q.latex_content)
      if (cleaned === null) {
        // Không có thay đổi
        totalSkipped++
        continue
      }

      // Kiểm tra xem có ID không
      const hasId = /\\begin\{(?:ex|bt)\}%\[\d+[A-Z]\d+[A-Z]\d+-\d+\]/.test(cleaned)
      if (!hasId && /\\begin\{(?:ex|bt)\}/.test(cleaned)) {
        // Có \begin{ex} nhưng không còn ID → cảnh báo
        totalNoId++
      }

      totalChanged++
      updates.push({ id: q.id, category_code: q.category_code, latex_content: cleaned, old_content: q.latex_content })

      // Lưu mẫu preview
      if (previewSamples.length < 10) {
        // Lấy dòng \begin{ex} cũ và mới để so sánh
        const oldLine = q.latex_content.match(/\\begin\{(?:ex|bt)\}(?:%\[[^\]]*\])*/)?.[0] || '(không tìm thấy)'
        const newLine = cleaned.match(/\\begin\{(?:ex|bt)\}(?:%\[[^\]]*\])*/)?.[0] || '(không tìm thấy)'
        previewSamples.push({ id: q.category_code || q.id, oldLine, newLine })
      }
    }

    // Ghi vào DB nếu không phải DRY-RUN
    if (!DRY_RUN && updates.length > 0) {
      for (const u of updates) {
        const { error: updateErr } = await supabase
          .from('questions')
          .update({ latex_content: u.latex_content })
          .eq('id', u.id)

        if (updateErr) {
          console.error(`   ❌ Lỗi cập nhật ${u.category_code}: ${updateErr.message}`)
        }
      }
      console.log(`   ✓ Batch ${offset}–${offset + questions.length - 1}: cập nhật ${updates.length} câu`)
    }

    offset += questions.length

    // Log tiến trình mỗi 2000 câu
    if (totalScanned % 2000 === 0) {
      console.log(`   📊 Đã quét ${totalScanned} câu, thay đổi ${totalChanged} câu...`)
    }

    // Dừng khi hết dữ liệu
    if (questions.length < BATCH_SIZE) break
  }

  // ── In kết quả ──────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('📊 KẾT QUẢ:')
  console.log(`   Tổng quét:          ${totalScanned}`)
  console.log(`   Cần thay đổi:       ${totalChanged}`)
  console.log(`   Không thay đổi:     ${totalSkipped}`)
  console.log(`   ⚠️  Không có ID:     ${totalNoId}`)
  console.log('═══════════════════════════════════════════════════════════')

  if (previewSamples.length > 0) {
    console.log('\n📋 XEM TRƯỚC (tối đa 10 câu đầu tiên):\n')
    for (const s of previewSamples) {
      console.log(`  📌 ${s.id}`)
      console.log(`     Trước: ${s.oldLine}`)
      console.log(`     Sau:   ${s.newLine}`)
      console.log()
    }
  }

  if (DRY_RUN) {
    console.log('💡 Để ghi thực sự vào database, chạy:')
    console.log('   node scripts/clean-comments.js --apply\n')
  } else {
    console.log(`✅ Đã cập nhật ${totalChanged} câu hỏi thành công!\n`)
  }
}

main().catch(console.error)
