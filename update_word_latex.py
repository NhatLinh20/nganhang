import re

with open('src/lib/word-latex-builder.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update BuildLatexOptions
text = text.replace('includeSolution?: boolean', 'includeSolution?: boolean\n  includeAnswerTable?: boolean')

# 2. Add buildAnswerTable before fixPandocCenterline
answer_table_code = """
function buildAnswerTable(questions: WordQuestion[]): string {
  const mcQs = questions.filter(q => q.questionType === 'multiple_choice')
  const tfQs = questions.filter(q => q.questionType === 'true_false')
  const saQs = questions.filter(q => q.questionType === 'short_answer')
  
  if (mcQs.length === 0 && tfQs.length === 0 && saQs.length === 0) return ''

  const lines: string[] = []
  lines.push('\\vspace{1cm}')
  lines.push('\\begin{center}')
  lines.push('\\textbf{\\Large BẢNG ĐÁP ÁN}')
  lines.push('\\end{center}')
  lines.push('\\medskip')

  if (mcQs.length > 0) {
    lines.push('\\noindent\\textbf{PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn}')
    lines.push('\\begin{center}')
    lines.push('\\begin{tabular}{|c|c|c|c|c|c|c|c|}')
    lines.push('\\hline')
    const cols = 4
    for (let r = 0; r < Math.ceil(mcQs.length / cols); r++) {
       const rowCells: string[] = []
       for (let c = 0; c < cols; c++) {
         const qIdx = r * cols + c
         if (qIdx < mcQs.length) {
            const q = mcQs[qIdx]
            const correctChoice = q.choices?.find(ch => ch.isCorrect)?.label || ''
            rowCells.push(`\\textbf{${qIdx + 1}} & ${correctChoice}`)
         } else {
            rowCells.push(' & ')
         }
       }
       lines.push(rowCells.join(' & ') + ' \\\\')
       lines.push('\\hline')
    }
    lines.push('\\end{tabular}')
    lines.push('\\end{center}')
  }

  if (tfQs.length > 0) {
    lines.push('\\noindent\\textbf{PHẦN II. Câu trắc nghiệm đúng sai}')
    lines.push('\\begin{center}')
    lines.push('\\begin{tabular}{|c|c|c|c|c|c|c|c|}')
    lines.push('\\hline')
    const cols = 4
    for (let r = 0; r < Math.ceil(tfQs.length / cols); r++) {
       const rowCells: string[] = []
       for (let c = 0; c < cols; c++) {
         const qIdx = r * cols + c
         if (qIdx < tfQs.length) {
            const q = tfQs[qIdx]
            const ans = q.tfStatements?.map(s => s.isTrue ? 'Đ' : 'S').join('') || ''
            rowCells.push(`\\textbf{${qIdx + 1}} & ${ans}`)
         } else {
            rowCells.push(' & ')
         }
       }
       lines.push(rowCells.join(' & ') + ' \\\\')
       lines.push('\\hline')
    }
    lines.push('\\end{tabular}')
    lines.push('\\end{center}')
  }

  if (saQs.length > 0) {
    lines.push('\\noindent\\textbf{PHẦN III. Câu trả lời ngắn}')
    lines.push('\\begin{center}')
    lines.push('\\begin{tabular}{|c|c|c|c|c|c|c|c|}')
    lines.push('\\hline')
    const cols = 4
    for (let r = 0; r < Math.ceil(saQs.length / cols); r++) {
       const rowCells: string[] = []
       for (let c = 0; c < cols; c++) {
         const qIdx = r * cols + c
         if (qIdx < saQs.length) {
            const q = saQs[qIdx]
            rowCells.push(`\\textbf{${qIdx + 1}} & ${q.shortAnswer || ''}`)
         } else {
            rowCells.push(' & ')
         }
       }
       lines.push(rowCells.join(' & ') + ' \\\\')
       lines.push('\\hline')
    }
    lines.push('\\end{tabular}')
    lines.push('\\end{center}')
  }

  return lines.join('\\n')
}

function fixPandocCenterline(tex: string): string {"""

text = text.replace('function fixPandocCenterline(tex: string): string {', answer_table_code)

# 3. Append to buildExamLatex and buildExamWithSolutionLatex
# Wait, buildExamWithSolutionLatex doesn't have "------------ HẾT ------------"
# It ends with lines.push('\\end{document}')
# buildExamLatex has:
# lines.push('\\textbf{------------ HẾT ------------}')

def insert_answer_table_buildExamLatex(match):
    return "lines.push('\\\\textbf{------------ HẾT ------------}')\\n  if (options.includeAnswerTable) {\\n    lines.push(buildAnswerTable(questions))\\n  }"

text = re.sub(r"lines\.push\('\\\\textbf{------------ HẾT ------------}'\)", insert_answer_table_buildExamLatex, text)

# For buildExamWithSolutionLatex, let's insert it before \\end{document}
def insert_answer_table_buildExamWithSolutionLatex(match):
    return "if (options.includeAnswerTable) {\\n    lines.push(buildAnswerTable(questions))\\n  }\\n\\n  lines.push('\\\\end{document}')"

# I only want to replace the SECOND occurrence of \end{document} because the first one is inside buildExamLatex
# Or I can just match lines.push('\end{document}')
occurrences = [m.start() for m in re.finditer(r"lines\.push\('\\\\end\{document\}'\)", text)]
if len(occurrences) == 2:
    idx = occurrences[1]
    replacement = "if (options.includeAnswerTable) {\\n    lines.push(buildAnswerTable(questions))\\n  }\\n  lines.push('\\\\end{document}')"
    text = text[:idx] + replacement + text[idx + len("lines.push('\\\\end{document}')"):]

with open('src/lib/word-latex-builder.ts', 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated src/lib/word-latex-builder.ts')
