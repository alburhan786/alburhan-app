import React, { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Eye, Share2, FileText, ArrowLeft, RefreshCw } from "lucide-react";
import { formatDate } from "@/lib/utils";

const BASE_API = import.meta.env.VITE_API_URL || "";

const DOC_META: Record<string, { label: string; icon: string }> = {
  visa:                    { label: "Visa",                   icon: "🛂" },
  flight_ticket:           { label: "Air Ticket",             icon: "✈️" },
  hotel_voucher:           { label: "Hotel Voucher",          icon: "🏨" },
  transport_voucher:       { label: "Transport Voucher",      icon: "🚌" },
  departure_letter:        { label: "Departure Letter",       icon: "📨" },
  luggage_tag:             { label: "Luggage Tag",            icon: "🏷️" },
  id_card:                 { label: "ID Card",                icon: "🪪"  },
  model_contract:          { label: "Signed Agreement",       icon: "📜"  },
  invoice:                 { label: "Invoice",                icon: "🧾"  },
  receipt:                 { label: "Payment Receipt",        icon: "🧾"  },
  passport:                { label: "Passport",               icon: "📗"  },
  aadhaar:                 { label: "Aadhaar Card",           icon: "🪪"  },
  pan:                     { label: "PAN Card",               icon: "💳"  },
  photo:                   { label: "Photograph",             icon: "🖼️"  },
  medical_certificate:     { label: "Medical Certificate",    icon: "🏥"  },
  vaccination_certificate: { label: "Vaccination Certificate",icon: "💉"  },
  other:                   { label: "Document",               icon: "📎"  },
};

const DOC_GROUPS = [
  {
    title: "Travel Documents",
    icon: "✈️",
    desc: "Visa, tickets, hotel and transport vouchers",
    types: ["visa", "flight_ticket", "hotel_voucher", "transport_voucher", "departure_letter", "luggage_tag", "id_card"],
  },
  {
    title: "Official Documents",
    icon: "📋",
    desc: "Signed agreement, invoice, receipts",
    types: ["model_contract", "invoice", "receipt"],
  },
  {
    title: "Personal Documents",
    icon: "👤",
    desc: "Passport, Aadhaar, PAN, photos, medical",
    types: ["passport", "aadhaar", "pan", "photo", "medical_certificate", "vaccination_certificate"],
  },
];

