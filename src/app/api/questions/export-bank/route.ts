// src/app/api/questions/export-bank/route.ts
// API xuất toàn bộ câu hỏi từ ngân hàng thành file ZIP LaTeX phân loại

import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import AdmZip from 'adm-zip'
import { createAdminClient } from '@/lib/supabase/server'
import { CHAPTER_NAMES, LESSON_NAMES, VARIANT_NAMES } from '@/lib/curriculum-labels'

interface QuestionRow {
  id: string
  grade: number
  subject_area: string
  chapter: number
  lesson: number
  variant: number
  difficulty: string
  question_type: string
  latex_content: string
  category_code: string
}

const DIFF_ORDER: Record<string, number> = { N: 0, H: 1, V: 2, C: 3 }
const DIFF_LABELS: Record<string, string> = { N: 'Nhận biết', H: 'Thông hiểu', V: 'Vận dụng', C: 'Vận dụng cao' }
const TYPE_ORDER: Record<string, number> = { multiple_choice: 0, true_false: 1, short_answer: 2, essay: 3 }
const TYPE_COMMANDS: Record<string, string> = {
  multiple_choice: '\\caulc',
  true_false: '\\cauds',
  short_answer: '\\caukq',
  essay: '\\cautl',
}
const TYPE_COMMENTS: Record<string, string> = {
  multiple_choice: '%%%-------------Trắc nghiệm-------------',
  true_false: '%%%-------------Đúng sai-------------',
  short_answer: '%%%-------------Trả lời ngắn-------------',
  essay: '%%%-------------Tự luận-------------',
}

