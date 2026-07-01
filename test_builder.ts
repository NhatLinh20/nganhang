import { buildExamLatex } from './src/lib/word-latex-builder.ts';

const tex = buildExamLatex({
  header: {
    labels: ['1', '2', '3', '4', '5', '6', '7', '8'],
    examCode: '123',
    duration: 90,
    grade: 12
  },
  questions: [
    {
      id: '1',
      questionType: 'multiple_choice',
      rawLatex: '',
      bodySegments: [{ type: 'text', content: 'Toan 12' }],
      tikzKeys: [],
      choices: [
        { label: 'A', isCorrect: true, segments: [{ type: 'text', content: '1' }] },
        { label: 'B', isCorrect: false, segments: [{ type: 'text', content: '2' }] },
        { label: 'C', isCorrect: false, segments: [{ type: 'text', content: '3' }] },
        { label: 'D', isCorrect: false, segments: [{ type: 'text', content: '4' }] }
      ]
    }
  ],
  imagePaths: new Map()
});

console.log(tex);
