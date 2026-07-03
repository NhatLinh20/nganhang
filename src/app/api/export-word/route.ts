// src/app/api/export-word/route.ts
// API endpoint orchestrator: Xuất file Word (.docx) qua pandoc trên VPS (hot-reloaded)
// Pipeline: parse LaTeX → expand macros → compile TikZ → build clean LaTeX → pandoc → .docx → ZIP

import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { generateTNMakerExcel, generateAZOTAExcel, generateYoungMixExcel, generateSmartTestExcel, generateOLMExcel, buildExamAnswers, parseMCAnswer, getAnswer, buildAnswerSheetTex } from '@/lib/answer-export-utils'
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
  referencePath: string | undefined,
  examCode: string
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
  return postProcessDocx(docxBuffer, examCode)
}

function postProcessDocx(buffer: Buffer, examCode: string): Buffer {
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

      // ─────────────────────────────────────────────────────────────────
      // INJECT FOOTER
      // ─────────────────────────────────────────────────────────────────
      const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Footer"/>
      <w:jc w:val="right"/>
    </w:pPr>
    <w:r>
      <w:t xml:space="preserve">Trang </w:t>
    </w:r>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:t>1</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
    <w:r><w:t>/</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:t>1</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
    <w:r>
      <w:t xml:space="preserve"> - Mã đề ${examCode}</w:t>
    </w:r>
  </w:p>
</w:ftr>`;
      zip.addFile('word/footer1.xml', Buffer.from(footerXml, 'utf-8'));

      let relsXml = zip.readAsText('word/_rels/document.xml.rels');
      if (relsXml && !relsXml.includes('footer1.xml')) {
        relsXml = relsXml.replace('</Relationships>', '  <Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>\n</Relationships>');
        zip.updateFile('word/_rels/document.xml.rels', Buffer.from(relsXml, 'utf-8'));
      }

      let contentTypes = zip.readAsText('[Content_Types].xml');
      if (contentTypes && !contentTypes.includes('/word/footer1.xml')) {
        contentTypes = contentTypes.replace('</Types>', '  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>\n</Types>');
        zip.updateFile('[Content_Types].xml', Buffer.from(contentTypes, 'utf-8'));
      }

      const footerRef = '<w:footerReference w:type="default" r:id="rIdFooter1"/>';
      if (!xml.includes(footerRef)) {
        xml = xml.replace(/(<w:sectPr[^>]*>)/g, `$1${footerRef}`);
        zip.updateFile('word/document.xml', Buffer.from(xml, 'utf-8'));
      }

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
      includeAnswerTable,
      includeAnswerSheet,
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
      const examTex = buildExamLatex({ header, questions: wordQuestions, imagePaths, includeAnswerTable })

      // Build đề + lời giải
      const examWithSolTex = buildExamWithSolutionLatex({ header, questions: wordQuestions, imagePaths, includeAnswerTable })

      try {
        const t1 = Date.now()
        const docxBuffer = await convertToDocs(examTex, imageFiles, referencePath, code)
        outputZip.addFile(`de_${code}.docx`, docxBuffer)
        console.log(`[export-word] Converted de_${code}.docx in ${Date.now() - t1}ms`)

        const t2 = Date.now()
        const solDocxBuffer = await convertToDocs(examWithSolTex, imageFiles, referencePath, code)
        outputZip.addFile(`de_${code}_loigiai.docx`, solDocxBuffer)
        console.log(`[export-word] Converted de_${code}_loigiai.docx in ${Date.now() - t2}ms`)
      } catch (err) {
        const errorMsg = String(err) + ((err as any).stack ? '\n' + (err as any).stack : '')
        console.error(`[export-word] Convert failed for code=${code}:`, err)
        outputZip.addFile(`de_${code}_LOFAIL.tex`, Buffer.from(examTex + '\n\n% ERROR:\n% ' + errorMsg, 'utf-8'))
        outputZip.addFile(`de_${code}_loigiai_LOFAIL.tex`, Buffer.from(examWithSolTex + '\n\n% ERROR:\n% ' + errorMsg, 'utf-8'))
      }
    }

    
    // ── Generate QR Codes for Apps (TNMaker, Smart Test, etc) ──
    const qrTypes = qrCodeOptions || []
    if (qrTypes.length > 0) {
      try {
        const typeNames: Record<string, string> = { '0': 'tnmaker', '1': 'youngmix', '3': 'smarttest' }

        for (const qrType of qrTypes) {
          const typeNum = parseInt(qrType, 10)
          const typeName = typeNames[qrType] || `type${qrType}`
          const jsons: string[] = []

          if (typeNum === 0) {
            // TNMaker format: {"success":true,"type":0,"code1":"ABCD",...}
            for (let i = 0; i < examSets.length; i += 9) {
              const chunk = examSets.slice(i, i + 9)
              const codeChunk = codes.slice(i, i + 9)
              const obj: any = { success: true, type: 0 }
              for (let j = 0; j < chunk.length; j++) {
                const mcQs = chunk[j].filter(q => q.question_type === 'multiple_choice')
                const tfQs = chunk[j].filter(q => q.question_type === 'true_false')
                const saQs = chunk[j].filter(q => q.question_type === 'short_answer')
                let answerStr = ''
                for (const q of mcQs) {
                  const ans = q.correct_answer?.trim() || parseMCAnswer(q.latex_content) || 'A'
                  answerStr += ans.charAt(0).toUpperCase()
                }
                for (const q of tfQs) {
                  const ans = getAnswer(q)
                  if (ans.length === 4) answerStr += ans
                  else answerStr += ans.padEnd(4, 'S')
                }
                if (saQs.length > 0) {
                  answerStr += '#' + saQs.map(q => getAnswer(q)).join('#')
                }
                obj[codeChunk[j]] = answerStr
              }
              jsons.push(JSON.stringify(obj))
            }
          } else {
            // Young Mix (1) / Smart Test (3) format: 2D array
            const allRows: (string | number)[][] = []
            for (let i = 0; i < examSets.length; i++) {
              const row: (string | number)[] = [codes[i]]
              const answers = buildExamAnswers(examSets[i])
              row.push(...answers)
              allRows.push(row)
            }
            const MAX_CELLS = 492
            let currentChunk: (string | number)[][] = []
            let currentCells = 0
            for (const row of allRows) {
              const cellCount = row.length
              if (currentCells + cellCount > MAX_CELLS && currentChunk.length > 0) {
                jsons.push(JSON.stringify(currentChunk))
                currentChunk = []
                currentCells = 0
              }
              currentChunk.push(row)
              currentCells += cellCount
            }
            if (currentChunk.length > 0) {
              jsons.push(JSON.stringify(currentChunk))
            }
          }

          // Generate PNG for each chunk of this type
          for (let i = 0; i < jsons.length; i++) {
            const suffix = jsons.length > 1 ? `_${i + 1}` : ''
            const filename = `qrcode_${typeName}${suffix}.png`
            const pngBuffer = await QRCode.toBuffer(jsons[i], { errorCorrectionLevel: 'L', width: 500, margin: 1 })
            outputZip.addFile(`DAP-AN/${filename}`, pngBuffer)
          }
        }
      } catch (qrErr) {
        console.error('QR Code generation error:', qrErr)
      }
    }

    // ── Generate answer Excel files ──
    try {
      const opts = excelOptions || []
      const isAll = opts.includes('all') || opts.length === 5

      if (isAll || opts.includes('tnmaker')) {
        const tnmakerBuf = generateTNMakerExcel(examSets, codes)
        outputZip.addFile('DAP-AN/bang_dap_an_tnmaker.xlsx', tnmakerBuf)
      }

      if (isAll || opts.includes('azota')) {
        const azotaBuf = generateAZOTAExcel(examSets, codes)
        outputZip.addFile('DAP-AN/bang_dap_an_azota.xlsx', azotaBuf)
      }

      if (isAll || opts.includes('youngmix')) {
        const ymBuf = generateYoungMixExcel(examSets, codes)
        outputZip.addFile('DAP-AN/bang_dap_an_youngmix.xlsx', ymBuf)
      }

      if (isAll || opts.includes('smarttest')) {
        const stBuf = generateSmartTestExcel(examSets, codes)
        outputZip.addFile('DAP-AN/bang_dap_an_smarttest.xlsx', stBuf)
      }

      if (isAll || opts.includes('olm')) {
        const olmBuf = generateOLMExcel(examSets, codes)
        outputZip.addFile('DAP-AN/bang_dap_an_olm.xlsx', olmBuf)
      }
    } catch (xlsxErr) {
      console.error('Excel generation error (non-fatal):', xlsxErr)
      // Non-fatal: still return ZIP without Excel files
    }

    // ── Generate PDF Answer Sheet ──
    if (includeAnswerSheet) {
      try {
        console.log('[export-word] Generating Answer Sheet PDF...')
        const configDir = path.join(process.cwd(), 'public', 'latex-config')
        const ansZip = new AdmZip()
        
        // Add shared files
        const sharedFiles = ['khaibaochung.tex', 'ex_test.sty', 'ex_tkz-euclide.sty', 'tkz-linknodes.sty', 'tkz-tab-vn.sty', 'twemojis.sty']
        for (const filename of sharedFiles) {
          const filePath = path.join(configDir, filename)
          if (fs.existsSync(filePath)) ansZip.addFile(filename, fs.readFileSync(filePath))
        }
        
        // Add empty folders
        ansZip.addFile('ans/', Buffer.alloc(0))
        ansZip.addFile('data/', Buffer.alloc(0))

        let mainTex = '\\documentclass[12pt,a4paper,twoside]{book}\n'
        mainTex += '\\input{khaibaochung}\n'
        mainTex += '\\begin{document}\n'
        
        for (let i = 0; i < examSets.length; i++) {
          const qs = examSets[i]
          const mcCount = qs.filter(q => ['Trắc nghiệm', '1'].includes(String(q.question_type)) || String(q.phan) === '1').length
          const tfCount = qs.filter(q => ['Đúng/Sai', '2'].includes(String(q.question_type)) || String(q.phan) === '2').length
          const saCount = qs.filter(q => ['Trả lời kết quả', '3'].includes(String(q.question_type)) || String(q.phan) === '3').length
          
          mainTex += buildAnswerSheetTex(codes[i], mcCount, tfCount, saCount)
        }
        mainTex += '\\end{document}\n'
        
        ansZip.addFile('main.tex', Buffer.from(mainTex, 'utf-8'))
        const ansZipBuffer = ansZip.toBuffer()

        // Call VPS to compile PDF
        const API_URL = process.env.NEXT_PUBLIC_TIKZ_API_URL || process.env.TIKZ_API_URL || ''
        if (API_URL) {
          const formData = new FormData()
          formData.append('file', new Blob([ansZipBuffer], { type: 'application/zip' }), 'exam.zip')
          const pdfRes = await fetch(`${API_URL}/compile-zip`, {
            method: 'POST',
            body: formData,
          })
          if (pdfRes.ok) {
            const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())
            outputZip.addFile('phieu_tra_loi_trac_nghiem.pdf', pdfBuffer)
            console.log('[export-word] Included phieu_tra_loi_trac_nghiem.pdf successfully.')
          } else {
            console.error('[export-word] VPS /compile-zip error for answer sheet:', await pdfRes.text())
          }
        }
      } catch (pdfErr) {
        console.error('Answer Sheet PDF generation error (non-fatal):', pdfErr)
      }
    }


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
