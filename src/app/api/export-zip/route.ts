// src/app/api/export-zip/route.ts
import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import AdmZip from 'adm-zip'
import QRCode from 'qrcode'

import { ExamQuestion, generateTNMakerExcel, generateAZOTAExcel, generateYoungMixExcel, generateSmartTestExcel, generateOLMExcel, buildExamAnswers, parseMCAnswer, getAnswer, buildAnswerSheetTex } from '@/lib/answer-export-utils'


// ─── LaTeX Content Builder ────────────────────────────────────────────────────

function buildMaTranTex(
  questions: ExamQuestion[],
  title: string,
  grade: number,
  examLabel?: string,
  headerLabels?: string[],
  examCode?: string,
  headerStyles?: { bold?: boolean; italic?: boolean; underline?: boolean; color?: string }[],
  includeAnswerTable: boolean = true,
  includeAnswerSheet: boolean = false
): string {
  const grouped: Record<number, ExamQuestion[]> = {}
  for (const q of questions) {
    const phan = q.phan ?? 1
    if (!grouped[phan]) grouped[phan] = []
    grouped[phan].push(q)
  }

  let tex = ''

  const labels = headerLabels && headerLabels.length === 8
    ? headerLabels
    : [
        'SỞ GDĐT ...',
        'TRƯỜNG THPT ...',
        'Đề chính thức',
        `(Đề thi gồm có \\zpageref{\\made-lastpage} trang)`,
        title || 'ĐỀ KIỂM TRA',
        `Môn: TOÁN ${grade}`,
        `Thời gian làm bài: 90 phút`,
        `(Không kể thời gian phát đề)`
      ]

  tex += `% Đề thi Toán lớp ${grade}\n`
  if (examCode) {
    tex += `\\def\\made{${examCode}}\n`
  }
  tex += `\\begin{name}\n`
  for (let li = 0; li < labels.length; li++) {
    let labelText = labels[li]
    // If the label is empty/blank, output {\,} and skip styling
    if (li !== 3 && labelText.trim() === '') {
      tex += `\t{\\,}\n`
      continue
    }
    // Apply formatting from headerStyles (skip index 3 — fixed zpageref)
    if (li !== 3 && headerStyles && headerStyles[li]) {
      const s = headerStyles[li]
      if (s.underline) labelText = `\\underline{${labelText}}`
      if (s.italic) labelText = `\\textit{${labelText}}`
      if (s.bold) labelText = `\\textbf{${labelText}}`
      if (s.color) labelText = `\\textcolor{${s.color}}{${labelText}}`
    } else if (li === 3) {
      labelText = `\\textit{(Đề thi gồm có 0\\zpageref{\\made-lastpage} trang)}`
    }
    tex += `\t{${labelText}}\n`
  }
  tex += `\\end{name}\n\n`

  tex += `\\Opensolutionfile{ansbook}[ans/ansb\\currfilebase]\n\n`

  const sortedParts = Object.keys(grouped).map(Number).sort((a, b) => a - b)
  for (const partNum of sortedParts) {
    const partQuestions = grouped[partNum]
    if (partQuestions.length === 0) continue

    let partHeader = ''
    let fileSuffix = ''
    const count = partQuestions.length
    if (partNum === 1) {
      partHeader = `\\def\\socaulc{${count}}\n\\caulc\n`
      fileSuffix = 'Phan-I'
    } else if (partNum === 2) {
      partHeader = `\\def\\socauds{${count}}\n\\cauds\n`
      fileSuffix = 'Phan-II'
    } else if (partNum === 3) {
      partHeader = `\\def\\socaukq{${count}}\n\\caukq\n`
      fileSuffix = 'Phan-III'
    } else if (partNum === 4) {
      partHeader = `\\def\\socautl{${count}}\n\\cautl\n`
      fileSuffix = 'Phan-IV'
    } else {
      partHeader = `\\def\\socaulc{${count}}\n\\caulc\n`
      fileSuffix = `Phan-${partNum}`
    }

    if (partNum === 3 || (partNum === 4 && !sortedParts.includes(3))) {
      tex += `\\Opensolutionfile{ansbook}[ans/ansb\\currfilebase]\n`
    }

    tex += partHeader
    tex += `\\Opensolutionfile{ans}[ans/ans\\currfilebase-${fileSuffix}]\n\n`
    tex += partQuestions.map(q => q.latex_content.trim()).join('\n\n')
    tex += `\n\\Closesolutionfile{ans}\n\n`
  }

  tex += `\\Closesolutionfile{ansbook}\n`
  tex += `\\begin{center}\n\t\\textbf{--------------- HẾT ---------------}\n\\end{center}\n`
  tex += `\\zlabel{\\made-lastpage}\n`
  if (includeAnswerTable) {
    tex += `\\begin{indapan}\n\t{ans/ans\\currfilebase}\n\\end{indapan}\n`
  } else {
    tex += `%\\begin{indapan}\n%\t{ans/ans\\currfilebase}\n%\\end{indapan}\n`
  }
  // Insert answer sheet (phiếu trả lời) if requested
  if (includeAnswerSheet && examCode) {
    const mcCount = questions.filter(q => q.question_type === 'multiple_choice').length
    const tfCount = questions.filter(q => q.question_type === 'true_false').length
    const saCount = questions.filter(q => q.question_type === 'short_answer').length
    const sheetTex = buildAnswerSheetTex(examCode, mcCount, tfCount, saCount)
    if (sheetTex) tex += sheetTex
  }

  return tex
}

