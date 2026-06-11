const fs = require('fs');
const content = fs.readFileSync('18-6c31f5a95040d9bc.js', 'utf8');

// We just want to extract function B and function V
// It's a bit tricky to run minified code. Let's just find function B's body.
const bMatch = content.match(/let\s+B\s*=\s*\((.*?)\)\s*=>\s*\{([\s\S]*?return\s+\{.*?\})\s*\};?/);
if (bMatch) {
  console.log('--- Function B ---');
  console.log('let B = (' + bMatch[1] + ') => {' + bMatch[2] + '}');
}
const vMatch = content.match(/let\s+V\s*=\s*\((.*?)\)\s*=>\s*\{([\s\S]*?return\s+[\s\S]*?)\s*\};?/);
if (vMatch) {
  console.log('--- Function V ---');
  console.log('let V = (' + vMatch[1] + ') => {' + vMatch[2] + '}');
}
