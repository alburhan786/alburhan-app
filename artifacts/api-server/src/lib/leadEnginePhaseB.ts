// @ts-nocheck
/**
 * Lead Engine — Phase B
 * AI scoring, WhatsApp inbox replies, web forms, Excel import/export,
 * conversion funnel, FB Ads sync, audit log, auto reminders, CRM reporting
 */

import { pool } from "@workspace/db";
import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";
import axios from "axios";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

// ── Schema ────────────────────────────────────────────────────────────────────
export async function ensureLeadEnginePhaseBSchema() {
  // AI columns on leads
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_score INTEGER`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_next_action TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_scored_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_score_factors JSONB`);

  // Conversion tracking
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_booking_id TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_campaign TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_ad_id TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS fb_ad_spend NUMERIC(10,2)`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS revenue_attributed NUMERIC(10,2)`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS package_interest_id TEXT`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS room_preference TEXT`);

  // Audit log
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_audit_log (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      lead_id TEXT NOT NULL,
      user_id TEXT,
      user_name TEXT,
      action TEXT NOT NULL,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      details JSONB,
      ip_address TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lead_audit_lead ON lead_audit_log(lead_id, created_at DESC)`);

  // Web form configs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_web_forms (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL,
      description TEXT,
      fields JSONB NOT NULL DEFAULT '[]',
      destination_url TEXT,
      success_message TEXT DEFAULT 'Thank you! We will contact you soon.',
      theme_color TEXT DEFAULT '#0A3D2A',
      is_active BOOLEAN DEFAULT true,
      submissions_count INTEGER DEFAULT 0,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Reminder columns on lead_followups (must exist before runLeadReminders queries them)
  await pool.query(`ALTER TABLE lead_followups ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE lead_followups ADD COLUMN IF NOT EXISTS upcoming_reminder_sent BOOLEAN DEFAULT false`);

  // Web form submissions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_web_form_submissions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      form_id TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}',
      lead_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_form_sub_form ON lead_web_form_submissions(form_id, created_at DESC)`);

  // FB Ads sync
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fb_ads_sync (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      campaign_id TEXT NOT NULL,
      campaign_name TEXT,
      ad_set_id TEXT,
      ad_set_name TEXT,
      ad_id TEXT NOT NULL DEFAULT '',
      ad_name TEXT,
      spend NUMERIC(10,2) DEFAULT 0,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      leads_count INTEGER DEFAULT 0,
      cpl NUMERIC(10,2),
      date DATE NOT NULL,
      synced_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(campaign_id, ad_id, date)
    )
  `);

  // Inbox message extensions
  await pool.query(`ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent'`);
  await pool.query(`ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS template_used TEXT`);
  await pool.query(`ALTER TABLE social_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ`);

  console.log("[LeadEnginePhaseB] Schema ready");
}

