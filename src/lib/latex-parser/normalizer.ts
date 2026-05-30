// src/lib/latex-parser/normalizer.ts
// Module chuẩn hóa câu hỏi LaTeX (chạy trên trình duyệt)

type NormalizeRule = (content: string) => string

function removeNonIdComments(content: string): string {
  // ID hợp lệ: dạng 2D3N1-2 (số, chữ, số, chữ, số, gạch ngang, số)
  const ID_PATTERN = /^\d+[a-zA-Z]\d+[a-zA-Z]\d+-\d+$/;

  return content.replace(
    // Match toàn bộ phần đầu dòng \begin{ex/bt} + mọi %[...] theo sau
    /(\\begin\{(?:ex|bt)\})\s*((?:%\[[^\]]*\]\s*)*)/g,
    (_match, beginTag, comments) => {
      // Tách tất cả %[...] tags và tìm tag ID hợp lệ đầu tiên
      const allTags = [...comments.matchAll(/%\[([^\]]*)\]/g)];
      const validTag = allTags.find(m => ID_PATTERN.test(m[1].trim()));
      // Tái tạo dòng: chỉ giữ \begin{ex}%[ID hợp lệ]
      return validTag ? `${beginTag}${validTag[0]}` : beginTag;
    }
  );
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function stripInvisibleChars(content: string): string {
  // Các ký tự Unicode vô hình thường xuất hiện khi copy từ Word/web/PDF
  // U+200B: Zero Width Space
  // U+200C: Zero Width Non-Joiner
  // U+200D: Zero Width Joiner
  // U+FEFF: BOM / Zero Width No-Break Space
  // U+00AD: Soft Hyphen
  // U+2060: Word Joiner
  return content.replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u2060]/g, '');
}

function trimTrailingWhitespace(content: string): string {
  return content
    .split('\n')
    .map(line => line.trimRight())
    .join('\n');
}

const NORMALIZE_RULES: NormalizeRule[] = [
  normalizeLineEndings,   // ← chạy trước để chuẩn hóa \r\n → \n
  stripInvisibleChars,    // ← xóa ký tự vô hình (Zero-Width)
  removeNonIdComments,    // ← sau đó mới xử lý comment
  trimTrailingWhitespace,
]

export function normalizeQuestion(block: string): string {
  return NORMALIZE_RULES.reduce((content, rule) => rule(content), block);
}

export function normalizeAllQuestions(blocks: string[]): string[] {
  return blocks.map(normalizeQuestion);
}
