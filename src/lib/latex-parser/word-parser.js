"use strict";
// src/lib/latex-parser/word-parser.ts
// Parse LaTeX \\begin{ex}...\\end{ex} thành WordQuestion[] — cấu trúc chi tiết cho xuất Word
// Tái sử dụng hàm tiện ích từ slideshow-parser.ts và file-parser.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.segmentContentDetailed = segmentContentDetailed;
exports.parseWordQuestion = parseWordQuestion;
exports.parseAllWordQuestions = parseAllWordQuestions;
var crypto = __importStar(require("crypto"));
var file_parser_1 = require("./file-parser");
var answer_parser_1 = require("./answer-parser");
// ─────────────────────────────────────────────────────────────────
// UTILITIES (tái sử dụng từ slideshow-parser)
// ─────────────────────────────────────────────────────────────────
function isEscaped(text, idx) {
    var count = 0;
    var i = idx - 1;
    while (i >= 0 && text[i] === '\\') {
        count++;
        i--;
    }
    return count % 2 === 1;
}
function extractBalancedContent(text, openIdx) {
    if (openIdx >= text.length || text[openIdx] !== '{')
        return null;
    var depth = 0;
    for (var i = openIdx; i < text.length; i++) {
        var ch = text[i];
        if (ch === '{' && !isEscaped(text, i))
            depth++;
        else if (ch === '}' && !isEscaped(text, i)) {
            depth--;
            if (depth === 0)
                return { content: text.slice(openIdx + 1, i), endIdx: i };
        }
    }
    return null;
}
function extractBracketedItems(text) {
    var items = [];
    var i = 0;
    while (i < text.length) {
        while (i < text.length && /\s/.test(text[i]))
            i++;
        if (i >= text.length)
            break;
        if (text[i] === '{') {
            var result = extractBalancedContent(text, i);
            if (result) {
                items.push(result.content);
                i = result.endIdx + 1;
            }
            else
                break;
        }
        else {
            i++;
        }
    }
    return items;
}
function unwrapImmini(text) {
    var result = text;
    var i = 0;
    while ((i = result.indexOf('\\immini', i)) !== -1) {
        var curr = i + 7;
        while (curr < result.length && /\s/.test(result[curr]))
            curr++;
        if (curr < result.length && result[curr] === '[') {
            var endBracket = result.indexOf(']', curr);
            if (endBracket !== -1)
                curr = endBracket + 1;
        }
        while (curr < result.length && /\s/.test(result[curr]))
            curr++;
        if (curr < result.length && result[curr] === '{') {
            var arg1 = extractBalancedContent(result, curr);
            if (arg1) {
                curr = arg1.endIdx + 1;
                while (curr < result.length && /\s/.test(result[curr]))
                    curr++;
                if (curr < result.length && result[curr] === '{') {
                    var arg2 = extractBalancedContent(result, curr);
                    if (arg2) {
                        var before = result.slice(0, i);
                        var after = result.slice(arg2.endIdx + 1);
                        result = before + arg2.content + '\n' + arg1.content + after;
                        i = before.length + arg2.content.length + 1 + arg1.content.length;
                        continue;
                    }
                }
            }
        }
        i += 7;
    }
    return result;
}
// ─────────────────────────────────────────────────────────────────
// TIKZ KEY GENERATOR
// ─────────────────────────────────────────────────────────────────
function makeTikzKey(code) {
    return 'tikz_' + crypto.createHash('sha256').update(code.trim()).digest('hex').slice(0, 12);
}
// ─────────────────────────────────────────────────────────────────
// SEGMENT PARSER — CHI TIẾT CHO WORD
// ─────────────────────────────────────────────────────────────────
/**
 * Parse nội dung LaTeX thành mảng WordSegment chi tiết.
 * Khác với slideshow-parser: tách riêng math-inline, math-display, formatting, TikZ.
 */
