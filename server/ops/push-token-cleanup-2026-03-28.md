# Push Token Cleanup — 2026-03-28

## Issue
The Expo push token stored for userId=2 (iOS, Mohammed Altaf) was corrupted —
missing one hyphen character in the token string:

- Corrupted (DB): `ExponentPushToken[N2GGy8HiS1JFnFUfAEe-_2]`  (41 chars, invalid)
- Real token:     `ExponentPushToken[N2GGy8Hi-S1JFnFUfAEe-_2]`  (42 chars, correct)

Expo's Push API silently rejects invalid tokens, so all device pushes failed
without any server-side error.

## Action Taken
SQL executed against the production database (DATABASE_URL):

```sql
DELETE FROM device_tokens WHERE user_id = 2 AND platform = 'ios';
```

Result: 1 row deleted. Table now contains only the Android row for userId=1 (no token).

## Recovery
User (Mohammed Altaf) must log in to the Expo app again. On login, the app
calls `POST /api/user/device-token` which saves the current valid Expo push token.
All subsequent push notifications will use the correct token.

## Verification
After user re-login, run:
```sql
SELECT user_id, platform, expo_push_token, length(expo_push_token) FROM device_tokens WHERE user_id = 2;
```
Expected: expo_push_token length = 42 (not 41).

## Related code changes
- server/routes.ts: All Expo push call sites now log token suffixes and full
  Expo API response JSON before/after each send.
- server/templates/admin-dashboard.html: Added "Test Push Notification" card
  in admin panel — enter User ID or raw token to send test push.
- POST /api/admin/test-push now accepts userId (looks up stored token) or
  falls back to raw expoPushToken.
