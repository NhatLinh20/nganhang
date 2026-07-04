import React from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

export const KATEX_MACROS = {
  '\\R': '\\mathbb{R}',
  '\\Z': '\\mathbb{Z}',
  '\\N': '\\mathbb{N}',
  '\\Q': '\\mathbb{Q}',
  '\\C': '\\mathbb{C}',
  '\\heva': '\\left\\{\\begin{aligned}#1\\end{aligned}\\right.',
  '\\hoac': '\\left[\\begin{aligned}#1\\end{aligned}\\right.',
  '\\vv': '\\overrightarrow{#1}',
}

export function renderKatex(math: string, displayMode: boolean): string {
  try {
    return katex.renderToString(math, {
      displayMode, throwOnError: false, trust: true, strict: false, macros: KATEX_MACROS,
    })
  } catch { return `<code>${escapeHtml(math)}</code>` }
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderLatexContent(text: string): string {
  if (!text) return ''
  
  // 1. Loại bỏ comment LaTeX (dấu % đến hết dòng, trừ khi bị escape \%)
  let processed = text.replace(/(^|[^\\])%.*/g, '$1')

  // 1.1 Sửa lỗi cú pháp \limits dư thừa gây lỗi cho KaTeX parser
  processed = processed.replace(/(?:\\limits){2,}/g, '\\limits')

  // 2. Chuẩn hóa môi trường align*, align, eqnarray*, eqnarray
  processed = processed.replace(/\\begin\{align\*\}([\s\S]*?)\\end\{align\*\}/g, '$$$$\\begin{aligned}$1\\end{aligned}$$$$')
  processed = processed.replace(/\\begin\{align\}([\s\S]*?)\\end\{align\}/g, '$$$$\\begin{aligned}$1\\end{aligned}$$$$')
  processed = processed.replace(/\\begin\{eqnarray\*\}([\s\S]*?)\\end\{eqnarray\*\}/g, '$$$$\\begin{aligned}$1\\end{aligned}$$$$')
  processed = processed.replace(/\\begin\{eqnarray\}([\s\S]*?)\\end\{eqnarray\}/g, '$$$$\\begin{aligned}$1\\end{aligned}$$$$')

  // Chuẩn hóa \[ \] thành $$ $$ và \( \) thành $ $ để đồng nhất phân tích
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')

  // 3. Trích xuất toán học thành các placeholder (để không bị ảnh hưởng bởi format HTML)
  const mathBlocks: string[] = []
  
  processed = processed.replace(/(\$\$[\s\S]*?\$\$)/g, (match) => {
    mathBlocks.push(renderKatex(match.slice(2, -2).trim(), true))
    return `__DISPLAY_MATH_${mathBlocks.length - 1}__`
  })
  
  processed = processed.replace(/(\$([^$]+?)\$)/g, (match) => {
    mathBlocks.push(renderKatex(match.slice(1, -1), false))
    return `__INLINE_MATH_${mathBlocks.length - 1}__`
  })

  // 4. Xử lý phần văn bản còn lại
  let html = escapeHtml(processed)
  
  // Regex hỗ trợ lồng nhau 1 cấp và bao trùm toàn bộ nội dung đã bị mã hóa hoặc chứa placeholder
  html = html.replace(/\\textbf\{((?:[^{}]|(?:\{[^{}]*\}))+)\}/g, '<strong>$1</strong>')
  html = html.replace(/\\textit\{((?:[^{}]|(?:\{[^{}]*\}))+)\}/g, '<em>$1</em>')
  html = html.replace(/\\underline\{((?:[^{}]|(?:\{[^{}]*\}))+)\}/g, '<u>$1</u>')
  html = html.replace(/\\text\{((?:[^{}]|(?:\{[^{}]*\}))+)\}/g, '$1')
  
  // List environments
  html = html.replace(/\\begin\{itemize\}/g, '<ul style="margin: 0.5em 0; padding-left: 1.5em; list-style-type: disc;">')
  html = html.replace(/\\end\{itemize\}/g, '</ul>')
  html = html.replace(/\\begin\{enumerate\}(?:\[[^\]]*\])?/g, `<ol style="margin: 0.5em 0; padding-left: 1.5em; list-style-type: decimal;">`)
  html = html.replace(/\\end\{enumerate\}/g, '</ol>')
  html = html.replace(/\\item\b/g, '<li>')
  
  // Center environment
  html = html.replace(/\\begin\{center\}/g, '<div style="text-align: center;">')
  html = html.replace(/\\end\{center\}/g, '</div>')

  // TF solution environments
  html = html.replace(/\\begin\{itemchoice\}/g, '<ol type="a" style="margin: 0.5em 0; padding-left: 1.5em;">')
  html = html.replace(/\\end\{itemchoice\}/g, '</ol>')
  html = html.replace(/\\itemch\b/g, '<li>')

  // Quotes
  html = html.replace(/\\lq\\lq\s*/g, '“')
  html = html.replace(/\\rq\\rq\s*/g, '”')
  html = html.replace(/\\lq\s*/g, '‘')
  html = html.replace(/\\rq\s*/g, '’')

  // Spaces, breaks and ignored commands
  html = html.replace(/~/g, '&nbsp;')
  html = html.replace(/\\qquad/g, '&emsp;&emsp;')
  html = html.replace(/\\quad/g, '&emsp;')
  html = html.replace(/\\,/g, '&thinsp;')
  html = html.replace(/\\par\b/g, '<br><br>')
  html = html.replace(/\\allowdisplaybreaks/g, '')
  html = html.replace(/\\\\(?:\s*\n)?/g, '<br>')
  html = html.replace(/\\break/g, '<br>')
  
  // Xử lý xuống dòng: LaTeX dùng 1 enter là space, 2 enter là paragraph.
  html = html.replace(/\n\n+/g, '<br><br>')
  html = html.replace(/\n/g, '<br>')
  
  // PHẢI xóa <br> thừa xung quanh các thẻ block (ul, ol, li, div) để tránh tạo khoảng trắng khổng lồ.
  html = html.replace(/(<\/?(?:ul|ol|li|div)[^>]*>)\s*(?:<br>)+/g, '$1')
  html = html.replace(/(?:<br>)+\s*(<\/?(?:ul|ol|li|div)[^>]*>)/g, '$1')
  
  // Xóa <br> thừa xung quanh công thức hiển thị dạng block (Display Math)
  html = html.replace(/(?:<br>)*\s*__DISPLAY_MATH_(\d+)__\s*(?:<br>)*/g, '__DISPLAY_MATH_$1__')
  
  html = html.replace(/\t/g, '')

  // 5. Trả lại các khối toán học
  html = html.replace(/__(DISPLAY|INLINE)_MATH_(\d+)__/g, (match, type, index) => {
    return mathBlocks[Number(index)]
  })

  return html
}

export function RenderedLatex({ content, className }: { content: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: renderLatexContent(content) }} />
}
