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
  - `app/(tabs)/` — main tab layout (Packages, Hotels, Videos, Brochures, Contact) + hidden tabs (Assistant, Bookings, Profile)
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
  - `POST /api/documents/upload` — multipart file upload to Replit Object Storage
  - `GET /api/documents/user/:userId` — list user documents
  - `GET /api/files/public/documents/:userId/:filename` — serve uploaded files from Object Storage
  - `GET /api/admin/documents` — all documents with user names
  - `POST /api/seed` — seeds 4 sample packages
  - `GET /api/admin/stats` — dashboard statistics
  - `GET /api/admin/bookings` — all bookings
  - `GET /api/admin/customers` — all customers
  - `GET /api/admin/payments` — all payments
  - `PUT /api/admin/bookings/:id/status` — update booking status
  - `POST /api/admin/upload-document` — upload visa/ticket for customer + auto-notify via SMS/WhatsApp/Email
  - `POST /api/admin/broadcast-notification` — send message to all customers via SMS/WhatsApp/Email
  - `GET /api/notifications/user/:userId` — user notification history
  - `GET /invoice/:bookingId` — professional tax invoice page (GST + TCS, printable PDF via browser print)
  - `POST /api/admin/create-offline-invoice` — create booking + invoice for walk-in/offline customers
  - `GET /admin` — admin dashboard HTML page (8 tabs: Dashboard, Bookings, Customers, Payments, Documents, Notifications, Packages, Create Invoice)

### Integrations

- **Fast2SMS** — OTP delivery via dedicated OTP route (with quick route fallback) + notification SMS via quick route
- **BotBee WhatsApp** — OTP + notification delivery via WhatsApp
- **Razorpay** — Real payment gateway (order creation + signature verification)
- **Nodemailer** — Email notifications (Gmail SMTP, requires EMAIL_USER + EMAIL_PASS)
- **Notifications** — Multi-channel (SMS + WhatsApp + Email) for booking/payment/document events
- **OpenAI (Replit AI Integrations)** — AI travel assistant chatbot with streaming responses

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
| `app/(tabs)/_layout.tsx` | Tab navigation (Packages, Hotels, Videos, Brochures, Contact) |
| `app/(tabs)/hotels.tsx` | Hotels tab — shows all hotels from packages grouped by city |
| `app/(tabs)/videos.tsx` | Videos tab — Hajj/Umrah YouTube video cards |
| `app/(tabs)/brochures.tsx` | Brochures tab — package summary cards with WhatsApp share |
| `app/(tabs)/contact.tsx` | Contact tab — phone, WhatsApp, email, address, social links |
| `app/(tabs)/assistant.tsx` | AI travel assistant chat screen (streaming responses) |
| `app/travel-kit.tsx` | Complimentary travel kit page (15 items with icons) |
| `server/replit_integrations/chat/` | Chat API routes and storage (OpenAI integration) |
| `shared/models/chat.ts` | Drizzle schema for conversations and messages tables |
| `app/(auth)/login.tsx` | Login screen (email/password + OTP login) |
| `app/(auth)/register.tsx` | Registration (direct email/password or OTP verification via SMS/WhatsApp) |
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
- multer (multipart file uploads)
- @replit/object-storage (cloud file storage)
- openai (AI chat via Replit AI Integrations)
- drizzle-zod, zod (schema validation)

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
| EMAIL_USER | Gmail address for sending email notifications |
| EMAIL_PASS | Gmail app password for email notifications |
| AI_INTEGRATIONS_OPENAI_BASE_URL | OpenAI API base URL (auto-set by Replit AI Integrations) |
| AI_INTEGRATIONS_OPENAI_API_KEY | OpenAI API key (auto-set by Replit AI Integrations) |

### Mobile Proxy Architecture

Phone → Replit HTTPS (443) → Backend (5000) → http-proxy-middleware → Metro (8081)
- `server/index.ts` rewrites manifest to set `hostUri` and `debuggerHost` to `devDomain:443`
- `getApiUrl()` in `lib/query-client.ts` strips port for non-web platforms
