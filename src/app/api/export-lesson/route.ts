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
}

interface LessonBlock {
  id: string
  type: 'chapter' | 'section' | 'theory' | 'exercises' | 'variant'
  grade: number
  subjectArea: string
  chapter: number
  lesson?: number
  variant?: number
  questions?: QuestionItem[]
}

// ─── Generate LaTeX content ───────────────────────────────────────────────────
function buildLessonTex(blocks: LessonBlock[], grade: number): string {
  let tex = '% Bài học được tạo từ Ngân Hàng Toán\n'
  tex += '% ═══════════════════════════════════\n\n'

  for (const block of blocks) {
    switch (block.type) {
      case 'chapter': {
        const name = CHAPTER_NAMES[block.grade]?.[block.subjectArea]?.[block.chapter] || `Chương ${block.chapter}`
        tex += `\\chapter{${name}}\n\n`
        break
      }
      case 'section': {
        const name = LESSON_NAMES[block.grade]?.[block.subjectArea]?.[block.chapter]?.[block.lesson!] || `Bài ${block.lesson}`
        tex += `\\section{${name}}\n\n`
        break
      }
      case 'theory': {
        const fileName = `${block.grade}_${block.subjectArea}_${block.chapter}_${block.lesson}`
        tex += `\\subsection{Lý thuyết}\n`
        tex += `\\input{theory/${fileName}}\n\n`
        break
      }
      case 'exercises': {
        tex += `\\subsection{Bài tập rèn luyện}\n\n`
        break
      }
      case 'variant': {
        const varName = block.variant != null
          ? (VARIANT_NAMES[block.grade]?.[block.subjectArea]?.[block.chapter]?.[block.lesson!]?.[block.variant] || `Dạng ${block.variant}`)
          : 'Tổng hợp'
        tex += `\\subsubsection{${varName}}\n`
        if (block.questions && block.questions.length > 0) {
          for (const q of block.questions) {
            tex += `${q.latex_content.trim()}\n\n`
          }
        }
        break
      }
    }
  }

  return tex
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { grade, blocks } = body as { grade: number; blocks: LessonBlock[] }

    if (!blocks || blocks.length === 0) {
      return NextResponse.json({ error: 'Missing blocks' }, { status: 400 })
    }

    const zip = new AdmZip()
    const configDir = path.join(process.cwd(), 'public', 'latex-config')

    // 1. Add shared config files
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
      }
    }

    // 2. Generate lesson_content.tex
    const lessonTex = buildLessonTex(blocks, grade)
    zip.addFile('lesson_content.tex', Buffer.from(lessonTex, 'utf-8'))

    // 3. Generate main.tex
    let mainTex = '\\documentclass[12pt,a4paper,twoside]{book}\n'
    mainTex += '\\input{khaibaochung}\n'
    mainTex += '\\anloigiai %ẩn lời giải\n'
    mainTex += '\\begin{document}\n'
    mainTex += '\\input{lesson_content}\n'
    mainTex += '\\end{document}\n'
    zip.addFile('main.tex', Buffer.from(mainTex, 'utf-8'))

    // 4. Download theory files from Supabase Storage
    const supabase = createAdminClient()
    const theoryBlocks = blocks.filter(b => b.type === 'theory')
    
    if (theoryBlocks.length > 0) {
      zip.addFile('theory/', Buffer.alloc(0)) // Create theory folder
      
      for (const block of theoryBlocks) {
        const fileName = `${block.grade}_${block.subjectArea}_${block.chapter}_${block.lesson}.tex`
        
        // Try to download from 'theory' bucket
        const { data, error } = await supabase.storage.from('theory').download(fileName)
        
        if (error) {
          console.warn(`Could not download theory file ${fileName}:`, error)
          // Add a placeholder if not found
          const placeholder = `% File lý thuyết ${fileName} chưa được upload lên Supabase Storage (bucket: theory)\n`
          zip.addFile(`theory/${fileName}`, Buffer.from(placeholder, 'utf-8'))
        } else if (data) {
          const buffer = Buffer.from(await data.arrayBuffer())
          zip.addFile(`theory/${fileName}`, buffer)
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
