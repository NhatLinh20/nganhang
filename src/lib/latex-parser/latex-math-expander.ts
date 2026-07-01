// src/lib/latex-parser/latex-math-expander.ts
// Expand macro tùy chỉnh → LaTeX chuẩn mà pandoc hiểu được
// Dựa trên danh sách macro từ khaibaochung.tex

// ─────────────────────────────────────────────────────────────────
// EXPAND MACROS
// ─────────────────────────────────────────────────────────────────

/**
 * Trích xuất nội dung balanced braces bắt đầu tại openIdx.
 * Xử lý đúng nested braces và escaped braces.
 */
function extractBalanced(text: string, openIdx: number): { content: string; endIdx: number } | null {
  if (openIdx >= text.length || text[openIdx] !== '{') return null
  let depth = 0
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i]
    const escaped = i > 0 && text[i - 1] === '\\' && (i < 2 || text[i - 2] !== '\\')
    if (ch === '{' && !escaped) depth++
    else if (ch === '}' && !escaped) {
      depth--
      if (depth === 0) return { content: text.slice(openIdx + 1, i), endIdx: i }
    }
  }
  return null
}

/**
 * Expand \\heva{...} → \\left\\{\\begin{cases}...\\end{cases}\\right.
 * Expand \\hoac{...} → \\left[\\begin{cases}...\\end{cases}\\right.
 */
function expandHevHoac(text: string): string {
  let result = text
  
  for (const [macro, open, close] of [
    ['\\heva', '\\begin{cases}', '\\end{cases}'],
    ['\\hoac', '\\left[\\begin{array}{l}',  '\\end{array}\\right.'],
  ] as [string, string, string][]) {
    let out = ''
    let i = 0
    while (i < result.length) {
      const idx = result.indexOf(macro, i)
      if (idx === -1) { out += result.slice(i); break }
      
      // Kiểm tra boundary (tránh khớp \\heva_ hay \\heva123)
      const afterMacro = idx + macro.length
      const nextChar = result[afterMacro]
      if (nextChar && /[a-zA-Z]/.test(nextChar)) {
        out += result.slice(i, idx + 1)
        i = idx + 1
        continue
      }
      
      out += result.slice(i, idx)
      
      // Tìm { ngay sau (bỏ qua whitespace)
      let braceStart = afterMacro
      while (braceStart < result.length && /\s/.test(result[braceStart])) braceStart++
      
      if (result[braceStart] === '{') {
        const inner = extractBalanced(result, braceStart)
        if (inner) {
          // Xóa dấu & đứng đầu mỗi dòng để tránh lỗi cột rỗng trong Word gây ra khoảng trống lớn
          const content = inner.content.split('\\\\').map(line => line.replace(/^\s*&/, '')).join('\\\\')
          
          out += open + content + close;
          i = inner.endIdx + 1;
          continue;
        }
      }
      // Không parse được → giữ nguyên
      out += macro
      i = afterMacro
    }
    result = out
  }
  
  return result
}

/**
 * Loại bỏ các lệnh không cần thiết cho Word:
 * - \\dc{...}, \\dongcham{n}, \\oli{n} — lưới trả lời
 * - \\shortans[opt]{...} — đánh dấu đáp số (đã được xử lý bởi word-parser)
 * - \\True — marker đáp án đúng (đã được xử lý bởi word-parser)
 * - \\allowdisplaybreaks — không cần thiết
 */
function removeUnnecessaryCommands(text: string): string {
  let result = text
  
  // \\dc[opt]{...}
  result = result.replace(/\\dc(?:\[[^\]]*\])?\{[^}]*\}/g, '')
  
  // \\dongcham{n}
  result = result.replace(/\\dongcham\{[^}]*\}/g, '')
  
  // \\oli{n}
  result = result.replace(/\\oli\{[^}]*\}/g, '')
  
  // \\allowdisplaybreaks
  result = result.replace(/\\allowdisplaybreaks/g, '')
  
  // \\True (marker đáp án — đã được xử lý trước đó)
  result = result.replace(/\\True\s*/g, '')
  
  return result
}

/**
 * Chuẩn hóa môi trường toán:
 * - eqnarray* → align*
 * - alignat* → align* (pandoc có thể không hỗ trợ alignat)
 */
