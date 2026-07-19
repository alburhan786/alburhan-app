import React, { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { BookOpen, Phone, Map, Star, ChevronDown, ChevronUp, Download, List } from "lucide-react";

const TABS = [
  { id: "essentials", label: "Hajj Essentials", icon: "🕋" },
  { id: "duas", label: "Important Duas", icon: "🤲" },
  { id: "manasik", label: "Manasik Guide", icon: "📖" },
  { id: "packing", label: "Packing Checklist", icon: "🧳" },
  { id: "emergency", label: "Emergency Numbers", icon: "🆘" },
  { id: "instructions", label: "Key Instructions", icon: "⚠️" },
];

const ESSENTIALS = [
  { step: "1", title: "Ihraam (الإحرام)", desc: "Before entering Miqaat, make Niyyah (intention) for Hajj/Umrah, wear Ihraam garments (two white sheets for men), and recite Talbiyah: لَبَّيْكَ اللَّهُمَّ لَبَّيْكَ", icon: "🤍" },
  { step: "2", title: "Tawaf (الطواف)", desc: "Circumambulate the Ka'bah 7 times counter-clockwise starting from the Black Stone (Hajr-e-Aswad). Recite duas and dhikr during Tawaf.", icon: "🕋" },
  { step: "3", title: "Sa'i (السعي)", desc: "Walk 7 times between Safa and Marwah hills, commemorating Hajar's (AS) search for water. Start at Safa and end at Marwah.", icon: "🏃" },
  { step: "4", title: "Mina (منى)", desc: "On 8 Dhul Hijjah (Yawm al-Tarwiyah), travel to Mina and spend the night there. Pray Dhuhr, Asr, Maghrib, Isha, and Fajr in Mina.", icon: "⛺" },
  { step: "5", title: "Arafat (عرفات)", desc: "The most important pillar of Hajj. Stand at Arafat on 9 Dhul Hijjah afternoon. Make excessive dua, dhikr, and istighfar until sunset.", icon: "🌄" },
  { step: "6", title: "Muzdalifah (مزدلفة)", desc: "After sunset at Arafat, travel to Muzdalifah. Pray Maghrib and Isha combined. Collect 49–70 pebbles for Rami (stoning).", icon: "🌙" },
  { step: "7", title: "Rami (رمي الجمرات)", desc: "Stone the three Jamarat (pillars) in Mina — Jamarah Aqabah on Eid day, then all three on 11th, 12th (and 13th if staying).", icon: "🪨" },
  { step: "8", title: "Qurbani (القربان)", desc: "Sacrifice an animal on Eid al-Adha (10 Dhul Hijjah) to commemorate Ibrahim (AS)'s sacrifice. Shave or cut hair after sacrifice.", icon: "🐑" },
  { step: "9", title: "Tawaf al-Ifadah (طواف الإفاضة)", desc: "Perform another Tawaf of Ka'bah after Qurbani on 10 Dhul Hijjah. This is a pillar (rukn) of Hajj.", icon: "🕋" },
  { step: "10", title: "Tawaf al-Wida (طواف الوداع)", desc: "The farewell Tawaf — last Tawaf before leaving Makkah. Obligatory for non-residents of Makkah.", icon: "👋" },
];

const DUAS = [
  { title: "Talbiyah (تلبية)", arabic: "لَبَّيْكَ اللَّهُمَّ لَبَّيْكَ، لَبَّيْكَ لَا شَرِيكَ لَكَ لَبَّيْكَ، إِنَّ الْحَمْدَ وَالنِّعْمَةَ لَكَ وَالْمُلْكَ، لَا شَرِيكَ لَكَ", transliteration: "Labbayk Allahumma labbayk, labbayk la shareeka laka labbayk, innal-hamda wan-ni'mata laka wal-mulk, la shareeka lak.", meaning: "Here I am O Allah, here I am. Here I am, You have no partner, here I am. Verily all praise, grace and sovereignty belong to You. You have no partner." },
  { title: "Starting Tawaf", arabic: "بِسْمِ اللهِ وَاللهُ أَكْبَرُ اللَّهُمَّ إِيمَاناً بِكَ وَتَصْدِيقاً بِكِتَابِكَ وَوَفَاءً بِعَهْدِكَ وَاتِّبَاعاً لِسُنَّةِ نَبِيِّكَ", transliteration: "Bismillahi Allahu Akbar, Allahumma imanan bika wa tasdiqan bikitabika wa wafa'an bi'ahdika wattiba'an lisunnati nabiyyika.", meaning: "In the name of Allah, Allah is the Greatest. O Allah, with faith in You, belief in Your Book, fulfilling Your covenant, and following the Sunnah of Your Prophet." },
  { title: "Between Yemeni Corner and Black Stone", arabic: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ", transliteration: "Rabbana atina fid-dunya hasanatan wa fil akhirati hasanatan wa qina 'adhaban-nar.", meaning: "Our Lord, give us good in this world and good in the Hereafter, and save us from the punishment of the Fire." },
  { title: "At Safa (starting Sa'i)", arabic: "إِنَّ الصَّفَا وَالْمَرْوَةَ مِنْ شَعَائِرِ اللَّهِ - اللهُ أَكْبَرُ، اللهُ أَكْبَرُ، اللهُ أَكْبَرُ وَلِلَّهِ الْحَمْدُ", transliteration: "Innas-safa wal-marwata min sha'airillah... Allahu Akbar, Allahu Akbar, Allahu Akbar, wa lillahil-hamd.", meaning: "Indeed Safa and Marwah are from the Signs of Allah... Allah is Greatest, Allah is Greatest, Allah is Greatest, and all praise is for Allah." },
  { title: "Dua at Arafat", arabic: "لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ", transliteration: "La ilaha illallahu wahdahu la shareeka lahu, lahul-mulku wa lahul-hamdu wa huwa 'ala kulli shay'in qadeer.", meaning: "There is no god but Allah alone, He has no partner, to Him belongs the dominion and all praise, and He is over all things capable." },
  { title: "Rami (Stoning) Dua", arabic: "بِسْمِ اللَّهِ وَاللَّهُ أَكْبَرُ رَغْمًا لِلشَّيْطَانِ وَحِزْبِهِ", transliteration: "Bismillahi Allahu Akbar raghan lish-shaytani wa hizbih.", meaning: "In the name of Allah, Allah is the Greatest — in defiance of Shaytan and his followers." },
];

const MANASIK = [
  { day: "Day 1 (8 Dhul Hijjah)", title: "Yawm al-Tarwiyah", activities: ["Wear Ihraam at Miqaat if not already done", "Travel to Mina after Fajr", "Pray Dhuhr, Asr, Maghrib, Isha, Fajr (shortened, not combined)", "Rest and make dhikr in Mina"], icon: "⛺" },
  { day: "Day 2 (9 Dhul Hijjah)", title: "Yawm al-Arafah — Most Important Day", activities: ["After Fajr, travel to Arafat", "Pray Dhuhr & Asr combined at Arafat", "Stand in Wuquf (standing) — make dua, dhikr, istighfar", "After sunset, travel to Muzdalifah", "Pray Maghrib & Isha combined at Muzdalifah", "Collect 49–70 pebbles, spend night"], icon: "🌄" },
  { day: "Day 3 (10 Dhul Hijjah — Eid al-Adha)", title: "Yawm al-Nahr", activities: ["After Fajr, stone Jamarah al-Aqabah (7 pebbles)", "Perform Qurbani (sacrifice)", "Shave or trim hair", "Remove Ihraam", "Perform Tawaf al-Ifadah", "Perform Sa'i (if not done earlier)", "Return to Mina by sunset"], icon: "🕋" },
  { day: "Days 4–5 (11–12 Dhul Hijjah)", title: "Ayyam al-Tashreeq", activities: ["Stay in Mina", "Stone all three Jamarat after Zawal (noon): Sughra, Wusta, Kubra — 7 pebbles each", "Depart Mina before sunset on 12th for early departure", "Or stay 13th for more reward"], icon: "🪨" },
  { day: "Final Day", title: "Tawaf al-Wida (Farewell)", activities: ["Perform 7 circuits of Ka'bah before leaving Makkah", "Make final duas at Multazam", "This is the last act before departing Makkah"], icon: "👋" },
];

const PACKING = {
  essential: ["Valid Passport (6+ months validity)", "Hajj/Umrah Visa", "Airline Tickets (printed)", "2 copies of all documents", "Meningitis vaccination certificate", "COVID vaccination certificate", "Travel Insurance document", "Hotel booking confirmation", "Emergency contact card"],
  ihraam: ["2 Ihraam sets (men) / Modest full-cover dress (women)", "Ihraam belt", "Sandals/flipflops", "Safety pins"],
  clothing: ["Light cotton clothes (modest)", "Light jacket/sweater for cool nights", "Walking shoes (comfortable)", "Socks", "Sunhat/cap", "Umbrella"],
  health: ["Personal medications + prescription letter", "First aid kit", "Paracetamol, antacid, rehydration salts", "Sunscreen SPF 50+", "Hand sanitiser", "Face mask & gloves", "Personal hygiene items", "Menstruation management items (women)"],
  convenience: ["Portable charger/power bank", "Universal adapter plug", "Small backpack/waist pouch", "Ziploc bags for documents", "Marker pen (for labelling luggage)", "Snacks for journey", "Water bottle", "Prayer mat (small, foldable)", "Quran/dua book"],
};

const EMERGENCY = [
  { category: "Saudi Emergency Services", numbers: [{ label: "Police", number: "999" }, { label: "Ambulance / Medical", number: "997" }, { label: "Fire Department", number: "998" }, { label: "Saudi Civil Defence", number: "911" }], color: "bg-red-50 border-red-200", icon: "🇸🇦" },
  { category: "Hajj Authorities", numbers: [{ label: "Hajj Ministry Helpline", number: "+966-2-5346450" }, { label: "Makkah Emergency", number: "920000912" }, { label: "Madinah Emergency", number: "920001220" }, { label: "Mina Emergency Centre", number: "+966-2-5740000" }], color: "bg-amber-50 border-amber-200", icon: "🕌" },
  { category: "Indian Embassy / Consulate", numbers: [{ label: "Indian Embassy Riyadh", number: "+966-11-4884144" }, { label: "Indian Consulate Jeddah", number: "+966-12-6651195" }, { label: "Haj Mission Jeddah", number: "+966-12-6650814" }], color: "bg-orange-50 border-orange-200", icon: "🇮🇳" },
  { category: "Al Burhan Tours", numbers: [{ label: "24/7 Emergency Line", number: "Your Guide's Number" }, { label: "India Office", number: "Your Booking Number" }, { label: "WhatsApp Support", number: "See Your Dashboard" }], color: "bg-emerald-50 border-emerald-200", icon: "📞" },
];

const INSTRUCTIONS = [
  { title: "During Ihraam", icon: "⚠️", rules: ["Do not cut hair or nails", "Do not use perfume or scented products", "Do not cover head (men) / Do not cover face (women)", "Do not hunt animals or cut trees", "Avoid marital relations", "Do not use foul language or quarrel"] },
  { title: "Health & Safety", icon: "🏥", rules: ["Stay hydrated — drink plenty of Zamzam water", "Carry personal medications at all times", "Use umbrella/hat in direct sunlight", "Wear comfortable walking shoes", "Know your tent/hotel address by heart", "Carry ID and emergency card at all times"] },
  { title: "At the Haram", icon: "🕋", rules: ["Maintain strict wudhu (ablution)", "Follow crowd management instructions", "Do not push or rush during Tawaf/Sa'i", "Women must be with mahram at all times", "Keep children close — hold their hands", "Follow Mutawwif (guide) instructions"] },
  { title: "General Etiquettes", icon: "🤲", rules: ["Be patient and kind to fellow pilgrims", "Avoid arguments or disputes", "Keep mobile on silent in Haram", "Respect local Saudi laws and customs", "Do not block pathways while praying", "Help elderly and disabled pilgrims"] },
];

function AccordionItem({ title, icon, content }: { title: string; icon: string; content: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border bg-background overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors">
        <span className="flex items-center gap-2.5 font-semibold text-sm"><span className="text-lg">{icon}</span>{title}</span>
        {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 border-t pt-3">{content}</div>}
    </div>
  );
}

export default function KnowledgeCenter() {
  const [tab, setTab] = useState("essentials");

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center text-3xl mx-auto">🕋</div>
          <h1 className="text-2xl font-bold">Hajj & Umrah Knowledge Center</h1>
          <p className="text-sm text-muted-foreground">Complete guide for a blessed and informed journey</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* ── ESSENTIALS ── */}
        {tab === "essentials" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Step-by-step Hajj rituals in sequence</p>
            {ESSENTIALS.map(e => (
              <div key={e.step} className="rounded-2xl border p-4 bg-background flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl flex-shrink-0">{e.icon}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary/70 bg-primary/10 px-2 py-0.5 rounded-lg">Step {e.step}</span>
                    <p className="font-bold text-sm">{e.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{e.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── DUAS ── */}
        {tab === "duas" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Essential duas for key moments during Hajj & Umrah</p>
            {DUAS.map(d => (
              <div key={d.title} className="rounded-2xl border p-4 bg-background space-y-2">
                <p className="font-bold text-sm">{d.title}</p>
                <p className="text-right text-lg leading-loose font-arabic text-foreground" dir="rtl">{d.arabic}</p>
                <p className="text-xs text-primary italic">{d.transliteration}</p>
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2">{d.meaning}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── MANASIK ── */}
        {tab === "manasik" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Day-by-day Hajj rituals schedule</p>
            {MANASIK.map(m => (
              <div key={m.day} className="rounded-2xl border p-4 bg-background">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{m.icon}</span>
                  <div>
                    <p className="font-bold text-sm">{m.title}</p>
                    <p className="text-xs text-primary font-semibold">{m.day}</p>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {m.activities.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* ── PACKING ── */}
        {tab === "packing" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Complete packing checklist — print before departure</p>
            {Object.entries({ "📋 Essential Documents": PACKING.essential, "🤍 Ihraam & Dress": PACKING.ihraam, "👕 Clothing": PACKING.clothing, "💊 Health & Medical": PACKING.health, "🧴 Convenience & Comfort": PACKING.convenience }).map(([cat, items]) => (
              <AccordionItem key={cat} icon={cat.slice(0,2)} title={cat.slice(3)} content={
                <ul className="space-y-1.5">
                  {items.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-4 h-4 rounded border border-border flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              } />
            ))}
          </div>
        )}

        {/* ── EMERGENCY ── */}
        {tab === "emergency" && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-center">
              <p className="text-red-700 font-bold text-sm">🆘 Save these numbers before you travel</p>
              <p className="text-red-600 text-xs mt-0.5">Also save your guide's number and hotel address offline</p>
            </div>
            {EMERGENCY.map(g => (
              <div key={g.category} className={`rounded-2xl border p-4 ${g.color}`}>
                <p className="font-bold text-sm mb-2">{g.icon} {g.category}</p>
                <div className="space-y-1.5">
                  {g.numbers.map(n => (
                    <div key={n.label} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{n.label}</span>
                      <a href={`tel:${n.number}`} className="text-sm font-bold text-primary hover:underline">{n.number}</a>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── INSTRUCTIONS ── */}
        {tab === "instructions" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Critical rules and etiquettes every pilgrim must know</p>
            {INSTRUCTIONS.map(ins => (
              <div key={ins.title} className="rounded-2xl border p-4 bg-background">
                <p className="font-bold text-sm mb-2">{ins.icon} {ins.title}</p>
                <ul className="space-y-1.5">
                  {ins.rules.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="text-primary mt-0.5">•</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="text-center text-xs text-muted-foreground py-4">
          May Allah accept your Hajj & Umrah and grant you a blessed journey. آمين
        </div>
      </div>
    </MainLayout>
  );
}