// ── AI Scoring ────────────────────────────────────────────────────────────────
export async function aiScoreLead(leadId: string) {
  const res = await pool.query(`
    SELECT l.*,
      (SELECT COUNT(*) FROM lead_followups WHERE lead_id = l.id)::int as task_count,
      (SELECT COUNT(*) FROM social_messages WHERE lead_text_id = l.id)::int as message_count,
      (SELECT MAX(created_at) FROM social_messages WHERE lead_text_id = l.id) as last_message_at
    FROM leads l WHERE l.id = $1
  `, [leadId]);

  if (!res.rows[0]) throw new Error("Lead not found");
  const lead = res.rows[0];

  const hoursAgo = (ts: any) => ts
    ? Math.floor((Date.now() - new Date(ts).getTime()) / 3600000)
    : null;

  const prompt = `You are an expert Hajj & Umrah travel sales consultant. Analyze this lead for Al Burhan Tours & Travels and respond ONLY with valid JSON.

Lead profile:
- Name: ${lead.name || "Unknown"}
- Mobile provided: ${lead.mobile ? "Yes" : "No"}
- Email provided: ${lead.email ? "Yes" : "No"}
- Source: ${lead.source || "unknown"}
- Package interest: ${lead.package_interest || "General"}
- Budget: ${lead.budget || "Not specified"}
- Travellers: ${lead.travellers || 1}
- Stage: ${lead.stage || "new"}
- Priority: ${lead.priority || "medium"}
- Age of lead (days): ${Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)}
- Messages exchanged: ${lead.message_count}
- Tasks created: ${lead.task_count}
- Last message: ${hoursAgo(lead.last_message_at) !== null ? hoursAgo(lead.last_message_at) + "h ago" : "never"}
- Notes: ${lead.notes ? lead.notes.slice(0, 300) : "none"}

Respond with ONLY this JSON (no other text):
{
  "score": <integer 0-100>,
  "factors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "nextAction": "<one concrete action the agent should take in the next 24h>",
  "reasoning": "<2-3 sentence explanation>"
}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0]?.text || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);

  await pool.query(`
    UPDATE leads SET ai_score = $1, ai_next_action = $2, ai_scored_at = NOW(), ai_score_factors = $3
    WHERE id = $4
  `, [parsed.score, parsed.nextAction, JSON.stringify(parsed.factors || []), leadId]);

  await logLeadAudit(leadId, null, "ai_scored", "ai_score", String(lead.ai_score || ""), String(parsed.score), {
    nextAction: parsed.nextAction,
    reasoning: parsed.reasoning,
  });

  return { ...parsed, leadId };
}

// ── Audit Log ─────────────────────────────────────────────────────────────────
export async function logLeadAudit(
  leadId: string,
  userId: string | null,
  action: string,
  fieldName?: string,
  oldValue?: string,
  newValue?: string,
  details?: any,
) {
  try {
    let userName = "System";
    if (userId) {
      const u = await pool.query(`SELECT name FROM users WHERE id = $1`, [userId]);
      if (u.rows[0]) userName = u.rows[0].name;
    }
    await pool.query(
      `INSERT INTO lead_audit_log (lead_id, user_id, user_name, action, field_name, old_value, new_value, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [leadId, userId, userName, action, fieldName || null, oldValue || null, newValue || null,
       details ? JSON.stringify(details) : null],
    );
  } catch (e) {
    console.error("[LeadAudit] log error:", e);
  }
}

