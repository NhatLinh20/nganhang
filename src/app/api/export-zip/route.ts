// src/app/api/export-zip/route.ts
import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import AdmZip from 'adm-zip'

interface ExamQuestion {
  id: string
  latex_content: string
  question_type: string
  phan?: number
}

// Helper: Build LaTeX content for a single exam
function buildMaTranTex(
  questions: ExamQuestion[],
  title: string,
  grade: number,
  examLabel?: string,
  headerLabels?: string[],
  examCode?: string
): string {
  // 1. Group questions by phan (Part)
  const grouped: Record<number, ExamQuestion[]> = {}
  for (const q of questions) {
    const phan = q.phan ?? 1
    if (!grouped[phan]) grouped[phan] = []
    grouped[phan].push(q)
  }

  // 2. Build the LaTeX content
  let tex = ''

  // Default header labels
  const labels = headerLabels && headerLabels.length === 6
    ? headerLabels
    : [
        'SỞ GDĐT ...',
        'TRƯỜNG THPT ...',
        `(Đề gồm ... trang, ... câu)`,
        title || 'ĐỀ KIỂM TRA',
        `Môn: TOÁN ${grade}`,
        `Thời gian làm bài: 90 phút (không kể thời gian phát đề)`
      ]

  // Name block with 6 params
  tex += `% Đề thi Toán lớp ${grade}\n`
  if (examCode) {
    tex += `\\def\\made{${examCode}}\n`
  }
  tex += `\\begin{name}\n`
  for (const label of labels) {
    tex += `\t{${label}}\n`
  }
  tex += `\\end{name}\n\n`


  // Open master answer book
  tex += `\\Opensolutionfile{ansbook}[ans/ansb\\currfilebase]\n\n`

  // Add each part
  const sortedParts = Object.keys(grouped).map(Number).sort((a, b) => a - b)
  for (const partNum of sortedParts) {
    const partQuestions = grouped[partNum]
    if (partQuestions.length === 0) continue

    let partHeader = ''
    let fileSuffix = ''
    if (partNum === 1) {
      partHeader = '\\caulc\n'
      fileSuffix = 'Phan-I'
    } else if (partNum === 2) {
      partHeader = '\\cauds\n'
      fileSuffix = 'Phan-II'
    } else if (partNum === 3) {
      const hasEssay = partQuestions.some(q => q.question_type === 'essay')
      partHeader = hasEssay ? '\\cautl\n' : '\\caukq\n'
      fileSuffix = 'Phan-III'
    } else {
      partHeader = `\\caulc\n`
      fileSuffix = `Phan-${partNum}`
    }

    // Re-open ansbook for Part III as in reference code
    if (partNum === 3) {
      tex += `\\Opensolutionfile{ansbook}[ans/ansb\\currfilebase]\n`
    }

    tex += partHeader
    tex += `\\Opensolutionfile{ans}[ans/ans\\currfilebase-${fileSuffix}]\n\n`
    tex += partQuestions.map(q => q.latex_content.trim()).join('\n\n')
    tex += `\n\\Closesolutionfile{ans}\n\n`
  }

  // Close master answer book and include answer sheet
  tex += `\\Closesolutionfile{ansbook}\n`
  tex += `\\begin{indapan}\n\t{ans/ans\\currfilebase}\n\\end{indapan}\n`

  return tex
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, duration, grade, questions, exams, headerLabels, examCodes } = body as {
      title?: string
      duration?: number
      grade?: number
      questions?: ExamQuestion[]
      exams?: { questions: ExamQuestion[] }[]
      headerLabels?: string[]
      examCodes?: string[]
    }

    const displayTitle = title || 'ĐỀ THI TRẮC NGHIỆM'
    const displayGrade = grade || 12
    const validHeaderLabels = headerLabels && Array.isArray(headerLabels) && headerLabels.length === 6
      ? headerLabels
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
    ]

    for (const filename of sharedFiles) {
      const filePath = path.join(configDir, filename)
      if (fs.existsSync(filePath)) {
        zip.addFile(filename, fs.readFileSync(filePath))
      } else {
        console.warn(`Warning: file not found: ${filePath}`)
      }
    }

    // Create empty ans/ folder
    zip.addFile('ans/', Buffer.alloc(0))

    if (examSets.length === 1) {
      // ── Single exam: keep original structure ──
      const maTranTex = buildMaTranTex(examSets[0], displayTitle, displayGrade, undefined, validHeaderLabels, validExamCodes[0])
      zip.addFile('ma_tran_de_thi_toan.tex', Buffer.from(maTranTex, 'utf-8'))

      // Add original main.tex from template
      const mainPath = path.join(configDir, 'main.tex')
      if (fs.existsSync(mainPath)) {
        zip.addFile('main.tex', fs.readFileSync(mainPath))
      }
    } else {
      // ── Multiple exams: generate ma_tran_de_thi_toanN.tex + custom main.tex ──
      for (let i = 0; i < examSets.length; i++) {
        const examLabel = `Đề ${i + 1}`
        const maTranTex = buildMaTranTex(examSets[i], displayTitle, displayGrade, examLabel, validHeaderLabels, validExamCodes[i])
        zip.addFile(`ma_tran_de_thi_toan${i + 1}.tex`, Buffer.from(maTranTex, 'utf-8'))
      }

      // Build custom main.tex
      let mainTex = '\\documentclass[12pt,a4paper,twoside]{book}\n'
      mainTex += '\\input{khaibaochung}\n'
      mainTex += '%\\exitdapso %ẩn đs\n'
      mainTex += '\\anloigiai %ẩn lời giải\n'
      mainTex += '%\\tatdongcham %tắt dòng chấm\n'
      mainTex += '\\begin{document}\n'
      for (let i = 0; i < examSets.length; i++) {
        mainTex += `\\newpage\\input{ma_tran_de_thi_toan${i + 1}}\n`
      }
      mainTex += '\\end{document}\n'

      zip.addFile('main.tex', Buffer.from(mainTex, 'utf-8'))
    }

    // Generate zip buffer
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
