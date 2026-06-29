const { Client } = require('ssh2');
const fs = require('fs');

const conn = new Client();
const serverJsContent = fs.readFileSync('latex-server.js', 'utf8');

console.log('Connecting to VPS...');

conn.on('ready', () => {
  console.log('Connected! Starting setup...');

  // Escaping the content so it can be written via bash
  // Using base64 to avoid escaping issues
  const base64Server = Buffer.from(serverJsContent).toString('base64');

  const setupCommand = `
    set -e
    echo "1/5: Updating system..."
    apt-get update -y
    
    echo "2/5: Installing prerequisites..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y pdf2svg curl unzip
    
    echo "3/5: Installing Node.js..."
    if ! command -v node &> /dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt-get install -y nodejs
    fi
    
    echo "4/5: Setting up Latex API Server..."
    mkdir -p /opt/latex-server
    cd /opt/latex-server
    
    if [ ! -f "package.json" ]; then
      npm init -y
      npm install express cors body-parser
    fi
    
    echo "${base64Server}" | base64 -d > server.js
    
    cat > /etc/systemd/system/latex-server.service << 'EOF'
[Unit]
Description=LaTeX Compile API Server
After=network.target

[Service]
Environment=NODE_ENV=production
Type=simple
User=root
WorkingDirectory=/opt/latex-server
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable latex-server
    systemctl restart latex-server
    
    echo "5/5: Checking TeX Live installation..."
    if ! command -v pdflatex &> /dev/null; then
      echo "--------------------------------------------------------"
      echo "TeX Live is NOT installed yet."
      echo "Please run this command manually on the VPS to install it:"
      echo "apt-get install -y texlive-full"
      echo "--------------------------------------------------------"
    else
      echo "TeX Live is installed!"
    fi
    
    echo "Setup finished! Server is running."
  `;

  conn.exec(setupCommand, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Setup command finished with code ' + code);
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
