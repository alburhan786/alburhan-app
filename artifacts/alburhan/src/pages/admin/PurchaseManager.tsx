import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "";

interface PO {
  id: string;
  po_number: string;
  vendor_name: string;
  category: string;
  status: string;
  order_date: string;
  expected_date?: string;
  total_amount: number;
  item_count: number;
  notes?: string;
}

interface Bill {
  id: string;
  bill_number: string;
  vendor_name: string;
  bill_date: string;
  due_date?: string;
  total_amount: number;
  paid_amount: number;
  outstanding: number;
  status: string;
  invoice_number?: string;
}

interface POItem {
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft:           "bg-gray-100 text-gray-700",
  pending:         "bg-yellow-100 text-yellow-800",
  approved:        "bg-blue-100 text-blue-800",
  received:        "bg-green-100 text-green-800",
  partially_paid:  "bg-orange-100 text-orange-800",
  paid:            "bg-green-100 text-green-800",
  cancelled:       "bg-red-100 text-red-800",
};

function fmt(n: number) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }

const EMPTY_ITEM: POItem = { description: "", quantity: 1, unit_price: 0, total_price: 0 };

export default function PurchaseManager() {
  const [tab, setTab] = useState<"orders" | "bills" | "stats">("orders");
  const [orders, setOrders] = useState<PO[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [billSummary, setBillSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [showPOForm, setShowPOForm] = useState(false);
  const [showBillForm, setShowBillForm] = useState(false);
  const [poVendor, setPoVendor] = useState("");
  const [poCategory, setPoCategory] = useState("others");
  const [poDate, setPoDate] = useState(new Date().toISOString().split("T")[0]);
  const [poExpected, setPoExpected] = useState("");
  const [poNotes, setPoNotes] = useState("");
  const [poItems, setPoItems] = useState<POItem[]>([{ ...EMPTY_ITEM }]);
  const [billVendor, setBillVendor] = useState("");
  const [billInvNum, setBillInvNum] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().split("T")[0]);
  const [billDue, setBillDue] = useState("");
  const [billSubtotal, setBillSubtotal] = useState(0);
  const [billTax, setBillTax] = useState(0);
  const [billNotes, setBillNotes] = useState("");
  const [payBill, setPayBill] = useState<Bill | null>(null);
  const [payAmt, setPayAmt] = useState("");
  const [payMode, setPayMode] = useState("bank_transfer");
  const [actionId, setActionId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  async function loadOrders() {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : "";
      const r = await fetch(`${API}/api/purchase/orders${params}`, { credentials: "include" });
      setOrders(await r.json());
    } finally { setLoading(false); }
  }

  async function loadBills() {
    setLoading(true);
    try {
      const [br, sr] = await Promise.all([
        fetch(`${API}/api/purchase/bills`, { credentials: "include" }),
        fetch(`${API}/api/purchase/bills/summary`, { credentials: "include" }),
      ]);
      setBills(await br.json());
      setBillSummary(await sr.json());
    } finally { setLoading(false); }
  }

  async function loadStats() {
    const r = await fetch(`${API}/api/purchase/stats`, { credentials: "include" });
    setStats(await r.json());
  }

  useEffect(() => {
    if (tab === "orders") loadOrders();
    else if (tab === "bills") loadBills();
    else loadStats();
  }, [tab]);

  function updateItem(idx: number, field: keyof POItem, value: any) {
    setPoItems(items => {
      const next = items.map((it, i) => i !== idx ? it : { ...it, [field]: value });
      if (field === "quantity" || field === "unit_price") {
        next[idx].total_price = Number(next[idx].quantity) * Number(next[idx].unit_price);
      }
      return next;
    });
  }

  const poTotal = poItems.reduce((s, i) => s + Number(i.total_price), 0);

  async function submitPO() {
    const r = await fetch(`${API}/api/purchase/orders`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendor_name: poVendor, category: poCategory, order_date: poDate, expected_date: poExpected || null, notes: poNotes, items: poItems }),
    });
    if (r.ok) {
      flash("✅ Purchase order created");
      setShowPOForm(false);
      setPoVendor(""); setPoCategory("others"); setPoItems([{ ...EMPTY_ITEM }]);
      loadOrders();
    } else flash("❌ Failed to create PO");
  }

  async function submitBill() {
    const total = billSubtotal + billTax;
    const r = await fetch(`${API}/api/purchase/bills`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendor_name: billVendor, invoice_number: billInvNum, bill_date: billDate, due_date: billDue || null, subtotal: billSubtotal, tax_amount: billTax, total_amount: total, notes: billNotes }),
    });
    if (r.ok) {
      flash("✅ Vendor bill created");
      setShowBillForm(false);
      setBillVendor(""); setBillInvNum(""); setBillSubtotal(0); setBillTax(0);
      loadBills();
    } else flash("❌ Failed to create bill");
  }

  async function doPoAction(id: string, action: string) {
    setActionId(id);
    try {
      const r = await fetch(`${API}/api/purchase/orders/${id}/${action}`, { method: "POST", credentials: "include" });
      if (r.ok) { flash(`✅ PO ${action}d`); loadOrders(); }
    } finally { setActionId(null); }
  }

  async function doBillAction(id: string, action: string) {
    setActionId(id);
    try {
      const r = await fetch(`${API}/api/purchase/bills/${id}/${action}`, { method: "POST", credentials: "include" });
      if (r.ok) { flash(`✅ Bill ${action}d`); loadBills(); }
    } finally { setActionId(null); }
  }

  async function submitBillPay() {
    if (!payBill) return;
    const r = await fetch(`${API}/api/purchase/bills/${payBill.id}/pay`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(payAmt), payment_mode: payMode }),
    });
    if (r.ok) { flash("✅ Payment recorded"); setPayBill(null); loadBills(); }
    else flash("❌ Payment failed");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Purchase Management</h1>
            <p className="text-sm text-gray-500 mt-1">Purchase orders, vendor bills & payment tracking</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowBillForm(true)} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              + Vendor Bill
            </button>
            <button onClick={() => setShowPOForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
              + Purchase Order
            </button>
          </div>
        </div>
        {msg && <div className="mt-3 p-3 bg-green-50 text-green-800 rounded-lg text-sm">{msg}</div>}
      </div>

      {/* Bill KPIs */}
      {tab === "bills" && billSummary && (
        <div className="grid grid-cols-4 gap-4 px-6 py-4">
          {[
            { label: "Outstanding Payable", value: fmt(billSummary.outstanding), color: "text-red-600" },
            { label: "Approved Bills", value: fmt(billSummary.approved_amount), color: "text-blue-600" },
            { label: "Total Paid", value: fmt(billSummary.total_paid), color: "text-green-600" },
            { label: "Overdue Bills", value: String(billSummary.overdue_count), color: "text-orange-600" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border p-4 shadow-sm">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">{k.label}</div>
              <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      {tab === "stats" && stats && (
        <div className="grid grid-cols-2 gap-6 px-6 py-4">
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">📦 Purchase Orders</h3>
            <div className="space-y-3 text-sm">
              {[
                ["Total", stats.purchase_orders?.total],
                ["Draft", stats.purchase_orders?.draft],
                ["Approved", stats.purchase_orders?.approved],
                ["Received", stats.purchase_orders?.received],
              ].map(([l, v]) => (
                <div key={l as string} className="flex justify-between"><span className="text-gray-600">{l}</span><span className="font-semibold">{v}</span></div>
              ))}
              <div className="pt-2 border-t flex justify-between"><span className="font-medium">Total Value</span><span className="font-bold">{fmt(stats.purchase_orders?.total_value)}</span></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">🧾 Vendor Bills</h3>
            <div className="space-y-3 text-sm">
              {[
                ["Total Bills", stats.bills?.total],
                ["Total Billed", fmt(stats.bills?.total_billed)],
                ["Total Paid", fmt(stats.bills?.total_paid)],
              ].map(([l, v]) => (
                <div key={l as string} className="flex justify-between"><span className="text-gray-600">{l}</span><span className="font-semibold">{v}</span></div>
              ))}
              <div className="pt-2 border-t flex justify-between"><span className="font-medium text-red-600">Outstanding</span><span className="font-bold text-red-600">{fmt(stats.bills?.outstanding)}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-6">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
          {(["orders", "bills", "stats"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"}`}>
              {t === "orders" ? "📦 Purchase Orders" : t === "bills" ? "🧾 Vendor Bills" : "📊 Statistics"}
            </button>
          ))}
        </div>

        {/* Orders Table */}
        {tab === "orders" && (
          <>
            <div className="mb-3 flex gap-2 flex-wrap">
              {["", "draft", "approved", "received", "cancelled"].map(s => (
                <button key={s} onClick={() => { setStatusFilter(s); setTimeout(loadOrders, 0); }}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${statusFilter === s ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 hover:bg-gray-50"}`}>
                  {s || "All"}
                </button>
              ))}
            </div>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>{["PO Number", "Vendor", "Category", "Amount", "Items", "Date", "Status", "Actions"].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y">
                  {orders.map(po => (
                    <tr key={po.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-medium text-indigo-600">{po.po_number}</td>
                      <td className="px-4 py-3 font-medium">{po.vendor_name}</td>
                      <td className="px-4 py-3 capitalize text-gray-600">{po.category}</td>
                      <td className="px-4 py-3 font-semibold">{fmt(po.total_amount)}</td>
                      <td className="px-4 py-3 text-gray-500">{po.item_count}</td>
                      <td className="px-4 py-3 text-gray-500">{po.order_date}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[po.status] || "bg-gray-100 text-gray-700"}`}>{po.status}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {po.status === "draft" && <>
                            <button onClick={() => doPoAction(po.id, "approve")} disabled={actionId === po.id}
                              className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Approve</button>
                            <button onClick={() => doPoAction(po.id, "cancel")}
                              className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Cancel</button>
                          </>}
                          {po.status === "approved" && (
                            <button onClick={() => doPoAction(po.id, "receive")}
                              className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">Mark Received</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && orders.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No purchase orders found</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Bills Table */}
        {tab === "bills" && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{["Bill #", "Vendor", "Invoice #", "Bill Date", "Due Date", "Total", "Paid", "Outstanding", "Status", "Actions"].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {bills.map(bill => (
                  <tr key={bill.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-indigo-600">{bill.bill_number}</td>
                    <td className="px-4 py-3 font-medium">{bill.vendor_name}</td>
                    <td className="px-4 py-3 text-gray-500">{bill.invoice_number || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{bill.bill_date}</td>
                    <td className="px-4 py-3 text-gray-500">{bill.due_date || "—"}</td>
                    <td className="px-4 py-3 font-semibold">{fmt(bill.total_amount)}</td>
                    <td className="px-4 py-3 text-green-600">{fmt(bill.paid_amount)}</td>
                    <td className="px-4 py-3 font-semibold text-red-600">{fmt(bill.outstanding)}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[bill.status] || "bg-gray-100 text-gray-700"}`}>{bill.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {bill.status === "pending" && (
                          <button onClick={() => doBillAction(bill.id, "approve")} disabled={actionId === bill.id}
                            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Approve</button>
                        )}
                        {(bill.status === "approved" || bill.status === "partially_paid") && (
                          <button onClick={() => { setPayBill(bill); setPayAmt(String(bill.outstanding)); }}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">Pay</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && bills.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No vendor bills found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PO Form Modal */}
      {showPOForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">New Purchase Order</h2></div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name *</label>
                  <input value={poVendor} onChange={e => setPoVendor(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Vendor name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select value={poCategory} onChange={e => setPoCategory(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    {["hotels", "transport", "airlines", "visa", "catering", "laundry", "others"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Order Date</label>
                  <input type="date" value={poDate} onChange={e => setPoDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expected Delivery</label>
                  <input type="date" value={poExpected} onChange={e => setPoExpected(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Line Items</label>
                  <button onClick={() => setPoItems(items => [...items, { ...EMPTY_ITEM }])}
                    className="text-sm text-indigo-600 hover:text-indigo-800">+ Add Item</button>
                </div>
                <div className="space-y-2">
                  {poItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input value={item.description} onChange={e => updateItem(idx, "description", e.target.value)}
                        className="col-span-5 border rounded px-2 py-1.5 text-sm" placeholder="Description" />
                      <input type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)}
                        className="col-span-2 border rounded px-2 py-1.5 text-sm" placeholder="Qty" />
                      <input type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", e.target.value)}
                        className="col-span-2 border rounded px-2 py-1.5 text-sm" placeholder="Price" />
                      <div className="col-span-2 text-sm font-medium text-right">₹{Number(item.total_price).toLocaleString()}</div>
                      <button onClick={() => setPoItems(items => items.filter((_, i) => i !== idx))}
                        className="col-span-1 text-red-400 hover:text-red-600 text-center text-lg">×</button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t flex justify-end">
                  <span className="font-semibold">Total: {fmt(poTotal)}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={poNotes} onChange={e => setPoNotes(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowPOForm(false)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium">Cancel</button>
              <button onClick={submitPO} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">Create PO</button>
            </div>
          </div>
        </div>
      )}

      {/* Bill Form Modal */}
      {showBillForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">New Vendor Bill</h2></div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name *</label>
                  <input value={billVendor} onChange={e => setBillVendor(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Invoice #</label>
                  <input value={billInvNum} onChange={e => setBillInvNum(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bill Date</label>
                  <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input type="date" value={billDue} onChange={e => setBillDue(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subtotal (₹) *</label>
                  <input type="number" value={billSubtotal} onChange={e => setBillSubtotal(Number(e.target.value))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax (₹)</label>
                  <input type="number" value={billTax} onChange={e => setBillTax(Number(e.target.value))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 flex justify-between text-sm">
                <span className="font-medium">Total Amount</span>
                <span className="font-bold">{fmt(billSubtotal + billTax)}</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={billNotes} onChange={e => setBillNotes(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowBillForm(false)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium">Cancel</button>
              <button onClick={submitBill} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">Create Bill</button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Bill Modal */}
      {payBill && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">Pay Vendor Bill</h2>
              <p className="text-sm text-gray-500 mt-1">{payBill.vendor_name} — {payBill.bill_number}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3 text-sm">
                <div><span className="text-gray-500">Total</span><div className="font-semibold">{fmt(payBill.total_amount)}</div></div>
                <div><span className="text-gray-500">Outstanding</span><div className="font-bold text-red-600">{fmt(payBill.outstanding)}</div></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount to Pay (₹) *</label>
                <input type="number" value={payAmt} onChange={e => setPayAmt(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                <select value={payMode} onChange={e => setPayMode(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="upi">UPI</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setPayBill(null)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium">Cancel</button>
              <button onClick={submitBillPay} className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700">Confirm Payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
