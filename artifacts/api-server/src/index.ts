import app from "./app";
import { db, usersTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
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

});
