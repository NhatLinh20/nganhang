const fs = require('fs');
const content = fs.readFileSync('18-6c31f5a95040d9bc.js', 'utf8');
const match = content.match(/(?:function|const|let|var)\s+\w+\s*=\s*(?:function)?\s*\([^)]*\)\s*=>?\s*\{[^}]*?\bC\\xe2u\b[^}]*?\}/);
if (match) {
  console.log(match[0]);
} else {
  // Let's just find the substring "C\\xe2u"
  const idx = content.indexOf('C\\xe2u');
  if (idx !== -1) {
    console.log(content.substring(idx - 200, idx + 200));
  }
}
