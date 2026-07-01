import os
import re

input_file = 'src/app/api/export-word/route.ts'
with open(input_file, 'r', encoding='utf-8') as f:
    text = f.read()

# Add imports
imports = """import QRCode from 'qrcode'
import { generateTNMakerExcel, generateAZOTAExcel, generateYoungMixExcel, generateSmartTestExcel, generateOLMExcel, buildExamAnswers, parseMCAnswer, getAnswer } from '@/lib/answer-export-utils'
"""
text = text.replace("import AdmZip from 'adm-zip'", imports + "import AdmZip from 'adm-zip'")

# Replace Step 4 placeholder
qr_excel_logic = """
    // ── Generate QR Codes for Apps (TNMaker, Smart Test, etc) ──
    const qrTypes = qrCodeOptions || []
    if (qrTypes.length > 0) {
      try {
        const typeNames: Record<string, string> = { '0': 'tnmaker', '1': 'youngmix', '3': 'smarttest' }

        for (const qrType of qrTypes) {
          const typeNum = parseInt(qrType, 10)
          const typeName = typeNames[qrType] || `type${qrType}`
          const jsons: string[] = []

          if (typeNum === 0) {
            // TNMaker format: {"success":true,"type":0,"code1":"ABCD",...}
            for (let i = 0; i < examSets.length; i += 9) {
              const chunk = examSets.slice(i, i + 9)
              const codeChunk = codes.slice(i, i + 9)
              const obj: any = { success: true, type: 0 }
              for (let j = 0; j < chunk.length; j++) {
                const mcQs = chunk[j].filter(q => q.question_type === 'multiple_choice')
                const tfQs = chunk[j].filter(q => q.question_type === 'true_false')
                const saQs = chunk[j].filter(q => q.question_type === 'short_answer')
                let answerStr = ''
                for (const q of mcQs) {
                  const ans = q.correct_answer?.trim() || parseMCAnswer(q.latex_content) || 'A'
                  answerStr += ans.charAt(0).toUpperCase()
                }
                for (const q of tfQs) {
                  const ans = getAnswer(q)
                  if (ans.length === 4) answerStr += ans
                  else answerStr += ans.padEnd(4, 'S')
                }
                if (saQs.length > 0) {
                  answerStr += '#' + saQs.map(q => getAnswer(q)).join('#')
                }
                obj[codeChunk[j]] = answerStr
              }
              jsons.push(JSON.stringify(obj))
            }
          } else {
            // Young Mix (1) / Smart Test (3) format: 2D array
            const allRows: (string | number)[][] = []
            for (let i = 0; i < examSets.length; i++) {
              const row: (string | number)[] = [codes[i]]
              const answers = buildExamAnswers(examSets[i])
              row.push(...answers)
              allRows.push(row)
            }
            const MAX_CELLS = 492
            let currentChunk: (string | number)[][] = []
            let currentCells = 0
            for (const row of allRows) {
              const cellCount = row.length
              if (currentCells + cellCount > MAX_CELLS && currentChunk.length > 0) {
                jsons.push(JSON.stringify(currentChunk))
                currentChunk = []
                currentCells = 0
              }
              currentChunk.push(row)
              currentCells += cellCount
            }
            if (currentChunk.length > 0) {
              jsons.push(JSON.stringify(currentChunk))
            }
          }

          // Generate PNG for each chunk of this type
          for (let i = 0; i < jsons.length; i++) {
            const suffix = jsons.length > 1 ? `_${i + 1}` : ''
            const filename = `qrcode_${typeName}${suffix}.png`
            const pngBuffer = await QRCode.toBuffer(jsons[i], { errorCorrectionLevel: 'L', width: 500, margin: 1 })
            outputZip.addFile(`DAP-AN/${filename}`, pngBuffer)
          }
        }
      } catch (qrErr) {
        console.error('QR Code generation error:', qrErr)
      }
    }

    // ── Generate answer Excel files ──
    try {
      const opts = excelOptions || []
      const isAll = opts.includes('all') || opts.length === 5

      if (isAll || opts.includes('tnmaker')) {
        const tnmakerBuf = generateTNMakerExcel(examSets, codes)
        outputZip.addFile('DAP-AN/bang_dap_an_tnmaker.xlsx', tnmakerBuf)
      }

      if (isAll || opts.includes('azota')) {
        const azotaBuf = generateAZOTAExcel(examSets, codes)
        outputZip.addFile('DAP-AN/bang_dap_an_azota.xlsx', azotaBuf)
      }

      if (isAll || opts.includes('youngmix')) {
        const ymBuf = generateYoungMixExcel(examSets, codes)
        outputZip.addFile('DAP-AN/bang_dap_an_youngmix.xlsx', ymBuf)
      }

      if (isAll || opts.includes('smarttest')) {
        const stBuf = generateSmartTestExcel(examSets, codes)
        outputZip.addFile('DAP-AN/bang_dap_an_smarttest.xlsx', stBuf)
      }

      if (isAll || opts.includes('olm')) {
        const olmBuf = generateOLMExcel(examSets, codes)
        outputZip.addFile('DAP-AN/bang_dap_an_olm.xlsx', olmBuf)
      }
    } catch (xlsxErr) {
      console.error('Excel generation error (non-fatal):', xlsxErr)
      // Non-fatal: still return ZIP without Excel files
    }
"""

text = re.sub(r'// ── BƯỚC 4: Excel.*?// \(Giáo viên vẫn dùng export-zip cho Excel\)', qr_excel_logic, text, flags=re.DOTALL)

with open(input_file, 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated export-word/route.ts')