function normalizeEnvironments(text: string): string {
  // eqnarray* → align*
  let result = text.replace(
    /\\begin\{eqnarray\*\}([\s\S]*?)\\end\{eqnarray\*\}/g,
    '\\begin{align*}$1\\end{align*}'
  )
  result = result.replace(
    /\\begin\{eqnarray\}([\s\S]*?)\\end\{eqnarray\}/g,
    '\\begin{align}$1\\end{align}'
  )
  // alignat* → align* (pandoc có thể không hỗ trợ)
  result = result.replace(
    /\\begin\{alignat\*\}\{?\d*\}?([\s\S]*?)\\end\{alignat\*\}/g,
    '\\begin{align*}$1\\end{align*}'
  )
  result = result.replace(
    /\\begin\{alignat\}\{?\d*\}?([\s\S]*?)\\end\{alignat\}/g,
    '\\begin{align}$1\\end{align}'
  )
  
  return result
}

/**
 * Escape ký tự đặc biệt {,} và {;} → , và ;
 */
function unescapeSpecialChars(text: string): string {
  return text
    .replace(/\{,\}/g, ',')
    .replace(/\{;\}/g, ';')
}

/**
 * Expand \\varparallel → \\parallel
 */
function expandSymbols(text: string): string {
  return text.replace(/\\varparallel\b/g, '\\parallel')
}

/**
 * Detect các lệnh không nhận diện được để log cảnh báo
 * Chỉ quan tâm đến các lệnh tùy chỉnh (bắt đầu bằng ký tự viết thường sau \\)
 * mà không nằm trong whitelist LaTeX chuẩn
 */
const STANDARD_COMMANDS_WHITELIST = new Set([
  'begin', 'end', 'frac', 'dfrac', 'tfrac', 'sqrt', 'left', 'right',
  'textbf', 'textit', 'underline', 'text', 'mathrm', 'mathbf', 'mathit',
  'overrightarrow', 'vec', 'hat', 'bar', 'tilde', 'dot', 'ddot',
  'quad', 'qquad', 'noindent', 'bigskip', 'medskip', 'smallskip',
  'par', 'newline', 'newpage', 'pagebreak', 'clearpage',
  'sum', 'prod', 'int', 'oint', 'iint', 'iiint',
  'lim', 'sup', 'inf', 'max', 'min', 'log', 'ln', 'sin', 'cos', 'tan',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma',
  'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon',
  'Phi', 'Psi', 'Omega',
  'infty', 'partial', 'nabla', 'forall', 'exists', 'nexists',
  'in', 'notin', 'subset', 'supset', 'subseteq', 'supseteq',
  'cup', 'cap', 'setminus', 'emptyset', 'varnothing',
  'cdot', 'cdots', 'ldots', 'vdots', 'ddots', 'times', 'div', 'pm', 'mp',
  'leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'simeq',
  'to', 'rightarrow', 'leftarrow', 'Rightarrow', 'Leftarrow',
  'leftrightarrow', 'Leftrightarrow', 'iff',
  'parallel', 'perp', 'angle', 'triangle', 'square',
  'binom', 'choose', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix',
  'cases', 'aligned', 'align', 'gather', 'multline',
  'item', 'label', 'ref', 'cite',
  'color', 'colorbox', 'fbox', 'mbox',
  'hspace', 'vspace', 'hfill', 'vfill',
  'includegraphics', 'caption', 'label',
  'loigiai', 'choice', 'choiceTF', 'shortans', 'immini',
  'heva', 'hoac', 'vv',    // custom — đã được expand trước
  'lq', 'rq',              // quotes
  'allowdisplaybreaks',
  'dc', 'dongcham', 'oli', 'True',  // đã xử lý (removed)
])

export function detectUnknownCommands(text: string): string[] {
  const unknown: string[] = []
  const matches = text.matchAll(/\\([a-zA-Z]+)/g)
  for (const match of matches) {
    const cmd = match[1]
    if (!STANDARD_COMMANDS_WHITELIST.has(cmd)) {
      if (!unknown.includes(cmd)) unknown.push(cmd)
    }
  }
  return unknown
}

// ─────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────

/**
 * Expand tất cả macro tùy chỉnh trong một câu hỏi LaTeX thành LaTeX chuẩn.
 * Hàm này an toàn để gọi trên raw LaTeX block.
 */
export function expandMacros(latexContent: string): string {
  let result = latexContent
  result = unescapeSpecialChars(result)
  result = expandHevHoac(result)
  result = expandSymbols(result)
  result = normalizeEnvironments(result)
  result = removeUnnecessaryCommands(result)
  return result
}
