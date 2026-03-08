# AL BURHAN TOURS & TRAVELS - Hajj & Umrah Booking App

  A comprehensive mobile application for booking Hajj and Umrah packages with integrated payment gateway and multi-channel notifications.

  ## Features

  ### MVP Features
  ✅ **User Authentication**
  - Secure registration and login system
  - User profile management
  - Session persistence

  ✅ **Package Browsing**
  - Browse Hajj and Umrah packages
  - Filter by type, price range, and dates
  - Search functionality
  - Detailed package information with hotel details

  ✅ **Booking System**
  - Complete booking flow with traveler information
  - Passport details collection
  - Contact information management
  - Special requests handling

  ✅ **Payment Integration**
  - Mock Razorpay payment gateway (ready for production integration)
  - Partial and full payment support
  - Payment history tracking
  - Automatic booking status updates

  ✅ **Multi-Channel Notifications** (Simulated)
  - WhatsApp notifications via BotBee
  - RCS messages via Lemin AI
  - SMS via Fast2SMS
  - Triggered on booking creation and payment completion

  ✅ **Beautiful Mobile UI**
  - Islamic-themed design (Green & Gold)
  - Smooth animations and transitions
  - Responsive layouts
  - Touch-optimized interface

  ## Technology Stack

  ### Frontend
  - **React Native** with Expo SDK 54
  - **Expo Router** for navigation
  - **TypeScript** for type safety
  - **AsyncStorage** for local data persistence

  ### Backend
  - **Express.js** server
  - **PostgreSQL** database
  - **Drizzle ORM** for database operations
  - **bcryptjs** for password hashing

  ### Integrations (Ready)
  - Razorpay payment gateway (mock implementation)
  - BotBee WhatsApp API
  - Lemin AI RCS messaging
  - Fast2SMS API

  ## Getting Started

  ### Prerequisites
  - Node.js 18+ installed
  - PostgreSQL database available
  - Expo Go app on your mobile device

  ### Installation

  1. **Install dependencies** (already done):
  ```bash
  npm install
  ```

  2. **Set up database**:
  ```bash
  npm run db:generate
  npm run db:migrate
  ```

  3. **Start the application**:
  ```bash
  npm start
  ```

  This will start both:
  - Express server on port 3000
  - Expo dev server on port 8081

  4. **Open the app**:
  - Scan the QR code with Expo Go app
  - Or press 'a' for Android emulator / 'i' for iOS simulator

  ### First Time Setup

  When you open the app for the first time:
  1. The database will be automatically seeded with sample packages
  2. Register a new account
  3. Browse packages and create bookings

  ## Project Structure

  ```
  ├── app/                    # Expo Router screens
  │   ├── (auth)/            # Authentication screens
  │   │   ├── login.tsx
  │   │   └── register.tsx
  │   ├── (tabs)/            # Main tab navigation
  │   │   ├── index.tsx      # Home (Package browsing)
  │   │   ├── bookings.tsx   # My Bookings
  │   │   └── profile.tsx    # User Profile
  │   ├── package/           # Package details
  │   │   └── [id].tsx
  │   ├── booking/           # Booking flow
  │   │   ├── create.tsx
  │   │   └── [id].tsx
  │   ├── _layout.tsx        # Root layout
  │   └── index.tsx          # Entry point
  ├── components/            # Reusable components
  ├── constants/             # App constants (Colors, etc.)
  ├── contexts/              # React contexts
  │   └── AuthContext.tsx
  ├── server/                # Backend server
  │   └── index.ts           # Express server with all routes
  ├── services/              # API services
  │   └── api.ts
  ├── shared/                # Shared code
  │   ├── schema.ts          # Database schema
  │   └── db.ts              # Database connection
  └── drizzle.config.ts      # Drizzle ORM config
  ```

  ## API Endpoints

  ### Authentication
  - POST `/api/auth/register` - Register new user
  - POST `/api/auth/login` - Login user

  ### Packages
  - GET `/api/packages` - List all packages with filters
  - GET `/api/packages/:id` - Get package details

  ### Bookings
  - POST `/api/bookings` - Create new booking
  - GET `/api/bookings/user/:userId` - Get user bookings
  - GET `/api/bookings/:id` - Get booking details

  ### Payments
  - POST `/api/payments/create-order` - Create payment order
  - POST `/api/payments/verify` - Verify payment

  ### Documents
  - POST `/api/documents/upload` - Upload document
  - GET `/api/documents/user/:userId` - Get user documents

  ### Utilities
  - POST `/api/seed` - Seed sample data

  ## Database Schema

  ### Tables
  - **users** - User accounts
  - **packages** - Hajj & Umrah packages
  - **bookings** - User bookings
  - **payments** - Payment transactions
  - **notifications** - Notification log
  - **documents** - Uploaded documents

  ## Configuration

  ### Environment Variables
  - `DATABASE_URL` - PostgreSQL connection string (automatically configured)
  - `PORT` - Server port (default: 3000)
  - `EXPO_PUBLIC_API_URL` - API URL for mobile app

  ### Payment Gateway (Production Setup)
  To enable real Razorpay payments:
  1. Sign up at https://razorpay.com
  2. Get API keys from dashboard
  3. Add to environment variables
  4. Update payment service in `services/api.ts`

  ### Notification Services (Production Setup)

  **BotBee (WhatsApp)**
  1. Sign up at https://botbee.io
  2. Get API credentials
  3. Update `sendWhatsAppMessage` function in `server/index.ts`

  **Lemin AI (RCS)**
  1. Sign up at https://lemin.ai
  2. Get API credentials
  3. Update `sendRCSMessage` function in `server/index.ts`

  **Fast2SMS (SMS)**
  1. Sign up at https://fast2sms.com
  2. Get API key
  3. Update `sendSMS` function in `server/index.ts`

  ## Testing

  ### Test Accounts
  Create your own account through the registration screen.

  ### Sample Data
  The app includes 4 sample packages:
  - Premium Umrah Package (14 days)
  - Deluxe Hajj Package (21 days)
  - Economy Umrah Package (7 days)
  - Standard Hajj Package (18 days)

  ### Payment Testing
  The app currently uses a simulated payment flow. Click "Simulate Success" to complete a payment.

  ## Troubleshooting

  ### Database Connection Issues
  - Ensure DATABASE_URL environment variable is set
  - Check PostgreSQL is running
  - Run migrations: `npm run db:migrate`

  ### Expo Connection Issues
  - Ensure phone and computer are on same network
  - Try restarting Expo: press 'r' in terminal
  - Clear cache: `npx expo start -c`

  ### Server Issues
  - Check if port 3000 is available
  - Restart server: Stop and run `npm start` again

  ## Next Phase Features

  Ready to implement:
  1. **Document Management** - Upload and manage travel documents
  2. **Payment History** - Detailed payment transaction history
  3. **Real Payment Integration** - Complete Razorpay integration
  4. **Live Notifications** - Integrate actual WhatsApp, RCS, and SMS services
  5. **Admin Dashboard** - Manage packages, bookings, and users
  6. **Push Notifications** - Real-time booking updates
  7. **Package Images** - Add image galleries for packages
  8. **Reviews & Ratings** - Customer feedback system
  9. **Multi-language Support** - Arabic and Urdu translations
  10. **Visa Tracking** - Track visa application status

  ## Support

  For technical support:
  - Email: support@alburhan.com
  - Phone: +91 1234567890

  ## License

  © 2026 AL BURHAN TOURS & TRAVELS. All rights reserved.
  