// ─── Main API Handler ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
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
      includeAnswerTable,
      includeAnswerSheet,
      qrCodeOptions,
      action
    } = await request.json()

    const displayTitle = title || 'ĐỀ THI TRẮC NGHIỆM'
    const displayGrade = grade || 12
    const validHeaderLabels = headerLabels && Array.isArray(headerLabels) && headerLabels.length === 8
      ? headerLabels
      : undefined
    const validHeaderStyles = headerStyles && Array.isArray(headerStyles) && headerStyles.length === 8
      ? headerStyles
      : undefined
    const validExamCodes = examCodes && Array.isArray(examCodes) ? examCodes : []

    // Determine whether single or multi-exam export
    const examSets: ExamQuestion[][] = []
    if (exams && Array.isArray(exams) && exams.length > 1) {
      for (const e of exams) {
        if (e.questions && Array.isArray(e.questions)) {
          examSets.push(e.questions)
        }
      }
    } else if (questions && Array.isArray(questions)) {
      examSets.push(questions)
    }

    if (examSets.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid questions list' }, { status: 400 })
    }

    // Pad exam codes if needed
    const codes = examSets.map((_, i) => validExamCodes[i] ?? `${i + 1}`)

    // Create the ZIP archive
    const zip = new AdmZip()
    const configDir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'latex-config')

    // Add shared config/sty files
    const sharedFiles = [
      'khaibaochung.tex',
      'ex_test.sty',
      'ex_tkz-euclide.sty',
      'tkz-linknodes.sty',
      'tkz-tab-vn.sty',
      'twemojis.sty',
    ]

    for (const filename of sharedFiles) {
      const filePath = path.join(configDir, filename)
      if (fs.existsSync(filePath)) {
        zip.addFile(filename, fs.readFileSync(filePath))
      } else {
        console.warn(`Warning: file not found: ${filePath}`)
      }
    }

    // Create empty ans/ and data/ folders
    zip.addFile('ans/', Buffer.alloc(0))
    zip.addFile('data/', Buffer.alloc(0))

    let mainTex = ''
    if (examSets.length === 1) {
      // ── Single exam ──
      const maTranTex = buildMaTranTex(examSets[0], displayTitle, displayGrade, undefined, validHeaderLabels, codes[0], validHeaderStyles, includeAnswerTable !== false, includeAnswerSheet === true)
      zip.addFile('data/ma_tran_de_thi_toan.tex', Buffer.from(maTranTex, 'utf-8'))

      const mainPath = path.join(configDir, 'main.tex')
      const mainContent = fs.existsSync(mainPath) ? fs.readFileSync(mainPath, 'utf-8') : '\\documentclass[12pt,a4paper,twoside]{book}\n\\input{khaibaochung}\n\\begin{document}\n\\input{data/ma_tran_de_thi_toan}\n\\end{document}'
      mainTex = mainContent
      
      const sanitizedTitle = displayTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      if (includeAnswerSheet && !includeAnswerSheet) {
         zip.addFile(`${sanitizedTitle}.tex`, Buffer.from(mainTex, 'utf-8'))
      } else {
         zip.addFile('main.tex', Buffer.from(mainTex, 'utf-8'))
      }
    } else {
      // ── Multiple exams ──
      for (let i = 0; i < examSets.length; i++) {
        const examLabel = `Đề ${i + 1}`
        const maTranTex = buildMaTranTex(examSets[i], displayTitle, displayGrade, examLabel, validHeaderLabels, codes[i], validHeaderStyles, includeAnswerTable !== false, includeAnswerSheet === true)
        zip.addFile(`data/ma_tran_de_thi_toan${i + 1}.tex`, Buffer.from(maTranTex, 'utf-8'))
      }

      mainTex = '\\documentclass[12pt,a4paper,twoside]{book}\n'
      mainTex += '\\input{khaibaochung}\n'
      mainTex += '%\\HeaderLoaiHai %Bật/tắt header đề thi/header bài dạy\n'
      mainTex += '%\\exitdapso %ẩn đs\n'
      mainTex += '\\anloigiai %ẩn lời giải\n'
      mainTex += '%\\tatdongcham %tắt dòng chấm\n'
      mainTex += '\\begin{document}\n%\\tableofcontents\\thispagestyle{empty}\n'
      for (let i = 0; i < examSets.length; i++) {
        mainTex += `\\newpage\\input{data/ma_tran_de_thi_toan${i + 1}}\n`
      }
      mainTex += '\\end{document}\n'

      zip.addFile('main.tex', Buffer.from(mainTex, 'utf-8'))
    }

    if (action === 'get_tex') {
      return new NextResponse(mainTex, {
        headers: {
          'Content-Type': 'text/plain',
        },
      })
    }

    // ── Generate QR Codes for Apps (TNMaker, Smart Test, etc) ──
    const qrTypes = qrCodeOptions || []
    if (qrTypes.length > 0) {
      try {
        // Helper: build answers list for one exam

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
            zip.addFile(`DAP-AN/${filename}`, pngBuffer)
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
        zip.addFile('DAP-AN/bang_dap_an_tnmaker.xlsx', tnmakerBuf)
      }

      if (isAll || opts.includes('azota')) {
        const azotaBuf = generateAZOTAExcel(examSets, codes)
        zip.addFile('DAP-AN/bang_dap_an_azota.xlsx', azotaBuf)
      }

      if (isAll || opts.includes('youngmix')) {
        const ymBuf = generateYoungMixExcel(examSets, codes)
        zip.addFile('DAP-AN/bang_dap_an_youngmix.xlsx', ymBuf)
      }

      if (isAll || opts.includes('smarttest')) {
        const stBuf = generateSmartTestExcel(examSets, codes)
        zip.addFile('DAP-AN/bang_dap_an_smarttest.xlsx', stBuf)
      }

      if (isAll || opts.includes('olm')) {
        const olmBuf = generateOLMExcel(examSets, codes)
        zip.addFile('DAP-AN/bang_dap_an_olm.xlsx', olmBuf)
      }
    } catch (xlsxErr) {
      console.error('Excel generation error (non-fatal):', xlsxErr)
      // Non-fatal: still return ZIP without Excel files
    }

    const zipBuffer = zip.toBuffer()

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="exam_package.zip"',
        'Cache-Control': 'no-store',
      },
    })

  } catch (err) {
    console.error('Export ZIP error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}
