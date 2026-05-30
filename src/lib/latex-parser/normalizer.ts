// src/lib/latex-parser/normalizer.ts
// Module chuẩn hóa câu hỏi LaTeX (chạy trên trình duyệt)

type NormalizeRule = (content: string) => string

function removeNonIdComments(content: string): string {
  // Thay thế TẤT CẢ các thẻ %[...] trong TOÀN BỘ nội dung, không chỉ riêng dòng đầu tiên.
  // Điều này đảm bảo an toàn tuyệt đối dù file có chứa ký tự ẩn, xuống dòng dị biệt hay ZWSP.
  
  let newContent = content.replace(/%\[([^\]]*)\]/g, (match, innerText) => {
    // Loại bỏ mọi khoảng trắng thừa để kiểm tra
    const cleanText = innerText.trim();
    
    // Nếu text trống hoặc không có số nào, chắc chắn không phải là ID
    if (!cleanText || !/\d/.test(cleanText)) {
      return '';
    }
    
    // Regex chuẩn của ID: ví dụ 2D3N1-2
    // Nới lỏng: bắt đầu bằng số, kết thúc bằng số, có dấu gạch ngang
    if (/^\d+[a-zA-Z]\d+[a-zA-Z]\d+-\d+$/.test(cleanText)) {
      return match; // Giữ lại nguyên vẹn nếu là ID hợp lệ
    }
    
    return ''; // Xóa sạch nếu là ghi chú rác (như %[Dự án...])
  });

  // Sau khi xóa các %[...] rác, có thể sẽ còn dư khoảng trắng trước %[ID] hợp lệ
  // VD: \begin{ex}   %[2D3N1-2]
  newContent = newContent.replace(/(\\begin\{(?:ex|bt)\})\s+(?=%\[)/g, '$1');

  return newContent;
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function trimTrailingWhitespace(content: string): string {
  return content
    .split('\n')
    .map(line => line.trimRight())
    .join('\n');
}

const NORMALIZE_RULES: NormalizeRule[] = [
  removeNonIdComments,
  normalizeLineEndings,
  trimTrailingWhitespace,
]

export function normalizeQuestion(block: string): string {
  return NORMALIZE_RULES.reduce((content, rule) => rule(content), block);
}

export function normalizeAllQuestions(blocks: string[]): string[] {
  return blocks.map(normalizeQuestion);
}
