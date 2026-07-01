"use strict";
// src/lib/latex-parser/answer-parser.ts
// Phát hiện loại câu hỏi và đáp án đúng từ raw LaTeX
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectQuestionType = detectQuestionType;
exports.detectMCAnswer = detectMCAnswer;
exports.detectTFAnswer = detectTFAnswer;
exports.detectShortAnswer = detectShortAnswer;
exports.detectCorrectAnswer = detectCorrectAnswer;
exports.extractBracketedItems = extractBracketedItems;
exports.extractSourceMeta = extractSourceMeta;
// ═══════════════════════════════════════════════════
// DETECT LOẠI CÂU HỎI
// ═══════════════════════════════════════════════════
/**
 * Phát hiện loại câu hỏi từ raw LaTeX block
 * Ưu tiên: \choiceTF > \choice > \shortans > essay
 */
function detectQuestionType(latexBlock) {
    // Trắc nghiệm Đúng/Sai — phải check trước \choice
    if (/\\choiceTF/.test(latexBlock)) {
        return 'true_false';
    }
    // Trắc nghiệm 4 phương án
    if (/\\choice(?!\s*TF)/.test(latexBlock)) {
        return 'multiple_choice';
    }
    // Trả lời ngắn / kết quả
    if (/\\shortans/.test(latexBlock)) {
        return 'short_answer';
    }
    // Tự luận
    return 'essay';
}
// ═══════════════════════════════════════════════════
// DETECT ĐÁP ÁN ĐÚNG
// ═══════════════════════════════════════════════════
/**
 * Tìm đáp án đúng cho câu Trắc nghiệm 4PA
 * Trả về 'A', 'B', 'C', hoặc 'D'
 * Logic: đếm vị trí của \True trong \choice{...}{\True ...}{...}{...}
 */
function detectMCAnswer(latexBlock) {
    // Lấy phần \choice{...}{...}{...}{...}
    // Tìm từ \choice hoặc \choice[số] đến hết các { }
    var choiceMatch = latexBlock.match(/\\choice(?:\[\d+\])?\s*([\s\S]+?)(?=\\loigiai|\\end\{ex\})/m);
    if (!choiceMatch)
        return null;
    var choiceBlock = choiceMatch[1];
    // Tách từng phương án — dùng balanced bracket parser
    var options = extractBracketedItems(choiceBlock);
    for (var i = 0; i < options.length; i++) {
        if (/\\True/.test(options[i])) {
            return ['A', 'B', 'C', 'D'][i] || null;
        }
    }
    return null;
}
/**
 * Tìm đáp án đúng cho câu Đúng/Sai
 * Trả về chuỗi VD: 'ĐSĐS' hoặc 'ĐSSĐ'...
 * Logic: \True = Đúng, không có = Sai
 */
function detectTFAnswer(latexBlock) {
    // Lấy phần \choiceTF{...}{...}{...}{...}
    var tfMatch = latexBlock.match(/\\choiceTF\s*([\s\S]+?)(?=\\loigiai|\\end\{ex\})/m);
    if (!tfMatch)
        return null;
    var tfBlock = tfMatch[1];
    var options = extractBracketedItems(tfBlock);
    if (options.length === 0)
        return null;
    // Đề thi trắc nghiệm Đúng/Sai luôn có tối đa 4 ý độc lập (a, b, c, d).
    // Việc cắt lấy 4 phần tử đầu tiên giúp loại bỏ trường hợp có hình vẽ tikzpicture ở cuối được bao trong ngoặc {...}
    var tfOptions = options.slice(0, 4);
    return tfOptions.map(function (opt) { return /\\True/.test(opt) ? 'Đ' : 'S'; }).join('');
}
/**
 * Tìm đáp án cho câu Trả lời kết quả
 * Hỗ trợ các dạng:
 *   \shortans{2,5}        → "2,5"
 *   \shortans[]{2,5}      → "2,5"   (optional [] rỗng)
 *   \shortans[oly]{34}    → "34"    (optional [tùy chọn])
 *   \shortans{2{,}45}     → "2,45"  ({,} là cách LaTeX viết dấu phẩy trong toán)
 */
