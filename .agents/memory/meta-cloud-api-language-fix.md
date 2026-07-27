---
name: Meta Cloud API language code fix
description: Root cause and fix for #132001 Template name does not exist in the translation error on Meta WhatsApp Cloud API
---

## The fix
`sendMetaTemplate` in `metaWapi.ts` defaulted `language.code` to `"en"` but all ABT templates are registered as `"en_US"` in Meta WABA. Changed default to `"en_US"`.

**Why:** Meta Graph API returns `#132001 Template name does not exist in the translation` when the language code doesn't match the registration language. Templates are visibly APPROVED in meta_templates table but silently rejected at send time. Confirmed: all 6 event-mapped templates (booking_approved, agreement_ready, agreement_signed, invoice_ready, otp_login, payment_received) use `en_US`.

**How to apply:** Always pass `languageCode: "en_US"` or rely on the default. If any future template is registered as `en_GB`, pass the explicit languageCode in opts when calling `sendMetaTemplate`.

## Full Meta Cloud API activation chain (July 2026)
1. `autoSyncBotBeeMetaToken()` in `botbee.ts` — fetches live token from BotBee template JSON at startup, calls `setMetaRuntimeToken()`
2. `setMetaRuntimeToken()` in `metaWapi.ts` — stores token in `_runtimeMetaToken` module var (bypasses esbuild compile-time `META_ACCESS_TOKEN=""` define)
3. `isMetaWapiConfigured()` — returns true only when `_runtimeMetaToken` is set
4. `syncMetaTemplates()` — syncs 42 templates from Meta WABA into `meta_templates` table with event_type mapping
5. `sendTemplate()` PRIMARY PATH in `botbee.ts` — when `isMetaWapiConfigured()=true`, looks up `meta_templates` by event_type, calls `sendMetaTemplate` with `en_US`
6. `logMetaResult()` in `metaWapi.ts` — logs to `notification_logs` with `sent_at=NOW()` when status='sent'

## Production confirmed working (July 27 2026)
- 3 consecutive live wamids returned from `https://graph.facebook.com/v20.0/965912196611113/messages`
- `notification_logs` shows `sent_at` populated, single row per delivery (no duplicates)
- All 8 template variables resolved correctly (zero undefined_variables)
- 48,738 permanently_failed entries are HISTORICAL (pre-fix), no new failures after en_US fix
