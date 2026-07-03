import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "../lib/auth.js";
import { pool } from "@workspace/db";

const router = Router();

function getClient() {
  const baseURL = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"];
  const apiKey = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] || "dummy-key";
  if (!baseURL) throw new Error("AI_INTEGRATIONS_ANTHROPIC_BASE_URL not set");
  return new Anthropic({ apiKey, baseURL });
}

// POST /api/ai/whatsapp-writer
// Generate a WhatsApp message draft for pilgrims
router.post("/whatsapp-writer", requireAdmin as any, async (req, res) => {
  const { context, tone, recipientType, language, extraInstructions } = req.body;
  if (!context) return res.status(400).json({ error: "Context is required" });

  try {
    const client = getClient();
    const systemPrompt = `You are an expert WhatsApp message writer for Al Burhan Tours & Travels, a Hajj and Umrah travel agency based in India.
Write clear, respectful, and appropriate messages for pilgrims and their families.
Keep messages concise and suitable for WhatsApp (max 3-4 short paragraphs).
Use ${language === "arabic" ? "Arabic (formal)" : language === "urdu" ? "Urdu" : "English"} language.
Tone should be ${tone || "professional and warm"}.
Do NOT use emojis unless specifically requested.`;

    const userPrompt = `Write a WhatsApp message for ${recipientType || "pilgrims"}.
Context/Purpose: ${context}
${extraInstructions ? `Additional instructions: ${extraInstructions}` : ""}

Output only the message text, ready to copy and send. No explanations or headings.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const message = response.content[0]?.type === "text" ? response.content[0].text : "";
    res.json({ message });
  } catch (err: any) {
    console.error("[AI] WhatsApp writer error:", err);
    res.status(500).json({ error: err.message || "AI service unavailable" });
  }
});

// POST /api/ai/report-summary
// Generate an AI summary of group/financial data
router.post("/report-summary", requireAdmin as any, async (req, res) => {
  const { reportType, groupId } = req.body;

  try {
    let dataText = "";

    if (reportType === "group" && groupId) {
      const [group, pilgrims, payments] = await Promise.all([
        pool.query(`SELECT group_name, year, departure_date, return_date, flight_number, maktab_number FROM hajj_groups WHERE id=$1`, [groupId]),
        pool.query(`SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE gender='Male')::int as male, COUNT(*) FILTER (WHERE gender='Female')::int as female, COUNT(*) FILTER (WHERE visa_status='received')::int as visa_received, COUNT(*) FILTER (WHERE bus_number IS NOT NULL)::int as bus_assigned FROM pilgrims WHERE group_id=$1`, [groupId]),
        pool.query(`SELECT COUNT(*)::int as payments, COALESCE(SUM(amount),0)::numeric as total_collected FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE group_id=$1 OR customer_id IN (SELECT DISTINCT id FROM users WHERE id IN (SELECT customer_id FROM bookings)))`, [groupId]).catch(() => ({ rows: [{}] })),
      ]);
      const g = group.rows[0] || {};
      const p = pilgrims.rows[0] || {};
      dataText = `Group: ${g.group_name || 'N/A'}, Year: ${g.year || 'N/A'}
Departure: ${g.departure_date || 'TBD'}, Return: ${g.return_date || 'TBD'}
Flight: ${g.flight_number || 'N/A'}, Maktab: ${g.maktab_number || 'N/A'}
Total Pilgrims: ${p.total || 0} (Male: ${p.male || 0}, Female: ${p.female || 0})
Visa Received: ${p.visa_received || 0}/${p.total || 0}
Bus Assigned: ${p.bus_assigned || 0}/${p.total || 0}`;
    } else if (reportType === "financial") {
      const result = await pool.query(`
        SELECT COUNT(DISTINCT b.id)::int as total_bookings,
          COALESCE(SUM(b.total_amount),0)::numeric as total_revenue,
          COALESCE(SUM(p.amount),0)::numeric as total_collected,
          COUNT(DISTINCT b.customer_id)::int as unique_customers
        FROM bookings b
        LEFT JOIN payments p ON p.booking_id = b.id
      `).catch(() => ({ rows: [{}] }));
      const r = result.rows[0] || {};
      dataText = `Total Bookings: ${r.total_bookings || 0}
Total Revenue: ₹${Number(r.total_revenue || 0).toLocaleString("en-IN")}
Amount Collected: ₹${Number(r.total_collected || 0).toLocaleString("en-IN")}
Outstanding: ₹${Number((r.total_revenue || 0) - (r.total_collected || 0)).toLocaleString("en-IN")}
Unique Customers: ${r.unique_customers || 0}`;
    } else if (reportType === "medical") {
      const result = await pool.query(`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status='open')::int as open_cases,
          COUNT(*) FILTER (WHERE severity='critical')::int as critical,
          COUNT(*) FILTER (WHERE status='resolved')::int as resolved,
          COUNT(DISTINCT case_type) as case_types
        FROM medical_cases
      `).catch(() => ({ rows: [{}] }));
      const r = result.rows[0] || {};
      dataText = `Total Medical Cases: ${r.total || 0}
