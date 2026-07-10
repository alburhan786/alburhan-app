const FAST2SMS_PLACEHOLDER_VALUES = new Set([
  "your_key_here",
  "your-fast2sms-key-here",
  "YOUR_API_KEY",
  "YOUR_NEW_API_KEY",
  "your_api_key",
  "your_new_api_key",
  "changeme",
  "null",
  "",
]);

export function isPlaceholderKey(k: string | undefined | null): boolean {
  if (!k) return true;
  return FAST2SMS_PLACEHOLDER_VALUES.has(k.trim());
}
