// src/lib/latex-parser/index.ts
// Module chính - export tất cả parser functions

export { parseTexFile } from './file-parser'
export { parseQuestion } from './question-parser'
export { parseCategoryCode } from './category-parser'
export { detectQuestionType, detectCorrectAnswer } from './answer-parser'
export type { ParseOptions, ParseFileResult } from './file-parser'
