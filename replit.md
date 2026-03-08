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
  - `app/(auth)/` — login and register screens
  - `app/(tabs)/` — main tab layout (Home, Bookings, Profile)
  - `app/package/[id]` — package detail screen
  - `app/booking/create` — booking creation flow
  - `app/booking/[id]` — booking detail and payment screen
- **State**: React Context (AuthContext) + TanStack React Query
- **Persistence**: AsyncStorage for user session
- **Styling**: Islamic green (#047857) primary, gold (#D97706) secondary

### Backend (Express.js)

- **Port**: 5000
- **Entry**: `server/index.ts` (CORS, landing page, Expo manifest)
- **Routes**: `server/routes.ts`
  - `POST /api/auth/register` and `POST /api/auth/login`
  - `GET /api/packages` and `GET /api/packages/:id`
  - `POST /api/bookings`, `GET /api/bookings/user/:userId`, `GET /api/bookings/:id`
  - `POST /api/payments/create-order` and `POST /api/payments/verify`
  - `POST /api/documents/upload` and `GET /api/documents/user/:userId`
  - `POST /api/seed` — seeds 4 sample packages

### Database (PostgreSQL)

- **ORM**: Drizzle ORM with `pg` driver
- **Config**: `drizzle.config.ts`
- **Schema** (`shared/schema.ts`): users, packages, bookings, payments, notifications, documents
- **Connection**: `server/db.ts` using DATABASE_URL

### Key Files

| File | Purpose |
|---|---|
| `server/index.ts` | Express server setup (CORS, landing page, error handler) |
| `server/routes.ts` | All API route handlers |
| `server/db.ts` | Database connection |
| `shared/schema.ts` | Drizzle schema definitions |
| `app/_layout.tsx` | Root layout with providers (fonts, error boundary, query client, auth) |
| `app/(tabs)/_layout.tsx` | Tab navigation (Home, Bookings, Profile) |
| `services/api.ts` | API service functions using fetch + getApiUrl() |
| `contexts/AuthContext.tsx` | Authentication context provider |
| `constants/Colors.ts` | Theme colors |
| `lib/query-client.ts` | React Query client with default fetcher |

### Dependencies

- expo, expo-router, express, drizzle-orm, pg, bcryptjs
- @tanstack/react-query, @react-native-async-storage/async-storage
- @expo/vector-icons (Ionicons for tab icons)
- @react-native-picker/picker (filter dropdowns)

### Environment Variables

| Variable | Description |
|---|---|
| DATABASE_URL | PostgreSQL connection (auto-set by Replit) |
| EXPO_PUBLIC_DOMAIN | API domain for mobile app (auto-set in dev) |
| REPLIT_DEV_DOMAIN | Replit domain for CORS (auto-set) |
