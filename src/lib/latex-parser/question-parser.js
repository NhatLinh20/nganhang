"use strict";
// src/lib/latex-parser/question-parser.ts
// Parse một block \begin{ex}...\end{ex} thành ParsedQuestion
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseQuestion = parseQuestion;
var category_parser_1 = require("./category-parser");
var answer_parser_1 = require("./answer-parser");
/**
 * Parse một block \begin{ex}...\end{ex} thành ParsedQuestion
 * @param latexBlock - Toàn bộ code từ \begin{ex} đến \end{ex} (bao gồm cả 2 tag)
 * @param sourceFile - Tên file .tex gốc (optional)
 */
function parseQuestion(latexBlock, sourceFile) {
    // 1. Kiểm tra content không rỗng
    var trimmed = latexBlock.trim();
    if (!trimmed || !trimmed.includes('\\begin{ex}')) {
        return { success: false, error: { reason: 'empty_content' } };
    }
    try {
        // 2. Tìm category code hợp lệ từ comment %[...]
        var comments = (0, category_parser_1.extractComments)(trimmed);
        var categoryInfo = (0, category_parser_1.findValidCategoryCode)(comments);
        if (!categoryInfo) {
            var specificError = '';
            for (var _i = 0, comments_1 = comments; _i < comments_1.length; _i++) {
                var comment = comments_1[_i];
                var val = (0, category_parser_1.validateCategoryCode)(comment);
                if (!val.valid && val.error !== 'Không đúng định dạng ID 6 tham số') {
                    specificError = "ID l\u1ED7i: [".concat(comment, "] - ").concat(val.error);
                    break;
                }
            }
            return {
                success: false,
                error: {
                    reason: 'no_valid_id',
                    detail: specificError || "Kh\u00F4ng t\u00ECm th\u1EA5y ID 6 tham s\u1ED1. Comments t\u00ECm th\u1EA5y: [".concat(comments.join(', '), "]"),
                },
            };
        }
        // 3. Detect loại câu hỏi
        var question_type = (0, answer_parser_1.detectQuestionType)(trimmed);
        // 4. Detect đáp án
        var correct_answer = (0, answer_parser_1.detectCorrectAnswer)(trimmed, question_type);
        // 5. Detect hình ảnh
        var _a = (0, category_parser_1.detectImageType)(trimmed), has_image = _a.has_image, image_type = _a.image_type;
        // 6. Trích xuất nguồn gốc
        var sourceMeta = (0, answer_parser_1.extractSourceMeta)(trimmed);
        // 7. Tổng hợp
        var parsed = __assign(__assign(__assign({ latex_content: trimmed }, categoryInfo), { question_type: question_type, has_image: has_image, image_type: image_type, correct_answer: correct_answer, source_file: sourceFile, is_active: true }), sourceMeta);
        return { success: true, question: parsed };
    }
    catch (err) {
        return {
            success: false,
            error: {
                reason: 'parse_error',
                detail: err instanceof Error ? err.message : String(err),
            },
        };
    }
}