function segmentContentDetailed(text, tikzKeys) {
    if (!text || !text.trim())
        return [];
    // ─── 1. Extract TikZ/tabular → placeholder ───
    var tikzBlocks = [];
    var processed = text.replace(/(?:\\begin\{center\}\s*)?\\begin\{(tikzpicture|tabular)\}[\s\S]*?\\end\{\1\}\s*(?:\\end\{center\})?/g, function (match) {
        // Bỏ wrapper center nếu có
        var code = match
            .replace(/\\begin\{center\}/g, '')
            .replace(/\\end\{center\}/g, '')
            .trim();
        var idx = tikzBlocks.length;
        tikzBlocks.push(code);
        return "__TIKZ_".concat(idx, "__");
    });
    // ─── 2. Extract math display $$...$$ và \[...\] và align* ───
    var mathDisplayBlocks = [];
    // align*, align, gather*, gather, eqnarray*
    processed = processed.replace(/\\begin\{(align\*?|gather\*?|eqnarray\*?|multline\*?|alignat\*?)\}[\s\S]*?\\end\{\1\}/g, function (match) {
        var idx = mathDisplayBlocks.length;
        mathDisplayBlocks.push(match);
        return "__DMATH_".concat(idx, "__");
    });
    // \[...\]
    processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, function (_, inner) {
        var idx = mathDisplayBlocks.length;
        mathDisplayBlocks.push("\\[".concat(inner, "\\]"));
        return "__DMATH_".concat(idx, "__");
    });
    // $$...$$
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, function (_, inner) {
        var idx = mathDisplayBlocks.length;
        mathDisplayBlocks.push("$$".concat(inner, "$$"));
        return "__DMATH_".concat(idx, "__");
    });
    // ─── 3. Extract math inline $...$ ───
    var mathInlineBlocks = [];
    processed = processed.replace(/\$([^$]+?)\$/g, function (_, inner) {
        var idx = mathInlineBlocks.length;
        mathInlineBlocks.push(inner);
        return "__IMATH_".concat(idx, "__");
    });
    // ─── 4. Parse formatting (textbf/textit/underline) + rest ───
    // Xây dựng segment array từ processed text, xử lý formatting và placeholders
    var segments = parseFormattedText(processed, tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys);
    return segments;
}
/**
 * Bước cuối: phân tích formatted text đã có placeholders → WordSegment[]
 */
