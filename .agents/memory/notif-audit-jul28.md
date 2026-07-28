---
name: Notification audit July 2026 findings
description: Root causes and fixes for all 5 notification channels — WhatsApp, SMS, Email, Push, RCS
---

## WhatsApp
- Template-based sends (booking_approved/payment_received/agreement_ready/agreement_signed/invoice_ready) are WORKING
- Mobile OTP WhatsApp fails "24h window" — no OTP template in BotBee; this is EXPECTED (SMS is primary OTP)
- 46K+ "permanently_failed" in notification_logs are HISTORICAL cleanup of deprecated template 333473 (not active failures)
- `window24h: true` flag added to sendWhatsApp() returns for 24h errors (callers can log as "skipped")
- send-test-all now uses sendTemplate("409950") instead of plain text (plain text always fails outside 24h)

## SMS  
- OTP SMS: working on DLT route, sender=ALBURH, template=164844
- custom_sms/custom_admin events: BLOCKED — no DLT template IDs registered with TRAI
- resolveConfig in sms.ts now maps custom/custom_sms/custom_admin/agreement_ready/agreement_signed events
- notification_templates seeded with placeholder rows for these events (enabled=false, no dlt_template_id)
- Admin must register DLT templates with TRAI and add IDs via DLT Template Manager UI
- All SMS sender IDs updated ABURHA→ALBURH in notification_templates

## Email
- 83.7% delivery rate ✅
- send-test-all had a bug: email format validation missing — was sending phone number as email address (EENVELOPE error)
- Fixed: regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` validation added before sendEmail in send-test-all

## Push
- 10% delivery rate — only 1 customer token registered, VAPID keys NOT configured in api_settings
- Need to generate VAPID keys and add to api_settings to enable web push
- customer_push_tokens table exists but no admin tokens

## RCS
- 0% — Lemin AI not configured (no api_settings row for lemin)
- 34 RCS attempts all failed

## system-health.ts
- delivery_rates section added: queries notification_logs last 7 days, reports per-channel sent/failed/rate
