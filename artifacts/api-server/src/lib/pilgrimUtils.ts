import { db, pilgrimsTable } from "@workspace/db";
import { eq, and, max } from "drizzle-orm";

type ProfileForPilgrim = {
  name?: string | null;
  passportNumber?: string | null;
  passportIssueDate?: string | null;
  passportExpiryDate?: string | null;
  passportPlaceOfIssue?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  bloodGroup?: string | null;
  address?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
};

export async function upsertPilgrimFromProfile(
  groupId: string,
  profile: ProfileForPilgrim,
  fallbackName: string,
  fallbackMobile: string,
): Promise<typeof pilgrimsTable.$inferSelect> {
  const salutation = profile.gender === "male" ? "Haji" : profile.gender === "female" ? "Hajjah" : "";

  const pilgrimData = {
    fullName: profile.name || fallbackName,
    salutation,
    passportNumber: profile.passportNumber || null,
    passportIssueDate: profile.passportIssueDate || null,
    passportExpiryDate: profile.passportExpiryDate || null,
    passportPlaceOfIssue: profile.passportPlaceOfIssue || null,
    dateOfBirth: profile.dateOfBirth || null,
    gender: profile.gender || null,
    bloodGroup: profile.bloodGroup || null,
    address: profile.address || null,
    mobileIndia: profile.phone || fallbackMobile,
    photoUrl: profile.photoUrl || null,
    updatedAt: new Date(),
  };

  const existingByPassport = profile.passportNumber
    ? await db.select().from(pilgrimsTable)
        .where(and(eq(pilgrimsTable.groupId, groupId), eq(pilgrimsTable.passportNumber, profile.passportNumber)))
        .limit(1)
    : [];

  if (existingByPassport[0]) {
    const [updated] = await db
      .update(pilgrimsTable)
      .set(pilgrimData)
      .where(eq(pilgrimsTable.id, existingByPassport[0].id))
      .returning();
    return updated;
  }

  const [{ maxSerial }] = await db
    .select({ maxSerial: max(pilgrimsTable.serialNumber) })
    .from(pilgrimsTable)
    .where(eq(pilgrimsTable.groupId, groupId));

  const [created] = await db
    .insert(pilgrimsTable)
    .values({ ...pilgrimData, groupId, serialNumber: (maxSerial || 0) + 1 })
    .returning();
  return created;
}
