const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const util = require('util');
const multer = require('multer');

const execAsync = util.promisify(exec);
const app = express();
const PORT = 3001;

// Middlewares
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

// Directories
const TMP_DIR = fs.existsSync('/dev/shm') ? '/dev/shm/latex-tmp' : path.join(__dirname, 'tmp');
const CACHE_DIR = path.join(__dirname, 'cache');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

// Multer setup for handling ZIP uploads
const upload = multer({ dest: TMP_DIR });

function getHash(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

app.post('/compile', async (req, res) => {
  const { tikzCode } = req.body;
  if (!tikzCode) return res.status(400).json({ error: 'Missing tikzCode' });

  // Add standard packages including tkz-euclide and tkz-tab
  const document = `
\\documentclass[border=5pt,tikz]{standalone}
\\usepackage{amsmath,amssymb,mathrsfs,fancyhdr,enumerate,multirow,makecell,currfile,venndiagram,fontawesome,pifont,pgf-pie,pgfplots,yhmath,xparse}
\\usepackage{etoolbox}
\\usepackage{mathpazo}
\\usepackage{tikz-3dplot,tikz,tkz-tab,tabvar,tkz-euclide}
\\usetikzlibrary{arrows,calc,intersections,angles,snakes,quotes,backgrounds,shapes.geometric,patterns, shapes.symbols}
\\usepackage[utf8]{vietnam}
\\def\\href#1#2{#2}
\\pgfplotsset{compat=1.18}
\\begin{document}
${tikzCode.trim().startsWith('\\begin{tabular}') ? `\\begin{tikzpicture}\\node[inner sep=0pt] {\n${tikzCode}\n};\n\\end{tikzpicture}` : tikzCode}
\\end{document}`;

  const hash = getHash(document);
  const cacheFile = path.join(CACHE_DIR, `${hash}.svg`);

  // Return cached SVG if exists
  if (fs.existsSync(cacheFile)) {
    const svg = fs.readFileSync(cacheFile, 'utf8');
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(svg);
  }

  const workDir = path.join(TMP_DIR, hash);
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir);

  const texFile = path.join(workDir, 'main.tex');
  const svgFile = path.join(workDir, 'main.svg');

  try {
    fs.writeFileSync(texFile, document);
    // Dùng pdflatex y hệt như trang "Tạo đề thi" để hỗ trợ mọi hiệu ứng 3D, đổ bóng, màu sắc...
    await execAsync(`pdflatex -interaction=nonstopmode -halt-on-error main.tex`, { cwd: workDir, timeout: 60000 });
    
    // Chuyển PDF thành ảnh PNG chất lượng cao (300 DPI) để trình duyệt hiển thị hoàn hảo, không bao giờ lỗi font
    let pngPath = path.join(workDir, 'main-1.png');
    let usePng = false;
    try {
      await execAsync(`pdftocairo -png -transp -r 300 main.pdf main`, { cwd: workDir, timeout: 15000 });
      if (fs.existsSync(pngPath)) usePng = true;
      else if (fs.existsSync(path.join(workDir, 'main.png'))) {
        pngPath = path.join(workDir, 'main.png');
        usePng = true;
      }
    } catch (e) {
      try { // Dự phòng dùng ghostscript nếu cairo lỗi
        pngPath = path.join(workDir, 'main.png');
        await execAsync(`gs -dSAFER -dBATCH -dNOPAUSE -dEPSCrop -sDEVICE=pngalpha -r300 -sOutputFile=${pngPath} main.pdf`, { cwd: workDir, timeout: 15000 });
        if (fs.existsSync(pngPath)) usePng = true;
      } catch(e2) {}
    }

    if (usePng) {
      const pngData = fs.readFileSync(pngPath);
      const base64 = pngData.toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;
      
      let width = 100, height = 100;
      try {
        const { stdout } = await execAsync(`pdfinfo main.pdf`, { cwd: workDir });
        const match = stdout.match(/Page size:\s+([0-9.]+)\s+x\s+([0-9.]+)/);
        if (match) {
          width = parseFloat(match[1]);
          height = parseFloat(match[2]);
        }
      } catch(e) {}
      
      // Bọc PNG vào khung SVG dùng đơn vị 'em' (tỷ lệ 1em = 10pt) để hình ảnh tự động to nhỏ theo cỡ chữ khi bấm nút A+ / A-
      const wrappedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width/10}em" height="${height/10}em" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="${dataUrl}" /></svg>`;

      fs.writeFileSync(cacheFile, wrappedSvg);
      fs.rmSync(workDir, { recursive: true, force: true });
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(wrappedSvg);
    }

    // Nếu mọi cách tạo PNG đều thất bại, fallback về pdf2svg
    await execAsync(`pdf2svg main.pdf main.svg`, { cwd: workDir, timeout: 10000 });
    const svg = fs.readFileSync(svgFile, 'utf8');
    fs.writeFileSync(cacheFile, svg);
    fs.rmSync(workDir, { recursive: true, force: true });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(svg);

  } catch (error) {
    // Cleanup on error
    if (fs.existsSync(workDir)) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
    console.error('Compilation error:', error.stdout || error.message);
    res.status(500).json({ 
      error: 'Biên dịch LaTeX thất bại', 
      details: error.stdout || error.message 
    });
  }
});

