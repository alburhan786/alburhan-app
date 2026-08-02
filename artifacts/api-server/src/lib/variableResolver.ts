// @ts-nocheck
/**
 * PROVIDER-AWARE TEMPLATE VARIABLE RESOLVER
 *
 * Resolves template variables in ALL formats used by the ERP:
 *   • #!Name!#  #!BookingID!#  (BotBee named-object format)
 *   • {{1}} {{2}}              (Meta / WhatsApp positional)
 *   • {name} {booking_id}     (Email / generic brace format)
 *   • plain key objects        (RCS Lemin key=value)
 *
 * Usage:
 *   const vars = resolveTemplateVariables({ channel, provider, event, templateId, context });
 *   // vars.variables  → the resolved provider-specific object to send
 *   // vars.issues     → missing/invalid fields (non-empty = do not send)
 */

import { pool } from "@workspace/db";
import type { CommunicationContext } from "./communicationContext.js";

export interface VariableResolutionResult {
  /** Provider-specific variables object ready to pass to the send function */
  variables: Record<string, string>;
  /** Positional array form for Meta {{1}} templates */
  positional: string[];
  /** Named object form for BotBee #!Key!# templates */
  named: Record<string, string>;
  /** Raw rendered message body with all placeholders substituted */
  renderedBody: string;
  /** Issues that MUST block sending */
  issues: string[];
  /** Warnings (non-blocking) */
  warnings: string[];
}

// ── Context → flat string map ─────────────────────────────────────────────────
// Maps every CommunicationContext key to its normalized string value.
// Also creates provider-specific aliases for all known template variable formats.

function flattenContext(ctx: CommunicationContext): Record<string, string> {
  const s = (v: unknown): string => (v == null || v === "" ? "" : String(v));

  const flat: Record<string, string> = {};

  // Direct from context
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v !== "object") flat[k] = s(v);
  }

  // BotBee #!Key!# aliases (case-sensitive exact match)
  flat["Name"]            = s(ctx.customer_name);
  flat["BookingID"]       = s(ctx.booking_id || ctx.booking_number);
  flat["PackageContent"]  = s(ctx.package_name);
  flat["Amount"]          = s(ctx.grand_total);
  flat["Paymenturllink"]  = s(ctx.payment_url || ctx.agreement_url);
  flat["Download"]        = s(ctx.invoice_url || ctx.agreement_url || ctx.document_url);
  flat["InvoiceNo"]       = s(ctx.invoice_number);
  flat["PaidAmount"]      = s(ctx.amount_paid);
  flat["OutstandingAmount"] = s(ctx.outstanding_amount);
  flat["Agreement"]       = s(ctx.agreement_number);
  flat["ReceiptNo"]       = s(ctx.receipt_number);
  flat["ReceiptUrl"]      = s(ctx.receipt_url);
  flat["DepartureDate"]   = s(ctx.departure_date);
  flat["FlightNumber"]    = s(ctx.flight_number);
  flat["HotelName"]       = s(ctx.makkah_hotel);
  flat["RoomNumber"]      = s(ctx.room_number);
  flat["BusNumber"]       = s(ctx.bus_number);
  flat["SupportPhone"]    = s(ctx.support_phone);
  flat["CompanyName"]     = s(ctx.company_name);

  // Email / generic {placeholder} aliases
  flat["customer_name"]   = s(ctx.customer_name);
  flat["first_name"]      = s(ctx.first_name);
  flat["booking_number"]  = s(ctx.booking_number);
  flat["booking_id"]      = s(ctx.booking_id || ctx.booking_number);
  flat["package_name"]    = s(ctx.package_name);
  flat["grand_total"]     = s(ctx.grand_total);
  flat["amount"]          = s(ctx.grand_total);
  flat["total_amount"]    = s(ctx.grand_total);
  flat["amount_paid"]     = s(ctx.amount_paid);
  flat["outstanding_amount"] = s(ctx.outstanding_amount);
  flat["payment_url"]     = s(ctx.payment_url);
  flat["payment_link"]    = s(ctx.payment_url);
  flat["invoice_number"]  = s(ctx.invoice_number);
  flat["invoice_url"]     = s(ctx.invoice_url);
  flat["receipt_number"]  = s(ctx.receipt_number);
  flat["receipt_url"]     = s(ctx.receipt_url);
  flat["agreement_url"]   = s(ctx.agreement_url);
  flat["agreement_number"] = s(ctx.agreement_number);
  flat["departure_date"]  = s(ctx.departure_date);
  flat["return_date"]     = s(ctx.return_date);
  flat["flight_number"]   = s(ctx.flight_number);
  flat["airline"]         = s(ctx.airline);
  flat["portal_link"]     = s(ctx.agreement_url || ctx.payment_url);
  flat["document_url"]    = s(ctx.document_url);
  flat["visa_url"]        = s(ctx.visa_url);
  flat["ticket_url"]      = s(ctx.ticket_url);
  flat["voucher_url"]     = s(ctx.voucher_url);
  flat["due_date"]        = s(ctx.payment_due_date);
  flat["payment_due_date"] = s(ctx.payment_due_date);
  flat["days_remaining"]  = s(ctx.days_remaining);
  flat["group_name"]      = s(ctx.group_name);
  flat["room_number"]     = s(ctx.room_number);
  flat["bus_number"]      = s(ctx.bus_number);
  flat["support_phone"]   = s(ctx.support_phone);
  flat["company_name"]    = s(ctx.company_name);
  flat["website_url"]     = s(ctx.website_url);

  // Lemin RCS — various key formats observed in production
  flat["booking id"]      = flat["booking_id"];
  flat["customer name"]   = flat["customer_name"];
  flat["package name"]    = flat["package_name"];
  flat["invoice no"]      = flat["invoice_number"];
  flat["paid amount"]     = flat["amount_paid"];
  flat["outstanding balance"] = flat["outstanding_amount"];
  flat["total amount"]    = flat["grand_total"];

  return flat;
}

