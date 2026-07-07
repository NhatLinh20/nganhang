const text = "\\definecolor{deepskyblue}{rgb}{0.0, 0.75, 1.0}\n \\begin{tikzpicture} \\tikzset{abc} \\end{tikzpicture}";

const r1 = /\\definecolor/;
console.log("r1:", text.match(r1));

const r2 = /\\definecolor\s*\{[^}]+\}\s*\{[^}]+\}(?:\s*\{[^}]+\})?\s*/;
console.log("r2:", text.match(r2));

const r3 = /(?:\\definecolor\s*\{[^}]+\}\s*\{[^}]+\}(?:\s*\{[^}]+\})?\s*)*\\begin\{(tikzpicture|tabular)\}[\s\S]*?\\end\{\1\}/;
console.log("r3:", text.match(r3));
