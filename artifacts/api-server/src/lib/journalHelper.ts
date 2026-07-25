import { pool } from "@workspace/db";

const CAT_TO_CODE: Record<string, string> = {
  flights: "5001", hotels: "5002", visa: "5003", transport: "5004",
  food: "5005", laundry: "5006", zamzam: "5007", salary: "5008",
  marketing: "5009", office: "5010",
};

let _cache: Record<string, string | null> = {};
export function clearAccountCache() { _cache = {}; }

async function acctId(code: string): Promise<string | null> {
  if (code in _cache) return _cache[code];
  const r = await pool.query(`SELECT id FROM accounts WHERE code=$1 LIMIT 1`, [code]);
  _cache[code] = r.rows[0]?.id ?? null;
  return _cache[code];
}

async function nextNum(source: string, prefix: string): Promise<string> {
  const r = await pool.query(`SELECT COUNT(*) FROM journal_entries WHERE source=$1`, [source]);
  return `${prefix}-${String(parseInt(r.rows[0].count) + 1).padStart(5, "0")}`;
}

/**
 * Void (delete) the journal entry for a given source + source_id.
 * Non-fatal — used before re-posting on edit/delete/restore.
 */
export async function voidJournalEntry(source: string, sourceId: string): Promise<void> {
  try {
    await pool.query(
      `DELETE FROM journal_entry_lines WHERE journal_entry_id IN
       (SELECT id FROM journal_entries WHERE source=$1 AND source_id=$2)`,
      [source, sourceId]
    );
    await pool.query(`DELETE FROM journal_entries WHERE source=$1 AND source_id=$2`, [source, sourceId]);
  } catch (err) {
    console.error("[journalHelper] voidJournalEntry (non-fatal):", err);
  }
}

export async function postPaymentJournal(params: {
  txnId: string; amount: number; mode: string; date: string; bookingNumber?: string;
}): Promise<void> {
  try {
    const dup = await pool.query(
      `SELECT id FROM journal_entries WHERE source='payment' AND source_id=$1 LIMIT 1`,
      [params.txnId]
    );
    if (dup.rows.length) return;

    // Resolve booking_number for narration/reference
    let bookingNum = params.bookingNumber;
    if (!bookingNum) {
      const bRes = await pool.query(
        `SELECT b.booking_number FROM payment_transactions pt
         JOIN bookings b ON b.id=pt.booking_id WHERE pt.id=$1`,
        [params.txnId]
      );
      bookingNum = bRes.rows[0]?.booking_number ?? params.txnId;
    }

    const isCash = params.mode === "cash";
    const drId = await acctId(isCash ? "1001" : "1002");
    const crId = await acctId("4001");
    if (!drId || !crId) return; // COA not seeded yet — skip silently

    const num = await nextNum("payment", "REC");
    const { rows: [entry] } = await pool.query(
      `INSERT INTO journal_entries (id, entry_number, date, narration, reference, source, source_id)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,'payment',$5) RETURNING id`,
      [num, params.date, `Customer receipt — ${bookingNum}`, bookingNum, params.txnId]
    );
    await pool.query(
      `INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, debit, credit)
       VALUES (gen_random_uuid()::text,$1,$2,$3,0),
              (gen_random_uuid()::text,$1,$4,0,$3)`,
      [entry.id, drId, params.amount, crId]
    );
  } catch (err) {
    console.error("[journalHelper] postPaymentJournal (non-fatal):", err);
  }
}

/**
 * Auto-post a double-entry journal entry when an expense is recorded.
 * Dr: Expense Account (500x) — Cr: Cash (1001) or Bank (1002)
 * Non-fatal: errors are logged but never propagated.
 */
export async function postExpenseJournal(params: {
  expId: string; amount: number; category: string;
  paymentMethod: string; date: string; description: string;
  invoiceNumber?: string | null;
}): Promise<void> {
  try {
    const dup = await pool.query(
      `SELECT id FROM journal_entries WHERE source='expense' AND source_id=$1 LIMIT 1`,
      [params.expId]
    );
    if (dup.rows.length) return;

    const expCode = CAT_TO_CODE[params.category] ?? "5011";
    const drId = await acctId(expCode);
    const crId = await acctId(params.paymentMethod === "cash" ? "1001" : "1002");
    if (!drId || !crId) return;

    const num = await nextNum("expense", "EXP");
    const { rows: [entry] } = await pool.query(
      `INSERT INTO journal_entries (id, entry_number, date, narration, reference, source, source_id)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,'expense',$5) RETURNING id`,
      [num, params.date, params.description, params.invoiceNumber ?? null, params.expId]
    );
    await pool.query(
      `INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, debit, credit)
       VALUES (gen_random_uuid()::text,$1,$2,$3,0),
              (gen_random_uuid()::text,$1,$4,0,$3)`,
      [entry.id, drId, params.amount, crId]
    );
  } catch (err) {
    console.error("[journalHelper] postExpenseJournal (non-fatal):", err);
  }
}

