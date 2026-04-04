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
  - `POST /api/admin/packages/:id/upload-image` — upload image to Object Storage, returns `PackageImage[]`
  - `DELETE /api/admin/packages/:id/remove-image` — remove image by URL
  - `PATCH /api/admin/packages/:id/set-main-image` — set which image is the main/primary
  - `PATCH /api/admin/packages/:id/update-image-position` — set crop position (left/center/right)
  - `POST /api/seed` — seeds 4 sample packages
  - `GET /api/admin/stats` — dashboard statistics
  - `GET /api/admin/bookings` — all bookings
  - `GET /api/admin/customers` — all customers
  - `GET /api/admin/payments` — all payments
  - `PUT /api/admin/bookings/:id/status` — update booking status
  - `POST /api/admin/upload-document` — upload visa/ticket for customer + auto-notify via SMS/WhatsApp/Email
  - `POST /api/admin/broadcast-notification` — send message to all customers via SMS/WhatsApp/Email/FCM push; requires `{message, subject?, title?}`
  - `POST /api/admin/notify-customer` — send single notification via WhatsApp/SMS/FCM push; requires `{phone, message, title?}`
  - `GET /api/admin/notification-history` — paginated notification log (leftJoin users, last 100 by default); admin-session protected
  - `GET /api/notifications/user/:userId` — user notification history
  - `POST /api/user/device-token` — register FCM device token (session auth)
  - `DELETE /api/user/device-token` — unregister FCM device token (session auth)
  - `GET /invoice/:bookingId` — professional tax invoice page (GST + TCS, printable PDF via browser print)
  - `POST /api/admin/create-offline-invoice` — create booking + invoice for walk-in/offline customers
  - `GET /admin` — admin dashboard HTML page (8 tabs: Dashboard, Bookings, Customers, Payments, Documents, Notifications, Packages, Create Invoice)

### Integrations

- **Fast2SMS** — OTP delivery via dedicated OTP route (with quick route fallback) + notification SMS via quick route
- **BotBee WhatsApp** — OTP + notification delivery via WhatsApp
- **Razorpay** — Real payment gateway (order creation + signature verification)
- **Nodemailer** — Email notifications (Gmail SMTP, requires EMAIL_USER + EMAIL_PASS)
- **Notifications** — Multi-channel (SMS + WhatsApp + Email + FCM Push) for booking/payment/document events
- **Firebase Admin SDK** (`server/lib/firebase.ts`) — FCM push via `sendFcmToToken` / `sendFcmMulticast`; enabled only when `FIREBASE_SERVICE_ACCOUNT` env var (full service account JSON) is set; graceful no-op when not configured
- **OpenAI (Replit AI Integrations)** — AI travel assistant chatbot with streaming responses

### Database (PostgreSQL)

- **ORM**: Drizzle ORM with `pg` driver
- **Config**: `drizzle.config.ts`
- **Schema** (`shared/schema.ts`): users, packages, bookings, payments, notifications, documents; `PackageImage` interface `{url, isMain, position}` used in packages.imageUrls JSON column
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

### Notification Safeguards (Task #72)

- **Content-based dedup**: `isNotifDuplicate()` function — 24h window, same userId+type+message combination blocks re-send.
- **FCM retry logic**: `sendFcmToToken()` retries up to 3 times with exponential backoff (1s, 2s, 4s) on transient error codes (`messaging/internal-error`, `messaging/quota-exceeded`, `messaging/unavailable`, `messaging/server-unavailable`). Never retries stale-token errors.
- **`sendFcmMulticast()` retry**: Retries the entire call on transient errors, then retries individual failed tokens.
- **Notifications table**: Added `retry_count` (integer, default 0) and `error_message` (text) columns — populated by admin send-notification endpoint.
- **Admin history UI**: Failed rows highlighted in red, retry badge (↺), error message shown under status, stats bar with Sent/Failed/Retried/Success-rate counts.
- **Expo stale token cleanup**: When Expo returns `DeviceNotRegistered` for a push token, that token is automatically deleted from the `deviceTokens` table.
- **classifyPushError()**: Module-level helper that maps raw error codes (Expo, FCM) to human-readable categories: "invalid token", "firebase error", "network issue".
- **`customer_profiles.whatsapp_number` column**: Added `whatsappNumber text` column to `customerProfiles` table; stores a 10-digit WhatsApp number.
- **`customer_profiles.photo` column**: Added `photo text` column to `customerProfiles` table; stores a URL for the customer's profile photo (separate from `users.profileImage`).
- **Admin bookings photo join**: `GET /api/admin/bookings` left-joins `users` and `customer_profiles`, returns `photo` (coalesce of `customer_profiles.photo` and `users.profileImage`).
- **Upgraded KYC (mobile)**: KYC section now includes Profile Photo card (camera/gallery pick, crop to 1:1, upload via `POST /api/profile/kyc/photo`) and WhatsApp Number card (10-digit, auto-fills from user.phone on first open, saves via existing `POST /api/profile/kyc`).
- **`POST /api/profile/kyc/photo`**: Multipart endpoint accepting a `photo` file (JPEG/PNG/WebP, ≤5 MB); stores in object storage and updates `customer_profiles.photo`.
- **`POST /api/profile/kyc` — whatsappNumber support**: Now accepts `whatsappNumber` field (10-digit validation) alongside existing aadhar/pan/bloodGroup fields.
- **Admin customers table**: `GET /api/admin/customers` now left-joins `customer_profiles` to return `photo` and `whatsappNumber`; HTML table updated with Photo (circular avatar + SVG fallback) and WhatsApp (green clickable link to `wa.me`) columns.
- **Admin All Bookings table**: "Photo" column added as 2nd column; shows 40×40 circular avatar with lazy-loading; falls back to SVG silhouette when no photo URL is present or image fails to load. `.customer-photo` and `.customer-photo-default` CSS classes added.
- **`POST /api/admin/notifications/retry-failed`**: Finds up to 50 failed push notifications with retryCount < 3, re-sends bypassing the 24h dedup window, updates status/retryCount, returns retried/succeeded/stillFailed/tokensCleaned counts.
- **`GET /api/admin/notifications/stats`**: Aggregates total/sent/failed/successRate/retriable from the notifications table (admin-session protected).
- **Admin "↺ Retry Failed" button**: In Notification History card; POST to retry-failed, shows result summary, auto-refreshes history; success rate % shown with color-coded badge (green ≥90%, amber ≥70%, red <70%).
- **sendPushToUser `skipDedup` option**: New `opts?: { skipDedup?: boolean }` parameter bypasses the 24h dedup check — used for admin-initiated retries.

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
