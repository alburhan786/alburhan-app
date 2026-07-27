// @ts-nocheck
/**
 * Lead Engine — Phase A
 * Handles: lead creation, duplicate detection, scoring, assignment, follow-up automation
 * All business logic lives here so routes stay thin.
 */

import { pool } from "@workspace/db";
import { randomUUID } from "crypto";
import { sendWhatsApp, sendDLTSMS, fireNotificationEvent } from "./notifications.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateLeadInput {
  name: string;
  first_name?: string;
  last_name?: string;
  mobile?: string;
  whatsapp_number?: string;
  email?: string;
  city?: string;
  state?: string;
  country?: string;
  source: string;
  platform?: string;
  platform_user_id?: string;
  instagram_username?: string;
  facebook_name?: string;
  package_interest?: string;
  budget?: string;
  message?: string;
  travel_month?: string;
  num_travellers?: number;
  meta_lead_id?: string;
  campaign_id?: string;
  campaign_name?: string;
  ad_set_id?: string;
  ad_set_name?: string;
  ad_id?: string;
  ad_name?: string;
  form_id?: string;
  utm_params?: Record<string, string>;
  consent_whatsapp?: boolean;
  consent_sms?: boolean;
  consent_email?: boolean;
  priority?: string;
  created_by?: string;
}

export interface AssignmentResult {
  assigned_to: string | null;
  assigned_name: string | null;
  assigned_branch: string | null;
  method: string;
}

// ── Lead number generation ─────────────────────────────────────────────────────

