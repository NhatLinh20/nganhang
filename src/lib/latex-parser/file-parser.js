"use strict";
// src/lib/latex-parser/file-parser.ts
// Parse toàn bộ file .tex — tách từng block \begin{ex}...\end{ex}
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractExBlocks = extractExBlocks;
exports.preprocessTexContent = preprocessTexContent;
exports.parseTexFile = parseTexFile;
exports.formatImportReport = formatImportReport;
exports.extractAndValidateBlocks = extractAndValidateBlocks;
var question_parser_1 = require("./question-parser");
var category_parser_1 = require("./category-parser");
// ═══════════════════════════════════════════════════
// BƯỚC 1: Tách các block \begin{ex}...\end{ex}
// ═══════════════════════════════════════════════════
/**
 * Tách tất cả block \begin{ex}...\end{ex} từ nội dung file .tex
 * Xử lý được:
 *   - Nhiều câu liên tiếp
 *   - Các lệnh cấu trúc đề bên ngoài (\caulc, \cauds, \caukq, \tl...)
 *   - \dc{...} ngoài \begin{ex}
 *   - \begin{name}...\end{name} và các lệnh header
 *   - Nested environments BÊN TRONG ex (tikzpicture, tabular...)
 */
function extractExBlocks(texContent) {
    var blocks = [];
    var BEGIN_EX = '\\begin{ex}';
    var END_EX = '\\end{ex}';
    var searchFrom = 0;
    while (true) {
        // Tìm \begin{ex} tiếp theo
        var beginIdx = texContent.indexOf(BEGIN_EX, searchFrom);
        if (beginIdx === -1)
            break;
        // Tìm \end{ex} tương ứng — cần xử lý nested environments (không phải nested ex)
        // Vì \begin{ex} không lồng nhau, chỉ cần tìm \end{ex} đầu tiên sau begin
        var endIdx = texContent.indexOf(END_EX, beginIdx + BEGIN_EX.length);
        if (endIdx === -1)
            break; // Malformed — thiếu \end{ex}
        var block = texContent.slice(beginIdx, endIdx + END_EX.length);
        blocks.push(block);
        searchFrom = endIdx + END_EX.length;
    }
    return blocks;
}
// ═══════════════════════════════════════════════════
// BƯỚC 2: Tiền xử lý — bỏ \dc{...} ngoài \begin{ex}
// ═══════════════════════════════════════════════════
/**
 * Làm sạch nội dung file trước khi parse
 * - Bỏ \dc{...} (nằm sau \end{ex})
 * - Không sửa bên trong \begin{ex}...\end{ex}
 */
function preprocessTexContent(content) {
    // Chỉ bỏ \dc{...} nằm NGOÀI \begin{ex}...\end{ex}
    // Thay bằng empty string
    return content.replace(/\\dc\{[^}]*\}/g, '');
}
// ═══════════════════════════════════════════════════
// BƯỚC 3: Parse toàn bộ file
// ═══════════════════════════════════════════════════
/**
 * Parse toàn bộ nội dung file .tex
 * @param texContent - Nội dung file .tex (string)
 * @param options - Tùy chọn parse
 */
