---
name: OTP delivery channel ordering (Al Burhan)
description: Fast2SMS is the primary OTP channel; WhatsApp is fire-and-forget secondary, never blocks the response.
---

Fast2SMS SMS is the sole channel the OTP send-otp response depends on. WhatsApp send is fired after `res.json()` already returned and its result/error is only logged, never surfaced in the API response or awaited.

**Why:** WhatsApp Business API legitimately rejects session messages outside the 24h customer-initiated window ("Sending message outside 24 hour window is not allowed... only template message"). Treating that as a delivery failure (or awaiting it) previously added latency and produced misleading `waSent`/`whatsappSent` failure states even when the SMS OTP had already succeeded.

**How to apply:** Any future channel (RCS, email, push) added to the OTP flow should follow the same pattern — one authoritative primary channel the client waits on, everything else best-effort and logged with its own `[OTP-SEND][<channel>]` prefix after the response is sent.