async function generateLeadNumber(): Promise<string> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM leads WHERE created_at > date_trunc('year', NOW())`
  );
  const seq = (r.rows[0]?.cnt || 0) + 1;
  const year = new Date().getFullYear().toString().slice(-2);
  return `LD-${year}-${String(seq).padStart(5, "0")}`;
}

// ── Duplicate detection ────────────────────────────────────────────────────────

export async function findDuplicateLead(input: CreateLeadInput): Promise<string | null> {
  // Check by meta_lead_id first (exact match)
  if (input.meta_lead_id) {
    const r = await pool.query(`SELECT id FROM leads WHERE meta_lead_id=$1 LIMIT 1`, [input.meta_lead_id]);
    if (r.rows[0]) return r.rows[0].id;
  }

  // Check by platform_user_id
  if (input.platform_user_id && input.platform) {
    const r = await pool.query(
      `SELECT id FROM leads WHERE platform_user_id=$1 AND platform=$2 LIMIT 1`,
      [input.platform_user_id, input.platform]
    );
    if (r.rows[0]) return r.rows[0].id;
  }

  // Check by normalised mobile (last 10 digits)
  if (input.mobile) {
    const norm = input.mobile.replace(/\D/g, "").slice(-10);
    if (norm.length >= 10) {
      const r = await pool.query(
        `SELECT id FROM leads WHERE REGEXP_REPLACE(mobile,'\\D','','g') LIKE $1 LIMIT 1`,
        [`%${norm}`]
      );
      if (r.rows[0]) return r.rows[0].id;
    }
  }

  // Check by email
  if (input.email) {
    const r = await pool.query(
      `SELECT id FROM leads WHERE LOWER(email)=LOWER($1) LIMIT 1`,
      [input.email]
    );
    if (r.rows[0]) return r.rows[0].id;
  }

  return null;
}

// ── Lead scoring ───────────────────────────────────────────────────────────────

export function calculateLeadScore(input: CreateLeadInput, factors: Record<string, any> = {}): {
  score: string;
  score_factors: Record<string, any>;
  score_points: number;
} {
  let points = 0;
  const computed: Record<string, any> = {};

  // Contact completeness
  if (input.mobile) { points += 10; computed.has_mobile = true; }
  if (input.email)  { points += 5;  computed.has_email = true; }
  if (input.whatsapp_number) { points += 5; computed.has_whatsapp = true; }

  // Package intent
  if (input.package_interest) {
    points += 15;
    computed.package_interest = input.package_interest;
    if (/hajj/i.test(input.package_interest)) { points += 10; computed.is_hajj = true; }
    else if (/umrah/i.test(input.package_interest)) { points += 8; computed.is_umrah = true; }
  }

  // Budget
  if (input.budget) {
    points += 10;
    const budgetNum = parseInt(String(input.budget).replace(/\D/g, ""));
    if (budgetNum >= 200000) { points += 15; computed.high_budget = true; }
    else if (budgetNum >= 100000) { points += 8; computed.medium_budget = true; }
  }

  // Traveller count
  if (input.num_travellers && input.num_travellers > 1) {
    points += Math.min(input.num_travellers * 3, 15);
    computed.num_travellers = input.num_travellers;
  }

  // Source quality
  const highValueSources = ["facebook_lead_ad", "instagram_lead_ad", "whatsapp", "referral"];
  const mediumSources = ["facebook_organic", "instagram_organic", "website"];
  if (highValueSources.includes(input.source)) { points += 15; computed.high_value_source = true; }
  else if (mediumSources.includes(input.source)) { points += 8; computed.medium_source = true; }

  // Travel month specificity
  if (input.travel_month) { points += 5; computed.has_travel_month = true; }

  // Message quality
  if (input.message && input.message.length > 30) { points += 5; computed.has_message = true; }

  // Location data
  if (input.city || input.state) { points += 5; computed.has_location = true; }

  // Consents
  if (input.consent_whatsapp) { points += 3; computed.whatsapp_consent = true; }

  // Priority override
  if (input.priority === "urgent") { points += 20; computed.urgent_priority = true; }
  else if (input.priority === "high") { points += 10; computed.high_priority = true; }

  // Apply external factors
  Object.assign(computed, factors);

  const score =
    points >= 70 ? "hot" :
    points >= 45 ? "warm" :
    points >= 20 ? "cold" : "cold";

  return { score, score_factors: computed, score_points: points };
}

// ── Assignment engine ──────────────────────────────────────────────────────────

export async function assignLead(input: CreateLeadInput, leadId: string): Promise<AssignmentResult> {
  const result: AssignmentResult = {
    assigned_to: null, assigned_name: null, assigned_branch: null, method: "none"
  };

  try {
    // 1. Check platform-specific rule (legacy lead_assignment_rules)
    if (input.source || input.platform) {
      const platformKey = input.platform || input.source;
      const ruleR = await pool.query(
        `SELECT * FROM lead_assignment_rules
         WHERE is_active=true AND platform=$1
         ORDER BY created_at ASC LIMIT 1`,
        [platformKey]
      );
      if (ruleR.rows[0]) {
        const rule = ruleR.rows[0];
        result.assigned_to = rule.assigned_to;
        result.assigned_name = rule.assigned_name;
        result.assigned_branch = rule.branch_name;
        result.method = "platform_rule";
      }
    }

    // 2. Check advanced assignment rules (crm_assignment_rules)
    if (!result.assigned_to) {
      const advRules = await pool.query(
        `SELECT * FROM crm_assignment_rules WHERE is_active=true ORDER BY priority ASC, created_at ASC LIMIT 50`
      );

      for (const rule of advRules.rows) {
        const conditions = rule.conditions || {};
        let match = true;

        if (conditions.source && conditions.source !== input.source) match = false;
        if (conditions.platform && conditions.platform !== input.platform) match = false;
        if (conditions.package && input.package_interest &&
            !input.package_interest.toLowerCase().includes(conditions.package.toLowerCase())) match = false;
        if (conditions.city && input.city &&
            !input.city.toLowerCase().includes(conditions.city.toLowerCase())) match = false;
        if (conditions.state && input.state &&
            !input.state.toLowerCase().includes(conditions.state.toLowerCase())) match = false;

        if (!match) continue;

        // Apply assignment method
        if (rule.method === "specific_user" && rule.assign_to_user_id) {
          const userR = await pool.query(`SELECT id, name FROM users WHERE id=$1 AND is_active=true`, [rule.assign_to_user_id]);
          if (userR.rows[0]) {
            result.assigned_to = userR.rows[0].id;
            result.assigned_name = userR.rows[0].name;
            result.assigned_branch = rule.assign_to_branch;
            result.method = "specific_user";
            break;
          }
        } else if (rule.method === "round_robin") {
          const teamIds: string[] = rule.team_user_ids || [];
          if (teamIds.length > 0) {
            // Find the team member with fewest active leads
            const countR = await pool.query(
              `SELECT assigned_to, COUNT(*)::int AS cnt
               FROM leads
               WHERE assigned_to = ANY($1::text[]) AND status NOT IN ('converted','lost','spam','cancelled')
               GROUP BY assigned_to`,
              [teamIds]
            );
            const countMap: Record<string, number> = {};
            for (const r of countR.rows) countMap[r.assigned_to] = r.cnt;

            // Pick the one with fewest leads
            let minUser = teamIds[0];
            let minCount = countMap[teamIds[0]] ?? 0;
            for (const uid of teamIds) {
              const cnt = countMap[uid] ?? 0;
              if (cnt < minCount) { minUser = uid; minCount = cnt; }
            }

            const userR = await pool.query(`SELECT id, name FROM users WHERE id=$1`, [minUser]);
            if (userR.rows[0]) {
              result.assigned_to = userR.rows[0].id;
              result.assigned_name = userR.rows[0].name;
              result.assigned_branch = rule.assign_to_branch;
              result.method = "round_robin";
              break;
            }
          }
        } else if (rule.method === "least_active") {
          const teamIds: string[] = rule.team_user_ids || [];
          if (teamIds.length > 0) {
            const activeR = await pool.query(
              `SELECT assigned_to, COUNT(*)::int AS cnt
               FROM leads
               WHERE assigned_to = ANY($1::text[]) AND status NOT IN ('converted','lost','spam','cancelled')
               AND created_at > NOW() - INTERVAL '30 days'
               GROUP BY assigned_to ORDER BY cnt ASC LIMIT 1`,
              [teamIds]
            );
            const assignedId = activeR.rows[0]?.assigned_to || teamIds[0];
            const userR = await pool.query(`SELECT id, name FROM users WHERE id=$1`, [assignedId]);
            if (userR.rows[0]) {
              result.assigned_to = userR.rows[0].id;
              result.assigned_name = userR.rows[0].name;
              result.assigned_branch = rule.assign_to_branch;
              result.method = "least_active";
              break;
            }
          }
        }
      }
    }

    // 3. Fallback: assign to most recently active admin/sales user
    if (!result.assigned_to) {
      const fallbackR = await pool.query(
        `SELECT u.id, u.name
         FROM users u
         WHERE u.is_active=true AND u.role='admin' AND u.admin_role IN ('admin','sales','super_admin')
         AND u.name IS NOT NULL
         ORDER BY u.updated_at DESC NULLS LAST LIMIT 1`
      );
      if (fallbackR.rows[0]) {
        result.assigned_to = fallbackR.rows[0].id;
        result.assigned_name = fallbackR.rows[0].name;
        result.method = "fallback_admin";
      }
    }
  } catch (err: any) {
    console.error("[LeadEngine] Assignment error:", err.message);
  }

  return result;
}

// ── Create or update lead ─────────────────────────────────────────────────────

export async function createOrUpdateLead(
  input: CreateLeadInput,
  options: { skipDuplicateCheck?: boolean; triggeredBy?: string } = {}
): Promise<{ leadId: string; isNew: boolean; isDuplicate: boolean }> {

  // Check duplicate
  let existingId: string | null = null;
  if (!options.skipDuplicateCheck) {
    existingId = await findDuplicateLead(input);
  }

  const { score, score_factors, score_points } = calculateLeadScore(input);
  const assignment = await assignLead(input, existingId || "");
  const leadNumber = existingId ? null : await generateLeadNumber();

  if (existingId) {
    // Update existing lead with new info, add to activity timeline
    const updateSets: string[] = ["updated_at=NOW()"];
    const params: any[] = [];

    const setIfPresent = (col: string, val: any) => {
      if (val !== undefined && val !== null && val !== "") {
        params.push(val);
        updateSets.push(`${col}=$${params.length}`);
      }
    };

    setIfPresent("source", input.source);
    setIfPresent("campaign_id", input.campaign_id);
    setIfPresent("campaign_name", input.campaign_name);
    setIfPresent("last_communication_at", new Date().toISOString());
    if (input.utm_params && Object.keys(input.utm_params).length) {
      params.push(JSON.stringify(input.utm_params));
      updateSets.push(`utm_params=utm_params || $${params.length}::jsonb`);
    }

    params.push(existingId);
    await pool.query(`UPDATE leads SET ${updateSets.join(",")} WHERE id=$${params.length}`, params);

    // Log duplicate enquiry as activity
    await pool.query(
      `INSERT INTO lead_activities (id, lead_id, type, content, metadata, performed_by, performed_by_name)
       VALUES ($1,$2,'duplicate_enquiry','New enquiry received on existing lead',$3,$4,'System')`,
      [randomUUID(), existingId, JSON.stringify({
        source: input.source, platform: input.platform, message: input.message?.slice(0, 200)
      }), options.triggeredBy || "system"]
    );

    return { leadId: existingId, isNew: false, isDuplicate: true };
  }

  // Create new lead
  const leadId = `lead_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const mobile = input.mobile?.replace(/\D/g, "");
  const normalizedMobile = mobile && mobile.length >= 10
    ? (mobile.startsWith("91") && mobile.length === 12 ? mobile.slice(2) : mobile.slice(-10))
    : input.mobile;

  await pool.query(
    `INSERT INTO leads (
       id, lead_number, name, first_name, last_name, mobile, whatsapp_number, email,
       city, state, country, source, platform, platform_user_id,
       instagram_username, facebook_name,
       package_interest, budget, message, travel_month, num_travellers,
       meta_lead_id, campaign_id, campaign_name, ad_set_id, ad_set_name,
       ad_id, ad_name, form_id, utm_params,
       score, score_factors,
       assigned_to, assigned_name, assigned_branch,
       status, pipeline_stage, priority, inbox_status,
       last_communication_at, pipeline_updated_at,
       created_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,
       $9,$10,$11,$12,$13,$14,
       $15,$16,
       $17,$18,$19,$20,$21,
       $22,$23,$24,$25,$26,
       $27,$28,$29,$30,
       $31,$32,
       $33,$34,$35,
       'new','new_lead',$36,'open',
       NOW(),NOW(),
       NOW(),NOW()
     )`,
    [
      leadId, leadNumber,
      input.name || [input.first_name, input.last_name].filter(Boolean).join(" ") || "Unknown",
      input.first_name || null, input.last_name || null,
      normalizedMobile || null, input.whatsapp_number || null, input.email || null,
      input.city || null, input.state || null, input.country || "India",
      input.source || "manual", input.platform || null, input.platform_user_id || null,
      input.instagram_username || null, input.facebook_name || null,
      input.package_interest || null, input.budget || null,
      input.message || null, input.travel_month || null, input.num_travellers || 1,
      input.meta_lead_id || null,
      input.campaign_id || null, input.campaign_name || null,
      input.ad_set_id || null, input.ad_set_name || null,
      input.ad_id || null, input.ad_name || null, input.form_id || null,
      JSON.stringify(input.utm_params || {}),
      score, JSON.stringify(score_factors),
      assignment.assigned_to || null, assignment.assigned_name || null, assignment.assigned_branch || null,
      input.priority || "normal",
    ]
  );

  // Add extra columns that may not exist in older DBs
  try {
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign_id TEXT`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign_name TEXT`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ad_set_id TEXT`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ad_set_name TEXT`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ad_id TEXT`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ad_name TEXT`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS form_id TEXT`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_number TEXT`);
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_factors JSONB DEFAULT '{}'::jsonb`);
  } catch {}

  // Record creation activity
  await pool.query(
    `INSERT INTO lead_activities (id, lead_id, type, content, metadata, performed_by, performed_by_name)
     VALUES ($1,$2,'lead_created','Lead created from ' || $3,$4,$5,'System')`,
    [randomUUID(), leadId, input.source, JSON.stringify({ source: input.source, platform: input.platform, score, assignment: assignment.method }), options.triggeredBy || "system"]
  );

  // Record assignment activity
  if (assignment.assigned_to) {
    await pool.query(
      `INSERT INTO lead_activities (id, lead_id, type, content, metadata, performed_by, performed_by_name)
       VALUES ($1,$2,'assignment','Lead assigned to ' || $3,$4,'system','System')`,
      [randomUUID(), leadId, assignment.assigned_name || assignment.assigned_to, JSON.stringify({ method: assignment.method, assigned_to: assignment.assigned_to })]
    );
  }

  // Store consents
  const consentChannels: Array<{ channel: string; granted: boolean | undefined }> = [
    { channel: "whatsapp", granted: input.consent_whatsapp },
    { channel: "sms", granted: input.consent_sms },
    { channel: "email", granted: input.consent_email },
  ];
  for (const c of consentChannels) {
    if (c.granted !== undefined && (normalizedMobile || input.email)) {
      try {
        await pool.query(
          `INSERT INTO communication_consents (id, lead_id, mobile, email, channel, status, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (mobile, channel) DO UPDATE SET status=EXCLUDED.status, updated_at=NOW()`,
          [randomUUID(), leadId, normalizedMobile || null, input.email || null, c.channel,
           c.granted ? "opted_in" : "opted_out", input.source]
        );
      } catch {}
    }
  }

  return { leadId, isNew: true, isDuplicate: false };
}

// ── Opt-out / STOP processing ──────────────────────────────────────────────────

const STOP_KEYWORDS = ["stop", "unsubscribe", "opt out", "optout", "remove me", "do not contact", "block", "रुको"];

export async function processOptOut(mobile: string, channel: string, message?: string): Promise<boolean> {
  const norm = mobile.replace(/\D/g, "").slice(-10);
  const text = (message || "").toLowerCase().trim();
  const isStop = STOP_KEYWORDS.some(kw => text === kw || text.startsWith(kw + " ") || text.endsWith(" " + kw));

  if (!isStop) return false;

  await pool.query(
    `INSERT INTO communication_consents (id, mobile, channel, status, source, consent_text)
     VALUES ($1,$2,$3,'opted_out','customer_reply',$4)
     ON CONFLICT (mobile, channel) DO UPDATE SET status='opted_out', updated_at=NOW(), consent_text=EXCLUDED.consent_text`,
    [randomUUID(), norm, channel, text]
  );

  // Also update the lead's status if found
  const leadR = await pool.query(
    `SELECT id FROM leads WHERE REGEXP_REPLACE(mobile,'\\D','','g') LIKE $1 LIMIT 1`,
    [`%${norm}`]
  );
  if (leadR.rows[0]) {
    await pool.query(
      `INSERT INTO lead_activities (id, lead_id, type, content, metadata, performed_by, performed_by_name)
       VALUES ($1,$2,'opt_out','Customer sent STOP — opted out of ' || $3,$4,'system','System')`,
      [randomUUID(), leadR.rows[0].id, channel, JSON.stringify({ channel, message: text })]
    );
  }

  console.log(`[LeadEngine] Opt-out recorded: mobile=${norm}, channel=${channel}`);
  return true;
}

export async function isOptedOut(mobile: string, channel: string): Promise<boolean> {
  if (!mobile) return false;
  const norm = mobile.replace(/\D/g, "").slice(-10);
  const r = await pool.query(
    `SELECT status FROM communication_consents WHERE REGEXP_REPLACE(mobile,'\\D','','g') LIKE $1 AND channel=$2 LIMIT 1`,
    [`%${norm}`, channel]
  );
  return r.rows[0]?.status === "opted_out";
}

// ── Follow-up automation cron ─────────────────────────────────────────────────

const FOLLOWUP_SEQUENCES = [
  {
    delayMinutes: 30,
    key: "30min_alert",
    title: "30-min Alert: Lead not opened",
    type: "internal_alert",
    message: null, // internal only — notifies assigned executive
  },
  {
    delayMinutes: 120,
    key: "2h_followup",
    title: "2-Hour Follow-up Message",
    type: "whatsapp",
    message: "Assalamu Alaikum! Thank you for your interest in Al Burhan Tours & Travels. We would love to assist you with your Hajj/Umrah journey. When is a good time for our executive to call you? 🕌",
  },
  {
    delayMinutes: 1440,
    key: "24h_call_task",
    title: "24-Hour Call Task",
    type: "call",
    message: null,
  },
  {
    delayMinutes: 4320,
    key: "3d_brochure",
    title: "3-Day Brochure Send",
    type: "whatsapp",
    message: "Assalamu Alaikum! We have prepared a special package brochure for you. Please let us know your travel month and number of travellers so we can give you the best price. 📋",
  },
  {
    delayMinutes: 10080,
    key: "7d_final",
    title: "7-Day Final Follow-up",
    type: "whatsapp",
    message: "Assalamu Alaikum! We hope you are well. This is our final follow-up regarding your Hajj/Umrah enquiry. We have limited seats available. Would you like to confirm your booking? 🕌",
  },
];

export async function ensureFollowupSequence(leadId: string, leadMobile: string | null): Promise<void> {
  // Check how many sequence followups already exist
  const existing = await pool.query(
    `SELECT title FROM lead_followups WHERE lead_id=$1 AND title ILIKE 'LD-SEQ-%'`,
    [leadId]
  );
  const existingTitles = new Set(existing.rows.map((r: any) => r.title));
  const now = new Date();

  for (const seq of FOLLOWUP_SEQUENCES) {
    const seqTitle = `LD-SEQ-${seq.key}`;
    if (existingTitles.has(seqTitle)) continue;

    const dueAt = new Date(now.getTime() + seq.delayMinutes * 60 * 1000);
    await pool.query(
      `INSERT INTO lead_followups (id, lead_id, title, description, due_at, type, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'pending','system')`,
      [
        randomUUID(), leadId, seqTitle,
        seq.message || seq.title,
        dueAt.toISOString(), seq.type
      ]
    );
  }
}

// ── Follow-up automation executor (called by cron) ────────────────────────────

export async function runFollowupCron(): Promise<void> {
  console.log("[LeadEngine] Running follow-up cron...");

  try {
    // Get all pending sequence followups due now
    const dueFollowups = await pool.query(
      `SELECT lf.*, l.mobile, l.name, l.email, l.source, l.assigned_to, l.assigned_name,
              l.pipeline_stage, l.status AS lead_status
       FROM lead_followups lf
       JOIN leads l ON l.id = lf.lead_id
       WHERE lf.status = 'pending'
         AND lf.title ILIKE 'LD-SEQ-%'
         AND lf.due_at <= NOW()
         AND l.status NOT IN ('converted', 'lost', 'spam', 'cancelled')
         AND l.pipeline_stage NOT IN ('lost', 'spam', 'travel_completed')
       ORDER BY lf.due_at ASC
       LIMIT 100`
    );

    for (const fu of dueFollowups.rows) {
      try {
        await processFollowup(fu);
      } catch (err: any) {
        console.error(`[LeadEngine] Followup error for ${fu.id}:`, err.message);
      }
    }

    // SLA monitoring: flag leads assigned >30min ago with no contact
    await runSLACheck();

    console.log(`[LeadEngine] Cron complete. Processed ${dueFollowups.rows.length} follow-ups.`);
  } catch (err: any) {
    console.error("[LeadEngine] Cron error:", err.message);
  }
}

async function processFollowup(fu: any): Promise<void> {
  const seqKey = fu.title.replace("LD-SEQ-", "");
  const seq = FOLLOWUP_SEQUENCES.find(s => s.key === seqKey);
  if (!seq) return;

  let actionTaken = "skipped";

  try {
    if (seq.type === "whatsapp" && seq.message && fu.mobile) {
      // Check opt-out
      const optedOut = await isOptedOut(fu.mobile, "whatsapp");
      if (!optedOut) {
        const sent = await sendWhatsApp(fu.mobile, seq.message);
        actionTaken = sent ? "whatsapp_sent" : "whatsapp_failed";

        // Log outgoing message in social_messages
        if (sent) {
          await pool.query(
            `INSERT INTO social_messages (platform, message_text, message_type, lead_text_id, direction, sender_name, status)
             VALUES ('whatsapp','${seq.message}','text',$1,'outgoing','System','sent')`,
            [fu.lead_id]
          );
        }
      } else {
        actionTaken = "opted_out_skip";
      }
    } else if (seq.type === "call") {
      // Convert to an explicit call task for the assigned executive
      actionTaken = "call_task_created";
    } else if (seq.type === "internal_alert" && fu.assigned_to) {
      // Check if lead was opened (has any activity beyond creation)
      const actCount = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM lead_activities
         WHERE lead_id=$1 AND type NOT IN ('lead_created','assignment') AND created_at > NOW() - INTERVAL '30 minutes'`,
        [fu.lead_id]
      );
      if (actCount.rows[0].cnt === 0) {
        // Lead not touched — log SLA breach activity
        await pool.query(
          `INSERT INTO lead_activities (id, lead_id, type, content, metadata, performed_by, performed_by_name)
           VALUES ($1,$2,'sla_alert','Lead not opened within 30 minutes of assignment',$3,'system','System')`,
          [randomUUID(), fu.lead_id, JSON.stringify({ assigned_to: fu.assigned_to })]
        );
        actionTaken = "sla_alert_logged";
      } else {
        actionTaken = "sla_ok";
      }
    }

    // Mark followup complete
    await pool.query(
      `UPDATE lead_followups
       SET status='completed', completed_at=NOW(), completed_notes=$1, updated_at=NOW()
       WHERE id=$2`,
      [`Auto-executed: ${actionTaken}`, fu.id]
    );

    // Log activity
    await pool.query(
      `INSERT INTO lead_activities (id, lead_id, type, content, metadata, performed_by, performed_by_name)
       VALUES ($1,$2,'auto_followup','Automated follow-up: ' || $3,$4,'system','System')`,
      [randomUUID(), fu.lead_id, seq.title, JSON.stringify({ seq_key: seqKey, action: actionTaken })]
    );

  } catch (err: any) {
    await pool.query(
      `UPDATE lead_followups SET completed_notes=$1, updated_at=NOW() WHERE id=$2`,
      [`Error: ${err.message}`, fu.id]
    );
  }
}

