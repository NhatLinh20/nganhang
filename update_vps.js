const { Client } = require('ssh2');
const fs = require('fs');

const conn = new Client();
const serverJsContent = fs.readFileSync('latex-server.js', 'utf8');

// Read API keys from .env.local
const envLocal = fs.readFileSync('.env.local', 'utf8');
let geminiApiKeys = '';
let geminiApiKey = '';
for (const line of envLocal.split('\n')) {
  if (line.startsWith('GEMINI_API_KEYS=')) geminiApiKeys = line.split('=')[1].trim();
  if (line.startsWith('GEMINI_API_KEY=')) geminiApiKey = line.split('=')[1].trim();
}
const finalKeys = geminiApiKeys || geminiApiKey;

console.log('Connecting to VPS to update server.js...');

conn.on('ready', () => {
  console.log('Connected! Updating server.js...');

  const base64Server = Buffer.from(serverJsContent).toString('base64');

  const setupCommand = `
    cd /opt/latex-server
    echo "GEMINI_API_KEYS=${finalKeys}" > .env
    echo "${base64Server}" | base64 -d > server.js
    npm install
    systemctl restart latex-server
    echo DONE
    echo "Server updated and restarted."
  `;

  conn.exec(setupCommand, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Update command finished with code ' + code);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).on('error', (err) => {
  console.error('Connection Error:', err);
}).connect({
  host: '42.96.15.5',
  port: 26266,
  username: 'root',
  password: '#_d7^g=+U'
});
