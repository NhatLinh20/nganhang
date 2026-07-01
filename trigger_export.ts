import * as fs from 'fs'

async function run() {
    const latexCode = fs.readFileSync('full_1761.tex', 'utf-8')
    const regex = /\\begin\{ex\}(?:%\[.*?\])?([\s\S]*?)\\end\{ex\}/g
    let match
    const qs = []
    while ((match = regex.exec(latexCode)) !== null) {
        qs.push({
            id: 'q' + Math.random(),
            latex_content: match[0],
            question_type: match[0].includes('\\choiceTF') ? 'true_false' : 'multiple_choice'
        })
    }

    const payload = {
        examSets: [
            {
                code: '1761',
                questions: qs
            }
        ],
        title: 'Đề kiểm tra',
        duration: '90',
        grade: '12',
        labels: [],
        styles: []
    }

    console.log("Sending payload to localhost:3000/api/export-word...")
    const res = await fetch('http://localhost:3000/api/export-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })

    console.log("Status:", res.status)
    if (!res.ok) {
        console.error(await res.text())
    } else {
        console.log("Success! Got zip file.")
    }
}

run().catch(console.error)
