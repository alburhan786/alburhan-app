import { objectStorageClient } from "./objectStorage.js";
import { randomUUID } from "crypto";

export async function uploadToGCS(
  buffer: Buffer,
  originalName: string,
  mimetype: string,
  prefix: string = "uploads"
): Promise<string> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");

  const sanitized = originalName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const uniquePart = `${Date.now()}_${randomUUID().slice(0, 8)}_${sanitized}`;

  // GCS key includes "objects/" prefix so the storage serving route
  // can resolve it via PRIVATE_OBJECT_DIR (which ends in "/objects")
  const gcsKey = `objects/${prefix}/${uniquePart}`;
  const bucket = objectStorageClient.bucket(bucketId);
  await bucket.file(gcsKey).save(buffer, {
    contentType: mimetype,
    resumable: false,
  });

  // Serving URL: GET /api/storage/objects/<prefix>/<uniquePart>
  // The route handler prepends "/objects/" internally, resolving to gcsKey above
  return `/api/storage/objects/${prefix}/${uniquePart}`;
}

export async function deleteFromGCS(objectPath: string): Promise<void> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId || !objectPath.startsWith("/api/storage/objects/")) return;
  try {
    // Convert serving URL back to GCS key: add "objects/" prefix
    const tail = objectPath.replace("/api/storage/objects/", "");
    const gcsKey = `objects/${tail}`;
    await objectStorageClient.bucket(bucketId).file(gcsKey).delete({ ignoreNotFound: true });
  } catch {
    console.error("[GCS] Failed to delete:", objectPath);
  }
}
