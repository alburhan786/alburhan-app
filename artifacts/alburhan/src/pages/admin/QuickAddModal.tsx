import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Send, Users } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface QuickRow {
  id: number;
  fullName: string;
  salutation: string;
  gender: string;
  passportNumber: string;
  mobileIndia: string;
  familyId: string;
  familyHead: string;
}

const emptyRow = (id: number): QuickRow => ({
  id, fullName: "", salutation: "Mr", gender: "Male",
  passportNumber: "", mobileIndia: "", familyId: "", familyHead: "No",
});

interface Props {
  open: boolean;
  onClose: () => void;
  groupId: string;
  onImported: () => void;
}

export default function QuickAddModal({ open, onClose, groupId, onImported }: Props) {
  const [rows, setRows] = useState<QuickRow[]>([emptyRow(1), emptyRow(2), emptyRow(3)]);
  const [nextId, setNextId] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const update = (id: number, field: keyof QuickRow, val: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  };

  const addRow = () => {
    setRows(prev => [...prev, emptyRow(nextId)]);
    setNextId(n => n + 1);
  };

  const removeRow = (id: number) => {
    if (rows.length === 1) return;
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const handleSubmit = async () => {
    const valid = rows.filter(r => r.fullName.trim());
    if (valid.length === 0) {
      toast({ title: "Enter at least one pilgrim name", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const payload = valid.map(r => ({
        fullName: r.fullName.trim(),
        salutation: r.salutation || null,
        gender: r.gender || null,
        passportNumber: r.passportNumber.trim() || null,
        mobileIndia: r.mobileIndia.trim() || null,
        familyId: r.familyId.trim() || null,
        familyHead: r.familyHead === "Yes" ? "Yes" : "No",
        familyRelation: null,
      }));
      const res = await fetch(`${API}/api/groups/${groupId}/pilgrims/bulk`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.message || "Import failed", variant: "destructive" }); return; }
      toast({
        title: `${data.created} pilgrim${data.created !== 1 ? "s" : ""} added!`,
        description: data.skipped > 0 ? `${data.skipped} skipped (duplicate passport)` : undefined,
      });
      setRows([emptyRow(nextId), emptyRow(nextId + 1), emptyRow(nextId + 2)]);
      setNextId(n => n + 3);
      onImported();
      onClose();
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const validCount = rows.filter(r => r.fullName.trim()).length;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users size={18} className="text-primary" /> Quick Add Pilgrims
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-2">
          Type names directly — passport and mobile are optional. Use the same <strong>Family ID</strong> for family members.
        </p>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b">
                <th className="text-left px-2 py-2 font-semibold text-xs text-muted-foreground w-8">#</th>
                <th className="text-left px-2 py-2 font-semibold text-xs text-muted-foreground w-16">Title</th>
                <th className="text-left px-2 py-2 font-semibold text-xs text-muted-foreground min-w-[180px]">Full Name <span className="text-red-500">*</span></th>
                <th className="text-left px-2 py-2 font-semibold text-xs text-muted-foreground w-24">Gender</th>
                <th className="text-left px-2 py-2 font-semibold text-xs text-muted-foreground w-36">Passport No.</th>
                <th className="text-left px-2 py-2 font-semibold text-xs text-muted-foreground w-36">Mobile India</th>
                <th className="text-left px-2 py-2 font-semibold text-xs text-muted-foreground w-24">Family ID</th>
                <th className="text-left px-2 py-2 font-semibold text-xs text-muted-foreground w-20">Head?</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className={`border-b ${row.fullName.trim() ? "bg-emerald-50/40" : ""}`}>
                  <td className="px-2 py-1 text-muted-foreground text-xs">{i + 1}</td>
                  <td className="px-1 py-1">
                    <select
                      value={row.salutation}
                      onChange={e => update(row.id, "salutation", e.target.value)}
                      className="w-full border rounded px-1 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option>Mr</option>
                      <option>Mrs</option>
                      <option>Miss</option>
                      <option>Haji</option>
                      <option>Hajiani</option>
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={row.fullName}
                      onChange={e => update(row.id, "fullName", e.target.value)}
                      placeholder="Full name"
                      className="h-8 text-sm"
                      onKeyDown={e => { if (e.key === "Enter") addRow(); }}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      value={row.gender}
                      onChange={e => update(row.id, "gender", e.target.value)}
                      className="w-full border rounded px-1 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option>Male</option>
                      <option>Female</option>
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={row.passportNumber}
                      onChange={e => update(row.id, "passportNumber", e.target.value.toUpperCase())}
                      placeholder="P1234567"
                      className="h-8 text-sm font-mono"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={row.mobileIndia}
                      onChange={e => update(row.id, "mobileIndia", e.target.value)}
                      placeholder="98765XXXXX"
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      value={row.familyId}
                      onChange={e => update(row.id, "familyId", e.target.value.toUpperCase())}
                      placeholder="F001"
                      className="h-8 text-sm font-mono"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      value={row.familyHead}
                      onChange={e => update(row.id, "familyHead", e.target.value)}
                      className="w-full border rounded px-1 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option>No</option>
                      <option>Yes</option>
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <button
                      onClick={() => removeRow(row.id)}
                      className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                      disabled={rows.length === 1}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center pt-3 border-t gap-3 flex-wrap">
          <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5 rounded-lg">
            <Plus size={14} /> Add Row
          </Button>
          <div className="flex items-center gap-3">
            {validCount > 0 && (
              <span className="text-sm text-muted-foreground">{validCount} pilgrim{validCount !== 1 ? "s" : ""} ready</span>
            )}
            <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || validCount === 0}
              className="gap-1.5 bg-primary text-white rounded-lg"
            >
              <Send size={14} /> {submitting ? "Saving…" : `Save ${validCount > 0 ? validCount : ""} Pilgrim${validCount !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
