import { parseAllWordQuestions } from './src/lib/latex-parser/word-parser'

const latex = `
\\begin{ex}
Một nhà sản xuất...
\\immini{Nội dung câu hỏi}{\\begin{tikzpicture} \\draw (0,0) -- (1,1); \\end{tikzpicture}}
\\choice{A}{B}{C}{D}
\\end{ex}
`

const result = parseAllWordQuestions(latex)
console.log(JSON.stringify(result, null, 2))
