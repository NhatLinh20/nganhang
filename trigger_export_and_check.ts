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

    const res = await fetch('http://localhost:3000/api/export-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })

    if (!res.ok) {
        console.error("API ERROR:", await res.text())
        return
    }

    const buf = await res.arrayBuffer()
    fs.writeFileSync('output_1761.zip', Buffer.from(buf))
    console.log("Success! Saved output_1761.zip")
    
    // Check if LOFAIL is in the zip
    const AdmZip = require('adm-zip')
    const zip = new AdmZip('output_1761.zip')
    const entries = zip.getEntries()
    console.log("Zip entries:")
    entries.forEach(e => console.log(e.entryName))
}

run().catch(console.error)