app.post('/compile-zip', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing zip file' });

  const workDir = path.join(TMP_DIR, req.file.filename + '_dir');
  fs.mkdirSync(workDir);

  const zipPath = req.file.path;
  const pdfFile = path.join(workDir, 'main.pdf');
  const logFile = path.join(workDir, 'main.log');

  try {
    // Extract ZIP
    await execAsync(`unzip -o ${zipPath} -d ${workDir}`);

    // Check if we need 2 passes (for table of contents or TikZ absolute positioning)
    const grepCmd = `grep -r -E "^[^%]*(remember picture|\\\\\\\\tableofcontents)" ${workDir}`;
    const needsTwoPasses = await execAsync(grepCmd).then(() => true).catch(() => false);

    if (needsTwoPasses) {
      // Compile to PDF (run twice for cross-references)
      await execAsync(`pdflatex -draftmode -interaction=nonstopmode -halt-on-error main.tex`, { 
        cwd: workDir, 
        timeout: 60000 
      }).catch(e => {
        console.warn('First pass pdflatex error:', e.message);
      });
    }

    await execAsync(`pdflatex -interaction=nonstopmode -halt-on-error main.tex`, { 
      cwd: workDir, 
      timeout: 60000 
    });

    if (!fs.existsSync(pdfFile)) {
       throw new Error('PDF file was not generated.');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="exam.pdf"');
    
    const fileStream = fs.createReadStream(pdfFile);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      fs.rmSync(workDir, { recursive: true, force: true });
      fs.unlinkSync(zipPath);
    });

  } catch (error) {
    let errorLog = '';
    if (fs.existsSync(logFile)) {
      errorLog = fs.readFileSync(logFile, 'utf8');
      const lines = errorLog.split('\n');
      // Instead of just filtering '!', find where the error starts and grab some context around it
      const errorIndex = lines.findIndex(l => l.startsWith('! '));
      if (errorIndex !== -1) {
        // Return 5 lines before and 15 lines after the error to see the exact control sequence
        const start = Math.max(0, errorIndex - 2);
        const end = Math.min(lines.length, errorIndex + 20);
        errorLog = lines.slice(start, end).join('\n');
      } else {
        // Fallback: just return the last 25 lines
        errorLog = lines.slice(-25).join('\n');
      }
    }

    if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    console.error('Compilation failed:', errorLog || error.message);
    res.status(500).json({ error: 'LaTeX compilation failed.', details: errorLog || error.message });
  }
});

app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, () => {
  console.log(`LaTeX API Server is running on port ${PORT}`);
});
