// src/lib/latex-parser/normalizer.ts
// Module chuẩn hóa câu hỏi LaTeX (chạy trên trình duyệt)

type NormalizeRule = (content: string) => string

export function formatLatexIndentation(content: string): string {
  const lines = content.split('\n')
  let envIndent = 0
  let braceIndent = 0
  let inChoice = 0

  const formattedLines = lines.map(line => {
    const trimmed = line.trim()
    if (!trimmed) return ''

    let lineEnvIndent = envIndent
    if (trimmed.startsWith('\\end{')) {
      envIndent = Math.max(0, envIndent - 1)
      lineEnvIndent = envIndent
    }

    let lineBraceIndent = braceIndent
    if (trimmed.startsWith('}')) {
      lineBraceIndent = Math.max(0, braceIndent - 1)
    }

    let extraIndent = 0
    if ((trimmed.startsWith('\\choice') || trimmed.startsWith('\\choiceTF')) && !trimmed.match(/\{.*\}/)) {
      inChoice = 4
    } else if (inChoice > 0 && trimmed.startsWith('{')) {
      extraIndent = 1
      inChoice--
    }

    if (trimmed.startsWith('\\loigiai') || trimmed.startsWith('\\begin{')) {
      inChoice = 0
    }

    const totalTabs = lineEnvIndent + lineBraceIndent + extraIndent
    const formattedLine = '\t'.repeat(Math.max(0, totalTabs)) + trimmed

    if (trimmed.startsWith('\\begin{')) {
      envIndent++
    }

    const unescapedTrimmed = trimmed.replace(/\\\\/g, '').replace(/\\%/g, 'ESCAPED_PERCENT')
    const withoutComment = unescapedTrimmed.split('%')[0]
    const cleanForBraces = withoutComment.replace(/\\\{/g, '').replace(/\\\}/g, '')
    
    const openBraces = (cleanForBraces.match(/\{/g) || []).length
    const closeBraces = (cleanForBraces.match(/\}/g) || []).length
    
    braceIndent += (openBraces - closeBraces)
    if (braceIndent < 0) braceIndent = 0

    return formattedLine
  })

  return formattedLines.join('\n')
}

function removeNonIdComments(content: string): string {
  // ID hợp lệ: dạng 2D3N1-2 (số, chữ, số, chữ, số, gạch ngang, số)
  const ID_PATTERN = /^\d+[a-zA-Z]\d+[a-zA-Z]\d+-\d+$/;

  return content.replace(
    // Đổi \s* thành [^\S\n]* để không nuốt ký tự xuống dòng
    /(\\begin\{(?:ex|bt)\})[^\S\n]*((?:%\[[^\]]*\][^\S\n]*)*)/g,
    (_match, beginTag, comments) => {
      // Tách tất cả %[...] tags và tìm tag ID hợp lệ đầu tiên
      const allTags = [...comments.matchAll(/%\[([^\]]*)\]/g)];
      const validTag = allTags.find(m => ID_PATTERN.test(m[1].trim()));
      // Tái tạo dòng: chỉ giữ \begin{ex}%[ID hợp lệ]
      return validTag ? `${beginTag}${validTag[0]}` : beginTag;
    }
  );
}

// Thêm rule bảo vệ: đảm bảo luôn có \n sau \begin{ex}%[ID]
// (phòng trường hợp file gốc không có xuống dòng)
function ensureNewlineAfterBeginTag(content: string): string {
  // Bỏ ? → %[ID] bắt buộc phải có, không còn khớp \begin{ex} đơn độc nữa
  return content.replace(
    /(\\begin\{(?:ex|bt)\}%\[[^\]]*\])[^\S\n]*(?!\n)/g,
    '$1\n'
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

function processOutsideTikz(content: string, processor: (text: string) => string): string {
  // Tách văn bản thành mảng: [ngoài tikz, trong tikz, ngoài tikz, ...]
  const parts = content.split(/(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})/);
  for (let i = 0; i < parts.length; i++) {
    // Vị trí chẵn là văn bản ngoài tikzpicture
    if (i % 2 === 0) {
      parts[i] = processor(parts[i]);
    }
  }
  return parts.join('');
}