function parseFormattedText(text, tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys) {
    var result = [];
    var i = 0;
    while (i < text.length) {
        // Kiểm tra placeholder
        var tikzMatch = text.slice(i).match(/^__TIKZ_(\d+)__/);
        if (tikzMatch) {
            var idx = parseInt(tikzMatch[1]);
            var code = tikzBlocks[idx] || '';
            var key = makeTikzKey(code);
            if (!tikzKeys.includes(key))
                tikzKeys.push(key);
            result.push({ type: 'tikz', code: code, key: key });
            i += tikzMatch[0].length;
            continue;
        }
        var dmathMatch = text.slice(i).match(/^__DMATH_(\d+)__/);
        if (dmathMatch) {
            var idx = parseInt(dmathMatch[1]);
            var latex = mathDisplayBlocks[idx] || '';
            // Normalize: $$...$$ → strip $$, \[...\] → strip \[ \]
            var inner = latex
                .replace(/^\$\$([\s\S]*)\$\$$/, '$1')
                .replace(/^\\\[([\s\S]*)\\\]$/, '$1')
                .trim();
            result.push({ type: 'math-display', latex: inner });
            i += dmathMatch[0].length;
            continue;
        }
        var imathMatch = text.slice(i).match(/^__IMATH_(\d+)__/);
        if (imathMatch) {
            var idx = parseInt(imathMatch[1]);
            result.push({ type: 'math-inline', latex: mathInlineBlocks[idx] || '' });
            i += imathMatch[0].length;
            continue;
        }
        // Kiểm tra \textbf{...}
        if (text.startsWith('\\textbf', i)) {
            var braceStart = text.indexOf('{', i + 7);
            if (braceStart !== -1 && braceStart === i + 7) {
                var inner = extractBalancedContent(text, braceStart);
                if (inner) {
                    var children = parseFormattedText(inner.content, tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys);
                    result.push({ type: 'bold', children: children });
                    i = inner.endIdx + 1;
                    continue;
                }
            }
        }
        // \textit{...}
        if (text.startsWith('\\textit', i)) {
            var braceStart = text.indexOf('{', i + 7);
            if (braceStart !== -1 && braceStart === i + 7) {
                var inner = extractBalancedContent(text, braceStart);
                if (inner) {
                    var children = parseFormattedText(inner.content, tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys);
                    result.push({ type: 'italic', children: children });
                    i = inner.endIdx + 1;
                    continue;
                }
            }
        }
        // \underline{...}
        if (text.startsWith('\\underline', i)) {
            var braceStart = text.indexOf('{', i + 10);
            if (braceStart !== -1 && braceStart === i + 10) {
                var inner = extractBalancedContent(text, braceStart);
                if (inner) {
                    var children = parseFormattedText(inner.content, tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys);
                    result.push({ type: 'underline', children: children });
                    i = inner.endIdx + 1;
                    continue;
                }
            }
        }
        // \begin{center}...\end{center}
        if (text.startsWith('\\begin{center}', i)) {
            var end = text.indexOf('\\end{center}', i);
            if (end !== -1) {
                var inner = text.slice(i + 14, end);
                var children = parseFormattedText(inner, tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys);
                result.push({ type: 'center', children: children });
                i = end + 12;
                continue;
            }
        }
        // \begin{itemize}...\end{itemize}
        if (text.startsWith('\\begin{itemize}', i)) {
            var end = text.indexOf('\\end{itemize}', i);
            if (end !== -1) {
                var inner = text.slice(i + 15, end);
                var items = inner.split('\\item').slice(1).map(function (item) {
                    return parseFormattedText(item.trim(), tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys);
                });
                result.push({ type: 'list', ordered: false, items: items });
                i = end + 13;
                continue;
            }
        }
        // \begin{enumerate}...\end{enumerate}
        if (text.startsWith('\\begin{enumerate}', i)) {
            var end = text.indexOf('\\end{enumerate}', i);
            if (end !== -1) {
                var optEnd = text[i + 17] === '[' ? text.indexOf(']', i + 17) + 1 : i + 17;
                var inner = text.slice(optEnd, end);
                var items = inner.split('\\item').slice(1).map(function (item) {
                    return parseFormattedText(item.trim(), tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys);
                });
                result.push({ type: 'list', ordered: true, items: items });
                i = end + 15;
                continue;
            }
        }
        // \\ line break
        if (text[i] === '\\' && text[i + 1] === '\\') {
            result.push({ type: 'linebreak' });
            i += 2;
            // Bỏ khoảng trắng sau \\
            while (i < text.length && text[i] !== '\n' && /[^\S\n]/.test(text[i]))
                i++;
            continue;
        }
        // Gom text thuần (đến khi gặp placeholder hoặc command đặc biệt)
        var j = i;
        while (j < text.length) {
            if (text[j] === '\\')
                break;
            if (text[j] === '_' && text.slice(j).match(/^__(TIKZ|DMATH|IMATH)_\d+__/))
                break;
            j++;
        }
        if (j > i) {
            var textContent = text.slice(i, j);
            if (textContent) {
                // Merge vào text segment trước nếu có
                var last = result[result.length - 1];
                if (last && last.type === 'text') {
                    last.content += textContent;
                }
                else {
                    result.push({ type: 'text', content: textContent });
                }
            }
            i = j;
        }
        else {
            // Ký tự \ không khớp command nào — add raw
            var last = result[result.length - 1];
            if (last && last.type === 'text') {
                last.content += text[i];
            }
            else {
                result.push({ type: 'text', content: text[i] });
            }
            i++;
        }
    }
    // Dọn dẹp text segments: trim nếu chỉ whitespace
    return result.filter(function (seg) {
        if (seg.type === 'text' && !seg.content.trim())
            return false;
        return true;
    });
}
// ─────────────────────────────────────────────────────────────────
// MAIN PARSER
// ─────────────────────────────────────────────────────────────────
var _idCounter = 0;
function generateId() {
    return "wq-".concat(Date.now(), "-").concat(++_idCounter);
}
/**
 * Parse 1 block \\begin{ex}...\\end{ex} thành WordQuestion
 */
