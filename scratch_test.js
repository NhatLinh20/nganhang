const ID_REGEX = /^\d+[a-zA-Z]\d+[a-zA-Z]\d+-\d+$/

function removeNonIdComments(content) {
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('\\begin{ex}') || line.includes('\\begin{bt}')) {
      const originalLine = line
      let nonIdFound = false

      const newLine = line.replace(/%\[([^\]]*)\]/g, (match, innerText) => {
        const text = innerText.trim()
        if (ID_REGEX.test(text)) {
          return match // Giữ nguyên ID hợp lệ
        } else {
          nonIdFound = true
          return '' // Xóa cụm không phải ID
        }
      })

      if (nonIdFound && newLine !== originalLine) {
        // Dọn dẹp khoảng trắng thừa cuối dòng
        lines[i] = newLine.replace(/ +(?=%)/g, '').trimEnd()
      }
    }
  }

  return lines.join('\n')
}

const input = `\\begin{ex}%[Dự án Tex Đề thi thử THPTQG 2526]%[2D3H2-2]
	Kết quả khảo sát năng suất...
\\end{ex}`;

console.log("Input:")
console.log(input)
console.log("Output:")
console.log(removeNonIdComments(input))
