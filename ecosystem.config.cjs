module.exports = {
  apps: [{
    name: 'alburhan-tours',
    script: 'artifacts/api-server/dist/index.cjs',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
    }
  }]
};