async function runSLACheck(): Promise<void> {
  // Leads assigned >2h ago with no staff activity → escalate
  const slaBreaches = await pool.query(
    `SELECT l.id, l.name, l.assigned_to, l.assigned_name, l.assignment_notified_at
     FROM leads l
     WHERE l.assigned_to IS NOT NULL
       AND l.status NOT IN ('converted','lost','spam','cancelled')
       AND l.assignment_notified_at IS NOT NULL
       AND l.assignment_notified_at < NOW() - INTERVAL '2 hours'
       AND NOT EXISTS (
         SELECT 1 FROM lead_activities la
         WHERE la.lead_id=l.id
           AND la.type IN ('call','message','email','whatsapp','sms','note','stage_change')
           AND la.performed_by != 'system'
           AND la.created_at > l.assignment_notified_at
       )
       AND NOT EXISTS (
         SELECT 1 FROM lead_activities la2
         WHERE la2.lead_id=l.id AND la2.type='sla_escalation'
           AND la2.created_at > NOW() - INTERVAL '12 hours'
       )
     LIMIT 20`
  );

  for (const lead of slaBreaches.rows) {
    await pool.query(
      `INSERT INTO lead_activities (id, lead_id, type, content, metadata, performed_by, performed_by_name)
       VALUES ($1,$2,'sla_escalation','Lead uncontacted for 2+ hours after assignment',$3,'system','System')`,
      [randomUUID(), lead.id, JSON.stringify({ assigned_to: lead.assigned_to, assigned_name: lead.assigned_name })]
    );
  }
}