Open Cases: ${r.open_cases || 0}
Critical Cases: ${r.critical || 0}
Resolved: ${r.resolved || 0}
Distinct Case Types: ${r.case_types || 0}`;
    } else if (reportType === "visa") {
      const result = await pool.query(`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE COALESCE(visa_status,'not_applied')='not_applied')::int as not_applied,
          COUNT(*) FILTER (WHERE visa_status='received')::int as received,
          COUNT(*) FILTER (WHERE visa_status='rejected')::int as rejected,
          COUNT(*) FILTER (WHERE visa_status='in_process' OR visa_status='applied')::int as in_process
        FROM pilgrims
      `).catch(() => ({ rows: [{}] }));
      const r = result.rows[0] || {};
      dataText = `Total Pilgrims: ${r.total || 0}
Visa Not Applied: ${r.not_applied || 0}
Visa Received: ${r.received || 0}
In Process: ${r.in_process || 0}
Rejected: ${r.rejected || 0}`;
    }

    const client = getClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: `You are an ERP analyst for Al Burhan Tours & Travels (Hajj & Umrah agency).
Generate a concise, professional ${reportType} report summary in 3-5 bullet points.
Include key insights, any concerns, and actionable recommendations.

Data:
${dataText}

Format as bullet points with emojis. Be specific with numbers.`,
      }],
    });

    const summary = response.content[0]?.type === "text" ? response.content[0].text : "";
    res.json({ summary, data: dataText });
  } catch (err: any) {
    console.error("[AI] Report summary error:", err);
    res.status(500).json({ error: err.message || "AI service unavailable" });
  }
});

// POST /api/ai/ocr-passport
// Extract passport/visa data from base64 image
router.post("/ocr-passport", requireAdmin as any, async (req, res) => {
  const { imageBase64, mediaType, documentType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "Image data required" });

  try {
    const client = getClient();
    const docLabel = documentType === "visa" ? "Visa" : "Passport";
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: (mediaType || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: `Extract all ${docLabel} information from this image.
Return ONLY a JSON object with these fields (use null for missing fields):
{
  "fullName": "...",
  "passportNumber": "...",
  "dateOfBirth": "DD/MM/YYYY",
  "gender": "Male/Female",
  "nationality": "...",
  "placeOfBirth": "...",
  "issueDate": "DD/MM/YYYY",
  "expiryDate": "DD/MM/YYYY",
  "placeOfIssue": "...",
  "visaNumber": "...",
  "visaType": "...",
  "fatherName": "..."
}
Return ONLY the JSON, no explanation.`,
          },
        ],
      }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    let parsed: Record<string, string | null> = {};
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      parsed = {};
    }
    res.json({ data: parsed, raw: text });
  } catch (err: any) {
    console.error("[AI] OCR error:", err);
    res.status(500).json({ error: err.message || "AI OCR service unavailable" });
  }
});

export default router;
