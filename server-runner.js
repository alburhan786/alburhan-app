const { spawn } = require('child_process');

  // Start Express server
  const server = spawn('npx', ['tsx', 'watch', 'server/index.ts'], {
    stdio: 'inherit',
    shell: true,
  });

  // Start Expo
  const expo = spawn('npx', ['expo', 'start', '--port', '8081'], {
    stdio: 'inherit',
    shell: true,
  });

  process.on('SIGINT', () => {
    server.kill();
    expo.kill();
    process.exit();
  });
  