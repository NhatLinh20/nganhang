const fs = require('fs')
const tex = fs.readFileSync('d:/nganhang/debug_export.tex', 'utf-8')
// Wait, I can't run buildExamWithSolutionLatex directly without mocking the data.
// But the error is "unexpected () \begin{center}". 
