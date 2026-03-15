import app from "./app";
import { db, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const ADMIN_MOBILES = ["9893989786", "9893225590", "9999999999"];

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
});
