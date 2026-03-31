import app from "./app";
import { db, usersTable, packagesTable } from "@workspace/db";
import { inArray, eq, and, like } from "drizzle-orm";
import { ADMIN_MOBILES } from "./routes/auth.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);

  try {
    await db.update(usersTable)
      .set({ role: "admin" })
      .where(inArray(usersTable.mobile, ADMIN_MOBILES));
    console.log("[Startup] Admin roles synced for ADMIN_MOBILES");
  } catch (err) {
    console.error("[Startup] Failed to sync admin roles:", err);
  }

  try {
    await db.update(packagesTable)
      .set({ imageUrl: null })
      .where(and(eq(packagesTable.type, 'iraq_ziyarat'), like(packagesTable.imageUrl, '/uploads/%')));
    console.log("[Startup] Cleared wrong uploaded images from iraq_ziyarat packages");
  } catch (err) {
    console.error("[Startup] Failed to clear iraq_ziyarat wrong images:", err);
  }
});
