import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = import.meta.env.VITE_API_URL || "";

type HealthData = {
  checkedAt: string;
  app: any;
  facebook: any;
  instagram: any;
  whatsapp: any;
  messenger: any;
  webhooks: any;
  token_debug: any;
  summary: { working: string[]; errors: string[]; warnings: string[] };
};

function StatusBadge({ ok, configured }: { ok: boolean; configured: boolean }) {
  if (!configured) return <Badge className="bg-gray-100 text-gray-600 border-gray-300">Not Configured</Badge>;
  if (ok) return <Badge className="bg-green-100 text-green-700 border-green-300">✅ Connected</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-300">❌ Error</Badge>;
}

function FieldRow({ label, value, mono = false, warn = false }: { label: string; value: any; mono?: boolean; warn?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start gap-2 text-xs py-1 border-b border-gray-50 last:border-0">
      <span className="text-gray-500 min-w-[140px] flex-shrink-0">{label}</span>
      <span className={`font-medium break-all ${mono ? "font-mono" : ""} ${warn ? "text-amber-600" : "text-gray-800"}`}>
        {String(value)}
      </span>
    </div>
  );
}

function HealthCard({
  icon, title, component, ok, configured, error, children, action
}: {
  icon: string; title: string; component: string;
  ok: boolean; configured: boolean; error?: string | null;
  children?: React.ReactNode; action?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = !configured ? "border-gray-200" : ok ? "border-green-200" : "border-red-200";
  const bgColor = !configured ? "bg-gray-50" : ok ? "bg-green-50/40" : "bg-red-50/40";

  return (
    <div className={`border rounded-xl overflow-hidden ${borderColor}`}>
      <div className={`p-4 ${bgColor}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{icon}</span>
            <div>
              <p className="font-semibold text-sm text-gray-900">{title}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{component}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge ok={ok} configured={configured} />
            {(children || error) && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="text-[10px] text-gray-400 hover:text-gray-700 px-1"
              >
                {expanded ? "▲" : "▼"}
              </button>
            )}
          </div>
        </div>
        {error && !expanded && (
          <p className="text-xs text-red-600 mt-2 bg-red-50 rounded p-1.5 border border-red-100">{error}</p>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>

      {expanded && (children || error) && (
        <div className="px-4 pb-3 pt-2 bg-white border-t border-gray-100">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded p-2 mb-2 border border-red-100">
              <strong>Error:</strong> {error}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

function TokenDebugPanel({ debug }: { debug: any }) {
  if (!debug || (Object.keys(debug).length === 0)) {
    return (
      <div className="border rounded-xl p-4 bg-amber-50 border-amber-200">
        <p className="text-sm font-semibold text-amber-800 mb-1">🔑 Token Debug — Not Available</p>
        <p className="text-xs text-amber-700">App ID and App Secret are required for token inspection. Configure them in the Facebook Page settings.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-xl p-4 bg-white">
      <p className="text-sm font-semibold text-gray-800 mb-3">🔑 Token Debug</p>
      <div className="space-y-4">
        {debug.facebook && (
          <div>
            <p className="text-xs font-medium text-blue-700 mb-1">📘 Facebook Page Token</p>
            <div className="bg-gray-50 rounded p-2 space-y-0.5">
              <FieldRow label="Valid" value={debug.facebook.valid ? "✅ Yes" : "❌ No"} />
              <FieldRow label="Token Type" value={debug.facebook.type} />
              <FieldRow label="Expires" value={debug.facebook.expires_at} />
              <FieldRow label="Issued At" value={debug.facebook.issued_at} />
              {debug.facebook.error && <FieldRow label="Error" value={debug.facebook.error} warn />}
              {debug.facebook.scopes?.length > 0 && (
                <div className="text-xs py-1">
                  <span className="text-gray-500">Permissions: </span>
                  <span className="text-gray-800">{debug.facebook.scopes.join(", ")}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {debug.whatsapp && (
          <div>
            <p className="text-xs font-medium text-green-700 mb-1">💬 WhatsApp Token</p>
            <div className="bg-gray-50 rounded p-2 space-y-0.5">
              <FieldRow label="Valid" value={debug.whatsapp.valid ? "✅ Yes" : "❌ No"} />
              <FieldRow label="Token Type" value={debug.whatsapp.type} />
              <FieldRow label="Expires" value={debug.whatsapp.expires_at} />
              {debug.whatsapp.error && <FieldRow label="Error" value={debug.whatsapp.error} warn />}
              {debug.whatsapp.scopes?.length > 0 && (
                <div className="text-xs py-1">
                  <span className="text-gray-500">Permissions: </span>
                  <span className="text-gray-800">{debug.whatsapp.scopes.join(", ")}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MetaHealth() {
  const { can } = usePermissions();
  const { toast } = useToast();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);

  const runCheck = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/social-media/meta/health`, { credentials: "include" });
      const d = await r.json();
      setData(d);
    } catch (e: any) {
      toast({ title: "Health check failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { runCheck(); }, [runCheck]);

  const subscribeWebhooks = async () => {
    setSubscribing(true);
    try {
      const r = await fetch(`${API}/api/social-media/meta/subscribe-webhooks`, {
        method: "POST", credentials: "include",
      });
      const d = await r.json();
      if (d.ok) {
        toast({ title: "Webhooks subscribed", description: d.message });
        runCheck();
      } else {
        toast({ title: "Subscription failed", description: d.message, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubscribing(false);
    }
  };

  if (!can("settings", "view")) {
    return <AdminLayout><div className="p-8 text-center text-muted-foreground">Access denied.</div></AdminLayout>;
  }

  const h = data;

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🔷 Meta Connection Health</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live audit of Facebook, Instagram, WhatsApp and Messenger Graph API connections.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {h?.checkedAt && (
              <span className="text-xs text-muted-foreground bg-gray-100 px-3 py-1.5 rounded-lg">
                Last checked: {new Date(h.checkedAt).toLocaleTimeString("en-IN")}
              </span>
            )}
            <Button onClick={runCheck} disabled={loading} size="sm" variant="outline">
              {loading ? "Checking…" : "↻ Run Check"}
            </Button>
          </div>
        </div>

        {loading && !data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="border rounded-xl p-4 bg-gray-50 animate-pulse">
                <div className="h-6 w-1/3 bg-gray-200 rounded mb-2" />
                <div className="h-4 w-1/2 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        )}

        {h && (
          <>
            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-3">
              <div className="border rounded-xl p-3 bg-green-50 border-green-200 text-center">
                <p className="text-xl font-bold text-green-700">{h.summary.working.length}</p>
                <p className="text-[10px] text-green-600">Working</p>
              </div>
              <div className="border rounded-xl p-3 bg-red-50 border-red-200 text-center">
                <p className="text-xl font-bold text-red-700">{h.summary.errors.length}</p>
                <p className="text-[10px] text-red-600">Errors</p>
              </div>
              <div className="border rounded-xl p-3 bg-amber-50 border-amber-200 text-center">
                <p className="text-xl font-bold text-amber-700">{h.summary.warnings.length}</p>
                <p className="text-[10px] text-amber-600">Warnings</p>
              </div>
            </div>

            {/* Status Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* App Status */}
              <HealthCard
                icon="🛡️" title="Meta App" component={h.app.app_id ? `App ID: ${h.app.app_id}` : "No credentials"}
                ok={h.app.ok} configured={h.app.configured} error={h.app.error}
              >
                <FieldRow label="App Name" value={h.app.app_name} />
                <FieldRow label="App ID" value={h.app.app_id} mono />
                <FieldRow label="Category" value={h.app.category} />
              </HealthCard>

              {/* Facebook Page */}
              <HealthCard
                icon="📘" title="Facebook Page"
                component={h.facebook.page_name ? h.facebook.page_name : (h.facebook.configured ? "Token configured" : "Not configured")}
                ok={h.facebook.ok} configured={h.facebook.configured} error={h.facebook.error}
              >
                <FieldRow label="Page ID" value={h.facebook.page_id} mono />
                <FieldRow label="Page Name" value={h.facebook.page_name} />
                <FieldRow label="Followers" value={h.facebook.followers_count?.toLocaleString()} />
                <FieldRow label="Fan Count" value={h.facebook.fan_count?.toLocaleString()} />
                <FieldRow label="Category" value={h.facebook.category} />
                <FieldRow label="Error Code" value={h.facebook.error_code} warn />
              </HealthCard>

              {/* Instagram */}
              <HealthCard
                icon="📸" title="Instagram Business"
                component={h.instagram.username ? `@${h.instagram.username}` : (h.instagram.configured ? "Account ID set" : "Not configured")}
                ok={h.instagram.ok} configured={h.instagram.configured} error={h.instagram.error}
              >
                <FieldRow label="Account ID" value={h.instagram.ig_id} mono />
                <FieldRow label="Username" value={h.instagram.username ? `@${h.instagram.username}` : null} />
                <FieldRow label="Followers" value={h.instagram.followers_count?.toLocaleString()} />
                <FieldRow label="Media Count" value={h.instagram.media_count} />
                {h.instagram.suggested_id && (
                  <div className="mt-2 text-xs bg-blue-50 border border-blue-200 rounded p-2">
                    💡 <strong>Suggested Account ID:</strong>{" "}
                    <code className="font-mono text-blue-700">{h.instagram.suggested_id}</code>
                    <br />Save this value in Instagram settings.
                  </div>
                )}
              </HealthCard>

              {/* WhatsApp */}
              <HealthCard
                icon="💬" title="WhatsApp Business"
                component={h.whatsapp.phone_number || (h.whatsapp.configured ? "Phone ID configured" : "Not configured")}
                ok={h.whatsapp.ok} configured={h.whatsapp.configured} error={h.whatsapp.error}
              >
                <FieldRow label="Phone Number" value={h.whatsapp.phone_number} />
                <FieldRow label="Verified Name" value={h.whatsapp.verified_name} />
                <FieldRow label="Quality" value={h.whatsapp.quality_rating} />
                <FieldRow label="Status" value={h.whatsapp.status} />
                <FieldRow label="WABA Name" value={h.whatsapp.waba_name} />
                <FieldRow label="Currency" value={h.whatsapp.currency} />
              </HealthCard>

              {/* Messenger */}
              <HealthCard
                icon="💬" title="Messenger"
                component={h.messenger.ok ? "Subscribed" : (h.messenger.configured ? "Check required" : "Needs FB token")}
                ok={h.messenger.ok} configured={h.messenger.configured} error={h.messenger.error}
              >
                {h.messenger.subscribed_fields?.length > 0 && (
                  <div className="text-xs">
                    <p className="text-gray-500 mb-1">Subscribed fields:</p>
                    <p className="font-mono text-gray-800 break-all">{h.messenger.subscribed_fields.join(", ")}</p>
                  </div>
                )}
              </HealthCard>

              {/* Webhooks */}
              <HealthCard
                icon="🔗" title="Webhooks"
                component={h.webhooks.webhook_verified ? "Verified" : "Not verified"}
                ok={h.webhooks.verify_token_set && h.webhooks.webhook_verified}
                configured={h.webhooks.configured}
                error={!h.webhooks.verify_token_set && h.webhooks.configured ? "Verify token looks like a URL — must be a secret string" : null}
                action={
                  <Button
                    size="sm" variant="outline"
                    className="text-xs h-7 mt-1"
                    onClick={subscribeWebhooks}
                    disabled={subscribing}
                  >
                    {subscribing ? "Subscribing…" : "📡 Subscribe All Webhook Fields"}
                  </Button>
                }
              >
                <FieldRow label="Verify Token Set" value={h.webhooks.verify_token_set ? "✅ Yes (secret string)" : "❌ No"} />
                <FieldRow label="Webhook Verified" value={h.webhooks.webhook_verified ? "✅ Yes" : "❌ Not verified"} />
                <FieldRow label="Webhook URL" value={h.webhooks.webhook_url} mono />
                <FieldRow label="Last Received" value={h.webhooks.last_received ? new Date(h.webhooks.last_received).toLocaleString() : "Never"} />
                {h.webhooks.subscribed_fields?.length > 0 && (
                  <div className="text-xs pt-1">
                    <p className="text-gray-500 mb-0.5">Subscribed fields:</p>
                    <p className="font-mono text-gray-700 break-all">{h.webhooks.subscribed_fields.join(", ")}</p>
                  </div>
                )}
              </HealthCard>
            </div>

            {/* Token Debug */}
            <TokenDebugPanel debug={h.token_debug} />

            {/* Required Permissions Reference */}
            <div className="border rounded-xl p-4 bg-white">
              <p className="text-sm font-semibold text-gray-800 mb-3">📋 Required Graph API Permissions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {[
                  { platform: "📘 Facebook Page", perms: ["pages_show_list","pages_read_engagement","pages_manage_metadata","pages_read_user_content"] },
                  { platform: "💬 Messenger", perms: ["pages_messaging","pages_messaging_subscriptions"] },
                  { platform: "🎯 Lead Ads", perms: ["leads_retrieval","pages_manage_ads"] },
                  { platform: "📸 Instagram", perms: ["instagram_basic","instagram_manage_messages","instagram_manage_comments","instagram_content_publish"] },
                  { platform: "💬 WhatsApp", perms: ["whatsapp_business_messaging","whatsapp_business_management"] },
                  { platform: "🔗 Webhooks", perms: ["messages","messaging_postbacks","message_deliveries","leadgen","feed"] },
                ].map(({ platform: plt, perms }) => (
                  <div key={plt}>
                    <p className="font-medium text-gray-700 mb-1">{plt}</p>
                    <div className="space-y-0.5">
                      {perms.map(p => {
                        const granted = h.token_debug?.facebook?.scopes?.includes(p);
                        return (
                          <div key={p} className="flex items-center gap-1">
                            <span className={granted ? "text-green-600" : "text-gray-400"}>{granted ? "✅" : "○"}</span>
                            <code className="text-gray-600">{p}</code>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Audit Report */}
            <div className="border rounded-xl p-4 bg-white">
              <p className="text-sm font-semibold text-gray-800 mb-3">📋 Full Audit Report</p>
              <div className="space-y-4">
                {h.summary.working.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-green-700 mb-1">✅ Working ({h.summary.working.length})</p>
                    <ul className="space-y-1">
                      {h.summary.working.map((w, i) => (
                        <li key={i} className="text-xs text-green-700 bg-green-50 rounded px-2 py-1">{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {h.summary.errors.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-700 mb-1">❌ Errors ({h.summary.errors.length})</p>
                    <ul className="space-y-1">
                      {h.summary.errors.map((e, i) => (
                        <li key={i} className="text-xs text-red-700 bg-red-50 rounded px-2 py-1">{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {h.summary.warnings.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-700 mb-1">⚠️ Warnings ({h.summary.warnings.length})</p>
                    <ul className="space-y-1">
                      {h.summary.warnings.map((w, i) => (
                        <li key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Setup Guide */}
            <div className="border rounded-xl p-4 bg-blue-50 border-blue-200">
              <p className="text-sm font-semibold text-blue-900 mb-2">🛠️ How to Fix Common Issues</p>
              <div className="space-y-2 text-xs text-blue-800">
                <div className="bg-white/70 rounded p-2">
                  <strong>Invalid OAuth / Cannot parse access token</strong>
                  <p className="mt-0.5">Your token has expired. Go to Meta Business Suite → Settings → Advanced → Page Access Token Generator. Click "Generate token" for your page, then save it here. Page tokens don't expire unless revoked.</p>
                </div>
                <div className="bg-white/70 rounded p-2">
                  <strong>Instagram followers not loading</strong>
                  <p className="mt-0.5">The Instagram Account ID must be the numeric ID of your Instagram Business Account, not the username. Use the "Suggested Account ID" shown above (discovered from your Facebook Page link) or go to Instagram → Professional Dashboard → Account ID.</p>
                </div>
                <div className="bg-white/70 rounded p-2">
                  <strong>WhatsApp shows 0% delivery</strong>
                  <p className="mt-0.5">Your active WhatsApp channel runs through BotBee (not Meta Cloud API). The Meta WhatsApp integration is separate — configure it only if you're moving to Meta Cloud API. Check BotBee Dashboard for actual delivery stats.</p>
                </div>
                <div className="bg-white/70 rounded p-2">
                  <strong>Webhook not receiving messages</strong>
                  <p className="mt-0.5">1. Set a secret verify token (e.g. <code>alburhan_verify_2026</code>), not a URL. 2. Register webhook URL <code>https://alburhantravels.com/api/social-media/webhook/meta</code> in your Meta App → Webhooks. 3. Click "Subscribe All Webhook Fields" above.</p>
                </div>
                <div className="bg-white/70 rounded p-2">
                  <strong>Only Ad Account connected</strong>
                  <p className="mt-0.5">You need to add your Facebook Page to the Meta App. Go to Meta App Dashboard → Add Product → Messenger → Add your Page. Then generate a Page Access Token with all required permissions.</p>
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground text-right">
              Webhook URL: <code className="font-mono">https://alburhantravels.com/api/social-media/webhook/meta</code>
              {" · "}Checked at {new Date(h.checkedAt).toLocaleString("en-IN")}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
