import * as fs from 'fs'
import AdmZip from 'adm-zip'

async function run() {
    const texContent = fs.readFileSync('debug_1761_out.tex', 'utf-8')
    const zip = new AdmZip()
    zip.addFile('document.tex', Buffer.from(texContent, 'utf-8'))
    const zipBuffer = zip.toBuffer()

    const formData = new FormData()
    formData.append('file', new Blob([zipBuffer], { type: 'application/zip' }), 'input.zip')

    const response = await fetch('http://42.96.15.5:8000/convert-to-docx', {
        method: 'POST',
        body: formData,
    })

    if (!response.ok) {
        console.error("VPS EROR:", await response.text())
    } else {
        console.log("Success!")
    }
}

run().catch(console.error)
