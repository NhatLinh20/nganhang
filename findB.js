const fs = require('fs');
const content = fs.readFileSync('18-6c31f5a95040d9bc.js', 'utf8');
const startIndex = content.indexOf('let B = (e) => {');
if (startIndex !== -1) {
  const endIndex = content.indexOf('};', startIndex) + 2;
  console.log('--- Function B ---');
  console.log(content.substring(startIndex, endIndex));
} else {
  console.log('Function B not found');
}
