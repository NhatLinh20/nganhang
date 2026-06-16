import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import AdmZip from 'adm-zip'
import { createAdminClient } from '@/lib/supabase/server'
import { CHAPTER_NAMES, LESSON_NAMES, VARIANT_NAMES } from '@/lib/curriculum-labels'

interface QuestionItem {
  id: string
  category_code: string
  latex_content: string
  difficulty: string
  question_type: string
  variant: number
}

interface LessonInput {
  subject: string
  chapter: number
  lesson: number
  questions: QuestionItem[]
}

const DIFF_ORDER: Record<string, number> = { N: 0, H: 1, V: 2, C: 3 }
const TYPE_ORDER: Record<string, number> = { multiple_choice: 0, true_false: 1, short_answer: 2, essay: 3 }
const TYPE_COMMANDS: Record<string, string> = {
  multiple_choice: '\\caulc',
  true_false: '\\cauds',
  short_answer: '\\caukq',
  essay: '\\cautl',
}

// ── Generate lesson_content.tex ──────────────────────────────────────────────
function buildLessonContentTex(grade: number, lessons: LessonInput[]): string {
  let tex = '% Bài học được tạo từ Ngân Hàng Toán\n'
  tex += '% ═══════════════════════════════════\n\n'

  // Group lessons by subject → chapter
  const grouped: Record<string, Record<number, LessonInput[]>> = {}
  for (const les of lessons) {
    if (!grouped[les.subject]) grouped[les.subject] = {}
    if (!grouped[les.subject][les.chapter]) grouped[les.subject][les.chapter] = []
    grouped[les.subject][les.chapter].push(les)
  }

  const subjectOrder = ['D', 'H', 'C']
  for (const sub of subjectOrder) {
    if (!grouped[sub]) continue
    const chapters = Object.keys(grouped[sub]).map(Number).sort((a, b) => a - b)

    for (const ch of chapters) {
      const rawChName = CHAPTER_NAMES[grade]?.[sub]?.[ch] || `Chương ${ch}`
      const chName = rawChName.replace(/^Ch\.\d+\s*/, '').replace(/^CĐ\d+\s*/, '')
      tex += `\\setcounter{chapter}{${ch - 1}}\n`
      tex += `\\chapter{${chName}}\n`

      const sortedLessons = grouped[sub][ch].sort((a, b) => a.lesson - b.lesson)

      for (const les of sortedLessons) {
        const rawLesName = LESSON_NAMES[grade]?.[sub]?.[ch]?.[les.lesson] || `Bài ${les.lesson}`
        const lesName = rawLesName.replace(/^§\d+\s*/, '')
        const theoryFile = `${grade}_${sub}_${ch}_${les.lesson}`

        tex += `\\setcounter{section}{${les.lesson - 1}}\n`
        tex += `\\section{${lesName}}\n`
        tex += `\\input{lythuyet/${theoryFile}}\n`

        // If there are questions, add exercises section
        if (les.questions && les.questions.length > 0) {
          tex += `\\subsection{Bài tập rèn luyện}\n`

          // Group questions by variant → type → difficulty
          const byVariant: Record<number, QuestionItem[]> = {}
          for (const q of les.questions) {
            const v = q.variant || 0
            if (!byVariant[v]) byVariant[v] = []
            byVariant[v].push(q)
          }

          const sortedVariants = Object.keys(byVariant).map(Number).sort((a, b) => a - b)

          for (const vari of sortedVariants) {
            const variantName = VARIANT_NAMES[grade]?.[sub]?.[ch]?.[les.lesson]?.[vari] || `Dạng ${vari}`
            tex += `\\subsubsection{${variantName}}\n`

            // Group by type
            const byType: Record<string, QuestionItem[]> = {}
            for (const q of byVariant[vari]) {
              if (!byType[q.question_type]) byType[q.question_type] = []
              byType[q.question_type].push(q)
            }

            const sortedTypes = Object.keys(byType).sort((a, b) => (TYPE_ORDER[a] ?? 9) - (TYPE_ORDER[b] ?? 9))

            for (const qType of sortedTypes) {
              const command = TYPE_COMMANDS[qType] || ''
              if (command) tex += `${command}\n`

              // Sort by difficulty: N → H → V → C
              const sorted = byType[qType].sort((a, b) => (DIFF_ORDER[a.difficulty] ?? 9) - (DIFF_ORDER[b.difficulty] ?? 9))

              for (const q of sorted) {
                tex += `${q.latex_content.trim()}\n\n`
              }
            }
          }
        }

        tex += '\n'
      }
    }
  }

  return tex
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { grade, lessons } = body as { grade: number; lessons: LessonInput[] }

    if (!lessons || lessons.length === 0) {
      return NextResponse.json({ error: 'Missing lessons data' }, { status: 400 })
    }

    const zip = new AdmZip()
    const configDir = path.join(process.cwd(), 'public', 'latex-config')

    // 1. Add shared config files
    const sharedFiles = ['khaibaochung.tex', 'ex_test.sty', 'ex_tkz-euclide.sty', 'tkz-linknodes.sty', 'tkz-tab-vn.sty']
    for (const filename of sharedFiles) {
      const filePath = path.join(configDir, filename)
      if (fs.existsSync(filePath)) {
        zip.addFile(filename, fs.readFileSync(filePath))
      }
    }

    // 2. Generate lesson_content.tex → data/lesson_content.tex
    const lessonTex = buildLessonContentTex(grade, lessons)
    zip.addFile('data/', Buffer.alloc(0))
    zip.addFile('data/lesson_content.tex', Buffer.from(lessonTex, 'utf-8'))

    // 3. Generate main.tex
    let mainTex = '\\documentclass[12pt,a4paper,twoside]{book}\n'
    mainTex += '\\input{khaibaochung}\n'
    mainTex += '\\HeaderLoaiHai %Bật/tắt header đề thi/header bài dạy\n'
    mainTex += '%\\exitdapso %ẩn đs\n'
    mainTex += '\\anloigiai %ẩn lời giải\n'
    mainTex += '%\\tatdongcham %tắt dòng chấm\n'
    mainTex += '\\begin{document}\n'
    mainTex += '\\tableofcontents\\thispagestyle{empty}\n'
    mainTex += '\\input{data/lesson_content}\n'
    mainTex += '\\end{document}\n'
    zip.addFile('main.tex', Buffer.from(mainTex, 'utf-8'))

    // 4. Download theory files from Supabase Storage → lythuyet/
    const supabase = createAdminClient()
    const theoryKeys = new Set<string>()
    for (const les of lessons) {
      theoryKeys.add(`${grade}_${les.subject}_${les.chapter}_${les.lesson}`)
    }

    if (theoryKeys.size > 0) {
      zip.addFile('lythuyet/', Buffer.alloc(0))

      for (const key of theoryKeys) {
        const fileName = `${key}.tex`

        const { data, error } = await supabase.storage.from('theory').download(fileName)

        if (error) {
          console.warn(`Could not download theory file ${fileName}:`, error)
          const placeholder = `% File lý thuyết ${fileName} chưa được upload lên Supabase Storage (bucket: theory)\n`
          zip.addFile(`lythuyet/${fileName}`, Buffer.from(placeholder, 'utf-8'))
        } else if (data) {
          const buffer = Buffer.from(await data.arrayBuffer())
          zip.addFile(`lythuyet/${fileName}`, buffer)
        }
      }
    }

    const zipBuffer = zip.toBuffer()

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="lesson_package.zip"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('Export Lesson error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}
