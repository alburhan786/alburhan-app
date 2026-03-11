import { Router } from "express";
import { db, documentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetUploadUrlBody, SaveDocumentBody } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth.js";

const router = Router();

router.post("/upload-url", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const parsed = GetUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const { bookingId, fileName, fileType, documentType } = parsed.data;

  const fileKey = `bookings/${bookingId}/${documentType}/${Date.now()}_${fileName}`;

  const docId = crypto.randomUUID();

  res.json({
    uploadUrl: `/api/documents/direct-upload/${docId}`,
    fileKey,
    documentId: docId,
  });
});

router.get("/:bookingId", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const docs = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.bookingId, req.params.bookingId))
    .orderBy(documentsTable.createdAt);

  res.json(docs.map(d => ({
    ...d,
    createdAt: d.createdAt?.toISOString?.(),
  })));
});

router.post("/", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  const parsed = SaveDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const data = parsed.data;
  const [doc] = await db.insert(documentsTable).values({
    bookingId: data.bookingId,
    documentType: data.documentType as any,
    fileName: data.fileName,
    fileKey: data.fileKey,
    fileUrl: data.fileUrl ?? null,
    uploadedBy: req.user?.role === "admin" ? "admin" : "customer",
  }).returning();

  res.status(201).json({
    ...doc,
    createdAt: doc.createdAt?.toISOString?.(),
  });
});

router.delete("/:id", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  await db.delete(documentsTable).where(eq(documentsTable.id, req.params.id));
  res.json({ message: "Document deleted" });
});

export default router;