function parseWordQuestion(latexBlock) {
    var raw = latexBlock.trim();
    var id = generateId();
    var questionType = (0, answer_parser_1.detectQuestionType)(raw);
    var tikzKeys = [];
    // 1. Bỏ \\begin{ex}%[...] ở đầu và \\end{ex} ở cuối, unwrap \\immini
    var inner = raw
        .replace(/^\\begin\{ex\}[^\n]*\n?/, '')
        .replace(/\\end\{ex\}\s*$/, '')
        .trim();
    inner = unwrapImmini(inner);
    // 2. Tách \\loigiai{...}
    var solutionRaw;
    var loigiaiIdx = inner.indexOf('\\loigiai');
    if (loigiaiIdx !== -1) {
        var braceStart = -1;
        for (var i = loigiaiIdx + 8; i < inner.length; i++) {
            if (/\s/.test(inner[i]))
                continue;
            if (inner[i] === '{') {
                braceStart = i;
                break;
            }
            break;
        }
        if (braceStart !== -1) {
            var result = extractBalancedContent(inner, braceStart);
            if (result) {
                solutionRaw = result.content.trim();
                inner = inner.slice(0, loigiaiIdx).trim();
            }
        }
    }
    // 3. Parse theo loại câu hỏi
    var questionBodyRaw = '';
    var choices;
    var tfStatements;
    var shortAnswer;
    if (questionType === 'multiple_choice') {
        var choiceMatch = inner.match(/\\choice(?!\s*TF)(?:\[\d+\])?\s*/);
        if (choiceMatch && choiceMatch.index !== undefined) {
            questionBodyRaw = inner.slice(0, choiceMatch.index).trim();
            var choiceBlock = inner.slice(choiceMatch.index + choiceMatch[0].length);
            var items = extractBracketedItems(choiceBlock);
            var labels_1 = ['A', 'B', 'C', 'D'];
            choices = items.slice(0, 4).map(function (item, idx) {
                var isCorrect = /\\True/.test(item);
                var content = item.replace(/\\True\s*/, '').trim();
                var choiceTikzKeys = [];
                var segments = segmentContentDetailed(content, choiceTikzKeys);
                choiceTikzKeys.forEach(function (k) { if (!tikzKeys.includes(k))
                    tikzKeys.push(k); });
                return { label: labels_1[idx], segments: segments, isCorrect: isCorrect };
            });
        }
        else {
            questionBodyRaw = inner;
        }
    }
    else if (questionType === 'true_false') {
        var tfMatch = inner.match(/\\choiceTF\s*/);
        if (tfMatch && tfMatch.index !== undefined) {
            questionBodyRaw = inner.slice(0, tfMatch.index).trim();
            var tfBlock = inner.slice(tfMatch.index + tfMatch[0].length);
            var items = extractBracketedItems(tfBlock);
            var labels_2 = ['a', 'b', 'c', 'd'];
            tfStatements = items.slice(0, 4).map(function (item, idx) {
                var isTrue = /\\True/.test(item);
                var content = item.replace(/\\True\s*/, '').trim();
                var stmtTikzKeys = [];
                var segments = segmentContentDetailed(content, stmtTikzKeys);
                stmtTikzKeys.forEach(function (k) { if (!tikzKeys.includes(k))
                    tikzKeys.push(k); });
                return { label: labels_2[idx], segments: segments, isTrue: isTrue };
            });
        }
        else {
            questionBodyRaw = inner;
        }
    }
    else if (questionType === 'short_answer') {
        var saMatch = inner.match(/\\shortans\s*(?:\[[^\]]*\])?\s*/);
        if (saMatch && saMatch.index !== undefined) {
            questionBodyRaw = inner.slice(0, saMatch.index).trim();
            var braceStart = inner.indexOf('{', saMatch.index + saMatch[0].length);
            if (braceStart !== -1) {
                var result = extractBalancedContent(inner, braceStart);
                if (result) {
                    shortAnswer = result.content
                        .replace(/\{,\}/g, ',').replace(/\{;\}/g, ';').replace(/\\,/g, '')
                        .replace(/^\$+/, '').replace(/\$+$/, '').trim();
                }
            }
        }
        else {
            questionBodyRaw = inner;
        }
    }
    else {
        questionBodyRaw = inner;
    }
    // 4. Segment body + solution
    var bodyTikzKeys = [];
    var bodySegments = segmentContentDetailed(questionBodyRaw, bodyTikzKeys);
    bodyTikzKeys.forEach(function (k) { if (!tikzKeys.includes(k))
        tikzKeys.push(k); });
    var solutionSegments;
    if (solutionRaw) {
        var solTikzKeys = [];
        solutionSegments = segmentContentDetailed(solutionRaw, solTikzKeys);
        solTikzKeys.forEach(function (k) { if (!tikzKeys.includes(k))
            tikzKeys.push(k); });
    }
    return {
        id: id,
        questionType: questionType,
        bodySegments: bodySegments,
        choices: choices,
        tfStatements: tfStatements,
        shortAnswer: shortAnswer,
        solutionSegments: solutionSegments,
        tikzKeys: tikzKeys,
        rawLatex: raw,
    };
}
/**
 * Parse toàn bộ text LaTeX thành mảng WordQuestion[]
 */
function parseAllWordQuestions(rawText) {
    var cleaned = (0, file_parser_1.preprocessTexContent)(rawText);
    var blocks = (0, file_parser_1.extractExBlocks)(cleaned);
    return blocks.map(function (block) { return parseWordQuestion(block); });
}
