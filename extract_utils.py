import os

input_file = "src/app/api/export-zip/route.ts"
output_file = "src/lib/answer-export-utils.ts"

with open(input_file, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Extract from line 8 to 520 (index 7 to 519)
utils_lines = lines[7:520]
utils_content = "// src/lib/answer-export-utils.ts\nimport AdmZip from 'adm-zip';\n" + "".join(utils_lines)

# Make things exportable
utils_content = utils_content.replace("interface ExamQuestion", "export interface ExamQuestion")
utils_content = utils_content.replace("function getAnswer", "export function getAnswer")
utils_content = utils_content.replace("function parseAnswerFromLatex", "export function parseAnswerFromLatex")
utils_content = utils_content.replace("function parseMCAnswer", "export function parseMCAnswer")
utils_content = utils_content.replace("function parseSAAnswer", "export function parseSAAnswer")
utils_content = utils_content.replace("function parseTFAnswer", "export function parseTFAnswer")
utils_content = utils_content.replace("function generateTNMakerExcel", "export function generateTNMakerExcel")
utils_content = utils_content.replace("function generateYoungMixExcel", "export function generateYoungMixExcel")
utils_content = utils_content.replace("function generateSmartTestExcel", "export function generateSmartTestExcel")
utils_content = utils_content.replace("function generateAZOTAExcel", "export function generateAZOTAExcel")
utils_content = utils_content.replace("function generateOLMExcel", "export function generateOLMExcel")

# Append buildExamAnswers
utils_content += "\n\n" + """export function buildExamAnswers(qs: ExamQuestion[]): string[] {
  const mcQs = qs.filter(q => q.question_type === 'multiple_choice');
  const tfQs = qs.filter(q => q.question_type === 'true_false');
  const saQs = qs.filter(q => q.question_type === 'short_answer');
  const answers: string[] = [];
  for (const q of mcQs) {
    const ans = q.correct_answer?.trim() || parseMCAnswer(q.latex_content) || 'A';
    answers.push(ans.charAt(0).toUpperCase());
  }
  for (const q of tfQs) {
    const ans = getAnswer(q);
    if (ans.length === 4) {
      for (const ch of ans) answers.push(ch);
    } else {
      answers.push(ans);
    }
  }
  for (const q of saQs) {
    answers.push(getAnswer(q));
  }
  return answers;
}
"""

with open(output_file, "w", encoding="utf-8") as f:
    f.write(utils_content)

print("Created src/lib/answer-export-utils.ts")
