import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import AdmZip from 'adm-zip'
import { detectQuestionType } from '@/lib/latex-parser/answer-parser'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { editorContent, headerLabels, headerStyles, examCode, includeAnswerTable } = body as { 
      editorContent: string
      headerLabels?: string[]
      headerStyles?: { bold?: boolean; italic?: boolean; underline?: boolean; color?: string }[]
      examCode?: string
      includeAnswerTable?: boolean
    }

    if (!editorContent || !editorContent.trim()) {
      return NextResponse.json({ error: 'Nội dung rỗng' }, { status: 400 })
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

    // 2. Extract valid blocks and group them
    // Regex for \begin{ex}...\end{ex} and tikzpicture blocks inside \begin{center}...\end{center} or standalone
    // We will find all matches with indices to keep their relative order if needed, 
    // but the requirement asks to group questions by type.
    
    // Extractor
    const exRegex = /\\begin\{ex\}[\s\S]*?\\end\{ex\}/g
    const centerRegex = /\\begin\{center\}[\s\S]*?\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}[\s\S]*?\\end\{center\}/g
    const tikzRegex = /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g

    let exBlocks = editorContent.match(exRegex) || []
    
    // Group questions by type
    const grouped: Record<string, string[]> = {
      multiple_choice: [],
      true_false: [],
      short_answer: [],
      essay: []
    }

    for (const block of exBlocks) {
      const type = detectQuestionType(block)
      if (grouped[type]) {
        grouped[type].push(block)
      } else {
        grouped.essay.push(block) // fallback
      }
    }

    // Extract standalone tikzpicture (or center tikzpicture) that are not inside ex blocks
    let remainingContent = editorContent
    for (const block of exBlocks) {
      remainingContent = remainingContent.replace(block, '')
    }
    const centerTikzRegex = /\\begin\{center\}[\s\S]*?\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}[\s\S]*?\\end\{center\}/g
    const standaloneTikz = remainingContent.match(centerTikzRegex) || []

    // 3. Generate data/content.tex
    let contentTex = ''
    if (examCode) {
      contentTex += `\\def\\made{${examCode}}\n`
    }
    contentTex += `\\begin{name}\n`
    
    const labels = headerLabels && headerLabels.length === 8
      ? headerLabels
      : [
          'SỞ GDĐT ...',
          'TRƯỜNG THPT ...',
          'Đề chính thức',
          `(Đề thi gồm có 0\\zpageref{\\made-lastpage} trang)`,
          'ĐỀ KIỂM TRA',
          'Môn: TOÁN',
          'Thời gian làm bài: 90 phút',
          '(Không kể thời gian phát đề)'
        ]

    for (let li = 0; li < labels.length; li++) {
      let labelText = labels[li]
      // If the label is empty/blank, output {\,} and skip styling
      if (li !== 3 && labelText.trim() === '') {
        contentTex += `\t{\\,}\n`
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
      contentTex += `\t{${labelText}}\n`
    }
    contentTex += `\\end{name}\n\n`
    
    contentTex += `\\Opensolutionfile{ansbook}[ans/ansb\\currfilebase]\n\n`

    // Process each part
    const parts = [
      { type: 'multiple_choice', cmd: '\\caulc', suffix: 'Phan-I' },
      { type: 'true_false', cmd: '\\cauds', suffix: 'Phan-II' },
      { type: 'short_answer', cmd: '\\caukq', suffix: 'Phan-III' },
      { type: 'essay', cmd: '\\cautl', suffix: 'Phan-IV' }
    ]

    for (const part of parts) {
      const questions = grouped[part.type]
      if (questions.length === 0) continue

      contentTex += `${part.cmd}\n`
      contentTex += `\\Opensolutionfile{ans}[ans/ans\\currfilebase-${part.suffix}]\n\n`
      contentTex += questions.map(q => q.trim()).join('\n\n')
      contentTex += `\n\n\\Closesolutionfile{ans}\n\n`
    }

    // Add standalone tikz pictures if any
    if (standaloneTikz.length > 0) {
      contentTex += `\\cautl\n` // Assume standalone images belong to some generic/essay part
      contentTex += standaloneTikz.map(t => t.trim()).join('\n\n')
      contentTex += `\n\n`
    }

    contentTex += `\\Closesolutionfile{ansbook}\n\n`
    
    contentTex += `\\zlabel{\\made-lastpage}\n\n`
    contentTex += `\\begin{center}\n\t\\textbf{--------------- HẾT ---------------}\n\\end{center}\n\n`
    if (includeAnswerTable !== false) {
      contentTex += `\\begin{indapan}\n\t{ans/ans\\currfilebase}\n\\end{indapan}\n`
    } else {
      contentTex += `%\\begin{indapan}\n%\t{ans/ans\\currfilebase}\n%\\end{indapan}\n`
    }

    zip.addFile('ans/', Buffer.alloc(0))
    zip.addFile('data/', Buffer.alloc(0))
    zip.addFile('data/content.tex', Buffer.from(contentTex, 'utf-8'))

    // 4. Generate main.tex
    const mainTex = `\\documentclass[12pt,a4paper,twoside]{book}
\\input{khaibaochung}
%\\HeaderLoaiHai %Bật/tắt header đề thi/header bài dạy
%\\exitdapso %ẩn đs
%\\anloigiai %ẩn lời giải
%\\tatdongcham %tắt dòng chấm
\\begin{document}
%\\tableofcontents
\\input{data/content}
\\end{document}
`
    zip.addFile('main.tex', Buffer.from(mainTex, 'utf-8'))

    const zipBuffer = zip.toBuffer()

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="ai_latex_export.zip"',
        'Cache-Control': 'no-store',
      },
    })

  } catch (err) {
    console.error('Export AI LaTeX error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}
