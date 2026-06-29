const { Client } = require('ssh2');
const fs = require('fs');

const conn = new Client();
const serverJsContent = fs.readFileSync('latex-server.js', 'utf8');

console.log('Connecting to VPS to update server.js...');

conn.on('ready', () => {
  console.log('Connected! Updating server.js...');

  const base64Server = Buffer.from(serverJsContent).toString('base64');

  const setupCommand = `
    cd /opt/latex-server
    npm install multer
    echo "${base64Server}" | base64 -d > server.js
    systemctl restart latex-server
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
