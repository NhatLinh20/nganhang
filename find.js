const fs = require('fs');
const files = ['18-6c31f5a95040d9bc.js', '867-ca5593892c8dccbc.js', '29107295-308b8b2c345f6613.js', '674a26a7-fde26b1905c2bda9.js'];
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('TNMaker')) {
    console.log('Found TNMaker in', f);
  }
  if (content.includes('read(') || content.includes('SheetNames')) {
    console.log('Found XLSX in', f);
  }
});
