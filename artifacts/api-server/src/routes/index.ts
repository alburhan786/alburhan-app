import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import packagesRouter from "./packages.js";
import bookingsRouter from "./bookings.js";
import paymentsRouter from "./payments.js";
import documentsRouter from "./documents.js";
import notificationsRouter from "./notifications.js";
import adminRouter from "./admin.js";
import inquiryRouter from "./inquiry.js";
import galleryRouter from "./gallery.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/packages", packagesRouter);
router.use("/bookings", bookingsRouter);
router.use("/payments", paymentsRouter);
router.use("/documents", documentsRouter);
router.use("/notifications", notificationsRouter);
router.use("/admin", adminRouter);
router.use("/inquiry", inquiryRouter);
router.use("/gallery", galleryRouter);

export default router;
