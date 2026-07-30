import cron from "node-cron";
import { db, hajjGroupsTable, pilgrimsTable, bookingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sendWhatsApp } from "../lib/notifications.js";

const PROD_DOMAIN = process.env.PUBLIC_DOMAIN || "https://alburhantravels.online";

const COMPANY_NAMES: Record<string, string> = {
  alburhan: "Al Burhan Tours & Travels",
  horizon: "Horizon Tours & Travels",
};

function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface FeedbackReminderResult {
  sent: number;
  failed: number;
  groupsProcessed: number;
  pilgrims: { name: string; mobile: string; success: boolean }[];
}

export async function sendFeedbackReminders(groupId?: string): Promise<FeedbackReminderResult> {
  let groups;

  if (groupId) {
    // Manual trigger: fetch the specific group
    groups = await db
      .select()
      .from(hajjGroupsTable)
      .where(eq(hajjGroupsTable.id, groupId));
    console.log(`[FeedbackReminder] Manual trigger for group: ${groupId}`);
  } else {
    // Cron trigger: send to groups returning today
    const today = todayString();
    console.log(`[FeedbackReminder] Running for return date: ${today}`);
    groups = await db
      .select()
      .from(hajjGroupsTable)
      .where(eq(hajjGroupsTable.returnDate, today));
  }

  if (groups.length === 0) {
    console.log("[FeedbackReminder] No groups found.");
    return { sent: 0, failed: 0, groupsProcessed: 0, pilgrims: [] };
  }

  let sent = 0;
  let failed = 0;
  const pilgrimResults: { name: string; mobile: string; success: boolean }[] = [];

  for (const group of groups) {
    const companyName = COMPANY_NAMES[group.companyId || "alburhan"] || "Al Burhan Tours & Travels";
    const pilgrims = await db
      .select()
      .from(pilgrimsTable)
      .where(eq(pilgrimsTable.groupId, group.id));

    for (const pilgrim of pilgrims) {
      if (!pilgrim.mobileIndia) continue;

      const booking = await db
        .select({ bookingNumber: bookingsTable.bookingNumber })
        .from(bookingsTable)
        .where(eq(bookingsTable.customerMobile, pilgrim.mobileIndia))
        .limit(1);

      const bookingNumber = booking[0]?.bookingNumber;
      const feedbackUrl = bookingNumber
        ? `${PROD_DOMAIN}/feedback?booking_id=${bookingNumber}`
        : `${PROD_DOMAIN}/feedback`;

      const message = `Assalamu Alaikum ${pilgrim.fullName},\n\nAlhamdulillah! JazakAllah Khair for travelling with *${companyName}* for Hajj ${group.year}.\n\nYour feedback is very important to us. Please share your valuable experience:\n${feedbackUrl}\n\nMay Allah accept your Hajj! Ameen. 🤲\n\n— ${companyName}\n+91 8989701701`;

      let success = false;
      try {
        await sendWhatsApp(pilgrim.mobileIndia, message);
        sent++;
        success = true;
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        failed++;
        console.error(`[FeedbackReminder] Failed for ${pilgrim.mobileIndia}:`, e);
      }
      pilgrimResults.push({ name: pilgrim.fullName || pilgrim.mobileIndia, mobile: pilgrim.mobileIndia, success });
    }
  }

  console.log(`[FeedbackReminder] Sent ${sent}, Failed ${failed} for ${groups.length} group(s).`);
  return { sent, failed, groupsProcessed: groups.length, pilgrims: pilgrimResults };
}

export function startFeedbackReminderCron(): void {
  cron.schedule("0 9 * * *", () => {
    sendFeedbackReminders().catch(console.error);
  }, { timezone: "Asia/Kolkata" });
  console.log("[FeedbackReminder] Cron scheduled: daily at 9:00 AM IST");
}
