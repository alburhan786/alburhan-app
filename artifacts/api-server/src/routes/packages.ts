import { Router } from "express";
import { db, packagesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreatePackageBody, ListPackagesQueryParams } from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth.js";

const router = Router();

router.get("/", async (req, res) => {
  const parsed = ListPackagesQueryParams.safeParse(req.query);
  const query = parsed.success ? parsed.data : {};

  let conditions: any[] = [];
  if (query.type) conditions.push(eq(packagesTable.type, query.type as any));
  if (query.active !== undefined) conditions.push(eq(packagesTable.isActive, query.active));

  const pkgs = await db
    .select()
    .from(packagesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(packagesTable.createdAt);

  res.json(pkgs.map(formatPackage));
});

router.get("/:id", async (req, res) => {
  const pkgs = await db.select().from(packagesTable).where(eq(packagesTable.id, req.params.id)).limit(1);
  if (!pkgs[0]) {
    res.status(404).json({ message: "Package not found" });
    return;
  }
  res.json(formatPackage(pkgs[0]));
});

router.post("/", requireAdmin as any, async (req, res) => {
  const parsed = CreatePackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid package data", error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const [pkg] = await db.insert(packagesTable).values({
    name: data.name,
    type: data.type as any,
    description: data.description ?? null,
    duration: data.duration ?? null,
    pricePerPerson: String(data.pricePerPerson),
    gstPercent: String(data.gstPercent ?? 5),
    includes: (data.includes as string[]) ?? [],
    highlights: (data.highlights as string[]) ?? [],
    departureDates: (data.departureDates as string[]) ?? [],
    maxPilgrims: data.maxPilgrims ?? null,
    imageUrl: data.imageUrl ?? null,
    isActive: data.isActive ?? true,
  }).returning();
  res.status(201).json(formatPackage(pkg));
});

router.put("/:id", requireAdmin as any, async (req, res) => {
  const parsed = CreatePackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid package data" });
    return;
  }
  const data = parsed.data;
  const [pkg] = await db.update(packagesTable).set({
    name: data.name,
    type: data.type as any,
    description: data.description ?? null,
    duration: data.duration ?? null,
    pricePerPerson: String(data.pricePerPerson),
    gstPercent: String(data.gstPercent ?? 5),
    includes: (data.includes as string[]) ?? [],
    highlights: (data.highlights as string[]) ?? [],
    departureDates: (data.departureDates as string[]) ?? [],
    maxPilgrims: data.maxPilgrims ?? null,
    imageUrl: data.imageUrl ?? null,
    isActive: data.isActive ?? true,
    updatedAt: new Date(),
  }).where(eq(packagesTable.id, req.params.id)).returning();
  if (!pkg) {
    res.status(404).json({ message: "Package not found" });
    return;
  }
  res.json(formatPackage(pkg));
});

router.delete("/:id", requireAdmin as any, async (req, res) => {
  await db.delete(packagesTable).where(eq(packagesTable.id, req.params.id));
  res.json({ message: "Package deleted" });
});

function formatPackage(pkg: any) {
  return {
    ...pkg,
    pricePerPerson: Number(pkg.pricePerPerson),
    gstPercent: Number(pkg.gstPercent),
  };
}

export default router;
