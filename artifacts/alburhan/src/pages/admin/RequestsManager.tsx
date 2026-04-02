import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock, MessageSquare, Package, Phone, User, RefreshCw } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Link } from "wouter";

const BASE_API = import.meta.env.VITE_API_URL || "";

function getStatusBadge(status: string) {
  switch (status) {
    case "approved":
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Approved</Badge>;
    case "rejected":
      return <Badge className="bg-red-100 text-red-800 border-red-300">Rejected</Badge>;
    default:
      return <Badge className="bg-amber-100 text-amber-800 border-amber-300">Pending</Badge>;
  }
}

interface PackageRequest {
  id: string;
  customerId: string | null;
  packageId: string | null;
  bookingId: string | null;
  customerName: string;
  customerMobile: string;
  packageName: string | null;
  message: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function RequestsManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [requests, setRequests] = useState<PackageRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE_API}/api/requests/admin/all`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      setRequests(await res.json());
    } catch {
      toast({ title: "Error", description: "Could not load requests", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useState(() => { loadRequests(); });

  const handleApprove = async (id: string) => {
    setProcessing(id);
    try {
      const res = await fetch(`${BASE_API}/api/requests/admin/${id}/approve`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      toast({ title: "Request approved", description: "Booking created and customer notified." });
      await loadRequests();
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!rejectDialogId) return;
    setProcessing(rejectDialogId);
    try {
      const res = await fetch(`${BASE_API}/api/requests/admin/${rejectDialogId}/reject`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      toast({ title: "Request rejected", description: "Customer has been notified." });
      setRejectDialogId(null);
      setRejectReason("");
      await loadRequests();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const pending = requests.filter(r => r.status === "pending");
  const handled = requests.filter(r => r.status !== "pending");

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-serif font-bold">Package Requests</h1>
        <p className="text-muted-foreground mt-1 text-sm">Review and respond to customer package enquiries</p>
      </div>

      <div className="pb-10">

        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-sm px-3 py-1">
              {pending.length} Pending
            </Badge>
            <Badge variant="outline" className="text-sm px-3 py-1">
              {requests.length} Total
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={loadRequests} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <Card className="p-12 text-center rounded-2xl">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
            <h3 className="text-lg font-bold text-foreground mb-2">No requests yet</h3>
            <p className="text-muted-foreground text-sm">Package requests from customers will appear here.</p>
          </Card>
        ) : (
          <div className="space-y-8">
            {pending.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" /> Pending Requests
                </h2>
                <div className="space-y-4">
                  {pending.map(r => (
                    <RequestCard
                      key={r.id}
                      request={r}
                      processing={processing}
                      onApprove={handleApprove}
                      onReject={(id) => { setRejectDialogId(id); setRejectReason(""); }}
                    />
                  ))}
                </div>
              </div>
            )}

            {handled.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-500" /> Handled Requests
                </h2>
                <div className="space-y-4">
                  {handled.map(r => (
                    <RequestCard
                      key={r.id}
                      request={r}
                      processing={processing}
                      onApprove={handleApprove}
                      onReject={(id) => { setRejectDialogId(id); setRejectReason(""); }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!rejectDialogId} onOpenChange={(o) => { if (!o) setRejectDialogId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <XCircle className="w-5 h-5" /> Reject Request
            </DialogTitle>
            <DialogDescription>
              Provide an optional reason. The customer will be notified via WhatsApp & SMS.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <textarea
              className="w-full min-h-[100px] rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Reason for rejection (optional)..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setRejectDialogId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleReject}
                disabled={!!processing}
              >
                {processing ? "Rejecting..." : "Reject Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function RequestCard({
  request,
  processing,
  onApprove,
  onReject,
}: {
  request: PackageRequest;
  processing: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const isPending = request.status === "pending";
  const isProcessing = processing === request.id;

  return (
    <Card className="rounded-2xl overflow-hidden shadow-sm border-border/60 hover:shadow-md transition-all">
      <div className="p-5">
        <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">{formatDate(request.createdAt)}</div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              <span className="font-bold text-foreground">{request.customerName}</span>
              {getStatusBadge(request.status)}
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Phone className="w-3 h-3" />
              <a href={`tel:+91${request.customerMobile}`} className="hover:text-primary">
                +91 {request.customerMobile}
              </a>
            </div>
          </div>
          {request.bookingId && (
            <Link href={`/admin/bookings`}>
              <Button variant="outline" size="sm" className="text-xs">
                View Booking
              </Button>
            </Link>
          )}
        </div>

        <div className="bg-muted/30 rounded-xl px-4 py-3 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm text-primary">{request.packageName || "Package not specified"}</span>
          </div>
          {request.message && (
            <div className="flex gap-2 text-sm text-muted-foreground">
              <MessageSquare className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{request.message}</p>
            </div>
          )}
        </div>

        {request.rejectionReason && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
            <span className="font-semibold">Rejection reason:</span> {request.rejectionReason}
          </div>
        )}

        {isPending && (
          <div className="flex gap-3">
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!!processing}
              onClick={() => onApprove(request.id)}
            >
              {isProcessing ? (
                <span className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Processing...</span>
              ) : (
                <><CheckCircle className="w-4 h-4 mr-2" /> Approve</>
              )}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={!!processing}
              onClick={() => onReject(request.id)}
            >
              <XCircle className="w-4 h-4 mr-2" /> Reject
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
