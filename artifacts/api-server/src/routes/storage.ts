import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError, objectStorageClient } from "../lib/objectStorage.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * GET /storage/public-objects/*filePath
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * No authentication required.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value: string, key: string) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("[storage] Error serving public object:", error);
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*path
 *
 * Serve uploaded files from Object Storage.
 * Files under "private_uploads/" require an authenticated session.
 * Files under "uploads/" (gallery, package images) are publicly accessible.
 *
 * Files are stored by gcsUpload.ts at GCS key: objects/{wildcardPath}
 * in the DEFAULT_OBJECT_STORAGE_BUCKET_ID bucket.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;

    if (wildcardPath.startsWith("private_uploads/")) {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) {
      res.status(500).json({ error: "Object storage not configured" });
      return;
    }

    const gcsKey = `objects/${wildcardPath}`;
    const objectFile = objectStorageClient.bucket(bucketId).file(gcsKey);
    const [exists] = await objectFile.exists();
    if (!exists) {
      res.status(404).json({ error: "Object not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value: string, key: string) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("[storage] Error serving object:", error);
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
