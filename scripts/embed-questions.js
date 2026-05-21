#!/usr/bin/env node
/**
 * scripts/embed-questions.js
 *
 * Script embedding hàng loạt toàn bộ câu hỏi trong ngân hàng.
 * Sử dụng batchEmbedContents để tránh lỗi 429 (Rate Limit).
 */

const { GoogleGenerativeAI } = require('@google/generative-ai')
const { createClient } = require('@supabase/supabase-js')

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://emidsfdgujxlnwrqizvo.supabase.co'
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtaWRzZmRndWp4bG53cnFpenZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA3MTI1MywiZXhwIjoyMDk0NjQ3MjUzfQ.FPZvfIJ6sE4K7aI0F-4X4gt8yspyfOtTHapirBv0KYY'

// DANH SÁCH API KEY (Thêm nhiều key vào đây để vượt qua giới hạn 1000 câu/ngày)
const API_KEYS = [
  // New API keys added
  'AIzaSyDAglaVuN3ZVtqZr8ifyRLmk75KkHZcL3E',
  'AIzaSyDsKxdgr1VdFUgBnOGSl32LrpoD_cyEDQ0',
  'AIzaSyAlVpQ1q6YPN5FTp12ttROSsBn-QSIjEvM',
  'AIzaSyBmLPO5DvxYgARU-KRf_TDUVOpbpOo1v24',
  'AIzaSyBGXRcQmiqV6dlam1xj3h374K4mWYfrxDg',
  'AIzaSyARAW_kBMmFC8YxJhzxJZqvZvFNehLYLPM',
  'AIzaSyCWww7BpDIZbIASNZ-YzKeKFeI371aVpx8',
  'AIzaSyDigLsTMSmTl6Lg54P0XBXhKWntmt-ClI4',
  'AIzaSyDQyXSp_t7ei_wS1U5QtoaNgcP7FcqFvFg',
  'AIzaSyDQz5mdghBthe2FttZ4Cl_2BnjHIbDg2Ew',
  'AIzaSyDrIppqjUJ9E9xkktCQES6GqU6ovBGgBB8',
  'AIzaSyBFvXRG26JeDkTRTh-wT6o_yp3FWzfLTSA',
  'AIzaSyBguAfo__Nr5k2B3sjhlA4UkaYnSAsHxIo',
  'AIzaSyD4wbXX6yDGlIDQsX06iBFJQzuhUPMeDkc',
  'AIzaSyBN-xZ0pfyHj2STlM-93l26brXPzZLmRUg',
  'AIzaSyByQ8Q2zJpZ304qQLa9YCHCoM-WkuAjRlc',

  // Existing API keys
  'AIzaSyCPVoJ3XM-B2kUEpWdW8ft9TYLofE0b9dc',
  'AIzaSyD3GRSM3pTHXq6EAqNfboEvV8Fm5Q-wspU',
  'AIzaSyBluSrfpn1scwnO6U-uX5vbe96mw3zMQk8',
  'AIzaSyAIGOLTEC1My4cNBu0NK28m5tZyPkjqrY8',
  'AIzaSyCCzxRi9R7W5JJplay1G0z6ZllnzEXWZt8',
  'AIzaSyADWbl0rNQyUcIRofLS3W71n37b65j2RD4',
  'AIzaSyAm4ydahaMV9bVt4OuQnnDp4ux_EgT1uoQ',
  'AIzaSyBDBZHi84O5ilninAkKSYgbL-SzYCVVSm8',
  'AIzaSyAz2pkveed5gRwc-n_swABCmaSIuHXt3gk',
  'AIzaSyDE-LfPFYBMTABd8lwAUwJpXbFCQUW7FAk',
  'AIzaSyAlNJF9k6JjXnUBVkauH71Do73xE-yfcNA',
  'AIzaSyDsyPx0JVW3_YYJF_Xa4E6UH2d-7OhtPgI',
  'AIzaSyC4xhCbAuVZqWtFVGtXW69ESGxF8MKboWg',
  'AIzaSyCK__bjj2slHaHG39LwukM_E2V4EiX_Mq8',
  'AIzaSyAELeqpXFkKy6bO1YEtckF-3khstLirERY',
  'AIzaSyAfQjEcbwIkUsAgzY_YYdZB2KiwgdT-CRk',
  'AIzaSyD4kZOjzm02693-zakikIlzsRY0cUZYdAg',
  'AIzaSyDuk_MvHA5qcUV9_PAgGXrOGjiP-k_rb84',
  'AIzaSyB2HW_42yxMZVBWgoV25GSng-6nezsLh9s',
  'AIzaSyB7qrlGzv7xO4_6ya2v9LdlRcWfYz_7TxE',
  'AIzaSyBxip7hL0svt5I0Kj3vFQMhKKLj-ykA2y8',
  'AIzaSyCXc3sRtMEKWLltr2IXMLelOdIVwhw45II',
  'AIzaSyAjiSFfiudtaavsH_Hl9SJzcxeujO4pwsE',
  'AIzaSyANqr6J_ImW28Tmds1Tgf0_6Pqr92gI23c',
  'AIzaSyAt_Yqbjm8FEazPOeko99tWt9goPsQlO4Q',
  'AIzaSyArZCXt1xXesMCQFiH7Ji_pBHRlbdGkZOE',
  'AIzaSyAjkoK60nar6IdDCmhpCUQXs40xBJoPhao',
  'AIzaSyBG9Ui8V_2xXb_K5hx-nx2BmjXQxttjxOI',
  'AIzaSyDpgh8TeQG2ztlNWB_DF7g8RR0Ijic4ZIc',
  'AIzaSyAaMdHT0cng3xicgwV5MWXlHDVwum5IOHI',
  'AIzaSyBGF6UWNPf4mTxTvBFT2y_UzZbozDnv2bg',
  'AIzaSyBdT3mHSQ3QE9TRwf_DGRm4MQeMD0yVS8c'
]

