import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, CheckCircle, Clock, AlertTriangle, Trash2, Edit2, RefreshCw, ListTodo } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
};
const CATEGORIES = ["general", "booking", "visa", "payment", "hotel", "flight", "document", "support", "medical"];

const EMPTY_FORM = { title: "", description: "", priority: "medium", assignedName: "", dueDate: "", category: "general", bookingId: "" };

function TaskForm({ initial, onSave, onCancel, saving }: { initial?: any; onSave: (d: any) => void; onCancel: () => void; saving: boolean }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <div className="rounded-2xl border p-5 bg-background space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Task Title *</Label>
        <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Follow up visa for Group A" className="h-9" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Description</Label>
        <textarea value={form.description} onChange={e => set("description", e.target.value)} placeholder="Task details…"
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Priority</Label>
          <select value={form.priority} onChange={e => set("priority", e.target.value)} className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
            {["urgent", "high", "medium", "low"].map(p => <option key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Category</Label>
          <select value={form.category} onChange={e => set("category", e.target.value)} className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
            {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Assigned To</Label>
          <Input value={form.assignedName} onChange={e => set("assignedName", e.target.value)} placeholder="Staff name" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Due Date</Label>
          <Input type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} className="h-9" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Booking # (optional)</Label>
        <Input value={form.bookingId} onChange={e => set("bookingId", e.target.value)} placeholder="Link to a booking ID" className="h-9" />
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={saving || !form.title.trim()} className="gap-1.5">
          {saving ? <RefreshCw size={13} className="animate-spin" /> : null}
          {initial ? "Update Task" : "Create Task"}
        </Button>
      </div>
    </div>
  );
}

export default function TaskManager() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const [tr, sr] = await Promise.all([
        fetch(`${BASE_API}/api/enterprise/tasks`, { credentials: "include" }),
        fetch(`${BASE_API}/api/enterprise/tasks/stats`, { credentials: "include" }),
      ]);
      if (tr.ok) setTasks(await tr.json());
      if (sr.ok) setStats(await sr.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form: any) => {
    setSaving(true);
    try {
      const url = editTask ? `${BASE_API}/api/enterprise/tasks/${editTask.id}` : `${BASE_API}/api/enterprise/tasks`;
      const method = editTask ? "PATCH" : "POST";
      const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (r.ok) {
        toast({ title: editTask ? "Task updated" : "Task created" });
        setShowForm(false); setEditTask(null); load();
      } else { toast({ title: "Failed to save", variant: "destructive" }); }
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setSaving(false);
  };

  const markStatus = async (id: string, status: string) => {
    const r = await fetch(`${BASE_API}/api/enterprise/tasks/${id}`, {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (r.ok) { setTasks(ts => ts.map(t => t.id === id ? { ...t, status } : t)); if (status === "completed") toast({ title: "Task completed! ✅" }); }
  };

  const deleteTask = async (id: string) => {
    if (!confirm("Delete this task?")) return;
    await fetch(`${BASE_API}/api/enterprise/tasks/${id}`, { method: "DELETE", credentials: "include" });
    setTasks(ts => ts.filter(t => t.id !== id));
  };

  const filtered = tasks.filter(t =>
    (filterStatus === "all" || t.status === filterStatus) &&
    (filterPriority === "all" || t.priority === filterPriority)
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Task Manager</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Assign and track tasks for your team</p>
          </div>
          <Button onClick={() => { setShowForm(true); setEditTask(null); }} className="gap-1.5">
            <Plus size={15} /> New Task
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {[
            { label: "Total", value: stats.total || 0, color: "text-foreground" },
            { label: "Pending", value: stats.pending || 0, color: "text-amber-700" },
            { label: "In Progress", value: stats.in_progress || 0, color: "text-blue-700" },
            { label: "Overdue", value: stats.overdue || 0, color: "text-red-700" },
            { label: "Completed", value: stats.completed || 0, color: "text-emerald-700" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border p-3 text-center bg-background">
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {showForm && <TaskForm onSave={handleSave} onCancel={() => setShowForm(false)} saving={saving} />}
        {editTask && <TaskForm initial={{ title: editTask.title, description: editTask.description, priority: editTask.priority, assignedName: editTask.assigned_name || "", dueDate: editTask.due_date?.slice(0,10) || "", category: editTask.category, bookingId: editTask.booking_id || "" }} onSave={handleSave} onCancel={() => setEditTask(null)} saving={saving} />}

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {["all", "pending", "in_progress", "completed", "cancelled"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${filterStatus === s ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
              {s === "all" ? "All" : s.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            {["all", "urgent", "high", "medium", "low"].map(p => (
              <button key={p} onClick={() => setFilterPriority(p)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${filterPriority === p ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                {p === "all" ? "All" : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Task list */}
        {loading ? (
          <div className="py-16 text-center text-muted-foreground">Loading tasks…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <ListTodo size={36} className="mx-auto mb-2 opacity-30" />
            <p>No tasks found. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(task => {
              const isOverdue = task.status !== "completed" && task.due_date && task.due_date.slice(0,10) < today;
              const isDueToday = task.due_date && task.due_date.slice(0,10) === today && task.status !== "completed";
              return (
                <div key={task.id} className={`rounded-2xl border p-4 bg-background transition-all hover:shadow-sm ${isOverdue ? "border-red-200 bg-red-50/30" : isDueToday ? "border-amber-200 bg-amber-50/20" : ""}`}>
                  <div className="flex items-start gap-3">
                    <button onClick={() => markStatus(task.id, task.status === "completed" ? "pending" : "completed")} className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${task.status === "completed" ? "bg-emerald-500 border-emerald-500 text-white" : "border-muted-foreground hover:border-primary"}`}>
                      {task.status === "completed" && <CheckCircle size={12} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-semibold text-sm ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                        <Badge variant="outline" className={`text-[10px] py-0 h-4 border ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</Badge>
                        <Badge variant="outline" className={`text-[10px] py-0 h-4 ${STATUS_COLORS[task.status]}`}>{task.status?.replace("_"," ")}</Badge>
                        {isOverdue && <Badge variant="outline" className="text-[10px] py-0 h-4 bg-red-100 text-red-700 border-red-200">Overdue</Badge>}
                        {isDueToday && <Badge variant="outline" className="text-[10px] py-0 h-4 bg-amber-100 text-amber-700 border-amber-200">Due Today</Badge>}
                      </div>
                      {task.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>}
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                        {task.assigned_name && <span>👤 {task.assigned_name}</span>}
                        {task.due_date && <span>📅 {new Date(task.due_date).toLocaleDateString("en-IN")}</span>}
                        {task.category && <span className="capitalize px-1.5 py-0.5 bg-muted/50 rounded-md">{task.category}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {task.status !== "completed" && (
                        <button onClick={() => markStatus(task.id, "in_progress")} className="w-7 h-7 rounded-lg border hover:bg-blue-50 text-blue-700 flex items-center justify-center text-xs" title="Mark In Progress">▶</button>
                      )}
                      <button onClick={() => { setEditTask(task); setShowForm(false); }} className="w-7 h-7 rounded-lg border hover:bg-muted flex items-center justify-center" title="Edit">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => deleteTask(task.id)} className="w-7 h-7 rounded-lg border hover:bg-red-50 text-red-500 flex items-center justify-center" title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
