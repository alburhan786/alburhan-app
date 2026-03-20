const { execSync, spawn } = require('child_process');

console.log('[Deploy] Building server...');
try {
  execSync('npm run server:build', { stdio: 'inherit' });
} catch (e) {
  console.error('[Deploy] Build failed:', e.message);
  process.exit(1);
}

console.log('[Deploy] Starting production server...');
const server = spawn('node', ['server_dist/index.js'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});

server.on('exit', (code) => {
  console.log('[Deploy] Server exited with code:', code);
  process.exit(code || 0);
});

process.on('SIGTERM', () => { server.kill('SIGTERM'); });
process.on('SIGINT', () => { server.kill('SIGINT'); });