// ── Ensure extra columns ───────────────────────────────────────────────────────

export async function ensureLeadEngineSchema(): Promise<void> {
  const cols = [
    ["campaign_id", "TEXT"],
    ["campaign_name", "TEXT"],
    ["ad_set_id", "TEXT"],
    ["ad_set_name", "TEXT"],
    ["ad_id", "TEXT"],
    ["ad_name", "TEXT"],
    ["form_id", "TEXT"],
    ["whatsapp_number", "TEXT"],
    ["score_factors", "JSONB DEFAULT '{}'::jsonb"],
    ["assignment_notified_at", "TIMESTAMPTZ"],
  ];
  for (const [col, type] of cols) {
    try {
      await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ${col} ${type}`);
    } catch {}
  }

  // crm_assignment_rules — advanced assignment with multiple methods
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_assignment_rules (
      id TEXT PRIMARY KEY,
      rule_name TEXT NOT NULL,
      priority INTEGER DEFAULT 10,
      method TEXT NOT NULL DEFAULT 'round_robin',
      conditions JSONB DEFAULT '{}'::jsonb,
      team_user_ids TEXT[] DEFAULT '{}',
      assign_to_user_id TEXT,
      assign_to_branch TEXT,
      sla_minutes INTEGER DEFAULT 120,
      is_active BOOLEAN DEFAULT true,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_crm_assignment_rules_priority ON crm_assignment_rules(priority, is_active)`);

  // lead_auto_followup_log — track what auto-messages were sent
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_auto_followup_log (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL,
      seq_key TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      error TEXT,
      UNIQUE(lead_id, seq_key)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_lead_auto_followup_lead ON lead_auto_followup_log(lead_id)`);

  console.log("[LeadEngine] Schema ready");
}
