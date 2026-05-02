module.exports = {
  apps: [{
    name: "api-server",
    script: "artifacts/api-server/dist/index.cjs",
    cwd: "/var/www/alburhan",
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      "NODE_ENV": "production",
      "PORT": "5000",
      "DATABASE_URL": "postgresql://alburhan:AlBurhan2026Secure@localhost:5432/alburhandb",
      "STATIC_FILES_DIR": "/var/www/alburhan/artifacts/alburhan/dist/public",
      "UPLOADS_DIR": "/var/www/alburhan/uploads",
      "CORS_ORIGIN": "https://alburhantravels.com,https://www.alburhantravels.com",
      "FAST2SMS_API_KEY": "XXSL5mI3wO9piOG62Va1lJyvd4JCECMXhzXm7dD7Y2JKydynma6IADpu1vcb",
      "RAZORPAY_KEY_ID": "rzp_live_SOMX9rmgXZroTD",
      "RAZORPAY_SECRET": "RN7dX2d86mdRrG5qNz2dY5BG",
      "BOTBEE_API_KEY": "18586|wNNF04uDdR6fFHZwBPpcPQcMDQJ1yqauLNaxWkHP6eaed2ba",
      "BOTBEE_BUSINESS_ID": "2322353164933958",
      "BOTBEE_PHONE_NUMBER_ID": "+918989701701",
      "SESSION_SECRET": "Y29ZSfR6hCqoCXmGxoLH1gcYyg/1X7KZV7w9s4GoK9lViBwJKx0LZXT8Brf/H0rxokXM7wipiL3OEQ82jHaY7w=="
    }
  }]
};
