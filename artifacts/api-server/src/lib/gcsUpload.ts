import { objectStorageClient } from "./objectStorage.js";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";

const UPLOADS_DIR = process.env.UPLOADS_DIR ||
  path.resolve(process.cwd(), process.env.NODE_ENV === "production" ? "uploads" : "../../uploads");

function diskFallback(buffer: Buffer, originalName: string, prefix: string): string {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  const sanitized = originalName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const filename = `${prefix.replace(/\//g, "_")}_${Date.now()}_${randomUUID().slice(0, 8)}_${sanitized}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return `/api/documents/files/${filename}`;
}

export async function uploadToGCS(
  buffer: Buffer,
  originalName: string,
  mimetype: string,
  prefix: string = "uploads"
): Promise<string> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;

  if (!bucketId) {
    return diskFallback(buffer, originalName, prefix);
  }

  const sanitized = originalName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const uniquePart = `${Date.now()}_${randomUUID().slice(0, 8)}_${sanitized}`;

  const gcsKey = `objects/${prefix}/${uniquePart}`;
  const bucket = objectStorageClient.bucket(bucketId);
  await bucket.file(gcsKey).save(buffer, {
    contentType: mimetype,
    resumable: false,
  });

  return `/api/storage/objects/${prefix}/${uniquePart}`;
}

export async function deleteFromGCS(objectPath: string): Promise<void> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;

  if (objectPath.startsWith("/api/documents/files/")) {
    try {
      const filename = path.basename(objectPath);
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      console.error("[upload] Failed to delete disk file:", objectPath);
    }
    return;
  }

  if (!bucketId || !objectPath.startsWith("/api/storage/objects/")) return;
  try {
    const tail = objectPath.replace("/api/storage/objects/", "");
    const gcsKey = `objects/${tail}`;
    await objectStorageClient.bucket(bucketId).file(gcsKey).delete({ ignoreNotFound: true });
  } catch {
    console.error("[GCS] Failed to delete:", objectPath);
  }
}
