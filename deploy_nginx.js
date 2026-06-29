const { Client } = require('ssh2');

const conn = new Client();
console.log('Connecting to VPS to install and configure Nginx...');

conn.on('ready', () => {
  const setupCommand = `
    apt-get update -y
    apt-get install -y nginx
    
    cat > /etc/nginx/sites-available/default << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

    systemctl restart nginx
    systemctl enable nginx
    echo "Nginx installed and configured!"
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
