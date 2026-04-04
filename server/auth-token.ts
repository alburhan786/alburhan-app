import { createHmac, timingSafeEqual } from 'crypto';

function getDeviceTokenKey(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return createHmac('sha256', secret).update('device-token-auth-v1').digest('hex');
}

export function signUserId(userId: number): string {
  return createHmac('sha256', getDeviceTokenKey())
    .update(String(userId))
    .digest('hex');
}

export function verifyUserToken(userId: number, token: string): boolean {
  try {
    const expected = signUserId(userId);
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(token, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
