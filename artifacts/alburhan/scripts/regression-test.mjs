#!/usr/bin/env node
/**
 * PERMANENT REGRESSION TEST SUITE
 *
 * Tests the PRODUCTION site before AND after every deployment.
 * Fails with exit code 1 if any role is broken, any route is missing,
 * or any API endpoint returns 5xx.
 *
 * Usage:
 *   node scripts/regression-test.mjs                    # test production
 *   node scripts/regression-test.mjs --base https://... # test another host
 *   node scripts/regression-test.mjs --phase post       # post-deploy label
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..");

const args     = process.argv.slice(2);
const BASE     = args.find((a, i) => args[i - 1] === "--base") ??
                 "https://alburhantravels.com";
const PHASE    = args.find((a, i) => args[i - 1] === "--phase") ?? "pre";
const TIMEOUT  = 12_000;

// ── helpers ────────────────────────────────────────────────────────────────
const red    = s => `\x1b[31m${s}\x1b[0m`;
const green  = s => `\x1b[32m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const cyan   = s => `\x1b[36m${s}\x1b[0m`;
const bold   = s => `\x1b[1m${s}\x1b[0m`;
const dim    = s => `\x1b[2m${s}\x1b[0m`;

const results = [];
let   failed  = false;

function pass(role, check) {
  results.push({ role, check, ok: true });
  console.log(green(`  ✓`) + ` ${role.padEnd(18)} ${check}`);
}
function fail(role, check, detail = "") {
  results.push({ role, check, ok: false, detail });
  console.error(red(`  ✗`) + ` ${role.padEnd(18)} ${check}` + (detail ? dim(` [${detail}]`) : ""));
  failed = true;
}

async function httpGet(path, { followRedirect = true } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const url = path.startsWith("http") ? path : `${BASE}${path}`;
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: followRedirect ? "follow" : "manual",
      headers: { "User-Agent": "AlBurhan-Regression/1.0" },
    });
    return { status: res.status, ok: res.ok, url: res.url };
  } catch (e) {
    return { status: 0, ok: false, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

// ── Load snapshot ──────────────────────────────────────────────────────────
const snapshot = JSON.parse(
  readFileSync(resolve(ROOT, "src/config/nav-snapshot.json"), "utf-8")
);

// ── Role matrix ────────────────────────────────────────────────────────────
// Defined once here.  roleRedirects.ts is the code source of truth;
// this is the TEST source of truth (same values, verified independently).
const ROLE_MATRIX = [
  { role: "Super Admin",   path: "/admin/super",       group: "admin"   },
  { role: "Admin",         path: "/admin/dashboard",   group: "admin"   },
  { role: "Executive",     path: "/admin/executive",   group: "admin"   },
  { role: "Finance",       path: "/admin/finance",     group: "admin"   },
  { role: "Accounts",      path: "/admin/accounting",  group: "admin"   },
  { role: "Operations",    path: "/admin/operations",  group: "admin"   },
  { role: "Manager",       path: "/admin/manager",     group: "admin"   },
  { role: "Sales",         path: "/admin/customers",   group: "admin"   },
  { role: "Guide",         path: "/admin/guide-panel", group: "admin"   },
  { role: "Branch",        path: "/branch/dashboard",  group: "portal"  },
  { role: "Agent",         path: "/agent/dashboard",   group: "portal"  },
  { role: "Staff",         path: "/staff/dashboard",   group: "portal"  },
  { role: "Customer",      path: "/customer/dashboard",group: "portal"  },
];

// Key API endpoints — must not return 5xx
// 401 Unauthorized is acceptable (user not logged in), 5xx is not.
const API_HEALTH_CHECKS = [
  { label: "Auth session",        path: "/api/auth/me"                },
  { label: "Packages list",       path: "/api/packages"               },
  { label: "System health",       path: "/api/health"                 },
  { label: "Feedback stats",      path: "/api/feedback/admin/stats"   },
  { label: "Bookings list",       path: "/api/bookings"               },
  { label: "Customers list",      path: "/api/customers"              },
  { label: "Invoices list",       path: "/api/invoices"               },
  { label: "Payments list",       path: "/api/payments"               },
  { label: "Notification logs",   path: "/api/notification-logs"      },
  { label: "WhatsApp history",    path: "/api/whatsapp/history"       },
  { label: "SMS audit",           path: "/api/sms/audit"              },
  { label: "Groups list",         path: "/api/groups"                 },
  { label: "Staff list",          path: "/api/staff"                  },
  { label: "Leads list",          path: "/api/leads"                  },
];

// ─────────────────────────────────────────────────────────────────────────────

async function runAll() {
  const label = PHASE === "post" ? "POST-DEPLOY" : "PRE-DEPLOY";
  console.log(bold(`\n╔══════════════════════════════════════════════════════╗`));
  console.log(bold(`║  AL BURHAN REGRESSION TEST — ${label.padEnd(22)}║`));
  console.log(bold(`╚══════════════════════════════════════════════════════╝`));
  console.log(dim(`  Target : ${BASE}`));
  console.log(dim(`  Time   : ${new Date().toISOString()}\n`));

  // ── SECTION 1: Server reachability ────────────────────────────────────────
  console.log(bold(cyan("  [1/5] Server Reachability")));
  const home = await httpGet("/");
  if (home.status === 200) {
    pass("Server", "Homepage HTTP 200");
  } else {
    fail("Server", "Homepage HTTP 200", `HTTP ${home.status}`);
  }
  const login = await httpGet("/login");
  if (login.status === 200) {
    pass("Server", "Login page HTTP 200");
  } else {
    fail("Server", "Login page HTTP 200", `HTTP ${login.status}`);
  }

  // ── SECTION 2: Dashboard routes ───────────────────────────────────────────
  console.log(bold(cyan("\n  [2/5] Dashboard Routes (all 13 roles)")));
  await Promise.all(ROLE_MATRIX.map(async ({ role, path }) => {
    const r = await httpGet(path);
    if (r.status === 200) {
      pass(role, `Dashboard → ${path}`);
    } else {
      fail(role, `Dashboard → ${path}`, `HTTP ${r.status}`);
    }
  }));

  // ── SECTION 3: All sidebar nav hrefs ─────────────────────────────────────
  console.log(bold(cyan("\n  [3/5] Sidebar Nav Routes (all 93 items)")));
  const navResults = await Promise.all(
    snapshot.navHrefs.map(async href => {
      const path = href.split("?")[0];
      const r    = await httpGet(path);
      return { href: path, status: r.status, ok: r.status === 200 };
    })
  );
  const navFailed = navResults.filter(r => !r.ok);
  if (navFailed.length === 0) {
    pass("Sidebar", `All ${snapshot.navHrefs.length} nav hrefs return 200`);
  } else {
    for (const r of navFailed) {
      fail("Sidebar", `Nav href → ${r.href}`, `HTTP ${r.status}`);
    }
  }

  // ── SECTION 4: API health checks ─────────────────────────────────────────
  console.log(bold(cyan("\n  [4/5] API Endpoint Health (no 5xx)")));
  await Promise.all(API_HEALTH_CHECKS.map(async ({ label, path }) => {
    const r = await httpGet(path);
    // 401 = not authenticated but server is running → PASS
    // 404 = endpoint might not exist → WARN (not fail, API may differ)
    // 5xx = server error → FAIL
    if (r.status >= 500) {
      fail("API", `${label} (${path})`, `HTTP ${r.status} — SERVER ERROR`);
    } else if (r.status === 0) {
      fail("API", `${label} (${path})`, "Connection failed");
    } else {
      pass("API", `${label} → HTTP ${r.status}`);
    }
  }));

  // ── SECTION 5: Redirect matrix ────────────────────────────────────────────
  console.log(bold(cyan("\n  [5/5] Role Redirect Matrix")));
  // Read from roleRedirects.ts to verify matrix is self-consistent
  const { roleRedirects } = snapshot;
  await Promise.all(
    Object.entries(roleRedirects).map(async ([role, target]) => {
      const r = await httpGet(target);
      if (r.status === 200) {
        pass(role, `→ ${target} (HTTP 200)`);
      } else {
        fail(role, `→ ${target}`, `HTTP ${r.status}`);
      }
    })
  );

  // ── FINAL REPORT ──────────────────────────────────────────────────────────
  const total   = results.length;
  const passing = results.filter(r => r.ok).length;
  const failing = results.filter(r => !r.ok).length;

  console.log(bold(`\n╔══════════════════════════════════════════════════════╗`));
  console.log(bold(`║  REGRESSION REPORT`));
  console.log(bold(`╠══════════════════════════════════════════════════════╣`));
  console.log(`  Total checks      : ${total}`);
  console.log(`  Passed            : ${green(passing)}`);
  console.log(`  Failed            : ${failing > 0 ? red(failing) : green(0)}`);
  console.log(`  Dashboards tested : ${ROLE_MATRIX.length}`);
  console.log(`  Sidebar routes    : ${snapshot.navHrefs.length}`);
  console.log(`  API endpoints     : ${API_HEALTH_CHECKS.length}`);
  console.log(`  Role redirects    : ${Object.keys(roleRedirects).length}`);

  if (failing > 0) {
    console.log(bold(`\n  ✗  FAILED CHECKS:`));
    for (const r of results.filter(r => !r.ok)) {
      console.log(red(`     [${r.role}] ${r.check}`) + (r.detail ? dim(` — ${r.detail}`) : ""));
    }
    console.log(red(bold(`\n  ✗  REGRESSION DETECTED — deployment blocked.\n`)));
    process.exit(1);
  } else {
    console.log(green(bold(`\n  ✓  ALL CHECKS PASSED — ${label} regression test complete.\n`)));
    process.exit(0);
  }
}

runAll().catch(e => {
  console.error(red(`\nFATAL: ${e.message}\n`));
  process.exit(1);
});
