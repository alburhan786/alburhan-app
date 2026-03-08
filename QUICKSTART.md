# 🚀 Quick Start Guide

  ## Step 1: Initialize the Database
  The database will be automatically initialized when you start the app for the first time.

  ## Step 2: Start the Application
  ```bash
  npm start
  ```

  This starts:
  - Express backend server on port 3000
  - Expo development server on port 8081

  ## Step 3: Open on Your Phone
  1. Install **Expo Go** app from App Store or Play Store
  2. Scan the QR code shown in terminal
  3. Wait for the app to load

  ## Step 4: Test the App

  ### Create an Account
  1. Open the app
  2. Tap "Register"
  3. Fill in your details
  4. Login with your credentials

  ### Browse Packages
  1. View available Hajj and Umrah packages
  2. Use filters to find specific packages
  3. Tap on a package to see details

  ### Make a Booking
  1. Select a package
  2. Tap "Book Now"
  3. Fill in traveler details
  4. Complete the booking
  5. Make a payment (simulated)

  ## Features Overview

  ✅ **User Authentication**
  - Secure registration and login
  - Profile management

  ✅ **Package Management**
  - Browse Hajj & Umrah packages
  - Filter by type, price, dates
  - Search functionality

  ✅ **Booking System**
  - Complete booking flow
  - Traveler information collection
  - Special requests

  ✅ **Payment Integration**
  - Mock Razorpay gateway
  - Full and partial payments
  - Payment tracking

  ✅ **Notifications** (Simulated)
  - WhatsApp via BotBee
  - RCS via Lemin AI
  - SMS via Fast2SMS

  ## Troubleshooting

  ### Can't connect to server?
  - Make sure both phone and computer are on same WiFi
  - Check that port 3000 isn't blocked

  ### App won't load?
  - Try pressing 'r' in terminal to reload
  - Clear Expo cache: `npx expo start -c`

  ### Database issues?
  - Check DATABASE_URL is set
  - Run: `npm run db:generate`

  ## Production Setup

  For production deployment:
  1. Add real Razorpay API keys
  2. Configure notification service credentials
  3. Set up proper environment variables
  4. Deploy backend to a server
  5. Build mobile app for App Store/Play Store

  ## Support
  Need help? Check README.md for detailed documentation.
  