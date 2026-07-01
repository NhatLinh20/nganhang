const text = "f'(x)=0\\Leftrightarrow \\hoac{                 &x=3\\\\                 &x=-2.\\\\  }";
function extractBalanced(text, openIdx) {
  if (openIdx >= text.length || text[openIdx] !== '{') return null;
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    const escaped = i > 0 && text[i - 1] === '\\' && (i < 2 || text[i - 2] !== '\\');
    if (ch === '{' && !escaped) depth++;
    else if (ch === '}' && !escaped) {
      depth--;
      if (depth === 0) return { content: text.slice(openIdx + 1, i), endIdx: i };
    }
  }
  return null;
}
function expandHevHoac(text) {
  let result = text;
  for (const [macro, open, close] of [
    ['\\heva', '\\begin{cases}', '\\end{cases}'],
    ['\\hoac', '\\left[\\begin{matrix}',  '\\end{matrix}\\right.'],
  ]) {
    let out = '';
    let i = 0;
    while (i < result.length) {
      const idx = result.indexOf(macro, i);
      if (idx === -1) { out += result.slice(i); break; }
      const afterMacro = idx + macro.length;
      const nextChar = result[afterMacro];
      if (nextChar && /[a-zA-Z]/.test(nextChar)) { out += result.slice(i, idx + 1); i = idx + 1; continue; }
      out += result.slice(i, idx);
      let braceStart = afterMacro;
      while (braceStart < result.length && /\s/.test(result[braceStart])) braceStart++;
      if (result[braceStart] === '{') {
        const inner = extractBalanced(result, braceStart);
        if (inner) {
          out += open + inner.content + close;
          i = inner.endIdx + 1;
          continue;
        }
      }
      out += macro;
      i = afterMacro;
    }
    result = out;
  }
  return result;
}
console.log(expandHevHoac(text));
