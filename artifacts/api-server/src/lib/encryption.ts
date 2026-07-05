import crypto from "crypto";

function getEncryptionKey(): Buffer {
  const raw = process.env.MIGRATION_KEY || process.env.SESSION_SECRET || "alburhan-api-settings-default-key-2026";
  return crypto.createHash("sha256").update(raw).digest();
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return "";
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return "";
  try {
    const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");
    if (!ivHex || !authTagHex || !encryptedHex) return "";
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final("utf8");
  } catch {
    return "";
  }
}

export function maskKey(key: string): string {
  if (!key || key.length < 4) return "****";
  return `${"*".repeat(Math.min(key.length - 4, 12))}${key.slice(-4)}`;
}