function formatDecimalsWithComma(content: string): string {
  // Chuẩn hóa số thập phân trong tiếng Việt: 0,975 -> 0{,}975 để LaTeX không bị cách chữ
  // CẢNH BÁO: Phải bỏ qua code TikZ để tránh làm hỏng tọa độ như (0,0) -> (0{,}0)
  return processOutsideTikz(content, text => text.replace(/(\d),(\d)/g, '$1{,}$2'));
}

function replaceFracWithDfrac(content: string): string {
  // Thay thế \frac thành \dfrac để phân số hiển thị to rõ ràng hơn
  return content.replace(/\\frac/g, '\\dfrac');
}

function replaceIntWithDisplaystyleInt(content: string): string {
  // Thay thế \int thành \displaystyle\int
  return content.replace(/(\\displaystyle\s*)?\\int/g, (match, p1) => {
    return p1 ? match : '\\displaystyle\\int';
  });
}

function removeSpacesAroundOperators(content: string): string {
  // Xóa khoảng trắng quanh các dấu +, -, =, <, >
  // Bỏ qua TikZ vì có thể phá hỏng các cú pháp như draw (A) + (1,0) hoặc các khai báo option
  return processOutsideTikz(content, text => {
    let res = text.replace(/[ \t]*([+\-=<>])[ \t]*/g, '$1');
    // Dấu mũi tên (\Leftrightarrow, \Rightarrow...): xóa khoảng trắng phía trước, để lại đúng 1 khoảng trắng phía sau
    res = res.replace(/[ \t]*(\\Leftrightarrow|\\Rightarrow|\\Leftarrow|\\iff|\\implies)[ \t]*/g, '$1 ');
    return res;
  });
}

function replaceMiddleWithMid(content: string): string {
  // Thay thế \;\middle|\; hoặc \middle| thành \mid
  return content
    .replace(/\\;\s*\\middle\s*\|\s*\\;/g, '\\mid')
    .replace(/\\middle\s*\|/g, '\\mid');
}

function replaceLimWithLimits(content: string): string {
  // Thay \lim_{...} thành \lim\limits_{...} (bỏ qua nếu đã có \limits)
  // Đồng thời xóa khoảng trắng thừa: x \to → x\to, \to + → \to+
  return content.replace(/\\lim(\\limits)?_(\{[^}]*\})/g, (_match, hasLimits, subscript) => {
    // Chuẩn hóa khoảng trắng bên trong subscript
    const cleaned = subscript
      .replace(/\s*\\to\s*/g, '\\to')
    return `\\lim\\limits_${cleaned}`;
  });
}

function replaceBarWithOverline(content: string): string {
  // Thay \bar{...} thành \overline{...}
  return content.replace(/\\bar\{/g, '\\overline{');
}

function removeTrailingDotInChoice(content: string): string {
  // Bỏ dấu chấm (.) ngay trước } ở cuối mỗi đáp án trong \choice / \choiceTF
  // Khớp: dấu $ hoặc ) hoặc chữ/số, theo sau là dấu chấm rồi } → bỏ dấu chấm
  return content.replace(/\.\}$/gm, '}');
}

function wrapBareNumbersInChoice(content: string): string {
  // Trong đáp án \choice / \choiceTF, nếu nội dung là số đơn lẻ (chưa có $)
  // thì tự bọc vào $...$
  // VD: {2} → {$2$}, {\True 3} → {\True $3$}
  // Chỉ khớp dòng mà toàn bộ nội dung sau { (và optional \True) là một con số
  return content.replace(
    /^(\s*\{)(\\True\s+)?(-?\d+(?:[,.]\d+)?)\s*(\}\s*)$/gm,
    (_match, open, trueTag, number, close) => {
      return `${open}${trueTag || ''}$${number}$${close}`;
    }
  );
}

