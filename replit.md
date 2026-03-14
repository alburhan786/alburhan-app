# Al Burhan Tours & Travels - Booking System

## Overview

Full-stack online booking system for Al Burhan Tours & Travels — a Hajj/Umrah travel company with 35+ years experience. Supports a booking approval workflow, Razorpay payments, SMS/WhatsApp notifications, and document management.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/alburhan)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Auth**: OTP login via Fast2SMS + session cookies
- **Payments**: Razorpay (UPI, Card, Net Banking)
- **Notifications**: Fast2SMS (SMS/OTP) + BotBee (WhatsApp)

## Booking Workflow

1. Customer browses packages → clicks "Request Booking"
2. Booking created with status: **PENDING**
3. Admin reviews in dashboard → **Approve** or **Reject**
4. If Approved → customer notified via SMS + WhatsApp
5. Customer logs in → clicks "Pay Now" → Razorpay checkout
6. Payment verified → status: **CONFIRMED**
7. Invoice generated → customer notified

## Structure

```text
artifacts/
├── alburhan/           # React + Vite frontend (serves at /)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── public/        # Home, Packages, PackageDetail, Ziyarat, Blog, About, Contact, Legal
│   │   │   ├── auth/          # Login (OTP flow)
│   │   │   ├── customer/      # Customer dashboard
│   │   │   └── admin/         # Admin dashboard, bookings, packages
│   │   ├── components/
│   │   │   └── layout/        # MainLayout, AdminLayout
│   │   └── hooks/
│   │       ├── use-auth.ts    # Auth state & OTP login
│   │       └── use-payment.ts # Razorpay payment flow
│   └── public/images/         # AI-generated brand images
│
└── api-server/         # Express 5 backend (serves at /api)
    └── src/
        ├── routes/
        │   ├── auth.ts         # OTP login/verify/logout
        │   ├── packages.ts     # Package CRUD
        │   ├── bookings.ts     # Booking management + approve/reject
        │   ├── payments.ts     # Razorpay order + verify
        │   ├── documents.ts    # File upload management
        │   ├── gallery.ts      # Image gallery CRUD (admin upload, public list)
        │   ├── notifications.ts# Send SMS/WhatsApp to customers
        │   ├── admin.ts        # Stats + customer list + inquiries
        │   └── inquiry.ts      # Public inquiry form
        └── lib/
            ├── auth.ts         # Session middleware, requireAuth/requireAdmin
            └── notifications.ts # Fast2SMS + BotBee WhatsApp API

lib/
├── api-spec/openapi.yaml  # OpenAPI 3.1 spec (source of truth)
├── api-client-react/      # Generated React Query hooks
├── api-zod/               # Generated Zod validation schemas
└── db/src/schema/
    ├── users.ts
    ├── otps.ts
    ├── packages.ts
    ├── bookings.ts
    ├── documents.ts
    ├── gallery.ts
    └── inquiries.ts
```

## Environment Variables (Secrets)

- `DATABASE_URL` — PostgreSQL connection
- `SESSION_SECRET` — Express session secret
- `FAST2SMS_API_KEY` — For OTP login and SMS notifications
- `RAZORPAY_KEY_ID` — Razorpay key ID
- `RAZORPAY_SECRET` — Razorpay secret key
- `BOTBEE_API_KEY` — BotBee WhatsApp API key
- `BOTBEE_PHONE_NUMBER_ID` — BotBee phone number ID
- `BOTBEE_BUSINESS_ID` — BotBee business ID
- `ADMIN_MOBILE` — (optional) Admin mobile for new inquiry alerts

## Admin Access

Default admin mobile: `9999999999` (role set in DB)
To add more admins, update user role in DB: `UPDATE users SET role = 'admin' WHERE mobile = 'XXXXXXXXXX';`

## Package Types

- `umrah` — Standard Umrah packages
- `ramadan_umrah` — Ramadan Umrah packages
- `hajj` — Hajj 2027 packages
- `special_hajj` — VIP Hajj packages
- `iraq_ziyarat` — Iraq Ziyarat packages
- `baitul_muqaddas` — Baitul Muqaddas packages
- `syria_ziyarat` — Syria Ziyarat packages
- `jordan_heritage` — Jordan Heritage packages

All prices exclude 5% GST (added at checkout).

## Package Details (JSONB)

Packages have a `details` JSONB column for structured fields:
- `airline`, `departureCities[]`, `returnDate`
- `hotelMakkah`, `hotelMadinah`, `hotelCategoryMakkah`, `hotelCategoryMadinah`
- `distanceMakkah`, `distanceMadinah`
- `roomType`, `mealPlan`, `transport`, `visa`

## Notifications

- **OTP**: Sent via SMS (Fast2SMS DLT template) + WhatsApp (BotBee)
- **Booking Submitted**: Customer gets SMS + WhatsApp; Admin gets WhatsApp alerts (9893989786, 9893225590)
- **Booking Approved/Rejected**: Customer gets SMS + WhatsApp + Email
- **Payment Confirmed**: Customer gets SMS + WhatsApp + Email with invoice number

## Database Commands

- Push schema: `pnpm --filter @workspace/db run push`
- Force push: `pnpm --filter @workspace/db run push-force`

## API Codegen

Run after changing openapi.yaml:
`pnpm --filter @workspace/api-spec run codegen`
