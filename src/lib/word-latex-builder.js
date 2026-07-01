"use strict";
// src/lib/word-latex-builder.ts
// Build file LaTeX chuẩn (clean) từ WordQuestion[] — file này pandoc convert thành .docx
// Output: 2 phiên bản per mã đề: đề thuần và đề + lời giải
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
exports.buildExamLatex = buildExamLatex;
exports.buildExamWithSolutionLatex = buildExamWithSolutionLatex;
var latex_math_expander_1 = require("./latex-parser/latex-math-expander");
// ─────────────────────────────────────────────────────────────────
// SEGMENT → LaTeX RENDERER
// ─────────────────────────────────────────────────────────────────
function renderSegments(segments, imagePaths) {
    return segments.map(function (seg) { return renderSegment(seg, imagePaths); }).join('');
}
function renderSegment(seg, imagePaths) {
    switch (seg.type) {
        case 'text':
            return (0, latex_math_expander_1.expandMacros)(seg.content);
        case 'math-inline':
            return "$".concat((0, latex_math_expander_1.expandMacros)(seg.latex).trim(), "$");
        case 'math-display': {
            var latex = (0, latex_math_expander_1.expandMacros)(seg.latex).trim();
            // align, gather, multline là các môi trường có sẵn mode toán
            if (/^\\begin\{(align|gather|multline)/.test(latex)) {
                return "\n".concat(latex, "\n");
            }
            return "\n$$".concat(latex, "$$\n");
        }
        case 'tikz': {
            var imgPath = imagePaths.get(seg.key);
            if (imgPath) {
                return "\n\\begin{center}\n\\includegraphics[width=0.6\\textwidth]{".concat(imgPath, "}\n\\end{center}\n");
            }
            // Hình không compile được → placeholder comment
            return "\n% [H\u00ECnh TikZ kh\u00F4ng compile \u0111\u01B0\u1EE3c: ".concat(seg.key, "]\n");
        }
        case 'bold':
            return "\\textbf{".concat(renderSegments(seg.children, imagePaths), "}");
        case 'italic':
            return "\\textit{".concat(renderSegments(seg.children, imagePaths), "}");
        case 'underline':
            return "\\underline{".concat(renderSegments(seg.children, imagePaths), "}");
        case 'linebreak':
            return '\\\\\n';
        case 'center':
            return "\n\\begin{center}\n".concat(renderSegments(seg.children, imagePaths), "\n\\end{center}\n");
        case 'list': {
            var env = seg.ordered ? 'enumerate' : 'itemize';
            var items = seg.items.map(function (item) { return "  \\item ".concat(renderSegments(item, imagePaths)); }).join('\n');
            return "\n\\begin{".concat(env, "}\n").concat(items, "\n\\end{").concat(env, "}\n");
        }
        default:
            return '';
    }
}
// ─────────────────────────────────────────────────────────────────
// HEADER BUILDER
// ─────────────────────────────────────────────────────────────────
function buildHeader(header) {
    var labels = header.labels, styles = header.styles, examCode = header.examCode, duration = header.duration, grade = header.grade;
    var l = labels.length >= 8 ? labels : [
        'SỞ GDĐT ...',
        'TRƯỜNG THPT ...',
        'Đề chính thức',
        '',
        'ĐỀ KIỂM TRA',
        "M\u00D4N TO\u00C1N ".concat(grade),
        "TH\u1EDCI GIAN: ".concat(duration, " PH\u00DAT"),
        '(Không kể thời gian phát đề)',
    ];
    function applyStyle(text, idx) {
        if (!styles || !styles[idx])
            return text;
        var s = styles[idx];
        var t = text;
        if (s.underline)
            t = "\\underline{".concat(t, "}");
        if (s.italic)
            t = "\\textit{".concat(t, "}");
        if (s.bold)
            t = "\\textbf{".concat(t, "}");
        return t;
    }
    return [
        '\\begin{center}',
        '\\begin{tabular}{p{0.45\\textwidth}p{0.55\\textwidth}}',
        "\\centering ".concat(applyStyle(l[0], 0), " & \\centering ").concat(applyStyle(l[4], 4), " \\\\"),
        "\\centering ".concat(applyStyle(l[1], 1), " & \\centering ").concat(applyStyle(l[5], 5), " \\\\"),
        "\\centering ".concat(applyStyle(l[2], 2), " & \\centering ").concat(applyStyle(l[6], 6), " \\\\"),
        "\\centering \\textit{(\u0110\u1EC1 thi g\u1ED3m c\u00F3 ... trang)} & \\centering ".concat(applyStyle(l[7], 7), " \\\\"),
        '\\end{tabular}',
        '\\end{center}',
        '\\noindent\\rule{\\textwidth}{0.4pt}',
        '',
        '\\noindent\\textit{Họ và tên thí sinh:}~\\dotfill~\\textit{Số báo danh:}~\\dotfill~\\textbf{Mã đề: ' + examCode + '}',
        '',
        '\\bigskip',
    ].join('\n');
}
// ─────────────────────────────────────────────────────────────────
// QUESTION RENDERER
// ─────────────────────────────────────────────────────────────────
function renderQuestion(q, num, imagePaths) {
    var lines = [];
    // Body
    var bodyText = renderSegments(q.bodySegments, imagePaths);
    lines.push("\\noindent\\textcolor{blue}{\\textbf{C\u00E2u ".concat(num, ".}} ").concat(bodyText));
    lines.push('');
    if (q.questionType === 'multiple_choice' && q.choices) {
        var choiceTexts = q.choices.map(function (c) {
            var text = renderSegments(c.segments, imagePaths);
            return "\\textbf{".concat(c.label, ".}~").concat(text);
        });
        // Đưa 4 đáp án vào bảng 2 cột để gióng hàng ngay ngắn trong Word
        var c0 = choiceTexts[0] || '';
        var c1 = choiceTexts[1] || '';
        var c2 = choiceTexts[2] || '';
        var c3 = choiceTexts[3] || '';
        lines.push('\\noindent\\begin{tabular}{p{0.48\\textwidth} p{0.48\\textwidth}}');
        lines.push("".concat(c0, " & ").concat(c1, " \\\\"));
        lines.push("".concat(c2, " & ").concat(c3, " \\\\"));
        lines.push('\\end{tabular}');
        lines.push('');
    }
    if (q.questionType === 'true_false' && q.tfStatements) {
        for (var _i = 0, _a = q.tfStatements; _i < _a.length; _i++) {
            var s = _a[_i];
            var text = renderSegments(s.segments, imagePaths);
            lines.push("\\noindent ".concat(s.label, ")~").concat(text));
        }
        lines.push('');
    }
    if (q.questionType === 'short_answer' && q.shortAnswer) {
        lines.push("\\noindent \\textit{\u0110\u00E1p s\u1ED1:} $".concat(q.shortAnswer, "$"));
        lines.push('');
    }
    return lines.join('\n');
}
function renderSolutionQuestion(q, num, imagePaths) {
    var lines = [];
    lines.push("\\noindent\\textcolor{blue}{\\textbf{C\u00E2u ".concat(num, ".}}"));
    lines.push('');
    // Đáp án đúng
    if (q.questionType === 'multiple_choice' && q.choices) {
        var correct = q.choices.find(function (c) { return c.isCorrect; });
        if (correct)
            lines.push("\\noindent \\textit{\u0110\u00E1p \u00E1n: \\textbf{".concat(correct.label, "}}"));
    }
    if (q.questionType === 'true_false' && q.tfStatements) {
        var ans = q.tfStatements.map(function (s) { return s.isTrue ? 'Đ' : 'S'; }).join('');
        lines.push("\\noindent \\textit{\u0110\u00E1p \u00E1n: ".concat(ans, "}"));
    }
    if (q.questionType === 'short_answer' && q.shortAnswer) {
        lines.push("\\noindent \\textit{\u0110\u00E1p s\u1ED1: $".concat(q.shortAnswer, "$}"));
    }
    // Lời giải
    if (q.solutionSegments && q.solutionSegments.length > 0) {
        var solText = renderSegments(q.solutionSegments, imagePaths);
        lines.push("\\noindent\\textbf{L\u1EDDi gi\u1EA3i. } ".concat(solText));
    }
    lines.push('');
    if (q.questionType === 'multiple_choice' && q.choices) {
        var choiceTexts = q.choices.map(function (c) {
            var text = renderSegments(c.segments, imagePaths);
            return "\\textbf{".concat(c.label, ".}~").concat(text);
        });
        var c0 = choiceTexts[0] || '';
        var c1 = choiceTexts[1] || '';
        var c2 = choiceTexts[2] || '';
        var c3 = choiceTexts[3] || '';
        lines.push('\\noindent\\begin{tabular}{p{0.48\\textwidth} p{0.48\\textwidth}}');
        lines.push("".concat(c0, " & ").concat(c1, " \\\\"));
        lines.push("".concat(c2, " & ").concat(c3, " \\\\"));
        lines.push('\\end{tabular}');
        lines.push('');
    }
    lines.push('\\medskip');
    return lines.join('\n');
}
// ─────────────────────────────────────────────────────────────────
// PREAMBLE + DOCUMENT STRUCTURE
// ─────────────────────────────────────────────────────────────────
var PREAMBLE = "\\documentclass[12pt,a4paper]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amsmath,amssymb}\n\\usepackage{graphicx}\n\\usepackage[left=1.5cm,right=1cm,top=1.3cm,bottom=1.3cm]{geometry}\n\\usepackage{lastpage}\n% Font Times New Roman (c\u1EA7n XeLaTeX + fontspec \u2014 uncomment n\u1EBFu VPS h\u1ED7 tr\u1EE3):\n% \\usepackage{fontspec}\n% \\setmainfont{Times New Roman}\n";
// ─────────────────────────────────────────────────────────────────
// SECTION HEADERS (PHẦN I, II, III)
// ─────────────────────────────────────────────────────────────────
function buildSectionHeaders(questions) {
    var mcCount = questions.filter(function (q) { return q.questionType === 'multiple_choice'; }).length;
    var tfCount = questions.filter(function (q) { return q.questionType === 'true_false'; }).length;
    var saCount = questions.filter(function (q) { return q.questionType === 'short_answer'; }).length;
    var esCount = questions.filter(function (q) { return q.questionType === 'essay'; }).length;
    var parts = [];
    if (mcCount > 0) {
        parts.push({ part: 1, label: 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.', intro: "Th\u00ED sinh tr\u1EA3 l\u1EDDi t\u1EEB c\u00E2u 1 \u0111\u1EBFn c\u00E2u ".concat(mcCount, ". M\u1ED7i c\u00E2u th\u00ED sinh ch\u1EC9 ch\u1ECDn m\u1ED9t ph\u01B0\u01A1ng \u00E1n.") });
    }
    if (tfCount > 0) {
        var start = mcCount + 1;
        var end = mcCount + tfCount;
        parts.push({ part: 2, label: 'PHẦN II. Câu trắc nghiệm đúng sai.', intro: "Th\u00ED sinh tr\u1EA3 l\u1EDDi t\u1EEB c\u00E2u ".concat(start, " \u0111\u1EBFn c\u00E2u ").concat(end, ". Trong m\u1ED7i \u00FD, th\u00ED sinh ch\u1ECDn \u0111\u00FAng (\u0110) ho\u1EB7c sai (S).") });
    }
    if (saCount > 0) {
        var start = mcCount + tfCount + 1;
        var end = mcCount + tfCount + saCount;
        parts.push({ part: 3, label: 'PHẦN III. Câu trả lời ngắn.', intro: "Th\u00ED sinh tr\u1EA3 l\u1EDDi t\u1EEB c\u00E2u ".concat(start, " \u0111\u1EBFn c\u00E2u ").concat(end, ".") });
    }
    if (esCount > 0) {
        var start = mcCount + tfCount + saCount + 1;
        parts.push({ part: 4, label: 'PHẦN IV. Câu tự luận.', intro: "Th\u00ED sinh tr\u1EA3 l\u1EDDi t\u1EEB c\u00E2u ".concat(start, ".") });
    }
    return parts;
}
// ─────────────────────────────────────────────────────────────────
// MAIN BUILD FUNCTION
// ─────────────────────────────────────────────────────────────────
/**
 * Build file LaTeX chuẩn (đề thuần, không lời giải).
 * Pandoc sẽ convert file này thành .docx.
 */
function buildExamLatex(options) {
    var header = options.header, questions = options.questions, imagePaths = options.imagePaths;
    var sections = buildSectionHeaders(questions);
    var lines = [PREAMBLE, '\\begin{document}', ''];
    // Header đề thi
    lines.push(buildHeader(header));
    lines.push('');
    // Câu hỏi theo phần
    var qNum = 0;
    var partOrder = [
        'multiple_choice', 'true_false', 'short_answer', 'essay'
    ];
    var _loop_1 = function (type) {
        var partQs = questions.filter(function (q) { return q.questionType === type; });
        if (partQs.length === 0)
            return "continue";
        var sectionInfo = sections.find(function (s) {
            if (type === 'multiple_choice')
                return s.part === 1;
            if (type === 'true_false')
                return s.part === 2;
            if (type === 'short_answer')
                return s.part === 3;
            return s.part === 4;
        });
        if (sectionInfo) {
            lines.push("\\noindent\\textbf{".concat(sectionInfo.label, "}"));
            lines.push(sectionInfo.intro);
            lines.push('');
            lines.push('\\medskip');
            lines.push('');
        }
        for (var _a = 0, partQs_1 = partQs; _a < partQs_1.length; _a++) {
            var q = partQs_1[_a];
            qNum++;
            lines.push(renderQuestion(q, qNum, imagePaths));
        }
    };
    for (var _i = 0, partOrder_1 = partOrder; _i < partOrder_1.length; _i++) {
        var type = partOrder_1[_i];
        _loop_1(type);
    }
    // HẾT
    lines.push('\\begin{center}');
    lines.push('\\textbf{------------ HẾT ------------}');
    lines.push('\\end{center}');
    lines.push('\\label{lastpage}');
    lines.push('');
    lines.push('\\end{document}');
    return lines.join('\n');
}
/**
 * Build file LaTeX đề + lời giải (_loigiai version).
 */
function buildExamWithSolutionLatex(options) {
    var header = options.header, questions = options.questions, imagePaths = options.imagePaths;
    // Phần đề thuần: giống buildExamLatex nhưng không có "HẾT" — thêm solution section sau
    var examOnly = buildExamLatex(__assign(__assign({}, options), { includeSolution: false }));
    // Thay \\end{document} để thêm phần lời giải
    var docEnd = '\\end{document}';
    var insertPos = examOnly.lastIndexOf(docEnd);
    if (insertPos === -1)
        return examOnly;
    var solutionLines = [
        '',
        '\\newpage',
        '\\begin{center}',
        '{\\Large\\textbf{ĐÁP ÁN VÀ LỜI GIẢI}}',
        '\\end{center}',
        '',
    ];
    var qNum = 0;
    var partOrder = [
        'multiple_choice', 'true_false', 'short_answer', 'essay'
    ];
    var _loop_2 = function (type) {
        for (var _a = 0, _b = questions.filter(function (qx) { return qx.questionType === type; }); _a < _b.length; _a++) {
            var q = _b[_a];
            qNum++;
            solutionLines.push(renderSolutionQuestion(q, qNum, imagePaths));
        }
    };
    for (var _i = 0, partOrder_2 = partOrder; _i < partOrder_2.length; _i++) {
        var type = partOrder_2[_i];
        _loop_2(type);
    }
    solutionLines.push('');
    solutionLines.push(docEnd);
    return examOnly.slice(0, insertPos) + solutionLines.join('\n');
}
