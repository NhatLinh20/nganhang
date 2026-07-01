// src/app/api/export-word/route.ts
// API endpoint orchestrator: Xuất file Word (.docx) qua pandoc trên VPS (hot-reloaded)
// Pipeline: parse LaTeX → expand macros → compile TikZ → build clean LaTeX → pandoc → .docx → ZIP

import { NextRequest, NextResponse } from 'next/server'
import AdmZip from 'adm-zip'
import * as fs from 'fs'
import * as path from 'path'
import { parseWordQuestion, WordQuestion, preprocessWordTexContent } from '@/lib/latex-parser/word-parser'
import { detectUnknownCommands } from '@/lib/latex-parser/latex-math-expander'
import { buildExamLatex, buildExamWithSolutionLatex } from '@/lib/word-latex-builder'
import { batchCompileTikz } from '@/lib/tikz-server'

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

interface ExamQuestion {
  id: string
  latex_content: string
  question_type: string
  correct_answer?: string
  phan?: number
}

// ─────────────────────────────────────────────────────────────────
// VPS: CONVERT .tex + images → .docx via pandoc
// ─────────────────────────────────────────────────────────────────

async function convertToDocs(
  texContent: string,
  imagePaths: Map<string, { svgBuffer: Buffer; filename: string }>,
  referencePath?: string
): Promise<Buffer> {
  const apiUrl = process.env.NEXT_PUBLIC_TIKZ_API_URL || process.env.TIKZ_API_URL || ''
  if (!apiUrl) throw new Error('TIKZ_API_URL không được cấu hình — không thể gọi VPS')

  // Đóng gói vào ZIP: document.tex + images/ + reference.docx (nếu có)
  const zip = new AdmZip()
  zip.addFile('document.tex', Buffer.from(texContent, 'utf-8'))

  for (const [, { svgBuffer, filename }] of imagePaths) {
    zip.addFile(`images/${filename}`, svgBuffer)
  }

  if (referencePath && fs.existsSync(referencePath)) {
    zip.addFile('reference.docx', fs.readFileSync(referencePath))
  }

  const zipBuffer = zip.toBuffer()

  // Gửi lên VPS POST /convert-to-docx
  const formData = new FormData()
  formData.append('file', new Blob([zipBuffer], { type: 'application/zip' }), 'input.zip')

  const DOCX_API = process.env.NEXT_PUBLIC_DOCX_API_URL || apiUrl
  const response = await fetch(`${DOCX_API}/convert-to-docx`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => `HTTP ${response.status}`)
    throw new Error(`VPS /convert-to-docx lỗi: ${errText}`)
  }

  const docxBuffer = Buffer.from(await response.arrayBuffer())
  return postProcessDocx(docxBuffer)
}