function wrapBareMathInChoice(content: string): string {
  // Trong đáp án \choice / \choiceTF, nếu nội dung bắt đầu bằng lệnh LaTeX
  // (\vec, \overrightarrow, \dfrac, ...) nhưng KHÔNG có $...$ bọc ngoài → tự thêm $...$
  // VD: {\vec{n}=(3;1;-2)} → {$\vec{n}=(3;1;-2)$}
  // VD: {\True \overrightarrow{AB}} → {\True $\overrightarrow{AB}$}
  // Chỉ khớp dòng riêng lẻ có dạng: { + optional \True + \command... + }
  return content.replace(
    /^(\s*\{)(\\True\s+)?(\\(?!True\b)[a-zA-Z].*?)(\}\s*)$/gm,
    (match, open, trueTag, inner, close) => {
      // Nếu nội dung đã có $ ở đầu thì bỏ qua
      if (inner.trimStart().startsWith('$')) return match;
      return `${open}${trueTag || ''}$${inner.trim()}$${close}`;
    }
  );
}

function wrapBareFormulaInText(content: string): string {
  // Phát hiện công thức toán trong văn bản chưa bọc $...$
  // Cụ thể: f'(x), g'(x)=biểu_thức, y'=...
  // VD: đạo hàm f'(x)=x(x-2)^2. → đạo hàm $f'(x)=x(x-2)^2$.
  return processOutsideTikz(content, (text) => {
    // Tách theo $...$ để bỏ qua nội dung đã trong math mode
    const parts = text.split(/(\$[^$]*?\$)/);
    return parts.map((part, i) => {
      if (i % 2 === 1) return part; // Trong $...$, bỏ qua
      let result = part;

      // Pattern 1: f'(x)=biểu_thức (derivative với phương trình)
      // Biểu thức kết thúc khi gặp dấu chấm/phẩy + khoảng trắng, hoặc cuối dòng
      result = result.replace(
        /([a-zA-Z]'{1,2}\([a-zA-Z]\)\s*[=<>]\s*\S+?(?<=[a-zA-Z0-9)}]))(?=\s|[.,;:]|$)/gm,
        (_m: string, expr: string) => `$${expr.trim()}$`
      );

      // Pattern 2: f'(x) đơn lẻ (không có = phía sau)
      // Bỏ qua nếu đã được bọc $ (từ pattern 1) hoặc đã có sẵn
      result = result.replace(
        /(?<!\$)([a-zA-Z]'{1,2}\([a-zA-Z]\))(?![=$<>])/g,
        (_m: string, expr: string) => `$${expr}$`
      );

      return result;
    }).join('');
  });
}

const NORMALIZE_RULES: NormalizeRule[] = [
  normalizeLineEndings,   // ← chạy trước để chuẩn hóa \r\n → \n
  stripInvisibleChars,    // ← xóa ký tự vô hình (Zero-Width)
  removeNonIdComments,    // ← sau đó mới xử lý comment
  ensureNewlineAfterBeginTag, // ← đảm bảo luôn xuống dòng sau tag
  trimTrailingWhitespace,
  formatDecimalsWithComma, // ← chuẩn hóa số thập phân 0,975 → 0{,}975
  replaceFracWithDfrac,    // ← đổi \frac thành \dfrac
  replaceIntWithDisplaystyleInt, // ← đổi \int thành \displaystyle\int
  removeSpacesAroundOperators, // ← xóa khoảng trắng quanh +, -, =, \Leftrightarrow
  replaceMiddleWithMid, // ← đổi \middle| thành \mid
  replaceLimWithLimits, // ← đổi \lim_{} thành \lim\limits_{}
  replaceBarWithOverline, // ← đổi \bar{} thành \overline{}
  removeTrailingDotInChoice, // ← bỏ dấu chấm cuối đáp án trong \choice
  wrapBareNumbersInChoice, // ← bọc số đơn lẻ trong \choice bằng $...$
  wrapBareMathInChoice, // ← bọc biểu thức toán thiếu $ trong \choice
  wrapBareFormulaInText, // ← bọc f'(x)=... thiếu $ trong văn bản
  formatLatexIndentation, // ← canh tab tự động
]

export function normalizeQuestion(block: string): string {
  return NORMALIZE_RULES.reduce((content, rule) => rule(content), block);
}

export function normalizeAllQuestions(blocks: string[]): string[] {
  return blocks.map(normalizeQuestion);
}
