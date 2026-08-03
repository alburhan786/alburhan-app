import { CustomerPortalLayout } from "@/components/layout/CustomerPortalLayout";
import { Card } from "@/components/ui/card";
import { Phone, AlertCircle, Globe, Building, Ambulance, Shield } from "lucide-react";

const EMERGENCY_CONTACTS = [
  {
    category: "Al Burhan Office",
    contacts: [
      { name: "Main Office", phone: "+91 9893225590", note: "Primary contact" },
      { name: "Alternate", phone: "+91 9893989786", note: "" },
      { name: "Email", phone: "info@alburhantravels.com", isEmail: true },
    ],
    icon: Building,
    color: "bg-emerald-50 border-emerald-200",
    iconColor: "text-emerald-600",
  },
  {
    category: "Saudi Arabia Emergencies",
    contacts: [
      { name: "Saudi Emergency (Police)", phone: "999", note: "All emergencies" },
      { name: "Ambulance", phone: "997", note: "" },
      { name: "Civil Defense (Fire)", phone: "998", note: "" },
    ],
    icon: AlertCircle,
    color: "bg-red-50 border-red-200",
    iconColor: "text-red-600",
  },
  {
    category: "Indian Embassy — Jeddah",
    contacts: [
      { name: "Consulate General", phone: "+966-12-6651527", note: "" },
      { name: "Emergency Helpline", phone: "+966-56-9610101", note: "24×7" },
    ],
    icon: Globe,
    color: "bg-blue-50 border-blue-200",
    iconColor: "text-blue-600",
  },
  {
    category: "Medical & Hospitals",
    contacts: [
      { name: "MERS Helpline (KSA)", phone: "920000150", note: "Ministry of Health" },
      { name: "Hajj Health Hotline", phone: "937", note: "During Hajj season" },
    ],
    icon: Shield,
    color: "bg-purple-50 border-purple-200",
    iconColor: "text-purple-600",
  },
];

const HAJJ_TIPS = [
  "Always carry your Hajj ID card and passport copy.",
  "Memorise your Maktab number and camp location.",
  "Keep emergency contacts saved offline on your phone.",
  "Stay hydrated — drink at least 3–4 litres of water daily.",
  "Avoid crowds during peak Tawaf hours (2–5 AM is quieter).",
  "If separated from your group, stay in place and call the office.",
  "Carry your group's WhatsApp contact card at all times.",
];

export default function EmergencyPage() {
  return (
    <CustomerPortalLayout title="Emergency Info">
      <div className="space-y-5">
        {/* Banner */}
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3">
          <AlertCircle size={22} className="text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">Emergency? Call immediately</p>
            <p className="text-xs text-red-600 mt-0.5">
              In Saudi Arabia dial <strong>999</strong> for all emergencies.
              Al Burhan helpline: <strong>+91 9893225590</strong>
            </p>
          </div>
        </div>

        {/* Contact groups */}
        {EMERGENCY_CONTACTS.map(group => (
          <Card key={group.category} className={`p-5 border ${group.color}`}>
            <div className="flex items-center gap-2 mb-4">
              <div className={`p-2 rounded-lg bg-white/60`}>
                <group.icon size={17} className={group.iconColor} />
              </div>
              <h3 className="font-semibold text-slate-800">{group.category}</h3>
            </div>
            <div className="space-y-2.5">
              {group.contacts.map(c => (
                <div key={c.name} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{c.name}</p>
                    {c.note && <p className="text-xs text-slate-400">{c.note}</p>}
                  </div>
                  {c.isEmail ? (
                    <a href={`mailto:${c.phone}`}
                      className="text-sm text-blue-600 hover:underline font-medium">
                      {c.phone}
                    </a>
                  ) : (
                    <a href={`tel:${c.phone}`}
                      className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 hover:text-emerald-700 transition-colors">
                      <Phone size={14} className="text-emerald-500" />
                      {c.phone}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}

        {/* Quick tips */}
        <Card className="p-5">
          <h3 className="font-semibold text-slate-800 mb-4">Safety Tips</h3>
          <ul className="space-y-2">
            {HAJJ_TIPS.map((tip, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                <span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {tip}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </CustomerPortalLayout>
  );
}
