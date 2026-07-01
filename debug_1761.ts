import fs from 'fs';
import { parseWordQuestion, preprocessWordTexContent } from './src/lib/latex-parser/word-parser';
import { buildExamWithSolutionLatex, buildExamLatex } from './src/lib/word-latex-builder';

const body = JSON.parse(fs.readFileSync('LAST_REQUEST.json', 'utf8'));
const questions = body.exams[0].questions;

const wordQuestions = [];
const imagePaths = new Map();

for (const q of questions) {
  const raw = q.latex_content || q.rawLatex || '';
  const cleaned = preprocessWordTexContent(raw);
  const wq = parseWordQuestion(cleaned);
  if (q.correct_answer && wq.questionType === 'multiple_choice' && wq.choices) {
    const ans = q.correct_answer.trim().toUpperCase();
    wq.choices.forEach(c => { c.isCorrect = c.label === ans; });
  }
  wordQuestions.push(wq);
}

const header = {
  labels: ['1', '2', '3', '4', '5', '6', '7', '8'],
  styles: [],
  examCode: '1761',
  duration: 90,
  grade: 12
};

const examTex = buildExamLatex({ header, questions: wordQuestions, imagePaths });
fs.writeFileSync('debug_1761.tex', examTex);
const examWithSolTex = buildExamWithSolutionLatex({ header, questions: wordQuestions, imagePaths });
fs.writeFileSync('debug_1761_loigiai.tex', examWithSolTex);
console.log('Done!');
