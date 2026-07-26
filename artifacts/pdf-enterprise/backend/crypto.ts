import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENCRYPTION_KEY_ENV = process.env.PDF_ENCRYPTION_KEY;
// Derive a 32-byte key from the env var or use a default (should be overridden in production)
const RAW_KEY = ENCRYPTION_KEY_ENV || "pdf-enterprise-aes256-default-key-2024!";

function getKey(): Buffer {
  return crypto.createHash("sha256").update(RAW_KEY).digest();
}

export function encryptFile(inputPath: string, outputPath: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const input = fs.readFileSync(inputPath);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: [4 bytes IV len][IV][16 bytes authTag][encrypted data]
  const result = Buffer.concat([
    Buffer.from([iv.length]),
    iv,
    authTag,
    encrypted,
  ]);
  fs.writeFileSync(outputPath, result);
  return outputPath;
}

export function encryptBuffer(data: Buffer): Buffer {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([iv.length]), iv, authTag, encrypted]);
}

export function decryptBuffer(data: Buffer): Buffer {
  const key = getKey();
  const ivLen = data[0];
  const iv = data.slice(1, 1 + ivLen);
  const authTag = data.slice(1 + ivLen, 1 + ivLen + 16);
  const encrypted = data.slice(1 + ivLen + 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function decryptFile(encryptedPath: string): Buffer {
  const data = fs.readFileSync(encryptedPath);
  return decryptBuffer(data);
}

export function computeChecksum(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function secureDelete(filePath: string): void {
  try {
    const size = fs.statSync(filePath).size;
    const fd = fs.openSync(filePath, "r+");
    // Overwrite with random data 3 times (DoD 5220.22-M standard)
    for (let pass = 0; pass < 3; pass++) {
      const random = crypto.randomBytes(size);
      fs.writeSync(fd, random, 0, size, 0);
      fs.fsyncSync(fd);
    }
    fs.closeSync(fd);
    fs.unlinkSync(filePath);
  } catch (err) {
    // Best effort; still try to unlink
    try { fs.unlinkSync(filePath); } catch {}
  }
}

export function getStoragePath(filename: string): string {
  const storageDir = path.join(__dirname, "../storage/files");
  return path.join(storageDir, filename);
}

export function getTempPath(filename: string): string {
  const tempDir = path.join(__dirname, "../storage/temp");
  return path.join(tempDir, filename);
}

export function getBackupPath(filename: string): string {
  const backupDir = path.join(__dirname, "../storage/backups");
  return path.join(backupDir, filename);
}
