"use strict";
// src/lib/latex-parser/latex-math-expander.ts
// Expand macro tùy chỉnh → LaTeX chuẩn mà pandoc hiểu được
// Dựa trên danh sách macro từ khaibaochung.tex
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectUnknownCommands = detectUnknownCommands;
exports.expandMacros = expandMacros;
// ─────────────────────────────────────────────────────────────────
// EXPAND MACROS
// ─────────────────────────────────────────────────────────────────
/**
 * Trích xuất nội dung balanced braces bắt đầu tại openIdx.
 * Xử lý đúng nested braces và escaped braces.
 */
function extractBalanced(text, openIdx) {
    if (openIdx >= text.length || text[openIdx] !== '{')
        return null;
    var depth = 0;
    for (var i = openIdx; i < text.length; i++) {
        var ch = text[i];
        var escaped = i > 0 && text[i - 1] === '\\' && (i < 2 || text[i - 2] !== '\\');
        if (ch === '{' && !escaped)
            depth++;
        else if (ch === '}' && !escaped) {
            depth--;
            if (depth === 0)
                return { content: text.slice(openIdx + 1, i), endIdx: i };
        }
    }
    return null;
}
/**
 * Expand \\heva{...} → \\left\\{\\begin{cases}...\\end{cases}\\right.
 * Expand \\hoac{...} → \\left[\\begin{cases}...\\end{cases}\\right.
 */
function expandHevHoac(text) {
    var result = text;
    for (var _i = 0, _a = [
        ['\\heva', '\\begin{cases}', '\\end{cases}'],
        ['\\hoac', '\\left[\\begin{array}{l}', '\\end{array}\\right.'],
    ]; _i < _a.length; _i++) {
        var _b = _a[_i], macro = _b[0], open_1 = _b[1], close_1 = _b[2];
        var out = '';
        var i = 0;
        while (i < result.length) {
            var idx = result.indexOf(macro, i);
            if (idx === -1) {
                out += result.slice(i);
                break;
            }
            // Kiểm tra boundary (tránh khớp \\heva_ hay \\heva123)
            var afterMacro = idx + macro.length;
            var nextChar = result[afterMacro];
            if (nextChar && /[a-zA-Z]/.test(nextChar)) {
                out += result.slice(i, idx + 1);
                i = idx + 1;
                continue;
            }
            out += result.slice(i, idx);
            // Tìm { ngay sau (bỏ qua whitespace)
            var braceStart = afterMacro;
            while (braceStart < result.length && /\s/.test(result[braceStart]))
                braceStart++;
            if (result[braceStart] === '{') {
                var inner = extractBalanced(result, braceStart);
                if (inner) {
                    // Xóa dấu & đứng đầu mỗi dòng để tránh lỗi cột rỗng trong Word gây ra khoảng trống lớn
                    var content = inner.content.split('\\\\').map(function (line) { return line.replace(/^\s*&/, ''); }).join('\\\\');
                    out += open_1 + content + close_1;
                    i = inner.endIdx + 1;
                    continue;
                }
            }
            // Không parse được → giữ nguyên
            out += macro;
            i = afterMacro;
        }
        result = out;
    }
    return result;
}
/**
 * Loại bỏ các lệnh không cần thiết cho Word:
 * - \\dc{...}, \\dongcham{n}, \\oli{n} — lưới trả lời
 * - \\shortans[opt]{...} — đánh dấu đáp số (đã được xử lý bởi word-parser)
 * - \\True — marker đáp án đúng (đã được xử lý bởi word-parser)
 * - \\allowdisplaybreaks — không cần thiết
 */
function removeUnnecessaryCommands(text) {
    var result = text;
    // \\dc[opt]{...}
    result = result.replace(/\\dc(?:\[[^\]]*\])?\{[^}]*\}/g, '');
    // \\dongcham{n}
    result = result.replace(/\\dongcham\{[^}]*\}/g, '');
    // \\oli{n}
    result = result.replace(/\\oli\{[^}]*\}/g, '');
    // \\allowdisplaybreaks
    result = result.replace(/\\allowdisplaybreaks/g, '');
    // \\True (marker đáp án — đã được xử lý trước đó)
    result = result.replace(/\\True\s*/g, '');
    return result;
}
/**
 * Chuẩn hóa môi trường toán:
 * - eqnarray* → align*
 * - alignat* → align* (pandoc có thể không hỗ trợ alignat)
 */
function normalizeEnvironments(text) {
    // eqnarray* → align*
    var result = text.replace(/\\begin\{eqnarray\*\}([\s\S]*?)\\end\{eqnarray\*\}/g, '\\begin{align*}$1\\end{align*}');
    result = result.replace(/\\begin\{eqnarray\}([\s\S]*?)\\end\{eqnarray\}/g, '\\begin{align}$1\\end{align}');
    // alignat* → align* (pandoc có thể không hỗ trợ)
    result = result.replace(/\\begin\{alignat\*\}\{?\d*\}?([\s\S]*?)\\end\{alignat\*\}/g, '\\begin{align*}$1\\end{align*}');
    result = result.replace(/\\begin\{alignat\}\{?\d*\}?([\s\S]*?)\\end\{alignat\}/g, '\\begin{align}$1\\end{align}');
    return result;
}
/**
 * Escape ký tự đặc biệt {,} và {;} → , và ;
 */
function unescapeSpecialChars(text) {
    return text
        .replace(/\{,\}/g, ',')
        .replace(/\{;\}/g, ';');
}
/**
 * Expand \\varparallel → \\parallel
 */
function expandSymbols(text) {
    return text.replace(/\\varparallel\b/g, '\\parallel');
}
/**
 * Detect các lệnh không nhận diện được để log cảnh báo
 * Chỉ quan tâm đến các lệnh tùy chỉnh (bắt đầu bằng ký tự viết thường sau \\)
 * mà không nằm trong whitelist LaTeX chuẩn
 */
var STANDARD_COMMANDS_WHITELIST = new Set([
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
    'heva', 'hoac', 'vv', // custom — đã được expand trước
    'lq', 'rq', // quotes
    'allowdisplaybreaks',
    'dc', 'dongcham', 'oli', 'True', // đã xử lý (removed)
]);
function detectUnknownCommands(text) {
    var unknown = [];
    var matches = text.matchAll(/\\([a-zA-Z]+)/g);
    for (var _i = 0, matches_1 = matches; _i < matches_1.length; _i++) {
        var match = matches_1[_i];
        var cmd = match[1];
        if (!STANDARD_COMMANDS_WHITELIST.has(cmd)) {
            if (!unknown.includes(cmd))
                unknown.push(cmd);
        }
    }
    return unknown;
}
// ─────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────
/**
 * Expand tất cả macro tùy chỉnh trong một câu hỏi LaTeX thành LaTeX chuẩn.
 * Hàm này an toàn để gọi trên raw LaTeX block.
 */
function expandMacros(latexContent) {
    var result = latexContent;
    result = unescapeSpecialChars(result);
    result = expandHevHoac(result);
    result = expandSymbols(result);
    result = normalizeEnvironments(result);
    result = removeUnnecessaryCommands(result);
    return result;
}
