import { Router } from "express";
import { requireAdmin, type AuthenticatedRequest } from "../lib/auth.js";
import { sendText, sendTemplate, sendInteractiveButtons, type BotBeeResult } from "../lib/botbee.js";
import { pool } from "@workspace/db";

const router = Router();

// POST /api/whatsapp/test — Admin test send with full response
router.post("/test", requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  const { mobile, message, templateName, components, buttons, bodyText } = req.body;
  if (!mobile || !mobile.trim()) {
    return res.status(400).json({ ok: false, message: "mobile is required" });
  }

  const to = mobile.trim();
  const testMessage = message?.trim() ||
    `🧪 Test from Al Burhan ERP\n${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}\n\nAl Burhan Tours & Travels`;

  let result: BotBeeResult;

  if (templateName) {
    result = await sendTemplate(to, templateName, components || []);
  } else if (buttons && Array.isArray(buttons) && buttons.length > 0) {
    result = await sendInteractiveButtons(to, bodyText || testMessage, buttons);
  } else {
    result = await sendText(to, testMessage);
  }

  try {
    const id = `nl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, channel, recipient, message, status, provider_response,
        provider_name, api_endpoint, http_status, request_payload, error_code,
        sent_at, retry_count)
       VALUES ($1,'test_send','whatsapp',$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),0)`,
      [
        id, to, templateName ? `[template] ${templateName}` : testMessage.substring(0, 300),
        result.ok ? "sent" : "failed",
        JSON.stringify(result),
        result.provider, result.endpoint, result.httpStatus || null,
        result.requestPayload ? JSON.stringify(result.requestPayload) : null,
        result.errorCode || null,
      ]
    );
  } catch (logErr) {
    console.error("[WhatsApp test] log insert failed:", logErr);
  }

  res.json({
    ok: result.ok,
    provider: result.provider,
    endpoint: result.endpoint,
    httpStatus: result.httpStatus,
    requestPayload: result.requestPayload,
    responsePayload: result.responsePayload,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    logged: true,
  });
});

// GET /api/whatsapp/status — check BotBee credentials
router.get("/status", requireAdmin as any, async (_req, res) => {
  const { getCachedConfig } = await import("../lib/apiSettingsProvider.js");
  const bbCfg = getCachedConfig("botbee");
  const apiToken = bbCfg.apiKey || process.env.BOTBEE_API_KEY;
  const phoneNumberId = bbCfg.extra?.phone_number_id || process.env.BOTBEE_PHONE_NUMBER_ID;
  const businessId = bbCfg.extra?.business_id || process.env.BOTBEE_BUSINESS_ID;
  res.json({
    configured: !!(apiToken && phoneNumberId),
    enabled: bbCfg.enabled !== false,
    apiKeyPresent: !!apiToken,
    phoneNumberIdPresent: !!phoneNumberId,
    businessIdPresent: !!businessId,
    apiKeyMasked: apiToken ? `${apiToken.slice(0, 6)}...${apiToken.slice(-4)}` : null,
    phoneNumberId: phoneNumberId || null,
    baseUrl: (bbCfg.apiUrl || "https://app.botbee.io/api/v1").replace(/\/whatsapp\/?$/, ""),
  });
});

export default router;