// Allow up to 60s for large exports (10k+ questions)
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const gradeParam = searchParams.get('grade')
    const subjectArea = searchParams.get('subject_area')
    const chapterParam = searchParams.get('chapter')
    const lessonParam = searchParams.get('lesson')
    const variantParam = searchParams.get('variant')
    const difficulty = searchParams.get('difficulty')
    const questionType = searchParams.get('question_type')

    const supabase = createAdminClient()

    // ── Fetch ALL questions matching filters (paginated) ─────────────────────
    const allData: QuestionRow[] = []
    const seenIds = new Set<string>()
    let page = 0
    const PAGE_SIZE = 1000

    while (true) {
      let query = supabase
        .from('questions')
        .select('id, grade, subject_area, chapter, lesson, variant, difficulty, question_type, latex_content, category_code')
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (gradeParam) query = query.eq('grade', parseInt(gradeParam))
      if (subjectArea) query = query.eq('subject_area', subjectArea)
      if (chapterParam) query = query.eq('chapter', parseInt(chapterParam))
      if (lessonParam) query = query.eq('lesson', parseInt(lessonParam))
      if (variantParam) query = query.eq('variant', parseInt(variantParam))
      if (difficulty) query = query.eq('difficulty', difficulty)
      if (questionType) query = query.eq('question_type', questionType)

      const { data, error } = await query

      if (error) {
        console.error('Export bank query error:', error)
        return NextResponse.json({ error: `Lỗi truy vấn: ${error.message}` }, { status: 500 })
      }

      if (!data || data.length === 0) break

      for (const row of data as QuestionRow[]) {
        if (!seenIds.has(row.id)) {
          seenIds.add(row.id)
          allData.push(row)
        }
      }

      if (data.length < PAGE_SIZE) break
      page++
    }

    if (allData.length === 0) {
      return NextResponse.json({ error: 'Không có câu hỏi nào phù hợp với bộ lọc.' }, { status: 400 })
    }

    console.log(`[export-bank] Fetched ${allData.length} questions in ${page + 1} pages`)

    const grade = gradeParam ? parseInt(gradeParam) : allData[0].grade

    // ── Group: subject→chapter → lesson → variant → type → difficulty ─────────
    type ChapterKey = string // "subject|chapter"
    // lesson → variant → question_type → difficulty → questions[]
    type VariantMap = Record<number, Record<string, Record<string, QuestionRow[]>>>
    type LessonMap = Record<number, VariantMap>
    const grouped: Record<ChapterKey, LessonMap> = {}

    for (const q of allData) {
      const chKey = `${q.subject_area}|${q.chapter}`
      if (!grouped[chKey]) grouped[chKey] = {}
      if (!grouped[chKey][q.lesson]) grouped[chKey][q.lesson] = {}
      if (!grouped[chKey][q.lesson][q.variant]) grouped[chKey][q.lesson][q.variant] = {}
      if (!grouped[chKey][q.lesson][q.variant][q.question_type]) grouped[chKey][q.lesson][q.variant][q.question_type] = {}
      if (!grouped[chKey][q.lesson][q.variant][q.question_type][q.difficulty]) grouped[chKey][q.lesson][q.variant][q.question_type][q.difficulty] = []
      grouped[chKey][q.lesson][q.variant][q.question_type][q.difficulty].push(q)
    }

    // ── Sort chapter keys: by subject (D→H→C) then chapter number ───────────
    const subjectOrder: Record<string, number> = { D: 0, H: 1, C: 2 }
    const sortedChapterKeys = Object.keys(grouped).sort((a, b) => {
      const [sA, cA] = a.split('|')
      const [sB, cB] = b.split('|')
      if (sA !== sB) return (subjectOrder[sA] ?? 9) - (subjectOrder[sB] ?? 9)
      return parseInt(cA) - parseInt(cB)
    })

    // ── Generate data/ChuongX-baiY.tex files ────────────────────────────────
    const zip = new AdmZip()

    // Add shared config files
    const configDir = path.join(process.cwd(), 'public', 'latex-config')
    const sharedFiles = ['khaibaochung.tex', 'ex_test.sty', 'ex_tkz-euclide.sty', 'tkz-linknodes.sty', 'tkz-tab-vn.sty']
    for (const filename of sharedFiles) {
      const filePath = path.join(configDir, filename)
      if (fs.existsSync(filePath)) {
        zip.addFile(filename, fs.readFileSync(filePath))
      }
    }

    // Create ans/ directory
    zip.addFile('ans/', Buffer.alloc(0))

    // Create data/ directory
    zip.addFile('data/', Buffer.alloc(0))

    // Build main.tex content and data files
    let mainTex = '\\documentclass[12pt,a4paper,twoside]{book}\n'
    mainTex += '\\input{khaibaochung}\n'
    mainTex += '%\\exitdapso %ẩn đs\n'
    mainTex += '\\anloigiai %ẩn lời giải\n'
    mainTex += '%\\tatdongcham %tắt dòng chấm\n'
    mainTex += '\\begin{document}\n'

    for (const chKey of sortedChapterKeys) {
      const [sub, chStr] = chKey.split('|')
      const ch = parseInt(chStr)
      const chapterName = CHAPTER_NAMES[grade]?.[sub]?.[ch]?.replace(/^Ch\.\d+\s*/, '').replace(/^CĐ\d+\s*/, '') || `Chương ${ch}`

      mainTex += `%%%%%-------Chương ${ch}--------%%%%%%%\n`
      mainTex += `\\newpage\\chapter{${chapterName}}\n`

      const lessons = grouped[chKey]
      const sortedLessons = Object.keys(lessons).map(Number).sort((a, b) => a - b)

      for (const les of sortedLessons) {
        const dataFileName = `Chuong${ch}-bai${les}`
        mainTex += `\\input{data/${dataFileName}}\n`

        // ── Generate lesson file content ──────────────────────────────────────
        const lessonName = LESSON_NAMES[grade]?.[sub]?.[ch]?.[les]?.replace(/^§\d+\s*/, '') || `Bài ${les}`
        let lessonTex = '\\newpage\n'
        lessonTex += `\\section{${lessonName}}\n`

        const variantsInLesson = lessons[les]
        const sortedVariants = Object.keys(variantsInLesson).map(Number).sort((a, b) => a - b)

        for (const vari of sortedVariants) {
          // Get variant name from VARIANT_NAMES
          const variantName = (VARIANT_NAMES as any)?.[String(grade)]?.[sub]?.[String(ch)]?.[String(les)]?.[String(vari)]
            || `Dạng ${vari}`
          lessonTex += `\\subsubsection{${variantName}}\n`

          const typesInVariant = variantsInLesson[vari]
          const sortedTypes = Object.keys(typesInVariant).sort((a, b) => (TYPE_ORDER[a] ?? 9) - (TYPE_ORDER[b] ?? 9))

          for (const qType of sortedTypes) {
            const comment = TYPE_COMMENTS[qType] || `%%%-------------${qType}-------------`
            const command = TYPE_COMMANDS[qType] || ''

            lessonTex += `${comment}\n`
            lessonTex += `${command}\n`

            const diffsInType = typesInVariant[qType]
            const sortedDiffs = Object.keys(diffsInType).sort((a, b) => (DIFF_ORDER[a] ?? 9) - (DIFF_ORDER[b] ?? 9))

            for (const diff of sortedDiffs) {
              const questions = diffsInType[diff]
              if (questions.length === 0) continue

              const diffLabel = DIFF_LABELS[diff] || diff
              lessonTex += `\\begin{center}\n\\textbf{${diffLabel}}\n\\end{center}\n`

              for (const q of questions) {
                const content = q.latex_content.trim()
                lessonTex += `${content}\n\n`
              }
            }
          }
        }

        zip.addFile(`data/${dataFileName}.tex`, Buffer.from(lessonTex, 'utf-8'))
      }
    }

    mainTex += '\\end{document}\n'
    zip.addFile('main.tex', Buffer.from(mainTex, 'utf-8'))

    // ── Build ZIP filename ───────────────────────────────────────────────────
    let zipName = `ngan_hang_lop${grade}`
    if (subjectArea) zipName += `_${subjectArea}`
    if (chapterParam) zipName += `_chuong${chapterParam}`
    if (lessonParam) zipName += `_bai${lessonParam}`
    zipName += '.zip'

    const zipBuffer = zip.toBuffer()

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('Export bank error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    )
  }
}