function detectShortAnswer(latexBlock) {
    // Tìm vị trí bắt đầu của `{` ngay sau `\shortans` (và optional `[...]`)
    var match = latexBlock.match(/\\shortans\s*(?:\[[^\]]*\])?\s*(?=\{)/);
    if (!match || match.index === undefined)
        return null;
    var braceStart = match.index + match[0].length;
    var content = extractBalancedBraceContent(latexBlock, braceStart);
    return content ? normalizeShortAnswer(content) : null;
}
/**
 * Trích xuất nội dung bên trong { } có balanced braces
 * VD: "{2{,}45}" → "2{,}45"
 */
function extractBalancedBraceContent(text, openIdx) {
    var depth = 0;
    var start = openIdx;
    for (var i = openIdx; i < text.length; i++) {
        if (text[i] === '{')
            depth++;
        else if (text[i] === '}') {
            depth--;
            if (depth === 0)
                return text.slice(start + 1, i);
        }
    }
    return null;
}
/**
 * Chuẩn hóa đáp án:
 *   - {,} → ,  (dấu phẩy trong LaTeX math mode)
 *   - Bỏ khoảng trắng thừa
 */
function normalizeShortAnswer(raw) {
    var cleaned = raw.trim();
    if (cleaned.startsWith('$') && cleaned.endsWith('$')) {
        cleaned = cleaned.slice(1, -1).trim();
    }
    return cleaned
        .replace(/\{,\}/g, ',') // {,} → ,
        .replace(/\{;\}/g, ';') // {;} → ; (tương tự)
        .replace(/\\,/g, '') // \, → xóa (dấu cách nghìn trong LaTeX, VD: 4\,097 → 4097)
        .trim();
}
/**
 * Hàm tổng hợp: phát hiện đáp án theo loại câu hỏi
 */
function detectCorrectAnswer(latexBlock, questionType) {
    switch (questionType) {
        case 'multiple_choice':
            return detectMCAnswer(latexBlock);
        case 'true_false':
            return detectTFAnswer(latexBlock);
        case 'short_answer':
            return detectShortAnswer(latexBlock);
        case 'essay':
            return null;
        default:
            return null;
    }
}
// ═══════════════════════════════════════════════════
// UTILITY: Tách các item trong { } liên tiếp
// ═══════════════════════════════════════════════════
/**
 * Tách các item {nội dung} liên tiếp từ chuỗi LaTeX
 * Xử lý được nested braces VD: {$\frac{1}{2}$}
 */
function extractBracketedItems(text) {
    var items = [];
    var i = 0;
    while (i < text.length) {
        // Bỏ qua whitespace
        while (i < text.length && /\s/.test(text[i]))
            i++;
        if (i >= text.length)
            break;
        if (text[i] === '{') {
            // Tìm closing brace tương ứng (xử lý nested)
            var depth = 0;
            var start = i;
            var j = i;
            while (j < text.length) {
                if (text[j] === '{' && (j === 0 || text[j - 1] !== '\\'))
                    depth++;
                else if (text[j] === '}' && (j === 0 || text[j - 1] !== '\\')) {
                    depth--;
                    if (depth === 0) {
                        // Lấy nội dung bên trong { }
                        items.push(text.slice(start + 1, j));
                        i = j + 1;
                        break;
                    }
                }
                j++;
            }
            if (depth !== 0)
                break; // Malformed LaTeX
        }
        else {
            i++;
        }
    }
    return items;
}
/**
 * Trích xuất metadata nguồn gốc từ các comment %[...]
 * VD: %[Dự án: ABC], %[TV015], %[2-TK-GK2-KN-1-2526]
 */
function extractSourceMeta(latexBlock) {
    var result = {};
    // Tìm tất cả comment %[...]
    var comments = [];
    var regex = /%\[([^\]]+)\]/g;
    var match;
    while ((match = regex.exec(latexBlock)) !== null) {
        comments.push(match[1].trim());
    }
    for (var _i = 0, comments_1 = comments; _i < comments_1.length; _i++) {
        var comment = comments_1[_i];
        // Mã giáo viên: dạng 2 chữ cái + 3 số VD: TV015, NT123
        if (/^[A-Z]{2}\d{3}$/.test(comment)) {
            result.source_teacher = comment;
        }
        // Mã đề: chứa dấu gạch nối nhiều phần VD: 2-TK-GK2-KN-1-2526
        else if (/^\d+-[A-Z]/.test(comment) && comment.includes('-')) {
            result.source_exam = comment;
        }
    }
    return result;
}
