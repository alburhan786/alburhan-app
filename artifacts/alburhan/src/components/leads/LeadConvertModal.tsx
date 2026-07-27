import React, { useState, useEffect } from "react";
import {
  X, CheckCircle, Loader2, AlertCircle, ExternalLink,
  FileText, Calendar, Users, IndianRupee, Package, Handshake,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BASE_API = import.meta.env.VITE_API_URL || "";

export interface LeadConvertModalProps {
  leadId: string;
  leadNumber?: string;
  onClose: () => void;
  onSuccess: (result: any) => void;
}

export function LeadConvertModal({ leadId, leadNumber, onClose, onSuccess }: LeadConvertModalProps) {
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [form, setForm] = useState({
    packageName:    "",
    totalAmount:    "",
    advanceAmount:  "",
    gstAmount:      "",
    discountAmount: "",
    roomType:       "quad",
    numTravellers:  "1",
    departureDate:  "",
    installments:   "1",
    notes:          "",
    approveBooking: false,
  });
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<any>(null);
  const [error,    setError]    = useState("");

  useEffect(() => {
    setPreviewLoading(true);
    fetch(`${BASE_API}/api/leads/${leadId}/convert-preview`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (!data.error) {
          setPreview(data);
          setForm(f => ({
            ...f,
            packageName:   data.packageName || "",
            totalAmount:   data.suggestedAmount > 0 ? String(data.suggestedAmount) : "",
            numTravellers: String(data.numTravellers || 1),
            roomType:      data.roomType || "quad",
            departureDate: data.departureDate ? data.departureDate.slice(0, 10) : "",
          }));
        }
      })
      .catch(() => {})
      .finally(() => setPreviewLoading(false));
  }, [leadId]);

  const finalAmount = Math.max(
    0,
    (Number(form.totalAmount)    || 0)
    + (Number(form.gstAmount)    || 0)
    - (Number(form.discountAmount) || 0)
  );

  const handleSubmit = async () => {
    const total = Number(form.totalAmount);
    if (!total || total <= 0) { setError("Please enter a valid total amount"); return; }
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${BASE_API}/api/leads/${leadId}/auto-convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          packageName:    form.packageName || "Hajj / Umrah Package",
          totalAmount:    total,
          advanceAmount:  Number(form.advanceAmount)  || 0,
          gstAmount:      Number(form.gstAmount)      || 0,
          discountAmount: Number(form.discountAmount)  || 0,
          roomType:       form.roomType,
          numTravellers:  Number(form.numTravellers)  || 1,
          departureDate:  form.departureDate || undefined,
          installments:   Number(form.installments)   || 1,
          notes:          form.notes,
          approveBooking: form.approveBooking,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || "Conversion failed");
      setResult(data);
      onSuccess(data);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  /* ── SUCCESS STATE ─────────────────────────────────────────── */
  if (result) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
        onClick={onClose}>
        <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          onClick={e => e.stopPropagation()}>
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle size={32} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-emerald-700">Booking Created!</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Lead {leadNumber || leadId} converted successfully
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 text-left text-sm">
              {result.bookingNumber && (
                <a href={`/admin/bookings?open=${result.bookingId}`}
                  className="flex items-center justify-between p-3 rounded-xl border hover:bg-muted/50 transition-colors">
                  <span className="flex items-center gap-2">
                    <FileText size={14} className="text-primary" />
                    Booking #{result.bookingNumber}
                  </span>
                  <ExternalLink size={12} className="text-muted-foreground" />
                </a>
              )}
              {result.invoiceNumber && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700">
                  <IndianRupee size={14} /> Invoice {result.invoiceNumber} auto-generated
                </div>
              )}
              {result.agreementId && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700">
                  <Handshake size={14} /> Agreement created &amp; sent to customer
                </div>
              )}
              {result.paymentSchedule?.length > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-violet-50 border border-violet-200 text-violet-700">
                  <Calendar size={14} />
                  {result.paymentSchedule.length} payment installments scheduled
                </div>
              )}
              {result.notificationSent && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700">
                  💬 WhatsApp + SMS notifications sent
                </div>
              )}
            </div>

            <Button onClick={onClose} className="w-full mt-2 bg-[#0A3D2A] text-[#C9A84C] hover:bg-[#0A3D2A]/90">
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── FORM ──────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-primary/5 to-transparent">
          <div>
            <h2 className="font-bold text-base">Convert Lead to Booking</h2>
            <p className="text-xs text-muted-foreground">
              {preview?.name ? `${preview.name} · ` : ""}{leadNumber || leadId}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {previewLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 size={24} className="animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading lead details…</p>
            </div>
          ) : (
            <>
              {/* Customer info */}
              {preview && (
                <div className="p-3 rounded-xl bg-muted/30 border space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Customer</p>
                  <p className="font-semibold">{preview.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {preview.mobile}{preview.email ? ` · ${preview.email}` : ""}
                  </p>
                  {preview.alreadyConverted && (
                    <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                      ⚠️ Already converted — this will create an additional booking
                    </p>
                  )}
                </div>
              )}

              {/* Package */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Package size={11} /> Package Name
                </Label>
                <Input value={form.packageName}
                  onChange={e => setForm(f => ({ ...f, packageName: e.target.value }))}
                  placeholder="e.g. Hajj 2025 Economy Package"
                  className="h-9 text-sm" />
              </div>

              {/* Amounts */}
              <div className="space-y-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <IndianRupee size={11} /> Amounts (₹)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Total Amount <span className="text-red-500">*</span></Label>
                    <Input type="number" min="0" value={form.totalAmount}
                      onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))}
                      placeholder="e.g. 150000" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Advance / Deposit</Label>
                    <Input type="number" min="0" value={form.advanceAmount}
                      onChange={e => setForm(f => ({ ...f, advanceAmount: e.target.value }))}
                      placeholder="e.g. 25000" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">GST Amount</Label>
                    <Input type="number" min="0" value={form.gstAmount}
                      onChange={e => setForm(f => ({ ...f, gstAmount: e.target.value }))}
                      placeholder="e.g. 5400" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Discount Amount</Label>
                    <Input type="number" min="0" value={form.discountAmount}
                      onChange={e => setForm(f => ({ ...f, discountAmount: e.target.value }))}
                      placeholder="e.g. 2000" className="h-9 text-sm" />
                  </div>
                </div>
                {finalAmount > 0 && (
                  <p className="text-xs font-bold text-right text-primary">
                    Final Payable: ₹{finalAmount.toLocaleString("en-IN")}
                  </p>
                )}
              </div>

              {/* Booking details */}
              <div className="space-y-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Users size={11} /> Booking Details
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Room Type</Label>
                    <select value={form.roomType}
                      onChange={e => setForm(f => ({ ...f, roomType: e.target.value }))}
                      className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm">
                      <option value="single">Single</option>
                      <option value="double">Double</option>
                      <option value="triple">Triple</option>
                      <option value="quad">Quad</option>
                      <option value="quint">Quint</option>
                      <option value="hex">Hex (6)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">No. of Travellers</Label>
                    <Input type="number" min="1" max="20" value={form.numTravellers}
                      onChange={e => setForm(f => ({ ...f, numTravellers: e.target.value }))}
                      className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      <Calendar size={10} /> Departure Date
                    </Label>
                    <Input type="date" value={form.departureDate}
                      onChange={e => setForm(f => ({ ...f, departureDate: e.target.value }))}
                      className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Payment Installments</Label>
                    <select value={form.installments}
                      onChange={e => setForm(f => ({ ...f, installments: e.target.value }))}
                      className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm">
                      <option value="1">Single Payment</option>
                      <option value="2">2 Installments</option>
                      <option value="3">3 Installments</option>
                      <option value="4">4 Installments (Quarterly)</option>
                      <option value="6">6 Installments</option>
                      <option value="12">12 Installments (Monthly)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs">Internal Notes</Label>
                <textarea value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Special requirements or notes for this booking…"
                  className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={2} />
              </div>

              {/* Auto-approve toggle */}
              <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-muted/30 transition-colors">
                <input type="checkbox" checked={form.approveBooking}
                  onChange={e => setForm(f => ({ ...f, approveBooking: e.target.checked }))}
                  className="w-4 h-4 rounded accent-primary" />
                <div>
                  <p className="text-sm font-medium">Auto-approve booking</p>
                  <p className="text-xs text-muted-foreground">Skip admin review step — approve immediately</p>
                </div>
              </label>

              {/* Automation checklist */}
              <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-primary">This automation will:</p>
                <ul className="text-xs text-muted-foreground space-y-1 pl-0.5">
                  <li>✅ Create or link customer account</li>
                  <li>✅ Create booking record</li>
                  <li>✅ Auto-generate invoice</li>
                  <li>✅ Auto-create &amp; send agreement for signature</li>
                  {Number(form.installments) > 1 && (
                    <li>✅ Schedule {form.installments} payment installments</li>
                  )}
                  <li>✅ Send WhatsApp + SMS booking confirmation</li>
                  <li>✅ Mark lead as Converted → Won</li>
                </ul>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle size={14} /> {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex gap-3 bg-muted/10">
          <Button variant="outline" onClick={onClose} className="flex-1 h-9">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || previewLoading || !form.totalAmount}
            className="flex-1 h-9 bg-[#0A3D2A] hover:bg-[#0A3D2A]/90 text-[#C9A84C] gap-1.5">
            {loading
              ? <><Loader2 size={14} className="animate-spin" /> Converting…</>
              : <><CheckCircle size={14} /> Convert to Booking</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
