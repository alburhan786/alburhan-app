const BASE = `${import.meta.env.BASE_URL}api`;

async function request<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.error || msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.blob() as any;
}

function getBase(): string {
  return BASE;
}

// Auth
export const auth = {
  login: (d: { username: string; password: string }) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(d) }),
  verifyTwoFactor: (code: string) =>
    request("/auth/verify-2fa", { method: "POST", body: JSON.stringify({ code }) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  setup2fa: () => request("/auth/2fa/setup", { method: "POST" }),
  confirm2fa: (code: string) =>
    request("/auth/2fa/confirm", { method: "POST", body: JSON.stringify({ code }) }),
  disable2fa: () => request("/auth/2fa/disable", { method: "POST" }),
  changePassword: (d: { currentPassword: string; newPassword: string }) =>
    request("/auth/change-password", { method: "PUT", body: JSON.stringify(d) }),
};

// Files
export const files = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return request(`/files${q}`);
  },
  upload: (formData: FormData) =>
    fetch(`${BASE}/files/upload`, { method: "POST", body: formData, credentials: "include" }).then((r) => {
      if (!r.ok) return r.json().then((d) => Promise.reject(new Error(d.error)));
      return r.json();
    }),
  get: (id: string) => request(`/files/${id}`),
  update: (id: string, data: any) =>
    request(`/files/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request(`/files/${id}`, { method: "DELETE" }),
  permanentDelete: (id: string) => request(`/files/${id}/permanent`, { method: "DELETE" }),
  versions: (id: string) => request(`/files/${id}/versions`),
  tamperCheck: (id: string) => request(`/files/${id}/tamper-check`),
  viewUrl: (id: string) => `${BASE}/files/${id}/view`,
  downloadUrl: (id: string) => `${BASE}/files/${id}/download`,
  folders: () => request("/files/folders/list"),
  createFolder: (data: { name: string; parentId?: string }) =>
    request("/files/folders", { method: "POST", body: JSON.stringify(data) }),
};

// PDF operations
export const pdf = {
  merge: (formData: FormData) =>
    fetch(`${BASE}/pdf/merge`, { method: "POST", body: formData, credentials: "include" }).then(async (r) => {
      if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
      return r.json();
    }),
  split: (fileId: string, ranges: any[]) =>
    request(`/pdf/split/${fileId}`, { method: "POST", body: JSON.stringify({ ranges }) }),
  compress: (fileId: string) =>
    request(`/pdf/compress/${fileId}`, { method: "POST" }),
  rotate: (fileId: string, rotations: any[]) =>
    request(`/pdf/rotate/${fileId}`, { method: "POST", body: JSON.stringify({ rotations }) }),
  reorder: (fileId: string, pageOrder: number[]) =>
    request(`/pdf/reorder/${fileId}`, { method: "POST", body: JSON.stringify({ pageOrder }) }),
  watermark: (fileId: string, options: any) =>
    request(`/pdf/watermark/${fileId}`, { method: "POST", body: JSON.stringify(options) }),
  annotate: (fileId: string, options: any) =>
    request(`/pdf/annotate/${fileId}`, { method: "POST", body: JSON.stringify(options) }),
  addSignature: (fileId: string, options: any) =>
    request(`/pdf/signature/${fileId}`, { method: "POST", body: JSON.stringify(options) }),
  addQRCode: (fileId: string, options: any) =>
    request(`/pdf/qrcode/${fileId}`, { method: "POST", body: JSON.stringify(options) }),
  getMetadata: (fileId: string) => request(`/pdf/metadata/${fileId}`),
  updateMetadata: (fileId: string, meta: any) =>
    request(`/pdf/metadata/${fileId}`, { method: "PUT", body: JSON.stringify(meta) }),
  detect: (fileId: string) =>
    request(`/pdf/detect/${fileId}`),
  unlock: (fileId: string, password?: string) =>
    request(`/pdf/unlock/${fileId}`, {
      method: "POST",
      body: JSON.stringify(password !== undefined ? { password } : {}),
    }),
  extractText: (fileId: string) =>
    request(`/pdf/extract-text/${fileId}`, { method: "POST" }),
  compare: (fileIdA: string, fileIdB: string) =>
    request("/pdf/compare", { method: "POST", body: JSON.stringify({ fileIdA, fileIdB }) }),
  pageInfo: (fileId: string) => request(`/pdf/page-info/${fileId}`),
  addPageNumbers: (fileId: string, opts: any) =>
    request(`/pdf/page-numbers/${fileId}`, { method: "POST", body: JSON.stringify(opts) }),
  addHeaderFooter: (fileId: string, opts: any) =>
    request(`/pdf/header-footer/${fileId}`, { method: "POST", body: JSON.stringify(opts) }),
};

// ERP
export const erp = {
  documents: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return request(`/erp/documents${q}`);
  },
  import: (type: string, id: string) =>
    request(`/erp/import/${type}/${id}`, { method: "POST" }),
  status: () => request("/erp/status"),
};

// Admin
export const admin = {
  stats: () => request("/admin/stats"),
  users: () => request("/admin/users"),
  createUser: (data: any) =>
    request("/admin/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) =>
    request(`/admin/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteUser: (id: string) =>
    request(`/admin/users/${id}`, { method: "DELETE" }),
  audit: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return request(`/admin/audit${q}`);
  },
  myAudit: () => request("/admin/my-audit"),
  backup: () => request("/admin/backup", { method: "POST" }),
  backups: () => request("/admin/backups"),
  downloadBackup: (id: string) => `${BASE}/admin/backups/${id}/download`,
};