export async function getLeadAuditLog(leadId: string) {
  const res = await pool.query(
    `SELECT * FROM lead_audit_log WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [leadId],
  );
  return res.rows;
}

// ── Create Booking from Lead ──────────────────────────────────────────────────
export async function createBookingFromLead(leadId: string, adminUserId: string) {
  const leadRes = await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadId]);
  if (!leadRes.rows[0]) throw new Error("Lead not found");
  const lead = leadRes.rows[0];

  if (!lead.mobile) throw new Error("Cannot create booking: no mobile number on lead");

  // Find or create user
  let userId: string;
  const existingUser = await pool.query(`SELECT id FROM users WHERE mobile = $1`, [lead.mobile]);
  if (existingUser.rows[0]) {
    userId = existingUser.rows[0].id;
    // Update name/email if we have better info
    if (lead.name) {
      await pool.query(`UPDATE users SET name = COALESCE(NULLIF(name,''), $1), email = COALESCE(NULLIF(email,''), $2), updated_at = NOW() WHERE id = $3`,
        [lead.name, lead.email || null, userId]);
    }
  } else {
    const newU = await pool.query(
      `INSERT INTO users (id, name, mobile, email, role, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, 'customer', NOW(), NOW()) RETURNING id`,
      [lead.name || lead.mobile, lead.mobile, lead.email || null],
    );
    userId = newU.rows[0].id;
  }

  // Create booking
  const bkRes = await pool.query(
    `INSERT INTO bookings (id, customer_id, package_id, status, room_type, travellers, notes, created_at, updated_at, source)
     VALUES (gen_random_uuid()::text, $1, $2, 'pending', $3, $4, $5, NOW(), NOW(), $6) RETURNING id`,
    [
      userId,
      lead.package_interest_id || null,
      lead.room_preference || "quad",
      parseInt(lead.travellers) || 1,
      `Auto-created from lead ${lead.lead_number}${lead.notes ? ". " + lead.notes : ""}`.trim(),
      `lead_${lead.source || "crm"}`,
    ],
  );

  const bookingId = bkRes.rows[0].id;

  // Mark lead as converted
  await pool.query(
    `UPDATE leads SET status = 'converted', stage = 'won', converted_booking_id = $1, updated_at = NOW() WHERE id = $2`,
    [bookingId, leadId],
  );

  await logLeadAudit(leadId, adminUserId, "converted_to_booking", "status", lead.status, "converted", { bookingId });

  return { bookingId, userId };
}

// ── Excel Export ──────────────────────────────────────────────────────────────
export async function exportLeadsToExcel(filters: Record<string, string> = {}): Promise<Buffer> {
  const conditions: string[] = ["l.status != 'spam'"];
  const params: any[] = [];

  const addFilter = (col: string, val: string) => {
    params.push(val);
    conditions.push(`${col} = $${params.length}`);
  };

  if (filters.source) addFilter("l.source", filters.source);
  if (filters.stage) addFilter("l.pipeline_stage", filters.stage);
  if (filters.status) addFilter("l.status", filters.status);
  if (filters.assignedTo) addFilter("l.assigned_to", filters.assignedTo);
  if (filters.from) { params.push(filters.from); conditions.push(`l.created_at >= $${params.length}`); }
  if (filters.to)   { params.push(filters.to);   conditions.push(`l.created_at <= $${params.length}`); }

  const where = "WHERE " + conditions.join(" AND ");
  const res = await pool.query(`
    SELECT l.lead_number, l.name, l.mobile, l.email, l.source, l.pipeline_stage as stage, l.status,
           l.score, l.ai_score, l.priority, l.package_interest, l.budget, l.num_travellers as travellers,
           l.notes, l.follow_up_date, l.tags, l.converted_booking_id,
           u.name as assigned_to,
           l.created_at
    FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
    ${where} ORDER BY l.created_at DESC
  `, params);

  const rows = res.rows.map(r => ({
    "Lead #": r.lead_number || "",
    "Name": r.name || "",
    "Mobile": r.mobile || "",
    "Email": r.email || "",
    "Source": r.source || "",
    "Stage": r.stage || "",
    "Status": r.status || "",
    "Score": r.score || 0,
    "AI Score": r.ai_score || "",
    "Priority": r.priority || "",
    "Package Interest": r.package_interest || "",
    "Budget": r.budget || "",
    "Travellers": r.travellers || 1,
    "Notes": r.notes || "",
    "Follow Up Date": r.follow_up_date || "",
    "Tags": Array.isArray(r.tags) ? r.tags.join(", ") : "",
    "Assigned To": r.assigned_to || "",
    "Created": r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "",
    "Booking ID": r.converted_booking_id || "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 26 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
    { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 40 }, { wch: 14 },
    { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 36 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

// ── Excel Import ──────────────────────────────────────────────────────────────
export async function importLeadsFromExcel(buffer: Buffer): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(ws);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const { createOrUpdateLead } = await import("./leadEngine.js");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const get = (...keys: string[]) => {
        for (const k of keys) {
          const val = row[k] || row[k.toLowerCase()] || row[k.toUpperCase()];
          if (val !== undefined && val !== null && String(val).trim() !== "") return String(val).trim();
        }
        return "";
      };

      const mobile = get("Mobile", "mobile", "Phone", "phone").replace(/[^0-9]/g, "").slice(-10);
      const name = get("Name", "name", "Full Name");
      const email = get("Email", "email");
      const source = get("Source", "source") || "excel_import";
      const packageInterest = get("Package Interest", "package_interest", "Package");
      const notes = get("Notes", "notes", "Remarks");
      const priority = get("Priority", "priority") || "medium";
      const budget = get("Budget", "budget");
      const travellers = parseInt(get("Travellers", "travellers", "No of Travellers")) || 1;

      if (!name && !mobile) { skipped++; continue; }

      await createOrUpdateLead({
        name, mobile, email, source, package_interest: packageInterest,
        notes, priority, budget, travellers,
        message: `Imported from Excel (row ${i + 2})`,
      });
      imported++;
    } catch (e: any) {
      errors.push(`Row ${i + 2}: ${e.message}`);
      skipped++;
    }
  }

  return { imported, skipped, errors };
}

// ── FB Ads Sync ───────────────────────────────────────────────────────────────
export async function syncFbAdsData(accessToken: string, adAccountId: string, since: string, until: string) {
  const url = `https://graph.facebook.com/v20.0/act_${adAccountId}/insights`;
  const resp = await axios.get(url, {
    params: {
      access_token: accessToken,
      fields: "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,date_start",
      time_range: JSON.stringify({ since, until }),
      level: "ad",
      limit: 500,
    },
  });

  const data: any[] = resp.data?.data || [];
  let synced = 0;

  for (const row of data) {
    const leadsCount = parseInt(row.actions?.find((a: any) => a.action_type === "lead")?.value || "0");
    const spend = parseFloat(row.spend || "0");
    const cpl = leadsCount > 0 ? spend / leadsCount : null;

    await pool.query(
      `INSERT INTO fb_ads_sync (campaign_id, campaign_name, ad_set_id, ad_set_name, ad_id, ad_name, spend, impressions, clicks, leads_count, cpl, date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (campaign_id, ad_id, date) DO UPDATE SET
         spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
         leads_count = EXCLUDED.leads_count, cpl = EXCLUDED.cpl, synced_at = NOW()`,
      [row.campaign_id, row.campaign_name, row.adset_id, row.adset_name,
       row.ad_id || "", row.ad_name, spend, parseInt(row.impressions || "0"),
       parseInt(row.clicks || "0"), leadsCount, cpl, row.date_start],
    );
    synced++;
  }

  return { synced, total: data.length };
}

// ── Reports ───────────────────────────────────────────────────────────────────
export async function getReportPipelineVelocity(from: string, to: string) {
  const [stages, weekly, velocity] = await Promise.all([
    pool.query(`
      SELECT pipeline_stage as stage, COUNT(*)::int as count,
             COUNT(CASE WHEN status='converted' THEN 1 END)::int as converted,
             COALESCE(AVG(ai_score),0)::int as avg_score
      FROM leads WHERE created_at BETWEEN $1 AND $2 AND status != 'spam'
      GROUP BY pipeline_stage
    `, [from, to]),
    pool.query(`
      SELECT DATE_TRUNC('week', created_at)::date as week,
             COUNT(*)::int as new_leads,
             COUNT(CASE WHEN status='converted' THEN 1 END)::int as converted
      FROM leads WHERE created_at BETWEEN $1 AND $2
      GROUP BY week ORDER BY week
    `, [from, to]),
    pool.query(`
      SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at-created_at))/86400), 0)::numeric(10,1) as avg_days
      FROM leads WHERE status='converted' AND updated_at BETWEEN $1 AND $2
    `, [from, to]),
  ]);
  return { stages: stages.rows, weekly: weekly.rows, avgDaysToConvert: velocity.rows[0]?.avg_days || 0 };
}

export async function getReportSourceROI(from: string, to: string) {
  const [sources, fbAds] = await Promise.all([
    pool.query(`
      SELECT l.source,
             COUNT(*)::int as total_leads,
             COUNT(CASE WHEN l.status='converted' THEN 1 END)::int as converted,
             ROUND(100.0*COUNT(CASE WHEN l.status='converted' THEN 1 END)/NULLIF(COUNT(*),0),1)::numeric as conv_rate,
             COALESCE(SUM(CASE WHEN l.status='converted' THEN b.advance_amount END),0)::int as revenue,
             COALESCE(AVG(l.ai_score),0)::int as avg_score
      FROM leads l LEFT JOIN bookings b ON b.id = l.converted_booking_id
      WHERE l.created_at BETWEEN $1 AND $2 AND l.status != 'spam'
      GROUP BY l.source ORDER BY total_leads DESC
    `, [from, to]),
    pool.query(`
      SELECT campaign_name, SUM(spend)::numeric(10,2) as total_spend,
             SUM(leads_count)::int as total_leads, AVG(cpl)::numeric(10,2) as avg_cpl
      FROM fb_ads_sync WHERE date BETWEEN $1 AND $2
      GROUP BY campaign_name ORDER BY total_spend DESC
    `, [from, to]),
  ]);
  return { sources: sources.rows, adSpend: fbAds.rows };
}

export async function getReportAgentPerformance(from: string, to: string) {
  const res = await pool.query(`
    SELECT u.name as agent_name, u.id as agent_id,
           COUNT(l.id)::int as total_leads,
           COUNT(CASE WHEN l.status='converted' THEN 1 END)::int as converted,
           ROUND(100.0*COUNT(CASE WHEN l.status='converted' THEN 1 END)/NULLIF(COUNT(l.id),0),1)::numeric as conv_rate,
           COALESCE(AVG(l.ai_score),0)::int as avg_score,
           COUNT(DISTINCT lf.id) FILTER (WHERE lf.status='pending')::int as pending_tasks,
           COUNT(DISTINCT lf.id) FILTER (WHERE lf.due_at < CURRENT_DATE AND lf.status='pending')::int as overdue_tasks
    FROM users u
    LEFT JOIN leads l ON l.assigned_to = u.id AND l.created_at BETWEEN $1 AND $2
    LEFT JOIN lead_followups lf ON lf.lead_id = l.id
    WHERE u.role IN ('admin','super_admin','staff','agent','branch_manager')
    GROUP BY u.id, u.name HAVING COUNT(l.id) > 0
    ORDER BY converted DESC
  `, [from, to]);
  return res.rows;
}

export async function getReportConversionFunnel(from: string, to: string) {
  const [funnel, monthly] = await Promise.all([
    pool.query(`
      SELECT COUNT(*)::int as total_leads,
             COUNT(CASE WHEN l.pipeline_stage != 'new_lead' THEN 1 END)::int as contacted,
             COUNT(CASE WHEN l.pipeline_stage IN ('qualified','proposal','negotiation','won') THEN 1 END)::int as qualified,
             COUNT(CASE WHEN l.pipeline_stage IN ('proposal','negotiation','won') THEN 1 END)::int as proposal_sent,
             COUNT(CASE WHEN l.status='converted' THEN 1 END)::int as converted,
             COALESCE(SUM(CASE WHEN l.status='converted' THEN b.advance_amount END),0)::int as total_revenue
      FROM leads l LEFT JOIN bookings b ON b.id = l.converted_booking_id
      WHERE l.created_at BETWEEN $1 AND $2 AND l.status != 'spam'
    `, [from, to]),
    pool.query(`
      SELECT DATE_TRUNC('month', l.created_at)::date as month,
             COUNT(*)::int as leads,
             COUNT(CASE WHEN l.status='converted' THEN 1 END)::int as conversions,
             COALESCE(SUM(CASE WHEN l.status='converted' THEN b.advance_amount END),0)::int as revenue
      FROM leads l LEFT JOIN bookings b ON b.id = l.converted_booking_id
      WHERE l.created_at BETWEEN $1 AND $2
      GROUP BY month ORDER BY month
    `, [from, to]),
  ]);
  return { funnel: funnel.rows[0], monthly: monthly.rows };
}

// ── Web Forms ─────────────────────────────────────────────────────────────────
export async function listWebForms() {
  const res = await pool.query(`SELECT * FROM lead_web_forms ORDER BY created_at DESC`);
  return res.rows;
}

export async function createWebForm(data: any, createdBy: string) {
  const res = await pool.query(
    `INSERT INTO lead_web_forms (name, description, fields, success_message, destination_url, theme_color, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [data.name, data.description || "", JSON.stringify(data.fields || []),
     data.success_message || "Thank you! We will contact you soon.",
     data.destination_url || null, data.theme_color || "#0A3D2A", createdBy],
  );
  return res.rows[0];
}

export async function updateWebForm(formId: string, data: any) {
  const res = await pool.query(
    `UPDATE lead_web_forms SET name=$1, description=$2, fields=$3, success_message=$4,
     destination_url=$5, theme_color=$6, is_active=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
    [data.name, data.description || "", JSON.stringify(data.fields || []),
     data.success_message || "Thank you! We will contact you soon.",
     data.destination_url || null, data.theme_color || "#0A3D2A",
     data.is_active !== false, formId],
  );
  return res.rows[0];
}

export async function getWebFormEmbed(formId: string, baseUrl: string) {
  const res = await pool.query(`SELECT * FROM lead_web_forms WHERE id = $1`, [formId]);
  if (!res.rows[0]) throw new Error("Form not found");
  const form = res.rows[0];

  const embedCode = `<!-- Al Burhan CRM Lead Form: ${form.name} -->
<div id="alburhan-form-${formId}" style="font-family:Arial,sans-serif;max-width:480px;"></div>
<script>
(function(){
  var c=document.getElementById('alburhan-form-${formId}');
  var f=document.createElement('iframe');
  f.src='${baseUrl}/api/leads/web-forms/${formId}/preview';
  f.style.cssText='width:100%;border:none;min-height:480px;';
  f.onload=function(){f.style.height=f.contentWindow.document.body.scrollHeight+'px';};
  c.appendChild(f);
})();
</script>`;

  return { form, embedCode };
}

export async function submitWebForm(formId: string, data: any, ip: string, userAgent: string) {
  const formRes = await pool.query(`SELECT * FROM lead_web_forms WHERE id=$1 AND is_active=true`, [formId]);
  if (!formRes.rows[0]) throw new Error("Form not found or inactive");
  const form = formRes.rows[0];

  const leadInput: any = { source: "web_form", priority: "medium" };
  const fields: any[] = form.fields || [];

  for (const field of fields) {
    const val = data[field.name] ?? data[field.label];
    if (!val) continue;
    const k = (field.maps_to || field.name || "").toLowerCase();
    if (k === "name")              leadInput.name = String(val);
    else if (k === "mobile" || k === "phone") leadInput.mobile = String(val).replace(/[^0-9]/g, "").slice(-10);
    else if (k === "email")        leadInput.email = String(val);
    else if (k === "package" || k === "package_interest") leadInput.package_interest = String(val);
    else if (k === "budget")       leadInput.budget = String(val);
    else if (k === "travellers")   leadInput.travellers = parseInt(val) || 1;
    else if (k === "message" || k === "notes") leadInput.message = String(val);
  }

  const subRes = await pool.query(
    `INSERT INTO lead_web_form_submissions (form_id, data, ip_address, user_agent) VALUES ($1,$2,$3,$4) RETURNING id`,
    [formId, JSON.stringify(data), ip, userAgent],
  );

  const { createOrUpdateLead } = await import("./leadEngine.js");
  const leadResult = await createOrUpdateLead(leadInput);

  if (leadResult?.leadId) {
    await pool.query(`UPDATE lead_web_form_submissions SET lead_id=$1 WHERE id=$2`, [leadResult.leadId, subRes.rows[0].id]);
    await pool.query(`UPDATE lead_web_forms SET submissions_count = submissions_count+1 WHERE id=$1`, [formId]);
  }

  return { success: true, message: form.success_message, leadId: leadResult?.leadId };
}

// ── Auto Reminders Cron ───────────────────────────────────────────────────────
export async function runLeadReminderCron() {
  try {
    const { sendWhatsApp, sendDLTSMS } = await import("./notifications.js");

    // Overdue follow-ups — notify assigned agent
    const overdue = await pool.query(`
      SELECT lf.*, l.name as lead_name, l.mobile as lead_mobile, l.lead_number,
             u.mobile as agent_mobile, u.name as agent_name
      FROM lead_followups lf
      JOIN leads l ON l.id = lf.lead_id
      LEFT JOIN users u ON u.id = lf.assigned_to
      WHERE lf.status = 'pending'
        AND lf.due_at < NOW()
        AND lf.due_at > NOW() - INTERVAL '24 hours'
        AND lf.title NOT ILIKE 'LD-SEQ-%'
        AND lf.reminder_sent IS NOT TRUE
    `);

    for (const task of overdue.rows) {
      if (task.agent_mobile) {
        const msg = `⏰ Overdue Follow-up Alert\nLead: ${task.lead_name || task.lead_number}\nTask: ${task.title}\nOverdue since: ${new Date(task.due_at).toLocaleDateString("en-IN")}\n\nPlease follow up immediately.`;
        try {
          await sendWhatsApp(task.agent_mobile, msg);
          await pool.query(`UPDATE lead_followups SET reminder_sent = true WHERE id = $1`, [task.id]);
        } catch {}
      }
    }

    // Upcoming follow-ups in 1 hour
    const upcoming = await pool.query(`
      SELECT lf.*, l.name as lead_name, l.mobile as lead_mobile, l.lead_number,
             u.mobile as agent_mobile
      FROM lead_followups lf
      JOIN leads l ON l.id = lf.lead_id
      LEFT JOIN users u ON u.id = lf.assigned_to
      WHERE lf.status = 'pending'
        AND lf.due_at BETWEEN NOW() AND NOW() + INTERVAL '65 minutes'
        AND lf.title NOT ILIKE 'LD-SEQ-%'
        AND lf.upcoming_reminder_sent IS NOT TRUE
    `);

    for (const task of upcoming.rows) {
      if (task.agent_mobile) {
        const msg = `⏰ Upcoming: ${task.title}\nLead: ${task.lead_name || task.lead_number}\nDue: ${new Date(task.due_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
        try {
          await sendWhatsApp(task.agent_mobile, msg);
          await pool.query(`UPDATE lead_followups SET upcoming_reminder_sent = true WHERE id = $1`, [task.id]);
        } catch {}
      }
    }

    console.log(`[LeadReminder] Overdue: ${overdue.rows.length}, Upcoming: ${upcoming.rows.length}`);
  } catch (e) {
    console.error("[LeadReminder] Cron error:", e);
  }
}