/**
 * Auto-post a double-entry journal entry when a booking is created or approved.
 * Dr: Accounts Receivable (1003) — Cr: Sales Revenue (4001)
 * Non-fatal: errors logged but never propagated.
 */
export async function postBookingJournal(params: {
  bookingId: string; bookingNumber: string; amount: number; date: string; customerName?: string;
}): Promise<void> {
  try {
    const dup = await pool.query(
      `SELECT id FROM journal_entries WHERE source='booking' AND source_id=$1 LIMIT 1`,
      [params.bookingId]
    );
    if (dup.rows.length) return;

    const drId = await acctId("1003"); // Accounts Receivable
    const crId = await acctId("4001"); // Sales Revenue
    if (!drId || !crId) return;        // COA not seeded yet — skip silently

    const num = await nextNum("booking", "BK");
    const { rows: [entry] } = await pool.query(
      `INSERT INTO journal_entries (id, entry_number, date, narration, reference, source, source_id)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,'booking',$5) RETURNING id`,
      [num, params.date, `Booking — ${params.customerName ?? params.bookingNumber}`, params.bookingNumber, params.bookingId]
    );
    await pool.query(
      `INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, debit, credit)
       VALUES (gen_random_uuid()::text,$1,$2,$3,0),
              (gen_random_uuid()::text,$1,$4,0,$3)`,
      [entry.id, drId, params.amount, crId]
    );
  } catch (err) {
    console.error("[journalHelper] postBookingJournal (non-fatal):", err);
  }
}

/**
 * Auto-post a journal entry for a refund.
 * Dr: Refund Expense (5012) — Cr: Cash (1001) or Bank (1002)
 * Non-fatal: errors logged but never propagated.
 */
export async function postRefundJournal(params: {
  refundId: string; amount: number; mode: string; date: string; bookingNumber?: string;
}): Promise<void> {
  try {
    const dup = await pool.query(
      `SELECT id FROM journal_entries WHERE source='refund' AND source_id=$1 LIMIT 1`,
      [params.refundId]
    );
    if (dup.rows.length) return;

    const drId = await acctId("5012"); // Refund Expense
    const crId = await acctId(params.mode === "cash" ? "1001" : "1002"); // Cash or Bank
    if (!drId || !crId) return;

    const num = await nextNum("refund", "REF");
    const { rows: [entry] } = await pool.query(
      `INSERT INTO journal_entries (id, entry_number, date, narration, reference, source, source_id)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,'refund',$5) RETURNING id`,
      [num, params.date, `Refund — ${params.bookingNumber ?? params.refundId}`, params.bookingNumber ?? null, params.refundId]
    );
    await pool.query(
      `INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, debit, credit)
       VALUES (gen_random_uuid()::text,$1,$2,$3,0),
              (gen_random_uuid()::text,$1,$4,0,$3)`,
      [entry.id, drId, params.amount, crId]
    );
  } catch (err) {
    console.error("[journalHelper] postRefundJournal (non-fatal):", err);
  }
}

/**
 * Bulk sync: auto-create journal entries for all existing payments and expenses
 * that don't have one yet. Safe to call multiple times (idempotent).
 */
export async function syncAllJournalEntries(): Promise<{ payments: number; expenses: number }> {
  let pCount = 0, eCount = 0;
  try {
    const payments = await pool.query(`
      SELECT pt.id, pt.amount::numeric AS amount, pt.payment_mode,
        pt.payment_date::text AS date, b.booking_number
      FROM payment_transactions pt
      JOIN bookings b ON b.id = pt.booking_id
      WHERE pt.is_deleted = false
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je WHERE je.source='payment' AND je.source_id=pt.id
        )
      ORDER BY pt.payment_date
      LIMIT 5000
    `);
    for (const pt of payments.rows) {
      await postPaymentJournal({ txnId: pt.id, amount: Number(pt.amount), mode: pt.payment_mode, date: pt.date, bookingNumber: pt.booking_number });
      pCount++;
    }

    const expenses = await pool.query(`
      SELECT id, amount::numeric AS amount, category, payment_method, date, description, invoice_number
      FROM expenses
      WHERE NOT EXISTS (
        SELECT 1 FROM journal_entries je WHERE je.source='expense' AND je.source_id=expenses.id
      )
      ORDER BY date
      LIMIT 5000
    `);
    for (const exp of expenses.rows) {
      await postExpenseJournal({ expId: exp.id, amount: Number(exp.amount), category: exp.category, paymentMethod: exp.payment_method || "cash", date: exp.date, description: exp.description, invoiceNumber: exp.invoice_number });
      eCount++;
    }
  } catch (err) {
    console.error("[journalHelper] syncAllJournalEntries failed:", err);
  }
  return { payments: pCount, expenses: eCount };
}
