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
const SUBJECT_ORDER: Record<string, number> = { D: 0, H: 1, C: 2 }
const SUBJECT_LABELS: Record<string, string> = { D: 'ĐẠI SỐ', H: 'HÌNH HỌC', C: 'CHUYÊN ĐỀ' }

// Allow up to 60s for large exports (10k+ questions)
export const maxDuration = 60

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build data filename: 2D1_1 = grade12, subject D, chapter 1, lesson 1 */
function buildFileName(grade: number, sub: string, ch: number, les: number): string {
  return `${grade % 10}${sub}${ch}_${les}`
}

/** Get chapter display name from CHAPTER_NAMES, stripping prefix */
function getChapterName(grade: number, sub: string, ch: number): string {
  const raw = CHAPTER_NAMES[grade]?.[sub]?.[ch]
  if (!raw) return `Chương ${ch}`
  return raw.replace(/^Ch\.\d+\s*/, '').replace(/^CĐ\d+\s*/, '')
}

/** Get lesson display name from LESSON_NAMES, stripping prefix */
function getLessonName(grade: number, sub: string, ch: number, les: number): string {
  const raw = LESSON_NAMES[grade]?.[sub]?.[ch]?.[les]
  if (!raw) return `Bài ${les}`
  return raw.replace(/^§\d+\s*/, '')
}

/** Get variant display name from VARIANT_NAMES */
function getVariantName(grade: number, sub: string, ch: number, les: number, vari: number): string {
  return (VARIANT_NAMES as any)?.[String(grade)]?.[sub]?.[String(ch)]?.[String(les)]?.[String(vari)]
    || `Dạng ${vari}`
}

