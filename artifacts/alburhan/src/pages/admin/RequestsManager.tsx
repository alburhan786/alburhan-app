import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock, MessageSquare, Package, Phone, User, RefreshCw, Users, ExternalLink } from "lucide-react";
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
  groupId: string | null;
  pilgrimId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface HajjGroup {
  id: string;
  groupName: string;
  year: number;
}

export default function RequestsManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [requests, setRequests] = useState<PackageRequest[]>([]);
  const [groups, setGroups] = useState<HajjGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  const [assignDialogId, setAssignDialogId] = useState<string | null>(null);
  const [assignGroupId, setAssignGroupId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE_API}/api/admin/requests`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      setRequests(await res.json());
    } catch {
      toast({ title: "Error", description: "Could not load requests", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const res = await fetch(`${BASE_API}/api/groups`, { credentials: "include" });
      if (res.ok) setGroups(await res.json());
    } catch {}
  };

  useEffect(() => {
    loadRequests();
    loadGroups();
  }, []);

  const handleApprove = async (id: string) => {
    setProcessing(id);
    try {
      const res = await fetch(`${BASE_API}/api/admin/requests/${id}/approve`, {
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
      const res = await fetch(`${BASE_API}/api/admin/requests/${rejectDialogId}/reject`, {
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

  const openAssignDialog = (id: string) => {
    setAssignDialogId(id);
    setAssignGroupId(groups[0]?.id ?? "");
  };

  const handleAssignGroup = async () => {
    if (!assignDialogId || !assignGroupId) return;
    setAssigning(true);
    try {
      const res = await fetch(`${BASE_API}/api/admin/requests/${assignDialogId}/assign-group`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: assignGroupId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      const data = await res.json();
      const grpName = data.group?.groupName ?? "group";
      toast({ title: "Group assigned", description: `Pilgrim placeholder created in "${grpName}". Travel details from customer will auto-populate it.` });
      setAssignDialogId(null);
      setAssignGroupId("");
      await loadRequests();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  const pending = requests.filter(r => r.status === "pending");
  const handled = requests.filter(r => r.status !== "pending");

  const groupMap = Object.fromEntries(groups.map(g => [g.id, g]));

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
                      groups={groups}
                      groupMap={groupMap}
                      processing={processing}
                      onApprove={handleApprove}
                      onReject={(id) => { setRejectDialogId(id); setRejectReason(""); }}
                      onAssign={openAssignDialog}
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
                      groups={groups}
                      groupMap={groupMap}
                      processing={processing}
                      onApprove={handleApprove}
                      onReject={(id) => { setRejectDialogId(id); setRejectReason(""); }}
                      onAssign={openAssignDialog}
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

      <Dialog open={!!assignDialogId} onOpenChange={(o) => { if (!o) { setAssignDialogId(null); setAssignGroupId(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Assign to Hajj Group
            </DialogTitle>
            <DialogDescription>
              A pilgrim placeholder will be created in the selected group. The customer's travel details will automatically fill in when they submit their passport information.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Hajj groups available. Create a group first in the Pilgrim Manager.</p>
            ) : (
              <select
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={assignGroupId}
                onChange={e => setAssignGroupId(e.target.value)}
              >
                {groups.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.groupName} ({g.year})
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setAssignDialogId(null); setAssignGroupId(""); }}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-primary text-white hover:bg-primary/90"
                onClick={handleAssignGroup}
                disabled={assigning || !assignGroupId || groups.length === 0}
              >
                {assigning ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Assigning...
                  </span>
                ) : (
                  <><Users className="w-4 h-4 mr-2" /> Assign Group</>
                )}
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
  groups,
  groupMap,
  processing,
  onApprove,
  onReject,
  onAssign,
}: {
  request: PackageRequest;
  groups: HajjGroup[];
  groupMap: Record<string, HajjGroup>;
  processing: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onAssign: (id: string) => void;
}) {
  const isPending = request.status === "pending";
  const isApproved = request.status === "approved";
  const isProcessing = processing === request.id;
  const assignedGroup = request.groupId ? groupMap[request.groupId] : null;
  const canAssign = !isPending && isApproved && !request.pilgrimId && groups.length > 0;

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
          <div className="flex gap-2 flex-wrap">
            {request.bookingId && (
              <Link href={`/admin/bookings`}>
                <Button variant="outline" size="sm" className="text-xs">
                  View Booking
                </Button>
              </Link>
            )}
          </div>
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

        {request.pilgrimId && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-emerald-800">
              <Users className="w-4 h-4 shrink-0" />
              <span>
                <span className="font-semibold">Assigned to group:</span>{" "}
                {assignedGroup ? `${assignedGroup.groupName} (${assignedGroup.year})` : "Unknown Group"}
              </span>
            </div>
            <Link href="/admin/pilgrims">
              <Button variant="outline" size="sm" className="text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 shrink-0">
                View Pilgrims <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          {isPending && (
            <>
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
            </>
          )}

          {canAssign && (
            <Button
              variant="outline"
              size="sm"
              className="border-primary text-primary hover:bg-primary/5"
              onClick={() => onAssign(request.id)}
            >
              <Users className="w-4 h-4 mr-2" /> Assign to Group
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
