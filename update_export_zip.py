import os

input_file = 'src/app/api/export-zip/route.ts'
with open(input_file, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if line.startswith('interface ExamQuestion'):
        skip = True
    if skip and line.startswith('// ─── Answer Sheet'):
        skip = False
        new_lines.append(line)
        continue
    
    if line.strip() == 'function buildExamAnswers(qs: ExamQuestion[]): string[] {':
        skip = True
    
    if skip and line.strip() == 'return answers' and lines[i+1].strip() == '}':
        # skip this line and next line
        continue
    if skip and line.strip() == '}' and lines[i-1].strip() == 'return answers':
        skip = False
        continue
        
    if not skip:
        new_lines.append(line)

# Add import
import_stmt = "import { ExamQuestion, generateTNMakerExcel, generateAZOTAExcel, generateYoungMixExcel, generateSmartTestExcel, generateOLMExcel, buildExamAnswers, parseMCAnswer, getAnswer } from '@/lib/answer-export-utils'\n"
new_lines.insert(7, import_stmt)

with open(input_file, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Updated export-zip/route.ts')