function DocCard({ doc, bookingLabel }: { doc: any; bookingLabel: string }) {
  const type = doc.documentType || doc.document_type || "other";
  const meta = DOC_META[type] || DOC_META.other;
  const fileUrl = doc.fileUrl || doc.file_url || "";
  const isPdf = fileUrl.toLowerCase().includes(".pdf");
  const isImg = /\.(jpg|jpeg|png|webp)$/i.test(fileUrl);

  function download() {
    fetch(`${BASE_API}/api/documents/${doc.id}/log-download`, { method: "POST", credentials: "include" }).catch(() => {});
    window.open(`${BASE_API}${fileUrl}`, "_blank");
  }

  function share() {
    const full = `${BASE_API}${fileUrl}`;
    if (navigator.share) {
      navigator.share({ title: meta.label, url: full }).catch(() => {});
    } else {
      navigator.clipboard.writeText(full)
        .then(() => alert("Link copied to clipboard!"))
        .catch(() => {});
    }
  }

  return (
    <div className="flex items-start gap-3 p-4 bg-white border border-border rounded-2xl hover:shadow-md transition-all hover:border-primary/30 group">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl shrink-0 group-hover:bg-primary/15 transition-colors">
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground truncate">{meta.label}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{bookingLabel}</p>
        {(doc.fileName || doc.file_name) && (
          <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{doc.fileName || doc.file_name}</p>
        )}
        {(doc.uploadedAt || doc.uploaded_at || doc.createdAt || doc.created_at) && (
          <p className="text-xs text-muted-foreground mt-1">
            {formatDate(doc.uploadedAt || doc.uploaded_at || doc.createdAt || doc.created_at)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 rounded-lg" onClick={download}>
            <Download className="w-3 h-3" /> Download
          </Button>
          {(isPdf || isImg) && (
            <Button
              size="sm" variant="ghost" className="h-7 text-xs gap-1.5 rounded-lg"
              onClick={() => window.open(`${BASE_API}${fileUrl}`, "_blank")}
            >
              <Eye className="w-3 h-3" /> View
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 rounded-lg" onClick={share}>
            <Share2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DocumentCenter() {
  useAuth(); // Ensures customer is authenticated (redirect handled by CustomerRoute)

  const [bookings, setBookings] = useState<any[]>([]);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [docsByBooking, setDocsByBooking] = useState<Record<string, any[]>>({});
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingBookings(true);
    fetch(`${BASE_API}/api/bookings`, { credentials: "include" })
      .then(r => r.ok ? r.json() : { bookings: [] })
      .then(data => {
        const bks = Array.isArray(data) ? data : (data.bookings || []);
        const active = bks.filter((b: any) => ["pending", "approved", "partially_paid", "confirmed"].includes(b.status || b.booking_status));
        const all = active.length > 0 ? active : bks;
        setBookings(all);
        if (all.length > 0) setActiveBookingId(all[0].id);
      })
      .catch(() => setError("Could not load your bookings. Please try again."))
      .finally(() => setLoadingBookings(false));
  }, []);

  useEffect(() => {
    if (!activeBookingId) return;
    if (docsByBooking[activeBookingId] !== undefined) return;
    setLoadingDocs(true);
    fetch(`${BASE_API}/api/documents/${activeBookingId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const arr = Array.isArray(data) ? data : (data.documents || []);
        setDocsByBooking(prev => ({ ...prev, [activeBookingId]: arr }));
      })
      .catch(() => setDocsByBooking(prev => ({ ...prev, [activeBookingId]: [] })))
      .finally(() => setLoadingDocs(false));
  }, [activeBookingId]);

  function refetchDocs() {
    if (!activeBookingId) return;
    setDocsByBooking(prev => {
      const updated = { ...prev };
      delete updated[activeBookingId];
      return updated;
    });
  }

  const docs = activeBookingId ? (docsByBooking[activeBookingId] || []) : [];
  const activeBk = bookings.find(b => b.id === activeBookingId);
  const activeBkLabel = activeBk
    ? `${activeBk.packageName || activeBk.package_name || "Booking"} — #${activeBk.bookingNumber || activeBk.booking_number}`
    : "Your Booking";

  const allGroupTypes = DOC_GROUPS.flatMap(g => g.types);

  return (
    <MainLayout>
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background py-8 px-4">
        <div className="max-w-3xl mx-auto">

          {/* Header */}
          <div className="mb-8">
            <a
              href={(import.meta.env.BASE_URL || "/") + "customer/dashboard"}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </a>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
                  <span className="text-4xl">📁</span> My Documents
                </h1>
                <p className="text-muted-foreground mt-2">All your travel and personal documents in one place</p>
              </div>
              <button
                onClick={refetchDocs}
                className="mt-2 p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
                title="Refresh"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-2xl border border-red-200 text-sm">{error}</div>
          )}

          {loadingBookings ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : bookings.length === 0 ? (
            <Card className="p-12 text-center border-dashed rounded-2xl">
              <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
              <h3 className="text-xl font-bold">No bookings yet</h3>
              <p className="text-muted-foreground mt-2 text-sm">
                Your travel documents will appear here once you have an active booking.
              </p>
              <a href={(import.meta.env.BASE_URL || "/") + "packages"} className="mt-6 inline-block">
                <Button>Explore Packages</Button>
              </a>
            </Card>
          ) : (
            <div className="space-y-6">

              {/* Booking selector (only if multiple) */}
              {bookings.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {bookings.map((b: any) => (
                    <button
                      key={b.id}
                      onClick={() => setActiveBookingId(b.id)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                        activeBookingId === b.id
                          ? "bg-primary text-white border-primary shadow-md"
                          : "bg-white text-foreground border-border hover:border-primary/50"
                      }`}
                    >
                      #{b.bookingNumber || b.booking_number}
                    </button>
                  ))}
                </div>
              )}

              {/* Active booking summary */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-bold text-lg">{activeBk?.packageName || activeBk?.package_name || "Booking"}</p>
                  <p className="text-sm text-muted-foreground">#{activeBk?.bookingNumber || activeBk?.booking_number}</p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">
                  {docs.length} document{docs.length !== 1 ? "s" : ""}
                </Badge>
              </div>

              {/* Document groups */}
              {loadingDocs ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : docs.length === 0 ? (
                <Card className="p-10 text-center border-dashed rounded-2xl">
                  <span className="text-5xl block mb-4">📭</span>
                  <h3 className="font-bold text-lg">No documents yet</h3>
                  <p className="text-muted-foreground mt-2 text-sm max-w-xs mx-auto">
                    Your travel documents (visa, air tickets, hotel vouchers, signed agreement) will appear here
                    once the team uploads them.
                  </p>
                </Card>
              ) : (
                <>
                  {DOC_GROUPS.map(group => {
                    const groupDocs = docs.filter((d: any) => group.types.includes(d.documentType || d.document_type));
                    if (groupDocs.length === 0) return null;
                    return (
                      <Card key={group.title} className="overflow-hidden rounded-2xl shadow-sm">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
                          <div>
                            <h3 className="font-bold flex items-center gap-2 text-base">
                              <span>{group.icon}</span> {group.title}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{group.desc}</p>
                          </div>
                          <Badge variant="secondary" className="text-xs shrink-0">{groupDocs.length}</Badge>
                        </div>
                        <div className="p-4 grid gap-3 sm:grid-cols-2">
                          {groupDocs.map((doc: any) => (
                            <DocCard key={doc.id} doc={doc} bookingLabel={activeBkLabel} />
                          ))}
                        </div>
                      </Card>
                    );
                  })}

                  {/* Uncategorized docs */}
                  {(() => {
                    const otherDocs = docs.filter((d: any) => !allGroupTypes.includes(d.documentType || d.document_type));
                    if (!otherDocs.length) return null;
                    return (
                      <Card className="overflow-hidden rounded-2xl shadow-sm">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
                          <h3 className="font-bold flex items-center gap-2"><span>📎</span> Other Documents</h3>
                          <Badge variant="secondary" className="text-xs">{otherDocs.length}</Badge>
                        </div>
                        <div className="p-4 grid gap-3 sm:grid-cols-2">
                          {otherDocs.map((doc: any) => (
                            <DocCard key={doc.id} doc={doc} bookingLabel={activeBkLabel} />
                          ))}
                        </div>
                      </Card>
                    );
                  })()}
                </>
              )}

              <div className="text-center pt-4 pb-8">
                <p className="text-xs text-muted-foreground">
                  Documents uploaded by Al Burhan Tours & Travels team. Contact us for any queries.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
