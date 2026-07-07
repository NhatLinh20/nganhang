/**
 * Calls the external VPS API to compile TikZ code into an SVG string.
 */
export async function compileTikz(tikzCode: string): Promise<string> {
  // Use Next.js API route as a proxy to avoid Mixed Content (HTTPS -> HTTP) errors
  const apiUrl = typeof window !== 'undefined' ? '/api/tikz' : (process.env.TIKZ_API_URL || process.env.NEXT_PUBLIC_TIKZ_API_URL || '/api/tikz')
  
  // Tự động định nghĩa một số màu mở rộng phổ biến (vì server xcolor không load svgnames/dvipsnames)
  const colorDefs = `
\\definecolor{dimgray}{RGB}{105,105,105}
\\definecolor{darkgray}{RGB}{169,169,169}
\\definecolor{lightgray}{RGB}{211,211,211}
`;

  // Chèn vào ngay sau \\begin{tikzpicture} hoặc ở đầu
  let safeTikzCode = tikzCode.trim();

  // Nếu đây là bảng tabular đơn thuần (không nằm trong tikzpicture), bọc nó vào tikzpicture để standalone crop chuẩn viền
  if (!safeTikzCode.includes('\\begin{tikzpicture}') && safeTikzCode.includes('\\begin{tabular}')) {
    safeTikzCode = `\\begin{tikzpicture}\n\\node[inner sep=0pt] {\n${safeTikzCode}\n};\n\\end{tikzpicture}`;
  }

  if (safeTikzCode.includes('\\begin{tikzpicture}')) {
    safeTikzCode = safeTikzCode.replace(/(\\begin\{tikzpicture\}(\[[^\]]*\])?)/, (match) => {
      return match + '\n' + colorDefs;
    });
  } else {
    safeTikzCode = colorDefs + safeTikzCode;
  }

  try {
    const response = await fetch(`${apiUrl}/compile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tikzCode: safeTikzCode })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.details || errorData.error || 'Failed to compile TikZ')
    }

    return await response.text()
  } catch (error) {
    console.error('Error compiling TikZ:', error)
    throw error
  }
}

/**
 * Calls the external VPS API to compile a ZIP containing LaTeX files into a PDF Blob.
 */
export async function compilePdfZip(zipBlob: Blob): Promise<Blob> {
  // Use Next.js API route as a proxy to avoid Mixed Content (HTTPS -> HTTP) errors
  const apiUrl = typeof window !== 'undefined' ? '/api/tikz' : (process.env.TIKZ_API_URL || process.env.NEXT_PUBLIC_TIKZ_API_URL || '/api/tikz')
  
  const formData = new FormData()
  formData.append('file', zipBlob, 'exam.zip')

  try {
    const response = await fetch(`${apiUrl}/compile-zip`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.details || errorData.error || 'Failed to compile PDF')
    }

    return await response.blob()
  } catch (error) {
    console.error('Error compiling PDF:', error)
    throw error
  }
}