let currentKeyIndex = 0
let genAI = new GoogleGenerativeAI(API_KEYS[currentKeyIndex])
let embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

// Hàm đổi API Key khi bị hết quota
function switchApiKey() {
  currentKeyIndex++
  if (currentKeyIndex >= API_KEYS.length) {
    console.error('❌ ĐÃ HẾT TOÀN BỘ API KEY! Vui lòng thêm key mới vào mảng API_KEYS.')
    process.exit(1)
  }
  console.log(`\n🔄 Đang chuyển sang API Key thứ ${currentKeyIndex + 1}...`)
  genAI = new GoogleGenerativeAI(API_KEYS[currentKeyIndex])
  embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Hàm tạo text đại diện ────────────────────────────────────────────────────
function buildEmbedText(q) {
  const subjectMap  = { D: 'Đại số', H: 'Hình học', C: 'Chuyên đề' }
  const diffMap     = { N: 'Nhận biết', H: 'Thông hiểu', V: 'Vận dụng', C: 'Vận dụng cao' }
  const typeMap     = { 
    multiple_choice: 'Trắc nghiệm nhiều đáp án', 
    true_false: 'Đúng/Sai', 
    short_answer: 'Trả lời ngắn',
    essay: 'Tự luận'
  }

  let content = q.latex_content || ''
  content = content
    .replace(/\\begin\{ex\}.*?\\end\{ex\}/gs, m => m)
    .replace(/\\begin\{[^}]+\}/g, '')
    .replace(/\\end\{[^}]+\}/g, '')
    .replace(/\\(choice|loigiai|immini|True|False)/g, '')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\\[([^\]]+)\\\]/g, '$1')
    .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)

  return [
    `Lớp ${q.grade}`,
    subjectMap[q.subject_area] || q.subject_area,
    `Chương ${q.chapter}`,
    q.lesson ? `Bài ${q.lesson}` : '',
    q.variant ? `Dạng ${q.variant}` : '',
    diffMap[q.difficulty] || q.difficulty,
    typeMap[q.question_type] || q.question_type,
    content,
  ].filter(Boolean).join(' | ')
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  console.log('🚀 Bắt đầu embedding (Batch Mode chống Rate Limit)...\n')

  const { data: progress } = await supabase.rpc('embedding_progress')
  if (progress?.[0]) {
    const p = progress[0]
    console.log(`📊 Tiến độ hiện tại:`)
    console.log(`   Tổng câu hỏi:    ${p.total_questions}`)
    console.log(`   Đã embed:        ${p.embedded_questions} (${p.progress_pct}%)`)
    console.log(`   Còn lại:         ${p.pending_questions}\n`)
  }

  let offset = 0
  let totalEmbedded = 0
  
  // API Free Tier của Gemini cho phép tối đa 100 requests / phút.
  // batchEmbedContents tính mỗi câu hỏi là 1 request!
  // Do đó, ta chỉ được phép embed tối đa 90 câu mỗi 60 giây để đảm bảo an toàn.
  const BATCH_SIZE = 90 

  while (true) {
    const { data: questions, error } = await supabase
      .from('questions')
      .select('id, category_code, grade, subject_area, chapter, lesson, variant, difficulty, question_type, latex_content')
      .is('embedding', null)
      .range(0, BATCH_SIZE - 1) // Luôn lấy BATCH_SIZE câu chưa embed đầu tiên

    if (error) {
      console.error('❌ Lỗi fetch Supabase:', error.message)
      break
    }

    if (!questions || questions.length === 0) {
      console.log('\n✅ Đã hoàn thành embedding toàn bộ câu hỏi!')
      break
    }

    console.log(`📦 Đang gửi batch ${questions.length} câu lên Gemini...`)

    try {
      const requests = questions.map(q => ({
        content: { parts: [{ text: buildEmbedText(q) }], role: 'user' },
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: 768
      }))

      // Gửi 100 câu trong đúng 1 request API
      const result = await embeddingModel.batchEmbedContents({ requests })
      const embeddings = result.embeddings

      console.log(`   ✓ Đã nhận ${embeddings.length} vectors. Đang lưu vào DB...`)

      // Lưu song song vào DB
      await Promise.all(
        questions.map((q, idx) => {
          const vectorStr = `[${embeddings[idx].values.join(',')}]`
          return supabase.from('questions').update({ embedding: vectorStr }).eq('id', q.id)
        })
      )

      totalEmbedded += questions.length
      console.log(`   ✓ Đã lưu thành công. (Tổng: ${totalEmbedded})`)

      // BẮT BUỘC: Chờ 61 giây để reset quota 100 req/min của Google
      console.log('   ⏳ Chờ 61 giây để tránh Rate Limit (100 req/min)...')
      await sleep(61000)

    } catch (err) {
      console.error('❌ Lỗi xử lý batch:', err.message)
      
      // Lỗi API key hết hạn hoặc không hợp lệ → chuyển key ngay
      if (err.message.includes('API_KEY_INVALID') || err.message.includes('API key expired') || err.message.includes('API key not valid')) {
        console.log('⚠️ Key hiện tại đã HẾT HẠN hoặc KHÔNG HỢP LỆ.')
        switchApiKey()
        await sleep(2000)
      } else if (err.message.includes('429')) {
        // Lỗi 429 có 2 loại: Quota theo phút (chờ 61s) hoặc Quota theo ngày (cần đổi key)
        if (err.message.includes('EmbedContentRequestsPerDay') || err.message.includes('embed_content_free_tier_requests')) {
          console.log('⚠️ Key hiện tại đã HẾT GIỚI HẠN THEO NGÀY (1000 câu/ngày).')
          switchApiKey()
          await sleep(3000)
        } else {
          console.log('⏳ Bị rate limit theo phút, chờ 60 giây trước khi thử lại...')
          await sleep(60000)
        }
      } else {
        // Lỗi không xác định → chờ rồi thử lại
        console.log('⏳ Lỗi không xác định, chờ 10 giây...')
        await sleep(10000)
      }
    }
  }
}

main().catch(console.error)
