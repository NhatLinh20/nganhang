const payload = {
  title: "Test",
  questions: [
    {
      id: "1",
      questionType: "multiple_choice",
      rawLatex: "",
      bodySegments: [{ type: "text", content: "Toan 12" }],
      choices: [
        { label: "A", isCorrect: true, segments: [{ type: "text", content: "1" }] }
      ]
    }
  ],
  exams: [
    [
      {
        id: "1",
        questionType: "multiple_choice",
        rawLatex: "",
        bodySegments: [{ type: "text", content: "Toan 12" }],
        choices: [
          { label: "A", isCorrect: true, segments: [{ type: "text", content: "1" }] },
          { label: "B", isCorrect: true, segments: [{ type: "text", content: "2" }] },
          { label: "C", isCorrect: true, segments: [{ type: "text", content: "3" }] },
          { label: "D", isCorrect: true, segments: [{ type: "text", content: "4" }] }
        ]
      }
    ]
  ]
};

fetch('http://localhost:3000/api/export-word', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
.then(res => res.arrayBuffer())
.then(buffer => {
  require('fs').writeFileSync('output.zip', Buffer.from(buffer));
  console.log("Done. Check debug_export.tex and output.zip");
})
.catch(console.error);
