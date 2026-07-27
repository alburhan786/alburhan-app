// @ts-nocheck
import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Code, Copy, Layout, Plus, Settings, Trash2, GripVertical, CheckCircle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

const FIELD_TYPES = [
  { value: "text", label: "Short Text" },
  { value: "email", label: "Email Address" },
  { value: "tel", label: "Phone Number" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown Select" },
  { value: "textarea", label: "Long Text" }
];

const MAPS_TO = [
  "name", "first_name", "last_name", "mobile", "email", 
  "package_interest", "budget", "travel_month", "num_travellers", "message", "none"
];

export default function WebFormBuilder() {
  const { toast } = useToast();
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Editor state
  const [editingForm, setEditingForm] = useState(null);
  const [embedModalOpen, setEmbedModalOpen] = useState(false);
  const [embedCode, setEmbedCode] = useState("");

  const loadForms = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/leads/web-forms`, { credentials: "include" });
      if (res.ok) setForms(await res.json());
    } catch (e) { }
    setLoading(false);
  };

  useEffect(() => { loadForms(); }, []);

  const handleCreateNew = () => {
    setEditingForm({
      name: "New Lead Form",
      description: "Please fill out your details below.",
      theme_color: "#0A3D2A",
      success_message: "Thank you! We will contact you shortly.",
      is_active: true,
      fields: [
        { id: "f1", label: "Full Name", type: "text", placeholder: "John Doe", required: true, maps_to: "name" },
        { id: "f2", label: "Mobile Number", type: "tel", placeholder: "9876543210", required: true, maps_to: "mobile" }
      ]
    });
  };

  const handleSaveForm = async () => {
    try {
      const method = editingForm.id ? "PUT" : "POST";
      const url = editingForm.id ? `/api/leads/web-forms/${editingForm.id}` : `/api/leads/web-forms`;
      const res = await fetch(`${API}${url}`, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editingForm)
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: "Form saved successfully" });
      loadForms();
      setEditingForm(null);
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const openEmbedModal = async (formId) => {
    try {
      const res = await fetch(`${API}/api/leads/web-forms/${formId}/embed`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setEmbedCode(data.embedCode || `<iframe src="${API}/embed/form/${formId}" width="100%" height="600" frameborder="0"></iframe>`);
        setEmbedModalOpen(true);
      }
    } catch (e) { }
  };

  const addField = (preset = null) => {
    const newField = { id: `f_${Date.now()}`, required: false };
    if (preset === 'email') { newField.label = "Email Address"; newField.type = "email"; newField.maps_to = "email"; }
    else if (preset === 'package') { newField.label = "Interested Package"; newField.type = "select"; newField.maps_to = "package_interest"; newField.options = "Hajj,Umrah,Ziyarat"; }
    else if (preset === 'message') { newField.label = "Your Message"; newField.type = "textarea"; newField.maps_to = "message"; }
    else { newField.label = "New Field"; newField.type = "text"; newField.maps_to = "none"; }
    
    setEditingForm({ ...editingForm, fields: [...editingForm.fields, newField] });
  };

  const updateField = (index, key, value) => {
    const newFields = [...editingForm.fields];
    newFields[index][key] = value;
    setEditingForm({ ...editingForm, fields: newFields });
  };

  const removeField = (index) => {
    setEditingForm({ ...editingForm, fields: editingForm.fields.filter((_, i) => i !== index) });
  };

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-[#0A3D2A] flex items-center gap-2">
              <Layout className="text-[#C9A84C]" /> Web Form Builder
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Build embeddable forms to capture leads from any website.</p>
          </div>
          {!editingForm && (
            <Button onClick={handleCreateNew} className="bg-[#0A3D2A] hover:bg-[#0A3D2A]/90 gap-2">
              <Plus size={16} /> Create Form
            </Button>
          )}
        </div>

        {!editingForm ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <div className="col-span-full py-12 text-center text-muted-foreground">Loading forms...</div>
            ) : forms.length === 0 ? (
              <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-dashed">
                <Layout size={48} className="mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No forms built yet</h3>
                <p className="text-muted-foreground text-sm mb-4">Create your first web form to start capturing leads automatically.</p>
                <Button onClick={handleCreateNew} variant="outline">Build First Form</Button>
              </div>
            ) : (
              forms.map(form => (
                <Card key={form.id} className="overflow-hidden group hover:shadow-md transition-shadow">
                  <div className="h-2 w-full" style={{ backgroundColor: form.theme_color || '#0A3D2A' }} />
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-lg leading-tight line-clamp-1">{form.name}</h3>
                      <Badge variant={form.is_active ? "default" : "secondary"} className={form.is_active ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}>
                        {form.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm mb-6 bg-muted/40 p-2 rounded-lg">
                      <Users size={14} className="text-muted-foreground" />
                      <span className="font-medium">{form.submissions_count || 0}</span>
                      <span className="text-muted-foreground">submissions</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingForm(form)} className="w-full">Edit</Button>
                      <Button variant="secondary" size="sm" onClick={() => openEmbedModal(form.id)} className="w-full gap-1"><Code size={12}/> Embed</Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          /* FORM EDITOR */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader className="bg-muted/30 pb-4">
                  <CardTitle className="text-lg flex items-center gap-2"><Settings size={18}/> Form Settings</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <Label>Form Name</Label>
                      <Input value={editingForm.name} onChange={e => setEditingForm({...editingForm, name: e.target.value})} />
                    </div>
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <Label>Theme Color</Label>
                      <div className="flex gap-2">
                        <Input type="color" value={editingForm.theme_color} onChange={e => setEditingForm({...editingForm, theme_color: e.target.value})} className="w-12 h-10 p-1" />
                        <Input value={editingForm.theme_color} onChange={e => setEditingForm({...editingForm, theme_color: e.target.value})} className="flex-1 font-mono uppercase" />
                      </div>
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Description (shown below title)</Label>
                      <Input value={editingForm.description} onChange={e => setEditingForm({...editingForm, description: e.target.value})} />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Success Message</Label>
                      <Input value={editingForm.success_message} onChange={e => setEditingForm({...editingForm, success_message: e.target.value})} />
                    </div>
                    <div className="col-span-2 flex items-center gap-2 pt-2">
                      <Switch id="active-toggle" checked={editingForm.is_active} onCheckedChange={c => setEditingForm({...editingForm, is_active: c})} />
                      <Label htmlFor="active-toggle">Form is Active (can accept submissions)</Label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="bg-muted/30 pb-4 flex flex-row items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2"><Layout size={18}/> Fields</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => addField('email')} className="h-7 text-xs">+ Email</Button>
                    <Button variant="outline" size="sm" onClick={() => addField('package')} className="h-7 text-xs">+ Package</Button>
                    <Button variant="outline" size="sm" onClick={() => addField('message')} className="h-7 text-xs">+ Message</Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {editingForm.fields.map((field, i) => (
                      <div key={field.id || i} className="p-4 bg-white hover:bg-muted/10 flex gap-4 group">
                        <div className="pt-2 text-muted-foreground/30 group-hover:text-muted-foreground cursor-grab"><GripVertical size={20} /></div>
                        <div className="flex-1 grid grid-cols-12 gap-3">
                          <div className="col-span-12 sm:col-span-5 space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Label</Label>
                            <Input value={field.label} onChange={e => updateField(i, 'label', e.target.value)} className="h-8 text-sm" />
                          </div>
                          <div className="col-span-6 sm:col-span-3 space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</Label>
                            <select value={field.type} onChange={e => updateField(i, 'type', e.target.value)} className="w-full h-8 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                              {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <div className="col-span-6 sm:col-span-3 space-y-1.5">
                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Maps To (CRM)</Label>
                            <select value={field.maps_to} onChange={e => updateField(i, 'maps_to', e.target.value)} className="w-full h-8 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                              {MAPS_TO.map(t => <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, c=>c.toUpperCase())}</option>)}
                            </select>
                          </div>
                          <div className="col-span-12 sm:col-span-1 flex items-center justify-end pt-5">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => removeField(i)}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                          
                          <div className="col-span-12 flex items-center gap-4 pt-1">
                            <label className="flex items-center gap-2 text-xs">
                              <input type="checkbox" checked={field.required} onChange={e => updateField(i, 'required', e.target.checked)} className="rounded text-[#0A3D2A] focus:ring-[#0A3D2A]" />
                              Required field
                            </label>
                            {field.type === 'select' && (
                              <div className="flex-1 flex items-center gap-2">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Options (comma separated):</span>
                                <Input value={field.options || ""} onChange={e => updateField(i, 'options', e.target.value)} className="h-6 text-xs flex-1" placeholder="Option 1, Option 2" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="p-4 bg-muted/10 text-center">
                      <Button variant="outline" onClick={() => addField()} className="gap-2 border-dashed bg-transparent w-full max-w-sm"><Plus size={16}/> Add Custom Field</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={() => setEditingForm(null)}>Cancel</Button>
                <Button onClick={handleSaveForm} className="bg-[#0A3D2A] hover:bg-[#0A3D2A]/90 px-8">Save Form</Button>
              </div>
            </div>

            {/* LIVE PREVIEW */}
            <div className="lg:col-span-1 sticky top-6">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2"><Eye size={14}/> Live Preview</div>
              <div className="bg-white rounded-2xl border shadow-xl overflow-hidden pointer-events-none select-none">
                <div className="h-3 w-full" style={{ backgroundColor: editingForm.theme_color || '#0A3D2A' }} />
                <div className="p-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">{editingForm.name || "Untitled Form"}</h2>
                  <p className="text-sm text-gray-500 mb-6">{editingForm.description}</p>
                  
                  <div className="space-y-4">
                    {editingForm.fields.map((f, i) => (
                      <div key={i} className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">{f.label} {f.required && <span className="text-red-500">*</span>}</label>
                        {f.type === 'textarea' ? (
                          <textarea className="w-full rounded-lg border border-gray-300 p-3 h-20 bg-gray-50/50" placeholder={f.placeholder} />
                        ) : f.type === 'select' ? (
                          <select className="w-full rounded-lg border border-gray-300 p-2.5 h-10 bg-gray-50/50 text-gray-500">
                            <option>Select an option...</option>
                          </select>
                        ) : (
                          <input type={f.type === 'tel' ? 'text' : f.type} className="w-full rounded-lg border border-gray-300 p-2.5 h-10 bg-gray-50/50" placeholder={f.placeholder} />
                        )}
                      </div>
                    ))}
                    <Button className="w-full mt-4 h-11 text-base font-semibold" style={{ backgroundColor: editingForm.theme_color || '#0A3D2A' }}>
                      Submit
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EMBED MODAL */}
        {embedModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <Card className="w-full max-w-2xl shadow-2xl animate-in zoom-in-95">
              <CardHeader className="border-b bg-muted/20">
                <CardTitle className="flex justify-between items-center">
                  <span className="flex items-center gap-2"><Code className="text-[#C9A84C]" /> Embed Form</span>
                  <Button variant="ghost" size="icon" onClick={() => setEmbedModalOpen(false)} className="h-8 w-8 rounded-full"><X size={16}/></Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="bg-blue-50 text-blue-800 p-4 rounded-xl border border-blue-200 text-sm flex gap-3">
                  <CheckCircle className="shrink-0 mt-0.5" size={16} />
                  <p>Copy and paste this HTML code into your website builder (WordPress, Wix, Shopify, custom HTML, etc.) where you want the form to appear.</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">HTML Embed Code</Label>
                    <Button variant="secondary" size="sm" onClick={copyEmbed} className="h-7 text-xs gap-1"><Copy size={12}/> Copy Code</Button>
                  </div>
                  <Textarea readOnly value={embedCode} className="font-mono text-xs h-32 bg-muted/50 resize-none" />
                </div>
                
                <div className="pt-2 border-t flex justify-end">
                  <Button onClick={() => setEmbedModalOpen(false)}>Done</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

// Ensure missing icons are imported if needed.
import { Eye, X } from "lucide-react";
