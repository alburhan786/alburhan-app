// PM2 Ecosystem Config — Al Burhan Tours & Travels VPS
// Usage:
//   pm2 start pm2.ecosystem.config.cjs
//   pm2 save
//   pm2 startup  (then run the printed command as root)
//
// Place at: /var/www/alburhan/pm2.ecosystem.config.cjs

const VPS_ROOT  = "/var/www/alburhan";
const ENV_FILE  = `${VPS_ROOT}/.env`;
const TSX_BIN   = `${VPS_ROOT}/node_modules/.bin/tsx`;

module.exports = {
  apps: [
    // ─────────────────────────────────────────────────────────────────────────
    //  App 1: Al Burhan Main API + Alburhan React Frontend
    // ─────────────────────────────────────────────────────────────────────────
    {
      name:            "alburhan-api",
      script:          `${VPS_ROOT}/artifacts/api-server/dist/index.cjs`,
      interpreter:     "node",
      cwd:             `${VPS_ROOT}/artifacts/api-server`,
      instances:       1,
      exec_mode:       "fork",
      autorestart:     true,
      watch:           false,
      max_memory_restart: "800M",
      restart_delay:   3000,
      env: {
        NODE_ENV:            "production",
        PORT:                "3000",
        SITE_BASE:           "https://alburhantravels.com",
        REPLIT_DEV_URL:      "",      // leave blank — not needed once fully on VPS
        // These will be overridden by your .env file:
        // DATABASE_URL, SESSION_SECRET, RAZORPAY_KEY_ID, RAZORPAY_SECRET,
        // BOTBEE_API_KEY, BOTBEE_BUSINESS_ID, BOTBEE_PHONE_NUMBER_ID,
        // FAST2SMS_API_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM,
        // MIGRATION_KEY, CORS_ORIGIN
      },
      env_file:        ENV_FILE,
      error_file:      "/var/log/pm2/alburhan-api-error.log",
      out_file:        "/var/log/pm2/alburhan-api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      kill_timeout:    5000,
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  App 2: Al Burhan Secure PDF Enterprise
    // ─────────────────────────────────────────────────────────────────────────
    {
      name:            "pdf-enterprise",
      script:          TSX_BIN,
      args:            "server.ts",
      interpreter:     "node",
      cwd:             `${VPS_ROOT}/artifacts/pdf-enterprise`,
      instances:       1,
      exec_mode:       "fork",
      autorestart:     true,
      watch:           false,
      max_memory_restart: "600M",
      restart_delay:   3000,
      env: {
        NODE_ENV:  "production",
        PORT:      "3001",
        SITE_BASE: "https://alburhantravels.com",
      },
      env_file:        ENV_FILE,
      error_file:      "/var/log/pm2/pdf-enterprise-error.log",
      out_file:        "/var/log/pm2/pdf-enterprise-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      kill_timeout:    5000,
    },
  ],
};
