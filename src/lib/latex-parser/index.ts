// src/lib/latex-parser/index.ts
// Module chính - export tất cả parser functions

export { parseTexFile, extractAndValidateBlocks, formatImportReport } from './file-parser'
export { parseQuestion } from './question-parser'
export { parseCategoryCode } from './category-parser'
export { detectQuestionType, detectCorrectAnswer } from './answer-parser'
export { normalizeQuestion, normalizeAllQuestions } from './normalizer'
export type { ParseOptions, ParseFileResult, ErrorBlock, ExtractResult } from './file-parser'