function parseTexFile(texContent, options) {
    if (options === void 0) { options = {}; }
    var sourceFile = options.sourceFile, _a = options.skipDuplicates, skipDuplicates = _a === void 0 ? true : _a;
    var errors = [];
    var questions = [];
    var seenContent = new Set();
    // 1. Tiền xử lý
    var cleaned = preprocessTexContent(texContent);
    // 2. Tách blocks
    var rawBlocks = extractExBlocks(cleaned);
    // 3. Parse từng block
    for (var i = 0; i < rawBlocks.length; i++) {
        var block = rawBlocks[i];
        // Kiểm tra duplicate
        if (skipDuplicates && seenContent.has(block)) {
            errors.push({
                reason: 'duplicate',
                content: block.slice(0, 80) + '...',
            });
            continue;
        }
        // Parse question
        var parseResult = (0, question_parser_1.parseQuestion)(block, sourceFile);
        if (parseResult.success) {
            questions.push(parseResult.question);
            if (skipDuplicates)
                seenContent.add(block);
        }
        else {
            errors.push({
                reason: parseResult.error.reason,
                content: block.slice(0, 120) + '...',
                detail: parseResult.error.detail,
            });
        }
    }
    return {
        questions: questions,
        rawBlocks: rawBlocks,
        result: {
            total: rawBlocks.length,
            success: questions.length,
            skipped: errors.filter(function (e) { return e.reason === 'duplicate'; }).length,
            errors: errors,
        },
    };
}
// ═══════════════════════════════════════════════════
// UTILITY: Format báo cáo kết quả
// ═══════════════════════════════════════════════════
function formatImportReport(result) {
    var lines = [
        "\uD83D\uDCCA K\u1EBFt qu\u1EA3 import:",
        "  \u2705 Th\u00E0nh c\u00F4ng: ".concat(result.success, " c\u00E2u"),
        "  \u23ED  B\u1ECF qua (tr\u00F9ng): ".concat(result.skipped, " c\u00E2u"),
        "  \u274C L\u1ED7i: ".concat(result.errors.filter(function (e) { return e.reason !== 'duplicate'; }).length, " c\u00E2u"),
        "  \uD83D\uDCDD T\u1ED5ng t\u00ECm th\u1EA5y: ".concat(result.total, " block"),
    ];
    var parseErrors = result.errors.filter(function (e) { return e.reason !== 'duplicate'; });
    if (parseErrors.length > 0) {
        lines.push("\n\uD83D\uDD34 Danh s\u00E1ch l\u1ED7i:");
        parseErrors.forEach(function (err, idx) {
            var reasonMap = {
                no_valid_id: 'Không có ID hợp lệ',
                empty_content: 'Nội dung rỗng',
                parse_error: 'Lỗi parse',
            };
            lines.push("  ".concat(idx + 1, ". [").concat(reasonMap[err.reason] || err.reason, "] ").concat(err.detail || ''));
            if (err.content) {
                lines.push("     \u2192 ".concat(err.content));
            }
        });
    }
    return lines.join('\n');
}
// ═══════════════════════════════════════════════════
// Bước 2 (Plan): Chỉ tách block + validate ID
// ═══════════════════════════════════════════════════
/**
 * Tách tất cả block từ nội dung .tex và chia thành câu đạt (có ID hợp lệ) / câu lỗi
 * Chưa parse chi tiết loại câu, đáp án — chỉ validate sơ bộ.
 */
function extractAndValidateBlocks(texContent) {
    var cleaned = preprocessTexContent(texContent);
    var rawBlocks = extractExBlocks(cleaned);
    var validBlocks = [];
    var errorBlocks = [];
    for (var _i = 0, rawBlocks_1 = rawBlocks; _i < rawBlocks_1.length; _i++) {
        var block = rawBlocks_1[_i];
        var comments = (0, category_parser_1.extractComments)(block);
        var categoryInfo = (0, category_parser_1.findValidCategoryCode)(comments);
        if (categoryInfo) {
            validBlocks.push(block);
        }
        else {
            var specificError = '';
            if (comments.length > 0) {
                for (var _a = 0, comments_1 = comments; _a < comments_1.length; _a++) {
                    var comment = comments_1[_a];
                    var val = (0, category_parser_1.validateCategoryCode)(comment);
                    if (!val.valid && val.error !== 'Không đúng định dạng ID 6 tham số') {
                        specificError = "ID l\u1ED7i: [".concat(comment, "] - ").concat(val.error);
                        break;
                    }
                }
            }
            errorBlocks.push({
                content: block,
                reason: specificError || (comments.length > 0
                    ? "Kh\u00F4ng t\u00ECm th\u1EA5y ID 6 tham s\u1ED1 h\u1EE3p l\u1EC7. T\u00ECm th\u1EA5y: [".concat(comments.join(', '), "]")
                    : 'Không có comment %[ID] nào trên dòng \\begin{ex}'),
            });
        }
    }
    return { validBlocks: validBlocks, errorBlocks: errorBlocks, totalBlocks: rawBlocks.length };
}