function postProcessDocx(buffer: Buffer): Buffer {
  try {
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(buffer)
    const entry = zip.getEntry('word/document.xml')
    if (entry) {
      let xml = zip.readAsText(entry)

      // 1. Canh giữa dòng HẾT và hình ảnh
      xml = xml.replace(/<w:p(?=[^>]*>|>)(?:(?!<\/w:p>).)*?(?:HẾT|<w:drawing>)(?:(?!<\/w:p>).)*?<\/w:p>/g, (match: string) => {
        if (!match.includes('<w:jc w:val="center"/>')) {
          if (match.includes('<w:pPr>')) {
            return match.replace('</w:pPr>', '<w:jc w:val="center"/></w:pPr>')
          } else {
            return match.replace('>', '><w:pPr><w:jc w:val="center"/></w:pPr>')
          }
        }
        return match
      })

      // 2. Xử lý bảng header (bảng đầu tiên): full width, canh giữa, tỉ lệ cột
      const tblStart = xml.indexOf('<w:tbl>')
      const tblEnd = xml.indexOf('</w:tbl>', tblStart)
      if (tblStart !== -1 && tblEnd !== -1) {
        const beforeTbl = xml.substring(0, tblStart)
        let tblContent = xml.substring(tblStart, tblEnd + '</w:tbl>'.length)
        const afterTbl = xml.substring(tblEnd + '</w:tbl>'.length)

        // 2a. Bảng chiếm 100% chiều ngang trang (thay thế mọi w:tblW)
        tblContent = tblContent.replace(
          /<w:tblW [^>]*\/>/g,
          '<w:tblW w:type="pct" w:w="5000" />'
        )

        // 2b. Ép ẩn hoàn toàn đường kẻ viền (table borders)
        const noBordersXML = `<w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>`
        if (tblContent.includes('<w:tblBorders>')) {
          tblContent = tblContent.replace(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/, noBordersXML)
        } else {
          tblContent = tblContent.replace(/(<w:tblPr>)/, `$1${noBordersXML}`)
        }

        // Xoá tất cả w:tcW để các ô tự động co giãn theo lưới và tỉ lệ %
        tblContent = tblContent.replace(/<w:tcW [^>]*\/>/g, '')

        // 2b. Thay grid 2 cột bằng grid 10 cột (mỗi cột 10%)
        //     Rows 0-3: cell1 span 4 (40%) + cell2 span 6 (60%)
        //     Row  4:   cell1 span 8 (80%) + cell2 span 2 (20%)
        const gridCol10 = Array(10).fill('<w:gridCol w:w="1049" />').join('')
        tblContent = tblContent.replace(
          /<w:tblGrid>[\s\S]*?<\/w:tblGrid>/,
          `<w:tblGrid>${gridCol10}</w:tblGrid>`
        )

        // 2c. Tách các dòng <w:tr>...</w:tr>
        const trParts: { start: number; end: number }[] = []
        let searchFrom2 = 0
        while (true) {
          const trOpen = tblContent.indexOf('<w:tr>', searchFrom2)
          if (trOpen === -1) break
          const trClose = tblContent.indexOf('</w:tr>', trOpen)
          if (trClose === -1) break
          trParts.push({ start: trOpen, end: trClose + '</w:tr>'.length })
          searchFrom2 = trClose + '</w:tr>'.length
        }

        // Xử lý từ cuối lên để không bị lệch index
        for (let rowIdx = trParts.length - 1; rowIdx >= 0; rowIdx--) {
          const { start, end } = trParts[rowIdx]
          let rowXml = tblContent.substring(start, end)
          const isLastRow = rowIdx === trParts.length - 1

          // Xác định gridSpan cho 2 ô trong dòng này
          const span1 = isLastRow ? 8 : 4  // cột trái
          const span2 = isLastRow ? 2 : 6  // cột phải

          // Thêm gridSpan và tcW (phần trăm) vào tcPr của từng ô.
          let cellIdx = 0
          rowXml = rowXml.replace(/<w:tcPr(\s*\/>|>)/g, (match: string, suffix: string) => {
            const isFirstCol = cellIdx === 0
            const span = isFirstCol ? span1 : span2
            const widthPct = isFirstCol 
                ? (isLastRow ? 4000 : 2000) 
                : (isLastRow ? 1000 : 3000)
            
            let injected = `<w:gridSpan w:val="${span}" /><w:tcW w:type="pct" w:w="${widthPct}" />`
            
            // Canh giữa theo chiều dọc và hiển thị đường kẻ viền cho ô Mã đề (dòng cuối, cột 2)
            if (isLastRow && !isFirstCol) {
              injected += '<w:vAlign w:val="center" />'
              injected += '<w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto" /><w:left w:val="single" w:sz="4" w:space="0" w:color="auto" /><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto" /><w:right w:val="single" w:sz="4" w:space="0" w:color="auto" /></w:tcBorders>'
            }
            
            cellIdx++
            
            if (suffix.includes('/')) {
              return `<w:tcPr>${injected}</w:tcPr>`
            } else {
              return `<w:tcPr>${injected}`
            }
          })

          // Canh giữa
          if (!isLastRow) {
            // Dòng 0..N-2: canh giữa TẤT CẢ các ô
            rowXml = rowXml.replace(/<w:jc w:val="left" \/>/g, '<w:jc w:val="center" />')
          } else {
            // Dòng cuối: chỉ canh giữa ô phải (Mã đề)
            const lastTcIdx = rowXml.lastIndexOf('<w:tc>')
            if (lastTcIdx !== -1) {
              const beforeLastTc = rowXml.substring(0, lastTcIdx)
              const lastTcContent = rowXml.substring(lastTcIdx)
              const fixedLastTc = lastTcContent.replace(/<w:jc w:val="left" \/>/g, '<w:jc w:val="center" />')
              rowXml = beforeLastTc + fixedLastTc
            }
          }

          tblContent = tblContent.substring(0, start) + rowXml + tblContent.substring(end)
        }

        xml = beforeTbl + tblContent + afterTbl
      }

      zip.updateFile(entry, Buffer.from(xml))
      return zip.toBuffer()
    }
  } catch (e) {
    console.error('Lỗi post-process docx:', e)
  }
  return buffer
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

/** Parse danh sách ExamQuestion → WordQuestion[], thu thập tất cả TikZ keys */
function parseExamSet(questions: ExamQuestion[]): {
  wordQuestions: WordQuestion[]
  allTikzCodes: Map<string, string>  // key → tikz code
} {
  const wordQuestions: WordQuestion[] = []
  const allTikzCodes = new Map<string, string>()

  for (const q of questions) {
    const raw = q.latex_content || ''
    const cleaned = preprocessWordTexContent(raw)
    const wq = parseWordQuestion(cleaned)
    // Ghi đè correct_answer từ DB nếu có
    if (q.correct_answer && wq.questionType === 'multiple_choice' && wq.choices) {
      const ans = q.correct_answer.trim().toUpperCase()
      wq.choices.forEach(c => { c.isCorrect = c.label === ans })
    }
    wordQuestions.push(wq)

    // Thu thập TikZ codes từ wordQuestion
    for (const key of wq.tikzKeys) {
      if (!allTikzCodes.has(key)) {
        // Tìm lại code từ segments
        const code = findTikzCode(wq, key)
        if (code) allTikzCodes.set(key, code)
      }
    }
  }

  return { wordQuestions, allTikzCodes }
}

/** Tìm TikZ code từ WordQuestion theo key */
function findTikzCode(wq: WordQuestion, key: string): string | null {
  const allSegments = [
    ...wq.bodySegments,
    ...(wq.choices?.flatMap(c => c.segments) || []),
    ...(wq.tfStatements?.flatMap(s => s.segments) || []),
    ...(wq.solutionSegments || []),
  ]
  for (const seg of allSegments) {
    if (seg.type === 'tikz' && seg.key === key) return seg.code
  }
  return null
}

// ─────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const bodyText = await request.text()
    const {
      title,
      duration,
      grade,
      questions,
      exams,
      headerLabels,
      headerStyles,
      examCodes,
      excelOptions,
      qrCodeOptions,
    } = JSON.parse(bodyText)

    const displayTitle = title || 'ĐỀ KIỂM TRA'
    const displayGrade = grade || 12
    const displayDuration = duration || 90
    const validHeaderLabels = Array.isArray(headerLabels) && headerLabels.length === 8 ? headerLabels : undefined
    const validHeaderStyles = Array.isArray(headerStyles) && headerStyles.length === 8 ? headerStyles : undefined
    const validExamCodes = Array.isArray(examCodes) ? examCodes : []

    // ── Chuẩn bị examSets ──
    const examSets: ExamQuestion[][] = []
    if (Array.isArray(exams) && exams.length > 1) {
      for (const e of exams) {
        if (e.questions && Array.isArray(e.questions)) examSets.push(e.questions)
      }
    } else if (Array.isArray(questions)) {
      examSets.push(questions)
    }

    if (examSets.length === 0) {
      return NextResponse.json({ error: 'Thiếu câu hỏi' }, { status: 400 })
    }

    const codes = examSets.map((_, i) => validExamCodes[i] ?? `${i + 1}`)

    // ── BƯỚC 1: Parse tất cả câu hỏi → WordQuestion[] ──
    console.log(`[export-word] Parsing ${examSets.reduce((s, e) => s + e.length, 0)} questions...`)
    const parsedExams: WordQuestion[][] = []
    const globalTikzCodes = new Map<string, string>()  // key → code (deduped)

    for (const examSet of examSets) {
      const { wordQuestions, allTikzCodes } = parseExamSet(examSet)
      parsedExams.push(wordQuestions)
      for (const [k, v] of allTikzCodes) {
        if (!globalTikzCodes.has(k)) globalTikzCodes.set(k, v)
      }
    }

    // ── BƯỚC 2: Batch compile TikZ → SVG ──
    const tikzKeys = Array.from(globalTikzCodes.keys())
    let tikzSvgMap = new Map<string, string>()  // code → SVG string (keyed by code, not key)

    if (tikzKeys.length > 0) {
      console.log(`[export-word] Compiling ${tikzKeys.length} unique TikZ images...`)
      const tikzCodes = tikzKeys.map(k => globalTikzCodes.get(k)!)
      try {
        const result = await batchCompileTikz(tikzCodes, 3)
        for (const [code, data] of result.imageMap) {
          tikzSvgMap.set(code, data.svg)
        }
        console.log(`[export-word] TikZ: ${result.stats.unique} compiled in ${result.stats.durationMs}ms`)
      } catch (err) {
        console.error('[export-word] TikZ batch compile error:', err)
        // Tiếp tục mà không có hình — sẽ dùng placeholder
      }
    }

    // Build imagePaths map: key → relative path trong ZIP + buffer
    // SVG → dùng SVG trực tiếp (pandoc có thể đọc SVG với --resource-path)
    // hoặc chuyển sang PNG — hiện tại dùng SVG để đơn giản
    const imageFiles = new Map<string, { svgBuffer: Buffer; filename: string }>()
    const imagePaths = new Map<string, string>()  // key → path trong ZIP

    for (const [key, code] of globalTikzCodes) {
      const svg = tikzSvgMap.get(code)
      if (svg) {
        const filename = `${key}.svg`
        imageFiles.set(key, { svgBuffer: Buffer.from(svg, 'utf-8'), filename })
        imagePaths.set(key, `images/${filename}`)
      }
    }

    // Logging unknown commands
    let mathFallbackCount = 0
    let mathTotalCount = 0
    for (const exam of parsedExams) {
      for (const wq of exam) {
        const unknown = detectUnknownCommands(wq.rawLatex)
        mathTotalCount += 1
        if (unknown.length > 0) {
          mathFallbackCount += unknown.length
          console.warn(`[export-word] Unknown commands in question ${wq.id}: ${unknown.join(', ')}`)
        }
      }
    }

    // ── BƯỚC 3: Build .tex và convert từng mã đề ──
    const referencePath = path.join(process.cwd(), 'public', 'word-config', 'reference.docx')
    const outputZip = new AdmZip()

    console.log(`[export-word] Converting ${examSets.length} exam(s) to .docx...`)

    for (let i = 0; i < parsedExams.length; i++) {
      const wordQuestions = parsedExams[i]
      const code = codes[i]

      const header = {
        labels: validHeaderLabels || [
          'SỞ GDĐT ...',
          'TRƯỜNG THPT ...',
          'Đề chính thức',
          '',
          displayTitle,
          `MÔN TOÁN ${displayGrade}`,
          `THỜI GIAN: ${displayDuration} PHÚT`,
          '(Không kể thời gian phát đề)',
        ],
        styles: validHeaderStyles,
        examCode: code,
        duration: displayDuration,
        grade: displayGrade,
      }

      // Build đề thuần
      const examTex = buildExamLatex({ header, questions: wordQuestions, imagePaths })
      require('fs').writeFileSync('d:/nganhang/debug_export.tex', examTex)

      // Build đề + lời giải
      const examWithSolTex = buildExamWithSolutionLatex({ header, questions: wordQuestions, imagePaths })
      require('fs').writeFileSync('d:/nganhang/debug_export_loigiai.tex', examWithSolTex)

      try {
        const t1 = Date.now()
        const docxBuffer = await convertToDocs(examTex, imageFiles, referencePath)
        outputZip.addFile(`de_${code}.docx`, docxBuffer)
        console.log(`[export-word] Converted de_${code}.docx in ${Date.now() - t1}ms`)

        const t2 = Date.now()
        const solDocxBuffer = await convertToDocs(examWithSolTex, imageFiles, referencePath)
        outputZip.addFile(`de_${code}_loigiai.docx`, solDocxBuffer)
        console.log(`[export-word] Converted de_${code}_loigiai.docx in ${Date.now() - t2}ms`)
      } catch (err) {
        console.error(`[export-word] Convert failed for code=${code}:`, err)
        require('fs').writeFileSync(`d:/nganhang/LOFAIL_ERROR_${code}.txt`, String(err) + '\n' + (err as any).stack)
        // Thêm file .tex thay thế nếu pandoc lỗi
        outputZip.addFile(`de_${code}_LOFAIL.tex`, Buffer.from(examTex, 'utf-8'))
        outputZip.addFile(`de_${code}_loigiai_LOFAIL.tex`, Buffer.from(examWithSolTex, 'utf-8'))
      }
    }

    // ── BƯỚC 4: Excel đáp án (reuse từ export-zip nếu cần) ──
    // Tạm thời skip Excel — phase 4 sẽ refactor
    // (Giáo viên vẫn dùng export-zip cho Excel)

    // ── BƯỚC 5: Trả về ZIP ──
    const totalMs = Date.now() - startTime
    console.log(
      `[export-word] Done in ${totalMs}ms. Math: ${mathTotalCount} questions, ${mathFallbackCount} with unknown commands.`
    )

    const sanitizedTitle = displayTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const zipBuffer = outputZip.toBuffer()

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${sanitizedTitle}_word.zip"`,
        'Content-Length': String(zipBuffer.length),
      },
    })
  } catch (err) {
    console.error('[export-word] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi không xác định' },
      { status: 500 }
    )
  }
}