// ── Types for grouped data ───────────────────────────────────────────────────
// Grouped[subject][chapter][lesson][variant][question_type][difficulty] = QuestionRow[]
type DiffMap = Record<string, QuestionRow[]>
type TypeMap = Record<string, DiffMap>
type VariantMap = Record<number, TypeMap>
type LessonMap = Record<number, VariantMap>
type ChapterMap = Record<number, LessonMap>
type SubjectMap = Record<string, ChapterMap>

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

    // ── 1. Fetch ALL questions matching filters (paginated by id) ────────────
    const allData: QuestionRow[] = []
    const seenIds = new Set<string>()
    let page = 0
    const PAGE_SIZE = 1000

    while (true) {
      let query = supabase
        .from('questions')
        .select('id, grade, subject_area, chapter, lesson, variant, difficulty, question_type, latex_content')
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

    const grade = gradeParam ? parseInt(gradeParam) : allData[0].grade
    console.log(`[export-bank] Fetched ${allData.length} unique questions in ${page + 1} page(s)`)

    // ── 2. Group: subject → chapter → lesson → variant → type → difficulty ──
    const grouped: SubjectMap = {}

    for (const q of allData) {
      const s = q.subject_area
      const c = q.chapter
      const l = q.lesson
      const v = q.variant
      const t = q.question_type
      const d = q.difficulty

      if (!grouped[s]) grouped[s] = {}
      if (!grouped[s][c]) grouped[s][c] = {}
      if (!grouped[s][c][l]) grouped[s][c][l] = {}
      if (!grouped[s][c][l][v]) grouped[s][c][l][v] = {}
      if (!grouped[s][c][l][v][t]) grouped[s][c][l][v][t] = {}
      if (!grouped[s][c][l][v][t][d]) grouped[s][c][l][v][t][d] = []
      grouped[s][c][l][v][t][d].push(q)
    }

    // ── 3. Sort subjects: D → H → C ─────────────────────────────────────────
    const sortedSubjects = Object.keys(grouped).sort(
      (a, b) => (SUBJECT_ORDER[a] ?? 9) - (SUBJECT_ORDER[b] ?? 9)
    )

    // ── 4. Build ZIP ─────────────────────────────────────────────────────────
    const zip = new AdmZip()

    // Add shared config files from public/latex-config
    const configDir = path.join(process.cwd(), 'public', 'latex-config')
    const sharedFiles = ['khaibaochung.tex', 'ex_test.sty', 'ex_tkz-euclide.sty', 'tkz-linknodes.sty', 'tkz-tab-vn.sty']
    for (const filename of sharedFiles) {
      const fp = path.join(configDir, filename)
      if (fs.existsSync(fp)) zip.addFile(filename, fs.readFileSync(fp))
    }

    // Empty directories
    zip.addFile('ans/', Buffer.alloc(0))
    zip.addFile('data/', Buffer.alloc(0))

    // ── 5. Generate main.tex + data files ────────────────────────────────────
    let mainTex = '\\documentclass[12pt,a4paper,twoside]{book}\n'
    mainTex += '\\input{khaibaochung}\n'
    mainTex += '\\HeaderLoaiHai %Bật/tắt header đề thi/header bài dạy\n'
    mainTex += '%\\exitdapso %ẩn đs\n'
    mainTex += '\\anloigiai %ẩn lời giải\n'
    mainTex += '%\\tatdongcham %tắt dòng chấm\n'
    mainTex += '\\begin{document}\n'
    mainTex += '\\tableofcontents\n'

    for (const sub of sortedSubjects) {
      const chapters = grouped[sub]
      const sortedChapters = Object.keys(chapters).map(Number).sort((a, b) => a - b)

      // Subject separator
      mainTex += `\n%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%\n`
      mainTex += `%%%  ${SUBJECT_LABELS[sub] || sub}\n`
      mainTex += `%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%\n`

      for (const ch of sortedChapters) {
        const chName = getChapterName(grade, sub, ch)
        mainTex += `%%%%%-------Chương ${ch}--------%%%%%%%\n`
        mainTex += `\\newpage\\chapter{${chName}}\n`

        const lessons = chapters[ch]
        const sortedLessons = Object.keys(lessons).map(Number).sort((a, b) => a - b)

        for (const les of sortedLessons) {
          const fileName = buildFileName(grade, sub, ch, les)
          mainTex += `\\input{data/${fileName}}\n`

          // ── Generate data file for this lesson ───────────────────────────────
          const lesName = getLessonName(grade, sub, ch, les)
          let tex = '\\newpage\n'
          tex += `\\section{${lesName}}\n`

          const variants = lessons[les]
          const sortedVariants = Object.keys(variants).map(Number).sort((a, b) => a - b)

          for (const vari of sortedVariants) {
            const variName = getVariantName(grade, sub, ch, les, vari)
            tex += `\\subsubsection{${variName}}\n`

            const types = variants[vari]
            const sortedTypes = Object.keys(types).sort(
              (a, b) => (TYPE_ORDER[a] ?? 9) - (TYPE_ORDER[b] ?? 9)
            )

            for (const qType of sortedTypes) {
              tex += `${TYPE_COMMENTS[qType] || `%%%---${qType}---`}\n`
              tex += `${TYPE_COMMANDS[qType] || ''}\n`

              const diffs = types[qType]
              const sortedDiffs = Object.keys(diffs).sort(
                (a, b) => (DIFF_ORDER[a] ?? 9) - (DIFF_ORDER[b] ?? 9)
              )

              for (const diff of sortedDiffs) {
                const questions = diffs[diff]
                if (!questions.length) continue

                tex += `\\begin{center}\n\\textbf{${DIFF_LABELS[diff] || diff}}\n\\end{center}\n`

                for (const q of questions) {
                  tex += `${q.latex_content.trim()}\n\n`
                }
              }
            }
          }

          zip.addFile(`data/${fileName}.tex`, Buffer.from(tex, 'utf-8'))
        }
      }
    }

    mainTex += '\\end{document}\n'
    zip.addFile('main.tex', Buffer.from(mainTex, 'utf-8'))

    // ── 6. Build ZIP filename ────────────────────────────────────────────────
    let zipName = `ngan_hang_lop${grade}`
    if (subjectArea) zipName += `_${subjectArea}`
    if (chapterParam) zipName += `_ch${chapterParam}`
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
