import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Settings, Percent, DollarSign, Tag, Save, RefreshCw, CheckCircle2 } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface BillingSettingsData {
  gstEnabled: boolean;
  gstRate: number;
  gstIncluded: boolean;
  tcsEnabled: boolean;
  tcsRate: number;
  tcsIncluded: boolean;
  discountEnabled: boolean;
  updatedAt?: string | null;
}

const DEFAULT: BillingSettingsData = {
  gstEnabled: true,
  gstRate: 5,
  gstIncluded: false,
  tcsEnabled: false,
  tcsRate: 2,
  tcsIncluded: false,
  discountEnabled: true,
};

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors focus:outline-none ${checked ? "bg-[#0B3D2E]" : "bg-gray-300"}`}
      aria-pressed={checked}
    >
      <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      {label && <span className="sr-only">{label}</span>}
    </button>
  );
}

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-border/50 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border/40 bg-gray-50/50">
        <span className="text-[#0B3D2E]">{icon}</span>
        <h3 className="font-bold text-[#0B3D2E] text-sm uppercase tracking-widest">{title}</h3>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="text-sm font-semibold text-gray-800">{label}</div>
        {description && <div className="text-xs text-gray-500 mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export default function BillingSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<BillingSettingsData>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/settings`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setSettings({ ...DEFAULT, ...data });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const set = (key: keyof BillingSettingsData, value: any) => {
    setSettings(s => ({ ...s, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setSettings({ ...DEFAULT, ...data });
      setSaved(true);
      toast({ title: "Settings Saved", description: "Billing configuration updated successfully." });
    } catch (err) {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-28 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/40 focus:border-[#0B3D2E] bg-white text-right font-mono";

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-[#0B3D2E]" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Billing Settings</h1>
          <p className="text-muted-foreground mt-1">Configure GST, TCS, and discount defaults for all bookings.</p>
          {settings.updatedAt && (
            <p className="text-xs text-gray-400 mt-1">Last updated: {new Date(settings.updatedAt).toLocaleString("en-IN")}</p>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm shadow transition ${saved ? "bg-emerald-600 text-white" : "bg-[#0B3D2E] text-white hover:bg-[#0d5038]"} disabled:opacity-60`}
        >
          {saved ? <CheckCircle2 size={16} /> : saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
          {saved ? "Saved!" : saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* GST Settings */}
        <SectionCard icon={<Percent size={16} />} title="GST Settings">
          <SettingRow label="Enable GST" description="Apply Goods & Services Tax to all bookings">
            <ToggleSwitch checked={settings.gstEnabled} onChange={v => set("gstEnabled", v)} />
          </SettingRow>

          {settings.gstEnabled && (
            <>
              <hr className="border-gray-100" />
              <SettingRow label="GST Rate (%)" description="Standard rate for tour packages is 5%">
                <div className="flex items-center gap-1">
                  <input
                    type="number" min="0" max="100" step="0.01"
                    value={settings.gstRate}
                    onChange={e => set("gstRate", Number(e.target.value))}
                    className={inputCls}
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </SettingRow>

              <hr className="border-gray-100" />
              <div>
                <div className="text-sm font-semibold text-gray-800 mb-3">GST Mode</div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => set("gstIncluded", true)}
                    className={`p-3 rounded-xl border-2 text-sm font-semibold transition ${settings.gstIncluded ? "border-[#0B3D2E] bg-[#0B3D2E]/5 text-[#0B3D2E]" : "border-gray-200 text-gray-600 hover:border-[#0B3D2E]/40"}`}
                  >
                    <div className="font-bold">GST Included</div>
                    <div className="text-xs font-normal mt-0.5 opacity-70">Package price includes GST</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => set("gstIncluded", false)}
                    className={`p-3 rounded-xl border-2 text-sm font-semibold transition ${!settings.gstIncluded ? "border-[#0B3D2E] bg-[#0B3D2E]/5 text-[#0B3D2E]" : "border-gray-200 text-gray-600 hover:border-[#0B3D2E]/40"}`}
                  >
                    <div className="font-bold">GST Extra</div>
                    <div className="text-xs font-normal mt-0.5 opacity-70">GST added on top of price</div>
                  </button>
                </div>
              </div>
            </>
          )}
        </SectionCard>

        {/* TCS Settings */}
        <SectionCard icon={<DollarSign size={16} />} title="TCS Settings">
          <SettingRow label="Enable TCS" description="Tax Collected at Source (Section 206C of Income Tax)">
            <ToggleSwitch checked={settings.tcsEnabled} onChange={v => set("tcsEnabled", v)} />
          </SettingRow>

          {settings.tcsEnabled && (
            <>
              <hr className="border-gray-100" />
              <SettingRow label="TCS Rate (%)" description="Default rate is 2% for overseas travel">
                <div className="flex items-center gap-1">
                  <input
                    type="number" min="0" max="100" step="0.01"
                    value={settings.tcsRate}
                    onChange={e => set("tcsRate", Number(e.target.value))}
                    className={inputCls}
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </SettingRow>

              <hr className="border-gray-100" />
              <div>
                <div className="text-sm font-semibold text-gray-800 mb-3">TCS Mode</div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => set("tcsIncluded", true)}
                    className={`p-3 rounded-xl border-2 text-sm font-semibold transition ${settings.tcsIncluded ? "border-[#0B3D2E] bg-[#0B3D2E]/5 text-[#0B3D2E]" : "border-gray-200 text-gray-600 hover:border-[#0B3D2E]/40"}`}
                  >
                    <div className="font-bold">TCS Included</div>
                    <div className="text-xs font-normal mt-0.5 opacity-70">Already within grand total</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => set("tcsIncluded", false)}
                    className={`p-3 rounded-xl border-2 text-sm font-semibold transition ${!settings.tcsIncluded ? "border-[#0B3D2E] bg-[#0B3D2E]/5 text-[#0B3D2E]" : "border-gray-200 text-gray-600 hover:border-[#0B3D2E]/40"}`}
                  >
                    <div className="font-bold">TCS Extra</div>
                    <div className="text-xs font-normal mt-0.5 opacity-70">Added on top of total</div>
                  </button>
                </div>
              </div>
            </>
          )}
        </SectionCard>

        {/* Discount Settings */}
        <SectionCard icon={<Tag size={16} />} title="Discount Settings">
          <SettingRow label="Enable Discounts" description="Allow applying discounts to bookings">
            <ToggleSwitch checked={settings.discountEnabled} onChange={v => set("discountEnabled", v)} />
          </SettingRow>
          {settings.discountEnabled && (
            <>
              <hr className="border-gray-100" />
              <div className="text-xs text-gray-500 leading-relaxed">
                Available discount types: Early Booking, Family, Group, Loyalty, Promo Code, Manual.
                Discounts can be applied as a percentage or a flat amount per booking.
              </div>
            </>
          )}
        </SectionCard>

        {/* Calculation Preview */}
        <SectionCard icon={<Settings size={16} />} title="Calculation Preview">
          <div className="text-xs text-gray-500 mb-4">Sample calculation with ₹6,82,500 package + ₹20,000 discount:</div>
          <PreviewCalc settings={settings} />
        </SectionCard>
      </div>
    </AdminLayout>
  );
}

function PreviewCalc({ settings }: { settings: BillingSettingsData }) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const pkg = 682500;
  const disc = 20000;
  const net = r2(pkg - disc);

  let gstAmt = 0;
  if (settings.gstEnabled && settings.gstRate > 0) {
    if (settings.gstIncluded) {
      const taxable = r2(net / (1 + settings.gstRate / 100));
      gstAmt = r2(net - taxable);
    } else {
      gstAmt = r2(net * settings.gstRate / 100);
    }
  }

  const afterGst = settings.gstEnabled && !settings.gstIncluded ? r2(net + gstAmt) : net;

  let tcsAmt = 0;
  if (settings.tcsEnabled && settings.tcsRate > 0) {
    if (settings.tcsIncluded) {
      tcsAmt = r2(afterGst - afterGst / (1 + settings.tcsRate / 100));
    } else {
      tcsAmt = r2(afterGst * settings.tcsRate / 100);
    }
  }

  const grand = settings.tcsEnabled && !settings.tcsIncluded ? r2(afterGst + tcsAmt) : afterGst;

  const rows: Array<{ label: string; value: string; prefix?: string; bold?: boolean; color?: string }> = [
    { label: "Package Price", value: `₹${fmt(pkg)}` },
    { label: "(-) Early Booking Discount", value: `₹${fmt(disc)}`, color: "#b45309" },
    { label: "Net Package", value: `₹${fmt(net)}`, bold: true },
  ];

  if (settings.gstEnabled) {
    rows.push({
      label: `GST @${settings.gstRate}% (${settings.gstIncluded ? "Included" : "Extra"})`,
      value: `₹${fmt(gstAmt)}`,
      color: "#1d4ed8",
    });
  }

  if (settings.tcsEnabled) {
    rows.push({
      label: `TCS @${settings.tcsRate}% (${settings.tcsIncluded ? "Included" : "Extra"})`,
      value: `₹${fmt(tcsAmt)}`,
      color: "#7c3aed",
    });
  }

  rows.push({ label: "GRAND TOTAL", value: `₹${fmt(grand)}`, bold: true, color: "#0B3D2E" });

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className={`flex justify-between text-sm ${row.bold ? "font-bold border-t border-gray-200 pt-2 mt-2" : ""}`}>
          <span className="text-gray-600" style={{ color: row.color ? undefined : undefined }}>{row.label}</span>
          <span className="font-mono" style={{ color: row.color }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