// ── Substitution engines ──────────────────────────────────────────────────────

/** Replaces #!Key!# placeholders */
function substituteBotBeeStyle(template: string, vars: Record<string, string>): string {
  return template.replace(/#!([^!]+)!#/g, (_, key) => vars[key] ?? `#!${key}!#`);
}

/** Replaces {{1}} {{2}} positional placeholders */
function substitutePositional(template: string, values: string[]): string {
  return template.replace(/\{\{(\d+)\}\}/g, (_, idx) => values[Number(idx) - 1] ?? `{{${idx}}}`);
}

/** Replaces {key} brace placeholders */
function substituteBraceStyle(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

/** Detects remaining unresolved placeholders */
function findUnresolved(text: string): string[] {
  const found: string[] = [];
  const patterns = [/#!([^!]+)!#/g, /\{\{(\d+)\}\}/g, /\{([^}]+)\}/g];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) found.push(m[0]);
  }
  return found;
}

// ── Main resolver ─────────────────────────────────────────────────────────────

export interface ResolveOpts {
  channel: "whatsapp" | "sms" | "rcs" | "email" | "push";
  provider?: string;
  event: string;
  templateId?: string;
  context: CommunicationContext;
  /** For positional templates, ordered values (overrides auto-extraction) */
  positionalOverride?: string[];
}

export async function resolveTemplateVariables(opts: ResolveOpts): Promise<VariableResolutionResult> {
  const { channel, provider, event, templateId, context, positionalOverride } = opts;
  const issues: string[] = [];
  const warnings: string[] = [];

  // Load template body from DB if templateId provided
  let templateBody = "";
  let requiredVarKeys: string[] = [];
  if (templateId) {
    try {
      const tplRow = await pool.query(
        `SELECT body, variables, required_variables FROM notification_templates WHERE id=$1 LIMIT 1`,
        [templateId]
      );
      if (tplRow.rows[0]) {
        templateBody = tplRow.rows[0].body || "";
        const rv = tplRow.rows[0].required_variables || tplRow.rows[0].variables;
        if (Array.isArray(rv)) {
          requiredVarKeys = rv.map((v: any) => (typeof v === "string" ? v : v?.key || v?.name || "")).filter(Boolean);
        }
      }
    } catch {}
  }

  const flat = flattenContext(context);

  // ── Build named object (BotBee) ──────────────────────────────────────────
  const named: Record<string, string> = {};
  // Include all BotBee-style keys that have values
  const BOTBEE_KEYS = ["Name","BookingID","PackageContent","Amount","Paymenturllink","Download",
    "InvoiceNo","PaidAmount","OutstandingAmount","Agreement","ReceiptNo","ReceiptUrl",
    "DepartureDate","FlightNumber","HotelName","RoomNumber","BusNumber","SupportPhone","CompanyName"];
  for (const k of BOTBEE_KEYS) {
    if (flat[k]) named[k] = flat[k];
  }

  // ── Build positional array ────────────────────────────────────────────────
  let positional: string[] = positionalOverride || [];
  if (!positional.length) {
    // Auto-derive from template body {{1}} {{2}} ...
    if (templateBody) {
      const maxIdx = Math.max(...[...templateBody.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1])), 0);
      if (maxIdx > 0) {
        // Try to fill in order from common fields
        const autoPositional = [
          flat["Name"], flat["BookingID"], flat["PackageContent"], flat["Amount"],
          flat["Paymenturllink"], flat["InvoiceNo"], flat["DepartureDate"],
        ];
        positional = autoPositional.slice(0, maxIdx);
      }
    }
  }

  // ── Render body ───────────────────────────────────────────────────────────
  let renderedBody = templateBody;
  if (renderedBody) {
    renderedBody = substituteBotBeeStyle(renderedBody, flat);
    renderedBody = substitutePositional(renderedBody, positional);
    renderedBody = substituteBraceStyle(renderedBody, flat);
  }

  // ── Validate required variables ───────────────────────────────────────────
  for (const key of requiredVarKeys) {
    if (!flat[key]) {
      issues.push(`Required variable "${key}" is missing or blank`);
    }
  }

  // ── Check for any remaining unresolved placeholders in rendered body ──────
  if (renderedBody) {
    const unresolved = findUnresolved(renderedBody);
    for (const u of unresolved) {
      issues.push(`Unresolved placeholder in rendered message: ${u} — error code UNRESOLVED_TEMPLATE_VARIABLE`);
    }
  }

  // ── Channel-specific validation ───────────────────────────────────────────
  if (channel === "whatsapp" || channel === "sms") {
    if (!flat["Name"]) issues.push("customer_name (Name) is required for WhatsApp/SMS templates");
    if (!flat["BookingID"]) warnings.push("booking_id (BookingID) is blank — template will show empty booking reference");
  }
  if (channel === "email") {
    if (!context.email) issues.push("customer email is required for email channel");
  }

  // ── URL validation ────────────────────────────────────────────────────────
  const urlVars = [flat["Paymenturllink"], flat["Download"], flat["invoice_url"], flat["agreement_url"]];
  for (const u of urlVars) {
    if (u && !/^https:\/\//i.test(u) && u.length > 0) {
      warnings.push(`URL field is not HTTPS: ${u.slice(0, 60)}`);
    }
    if (u && /(localhost|127\.0\.0\.1|replit\.dev)/i.test(u)) {
      issues.push(`URL contains development domain: ${u.slice(0, 60)}`);
    }
  }

  return {
    variables: flat,
    positional,
    named,
    renderedBody,
    issues,
    warnings,
  };
}

// ── Convenience: validate before sending ──────────────────────────────────────
export function assertResolvable(result: VariableResolutionResult): void {
  if (result.issues.length > 0) {
    throw new Error(
      `UNRESOLVED_TEMPLATE_VARIABLE: ${result.issues.join("; ")}`
    );
  }
}
