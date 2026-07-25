// @ts-nocheck
import { Router } from "express";
import { db, packageRequestsTable, packagesTable, bookingsTable, customerProfilesTable, pilgrimsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth.js";
import multer from "multer";
import { uploadToGCS } from "../lib/gcsUpload.js";
import { triggerWorkflow } from "../lib/workflowEngine.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPG, PNG, WebP and PDF files are allowed"));
  },
});

const detailsUpload = upload.fields([
  { name: "photo", maxCount: 1 },
]);

const router = Router();

function generateBookingNumber(): string {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ABT${yy}${mm}${rand}`;
}

// All customer notifications route through the Communication Engine
async function notifyCustomerRequestReceived(opts: { mobile: string; customerName: string; packageName: string; bookingId?: string }) {
  await triggerWorkflow("request_submitted", {
    customerName: opts.customerName, customerMobile: opts.mobile,
    packageName: opts.packageName, bookingId: opts.bookingId,
  }).catch(console.error);
}

async function notifyCustomerRequestApproved(opts: { mobile: string; customerName: string; packageName: string; bookingId?: string }) {
  await triggerWorkflow("request_approved", {
    customerName: opts.customerName, customerMobile: opts.mobile,
    packageName: opts.packageName, bookingId: opts.bookingId,
  }).catch(console.error);
}

async function notifyCustomerRequestRejected(opts: { mobile: string; customerName: string; packageName: string; reason?: string | null; bookingId?: string }) {
  await triggerWorkflow("request_rejected", {
    customerName: opts.customerName, customerMobile: opts.mobile,
    packageName: opts.packageName, bookingId: opts.bookingId,
  }).catch(console.error);
}

async function notifyCustomerDetailsSubmitted(opts: { mobile: string; customerName: string; packageName: string; bookingId?: string }) {
  await triggerWorkflow("request_details_submitted", {
    customerName: opts.customerName, customerMobile: opts.mobile,
    packageName: opts.packageName, bookingId: opts.bookingId,
  }).catch(console.error);
}

async function notifyAdminNewRequest(opts: { customerName: string; customerMobile: string; packageName: string }) {
  // Admin-only direct alert kept intentionally for real-time ops awareness
  const { sendWhatsApp } = await import("../lib/notifications.js");
  const msg = `New Package Request!\n\nCustomer: ${opts.customerName}\nMobile: ${opts.customerMobile}\nPackage: ${opts.packageName}\n\nReview in admin dashboard → Requests.`;
  await Promise.allSettled([
    sendWhatsApp("9893989786", msg),
    sendWhatsApp("8989701701", msg),
  ]);
}

router.post("/", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const { packageId, message } = req.body;
    if (!packageId) {
      res.status(400).json({ message: "packageId is required" });
      return;
    }

    const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, packageId)).limit(1);
    const pkg = pkgs[0];
    if (!pkg) {
      res.status(404).json({ message: "Package not found" });
      return;
    }

    const [request] = await db.insert(packageRequestsTable).values({
      customerId: req.user!.id,
      packageId,
      packageName: pkg.name,
      customerName: req.user!.name || "Customer",
      customerMobile: req.user!.mobile,
      message: message || null,
      status: "pending",
    }).returning();

    notifyAdminNewRequest({
      customerName: request.customerName,
      customerMobile: request.customerMobile,
      packageName: pkg.name,
    }).catch(console.error);

    notifyCustomerRequestReceived({
      mobile: request.customerMobile,
      customerName: request.customerName,
      packageName: pkg.name,
    }).catch(console.error);

    res.status(201).json(request);
  } catch (err: any) {
    console.error("[requests] POST / error:", err);
    res.status(500).json({ message: err?.message || "Failed to create request" });
  }
});

router.get("/", requireAuth as any, async (req: AuthenticatedRequest, res) => {
  try {
    const requests = await db
      .select()
      .from(packageRequestsTable)
      .where(eq(packageRequestsTable.customerId, req.user!.id))
      .orderBy(desc(packageRequestsTable.createdAt));
    res.json(requests);
  } catch (err: any) {
    console.error("[requests] GET / error:", err);
    res.status(500).json({ message: err?.message || "Failed to fetch requests" });
  }
});

router.post("/:id/submit-details", requireAuth as any, detailsUpload as any, async (req: AuthenticatedRequest, res) => {
  try {
    const files = (req as any).files as Record<string, Express.Multer.File[]>;
    const body = req.body;

    const requests = await db
      .select()
      .from(packageRequestsTable)
      .where(
        and(
          eq(packageRequestsTable.id, req.params.id),
          eq(packageRequestsTable.customerId, req.user!.id)
        )
      )
      .limit(1);
    const request = requests[0];

    if (!request) {
      res.status(404).json({ message: "Request not found" });
      return;
    }
    if (request.status !== "approved") {
      res.status(400).json({ message: "Request must be approved before submitting details" });
      return;
    }

    let photoUrl: string | null = null;
    if (files?.photo?.[0]) {
      photoUrl = await uploadToGCS(files.photo[0].buffer, files.photo[0].originalname, files.photo[0].mimetype, "passport_photos");
    }

    const profileData: any = {
      updatedAt: new Date(),
    };
    if (body.name) profileData.name = body.name;
    if (body.dateOfBirth) profileData.dateOfBirth = body.dateOfBirth;
    if (body.gender) profileData.gender = body.gender;
    if (body.address) profileData.address = body.address;
    if (body.passportNumber) profileData.passportNumber = body.passportNumber;
    if (body.passportIssueDate) profileData.passportIssueDate = body.passportIssueDate;
    if (body.passportExpiryDate) profileData.passportExpiryDate = body.passportExpiryDate;
    if (body.passportPlaceOfIssue) profileData.passportPlaceOfIssue = body.passportPlaceOfIssue;
    if (photoUrl) profileData.photoUrl = photoUrl;

    const existingProfile = await db
      .select()
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.userId, req.user!.id))
      .limit(1);

    if (existingProfile[0]) {
      await db
        .update(customerProfilesTable)
        .set(profileData)
        .where(eq(customerProfilesTable.userId, req.user!.id));
    } else {
      await db.insert(customerProfilesTable).values({
        userId: req.user!.id,
        ...profileData,
      });
    }

    if (request.groupId && request.pilgrimId) {
      const updatedPilgrims = await db
        .update(pilgrimsTable)
        .set({
          fullName: body.name || request.customerName,
          passportNumber: body.passportNumber || null,
          dateOfBirth: body.dateOfBirth || null,
          gender: body.gender || null,
          address: body.address || null,
          ...(photoUrl ? { photoUrl } : {}),
          passportIssueDate: body.passportIssueDate || null,
          passportExpiryDate: body.passportExpiryDate || null,
          passportPlaceOfIssue: body.passportPlaceOfIssue || null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(pilgrimsTable.id, request.pilgrimId),
            eq(pilgrimsTable.groupId, request.groupId)
          )
        )
        .returning();
      if (!updatedPilgrims[0]) {
        console.warn(`[requests] submit-details: assigned pilgrim ${request.pilgrimId} not found in group ${request.groupId} for request ${request.id} — pilgrim may have been deleted`);
      }
    }

    if (request.bookingId) {
      if (!request.pilgrimId) {
        const existingPilgrims = await db
          .select()
          .from(pilgrimsTable)
          .where(eq(pilgrimsTable.groupId, `booking:${request.bookingId}`))
          .limit(1);

        if (!existingPilgrims[0]) {
          await db.insert(pilgrimsTable).values({
            groupId: `booking:${request.bookingId}`,
            serialNumber: 1,
            fullName: body.name || request.customerName,
            passportNumber: body.passportNumber || null,
            dateOfBirth: body.dateOfBirth || null,
            gender: body.gender || null,
            address: body.address || null,
            photoUrl: photoUrl || null,
            mobileIndia: request.customerMobile,
          });
        }
      }

      await db
        .update(bookingsTable)
        .set({
          customerName: body.name || request.customerName,
          status: "confirmed",
          updatedAt: new Date(),
        })
        .where(eq(bookingsTable.id, request.bookingId));
    }

    notifyCustomerDetailsSubmitted({
      mobile: request.customerMobile,
      customerName: body.name || request.customerName,
      packageName: request.packageName ?? "Package",
    }).catch(console.error);

    res.json({ message: "Details submitted successfully" });
  } catch (err: any) {
    console.error("[requests] POST /:id/submit-details error:", err);
    res.status(500).json({ message: err?.message || "Failed to submit details" });
  }
});

export default router;
