// src/app/api/compile-pdf/route.ts
// API endpoint biên dịch LaTeX → PDF dùng pdflatex cục bộ và cấu hình đa file
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const PDFLATEX_PATH = 'C:\\texlive\\2024\\bin\\windows\\pdflatex.exe'
const CONFIG_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'latex-config')

// Chạy pdflatex trong thư mục temp
async function runPdflatex(texFilePath: string, workDir: string): Promise<{ success: boolean; log: string }> {
  return new Promise((resolve) => {
    const args = [
      '-interaction=nonstopmode',
      '-halt-on-error',
      '-output-directory', workDir,
      texFilePath,
    ]

    const proc = spawn(PDFLATEX_PATH, args, {
      cwd: workDir,
      env: {
        ...process.env,
        PATH: `C:\\texlive\\2024\\bin\\windows;${process.env.PATH}`,
      },
    })

    let log = ''
    proc.stdout?.on('data', (d: Buffer) => { log += d.toString() })
    proc.stderr?.on('data', (d: Buffer) => { log += d.toString() })

    proc.on('close', (code: number | null) => {
      resolve({ success: code === 0, log })
    })

    // Timeout 30s
    setTimeout(() => {
      proc.kill()
      resolve({ success: false, log: log + '\nTIMEOUT: pdflatex mất quá 30 giây.' })
    }, 30000)
  })
}

export async function POST(request: NextRequest) {
  let workDir = ''
  try {
    const body = await request.json()
    const { latex_content, show_solutions } = body

    if (!latex_content) {
      return NextResponse.json({ error: 'Thiếu latex_content' }, { status: 400 })
    }

    // Check if pdflatex is available (not available on Vercel)
    if (!fs.existsSync(PDFLATEX_PATH)) {
      return NextResponse.json(
        { error: 'Biên dịch PDF chỉ hỗ trợ khi chạy local (cần cài TeX Live). Trên Vercel, vui lòng sử dụng chức năng Xuất LaTeX (.tex) thay thế.' },
        { status: 501 }
      )
    }

    // Tạo thư mục temp
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nganhangtex-'))
    fs.mkdirSync(path.join(workDir, 'ans'), { recursive: true })

    // 1. Copy toàn bộ file cấu hình và packages từ cauhinh_latex vào thư mục temp
    const configFiles = [
      'main.tex',
      'khaibaochung.tex',
      'ex_test.sty',
      'ex_tkz-euclide.sty',
      'tkz-linknodes.sty',
      'tkz-tab-vn.sty',
    ]

    for (const file of configFiles) {
      const srcPath = path.join(CONFIG_DIR, file)
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, path.join(workDir, file))
      } else {
        return NextResponse.json(
          { error: `Không tìm thấy file cấu hình: ${file} tại ${CONFIG_DIR}` },
          { status: 500 }
        )
      }
    }

    // 2. Ghi nội dung đề thi vào ma_tran_de_thi_toan.tex
    const maTranPath = path.join(workDir, 'ma_tran_de_thi_toan.tex')
    fs.writeFileSync(maTranPath, latex_content, 'utf-8')

    // 3. Xử lý tùy chỉnh ẩn/hiện lời giải trong main.tex
    const mainPath = path.join(workDir, 'main.tex')
    let mainContent = fs.readFileSync(mainPath, 'utf-8')
    if (show_solutions) {
      // Hiện lời giải: comment lệnh \anloigiai
      mainContent = mainContent.replace(/\\anloigiai/g, '%\\anloigiai')
    } else {
      // Ẩn lời giải: bỏ comment lệnh \anloigiai nếu có
      mainContent = mainContent.replace(/%\\anloigiai/g, '\\anloigiai')
    }
    fs.writeFileSync(mainPath, mainContent, 'utf-8')

    // 4. Chạy pdflatex biên dịch main.tex
    const result1 = await runPdflatex(mainPath, workDir)
    
    // Chạy lần 2 để cập nhật mục lục và đáp án
    let result = result1
    if (result1.success) {
      result = await runPdflatex(mainPath, workDir)
    }

    const pdfFile = path.join(workDir, 'main.pdf')

    if (!result.success || !fs.existsSync(pdfFile)) {
      // Debug logging (only in development)
      try {
        if (process.env.NODE_ENV === 'development') {
          const debugDir = process.cwd()
          fs.copyFileSync(maTranPath, path.join(debugDir, 'error_output.tex'))
          const logFile = path.join(workDir, 'main.log')
          if (fs.existsSync(logFile)) {
            fs.copyFileSync(logFile, path.join(debugDir, 'error_output.log'))
          }
        }
      } catch {}

      // Trích xuất lỗi từ log
      const errorLines = result.log
        .split('\n')
        .filter(l => l.startsWith('!') || l.includes('Error') || l.includes('Fatal error'))
        .slice(0, 15)
        .join('\n')

      return NextResponse.json(
        {
          error: 'Biên dịch LaTeX thất bại',
          details: errorLines || result.log.slice(-1000),
          log: result.log,
        },
        { status: 422 }
      )
    }

    // Đọc file PDF và trả về
    const pdfBuffer = fs.readFileSync(pdfFile)

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="preview.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('Compile PDF error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 500 }
    )
  } finally {
    // Dọn thư mục temp
    if (workDir) {
      try { fs.rmSync(workDir, { recursive: true, force: true }) } catch {}
    }
  }
}
