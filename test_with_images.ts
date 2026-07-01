import * as fs from 'fs'
import AdmZip from 'adm-zip'
import crypto from 'crypto'
import { parseWordQuestion } from './src/lib/latex-parser/word-parser'
import { buildExamLatex, buildExamWithSolutionLatex } from './src/lib/word-latex-builder'

async function compileTikz(tikzCode) {
    const res = await fetch('http://42.96.15.5:3001/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tikzCode })
    })
    if (!res.ok) throw new Error("Compile failed")
    return Buffer.from(await res.arrayBuffer())
}

async function run() {
    const latexCode = fs.readFileSync('full_1761.tex', 'utf-8')
    const regex = /\\begin\{ex\}(?:%\[.*?\])?([\s\S]*?)\\end\{ex\}/g
    let match
    
    const qs = []
    let t = latexCode
    let allTikzCodes = new Map()
    let match2
    while ((match2 = /\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/.exec(t)) !== null) {
        const fullMatch = match2[0]
        const hash = crypto.createHash('md5').update(fullMatch).digest('hex').substring(0, 12)
        const key = `tikz_${hash}`
        allTikzCodes.set(key, fullMatch)
        t = t.substring(0, match2.index) + key + t.substring(match2.index + fullMatch.length)
    }

    while ((match = regex.exec(t)) !== null) {
        qs.push(parseWordQuestion(match[0]))
    }

    const wordQuestions = qs

    console.log(`Compiling ${allTikzCodes.size} tikz images...`)
    const imageFiles = new Map()
    const imagePaths = new Map()
    for (const [key, code] of allTikzCodes) {
        try {
            const svgBuf = await compileTikz(code)
            imageFiles.set(key, { svgBuffer: svgBuf, filename: key + '.svg' })
            imagePaths.set(key, 'images/' + key + '.svg')
            console.log("Compiled", key)
        } catch(e) {
            console.error("Failed", key)
        }
    }

    const header = {
        labels: ['A', 'B', 'C', 'D'],
        styles: [],
        examCode: '1761',
        duration: '90',
        grade: '12'
    }

    const examWithSolTex = buildExamWithSolutionLatex({ header, questions: wordQuestions, imagePaths })
    
    fs.writeFileSync('debug_export_loigiai.tex', examWithSolTex)

    const zip = new AdmZip()
    zip.addFile('document.tex', Buffer.from(examWithSolTex, 'utf-8'))
    for (const [, { svgBuffer, filename }] of imageFiles) {
        zip.addFile(`images/${filename}`, svgBuffer)
    }

    const zipBuffer = zip.toBuffer()

    console.log("Sending to VPS...")
    const formData = new FormData()
    formData.append('file', new Blob([zipBuffer], { type: 'application/zip' }), 'input.zip')

    const response = await fetch('http://42.96.15.5:8000/convert-to-docx', {
        method: 'POST',
        body: formData,
    })

    if (!response.ok) {
        console.error("VPS ERROR:", await response.text())
    } else {
        console.log("VPS SUCCESS!")
    }
}
run().catch(console.error)
