---
name: Comms E2E channel verification July 2026
description: Results of 10-channel E2E communication system verification; test-resend diagnostic endpoint; VPS deployment challenge
---

# E2E Communication System Verification — July 26, 2026

## Test-resend diagnostic endpoint
`POST /api/migrate/test-resend?key=alburhan-migrate-2026`
- No admin session needed (uses migration key)
- Auto-picks best test booking from DB (prefers one with payment+docs+agreement)
- Returns JSON report: `{summary:{total,ok,fail}, results:{whatsapp,sms,email,...}}`
- Tests: WhatsApp (BotBee template), SMS (Fast2SMS DLT), Email (SMTP), Invoice PDF, Receipt PDF, Agreement, Customer Dashboard notification

## Dev server results (ABT26UAT01 — all 7/7 ok)
- WhatsApp: ok, wamid=— (BotBee returns 200 without wamid for templates), 2657ms
- SMS: ok, sent, 329ms
- Email: ok, sent to ramesh.uat@test.com, 1662ms
- Invoice PDF via WhatsApp: ok, 223KB, 3373ms
- Receipt PDF via WhatsApp: ok, 223KB, 2196ms
- Agreement via WhatsApp: ok, AGR-UAT-001, 1179ms
- Customer dashboard notification: ok, 15ms

## Production webhook tests (alburhantravels.replit.app)
- Facebook Lead Ads: POST /api/social-media/webhook/meta → `{"ok":true}`
- Instagram DM: POST /api/social-media/webhook/meta → `{"ok":true}`
- BotBee DLR: POST /api/webhook/botbee → `{"ok":true,"received":true}`
- SMS DLR: POST /api/webhook/sms-dlr → `{"ok":true}`
- VAPID push key: GET /api/push/vapid-key → publicKey confirmed

## Lead flow architecture (verified)
- autoCreateLeadFromMessage(): in social-media.ts, called on all FB/IG messages
- lead_assignment_rules table: auto-assigns by platform + agent mapping
- POST /leads/:id/assign in enterprise.ts: manual assignment

## VPS deployment challenge
- VPS at 2.57.91.91 (alburhantravels.online) NOT reachable from Replit's network
- exit code 92 (HTTP/2 stream error) or empty response on all outbound curl attempts
- Replit production: alburhantravels.replit.app (autoscale, hasSuccessfulBuild:true)

## VPS self-update command (run from VPS SSH):
```bash
curl -X POST "http://localhost:3000/api/migrate/self-update?key=alburhan-migrate-2026" \
  -H "Content-Type: application/json" \
  -d '{"source":"https://57456384-023a-43e4-a60f-e6d8f967d324-00-vmg20t5z0q5l.spock.replit.dev/api/migrate/server.cjs?key=alburhan-migrate-2026"}'
```
Must run `pnpm --filter @workspace/api-server run build` FIRST to get fresh bundle.

**Why:** VPS has PM2; process.exit(0) causes PM2 to restart with new bundle. Must use localhost (not external domain) because VPS doesn't serve HTTPS on raw IP.
