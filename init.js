#!/usr/bin/env node

  const { execSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');

  console.log('🚀 Initializing AL BURHAN Tours & Travels App...\n');

  // Check if migrations exist
  const migrationsDir = path.join(__dirname, 'drizzle');
  if (!fs.existsSync(migrationsDir)) {
    console.log('📦 Generating database migrations...');
    try {
      execSync('npm run db:generate', { stdio: 'inherit' });
      console.log('✅ Migrations generated\n');
    } catch (error) {
      console.error('❌ Failed to generate migrations');
      process.exit(1);
    }
  }

  // Check if .env exists
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) {
    console.log('⚠️  No .env file found');
    console.log('   DATABASE_URL should be automatically set by Replit\n');
  }

  console.log('✅ Initialization complete!\n');
  console.log('📱 To start the app, run: npm start\n');
  console.log('The app includes:');
  console.log('  • User authentication (register/login)');
  console.log('  • Package browsing with filters');
  console.log('  • Complete booking system');
  console.log('  • Payment integration (mock)');
  console.log('  • Multi-channel notifications (simulated)\n');
  console.log('Visit the app on your phone using Expo Go!\n');
  