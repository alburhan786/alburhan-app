# AL BURHAN TOURS & TRAVELS

## Overview

AL BURHAN Tours & Travels is a cross-platform mobile application for booking Hajj and Umrah pilgrimage packages. Built with Expo (React Native) for the frontend and Express.js for the backend, with PostgreSQL via Drizzle ORM.

## How to Run

- **Backend**: `npm run server:dev` (Express server on port 5000)
- **Frontend**: `npm run expo:dev` (Expo dev server on port 8081)
- Both run via configured Replit workflows: "Start Backend" and "Start Frontend"

## Accessing the App

- **In Replit webview** (port 5000): Shows the landing page with QR code for Expo Go
- **Web preview** (port 8081): Shows the actual React Native web app
- **On phone**: Download Expo Go, scan QR code from the webview/console

## System Architecture

### Frontend (React Native / Expo)

- **Framework**: React Native with Expo SDK 54
- **Navigation**: Expo Router (file-based routing)
  - `app/(auth)/` — login and register screens (email/password + OTP via SMS/WhatsApp)
  - `app/(tabs)/` — main tab layout (Home, Bookings, Profile with document uploads)
  - `app/package/[id]` — package detail screen
  - `app/booking/create` — booking creation flow
  - `app/booking/[id]` — booking detail with real Razorpay payment via WebView
- **State**: React Context (AuthContext) + TanStack React Query
- **Persistence**: AsyncStorage for user session
- **Styling**: Islamic green (#047857) primary, gold (#D97706) secondary

### Backend (Express.js)

- **Port**: 5000
- **Entry**: `server/index.ts` (CORS, landing page, Expo manifest proxy, Metro proxy)
- **Routes**: `server/routes.ts`
  - `POST /api/auth/register` and `POST /api/auth/login` — email/password auth
  - `POST /api/auth/send-otp` — send OTP via Fast2SMS
  - `POST /api/auth/send-whatsapp-otp` — send OTP via BotBee WhatsApp
  - `POST /api/auth/verify-otp` — verify OTP and create account
  - `POST /api/auth/login-with-otp` — send login OTP to existing user
  - `POST /api/auth/verify-login-otp` — verify login OTP
  - `GET /api/packages` and `GET /api/packages/:id`
  - `POST /api/bookings`, `GET /api/bookings/user/:userId`, `GET /api/bookings/:id`
  - `POST /api/payments/create-order` — creates real Razorpay order
  - `POST /api/payments/verify` — verifies Razorpay signature (HMAC SHA256)
  - `POST /api/documents/upload` and `GET /api/documents/user/:userId`
  - `POST /api/seed` — seeds 4 sample packages
  - `GET /api/admin/stats` — dashboard statistics
  - `GET /api/admin/bookings` — all bookings
  - `GET /api/admin/customers` — all customers
  - `GET /api/admin/payments` — all payments
  - `PUT /api/admin/bookings/:id/status` — update booking status
  - `GET /admin` — admin dashboard HTML page

### Integrations

- **Fast2SMS** — OTP delivery via SMS (route=q quick SMS)
- **BotBee WhatsApp** — OTP and notification delivery via WhatsApp
- **Razorpay** — Real payment gateway (order creation + signature verification)
- **Notifications** — Multi-channel (SMS + WhatsApp) for booking/payment events

### Database (PostgreSQL)

- **ORM**: Drizzle ORM with `pg` driver
- **Config**: `drizzle.config.ts`
- **Schema** (`shared/schema.ts`): users, packages, bookings, payments, notifications, documents
- **Connection**: `server/db.ts` using DATABASE_URL

### Key Files

| File | Purpose |
|---|---|
| `server/index.ts` | Express server setup (CORS, landing page, Metro proxy, manifest rewrite) |
| `server/routes.ts` | All API route handlers (auth, OTP, bookings, payments, notifications) |
| `server/db.ts` | Database connection |
| `shared/schema.ts` | Drizzle schema definitions |
| `app/_layout.tsx` | Root layout with providers (fonts, error boundary, query client, auth) |
| `app/(tabs)/_layout.tsx` | Tab navigation (Home, Bookings, Profile) |
| `app/(auth)/login.tsx` | Login screen (email/password + OTP login) |
| `app/(auth)/register.tsx` | Registration with OTP verification (SMS/WhatsApp) |
| `app/booking/[id].tsx` | Booking detail with Razorpay WebView checkout |
| `app/(tabs)/profile.tsx` | Profile with document upload/management |
| `services/api.ts` | API service functions (auth, OTP, bookings, payments, documents) |
| `contexts/AuthContext.tsx` | Authentication context provider (login, register, OTP methods) |
| `constants/Colors.ts` | Theme colors |
| `lib/query-client.ts` | React Query client with default fetcher + getApiUrl() |
| `server/templates/admin-dashboard.html` | Admin dashboard (bookings, customers, payments, packages) |

### Dependencies

- expo, expo-router, express, drizzle-orm, pg, bcryptjs
- @tanstack/react-query, @react-native-async-storage/async-storage
- @expo/vector-icons (Ionicons for tab icons)
- @react-native-picker/picker (filter dropdowns)
- react-native-webview (Razorpay checkout)
- expo-document-picker (document uploads)

### Environment Variables

| Variable | Description |
|---|---|
| DATABASE_URL | PostgreSQL connection (auto-set by Replit) |
| EXPO_PUBLIC_DOMAIN | API domain for mobile app (auto-set in dev) |
| REPLIT_DEV_DOMAIN | Replit domain for CORS (auto-set) |
| FAST2SMS_API_KEY | Fast2SMS API key for OTP delivery |
| BOTBEE_WHATSAPP_API_KEY | BotBee API key for WhatsApp messaging |
| RAZORPAY_KEY_ID | Razorpay payment gateway key ID |
| RAZORPAY_KEY_SECRET | Razorpay payment gateway key secret |

### Mobile Proxy Architecture

Phone → Replit HTTPS (443) → Backend (5000) → http-proxy-middleware → Metro (8081)
- `server/index.ts` rewrites manifest to set `hostUri` and `debuggerHost` to `devDomain:443`
- `getApiUrl()` in `lib/query-client.ts` strips port for non-web platforms
