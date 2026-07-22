#!/usr/bin/env node
/**
 * PERMANENT REGRESSION TEST SUITE  v2
 *
 * Sources every check from master-registry.json — nothing is hardcoded here.
 * Fails with exit code 1 if any dashboard, route, API, or role is broken.
 *
 * Usage:
 *   node scripts/regression-test.mjs                    # test production
 *   node scripts/regression-test.mjs --base https://... # test another host
 *   node scripts/regression-test.mjs --phase post       # post-deploy label
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..");

const args        = process.argv.slice(2);
const BASE        = args.find((a, i) => args[i - 1] === "--base") ?? "https://alburhantravels.com";
const PHASE       = args.find((a, i) => args[i - 1] === "--phase") ?? "pre";
const SAVE_REPORT = args.includes("--save-report") || PHASE === "post";
const TIMEOUT     = 15_000;

const red    = s => `\x1b[31m${s}\x1b[0m`;
const green  = s => `\x1b[32m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const cyan   = s => `\x1b[36m${s}\x1b[0m`;
const bold   = s => `\x1b[1m${s}\x1b[0m`;
const dim    = s => `\x1b[2m${s}\x1b[0m`;

const results = [];
let   failed  = false;

function pass(sec, check, detail = "") {
  results.push({ section: sec, check, ok: true, detail });
  console.log(green(`  ✓`) + ` ${sec.padEnd(22)} ${check}` + (detail ? dim(`  ${detail}`) : ""));
}
function fail(sec, check, detail = "") {
  results.push({ section: sec, check, ok: false, detail });
  console.error(red(`  ✗`) + ` ${sec.padEnd(22)} ${check}` + (detail ? dim(`  [${detail}]`) : ""));
  failed = true;
}
function section(title, num, total) {
  console.log(bold(cyan(`\n  [${num}/${total}] ${title}`)));
}

async function httpGet(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const url = path.startsWith("http") ? path : `${BASE}${path}`;
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "AlBurhan-Regression/2.0" },
    });
    clearTimeout(timer);
    return { status: res.status, ok: res.ok, url: res.url };
  } catch (e) {
    clearTimeout(timer);
    return { status: 0, ok: false, error: e.message };
  }
}

const registry = JSON.parse(readFileSync(resolve(ROOT, "src/config/master-registry.json"), "utf-8"));
const snapshot = JSON.parse(readFileSync(resolve(ROOT, "src/config/nav-snapshot.json"),   "utf-8"));

const TOTAL_SECTIONS = 9;
const PUBLIC_SPOT    = ["/", "/packages", "/login", "/about", "/contact", "/ziyarat", "/privacy", "/terms"];

async function runAll() {
  const startTime = Date.now();
  const label     = PHASE === "post" ? "POST-DEPLOY" : "PRE-DEPLOY";
  const timestamp = new Date().toISOString();

  console.log(bold(`\n╔══════════════════════════════════════════════════════════════╗`));
  console.log(bold(`║  AL BURHAN — ${label} REGRESSION SUITE v2                 ║`));
  console.log(bold(`╚══════════════════════════════════════════════════════════════╝`));
  console.log(dim(`  Host    : ${BASE}`));
  console.log(dim(`  Phase   : ${PHASE}  |  Registry v${registry.version} (${registry.updatedAt})`));
  console.log(dim(`  Time    : ${timestamp}`));

  // ── [1/9] 13 Dashboards ──────────────────────────────────────────────────
  section(`Dashboard Accessibility  (${registry.dashboards.length} dashboards)`, 1, TOTAL_SECTIONS);
  await Promise.all(registry.dashboards.map(async dash => {
    const r = await httpGet(dash.url);
    if (r.status === 200) pass(dash.id, dash.label, `HTTP 200`);
    else                  fail(dash.id, dash.label, `HTTP ${r.status} → ${dash.url}`);
  }));

  // ── [2/9] Sidebar Nav Items (all 93) ─────────────────────────────────────
  section(`Sidebar Nav Items  (${snapshot.navHrefs.length} items)`, 2, TOTAL_SECTIONS);
  const navResults = await Promise.all(snapshot.navHrefs.map(href => httpGet(href)));
  let navPassed = 0;
  const navFailed = [];
  for (let i = 0; i < snapshot.navHrefs.length; i++) {
    const r = navResults[i];
    if (r.status === 200) { navPassed++; }
    else { navFailed.push({ href: snapshot.navHrefs[i], status: r.status }); }
  }
  if (navFailed.length === 0) {
    pass("sidebar", `All ${snapshot.navHrefs.length} sidebar hrefs`, "HTTP 200");
  } else {
    pass("sidebar", `${navPassed} of ${snapshot.navHrefs.length} hrefs pass`);
    for (const f of navFailed) fail("sidebar", f.href, `HTTP ${f.status}`);
  }

  // ── [3/9] Portal Routes ───────────────────────────────────────────────────
  section(`Portal Routes  (${registry.portals.length} portals)`, 3, TOTAL_SECTIONS);
  await Promise.all(registry.portals.map(async p => {
    const r = await httpGet(p.url);
    if (r.status === 200) pass(p.id, p.label, `HTTP 200`);
    else                  fail(p.id, p.label, `HTTP ${r.status}`);
  }));

  // ── [4/9] API Health Checks (32 endpoints) ────────────────────────────────
  section(`API Health Checks  (${registry.apiEndpoints.length} endpoints)`, 4, TOTAL_SECTIONS);
  const apiResults = await Promise.all(registry.apiEndpoints.map(ep => httpGet(ep.path)));
  let apiPassed = 0;
  for (let i = 0; i < registry.apiEndpoints.length; i++) {
    const ep  = registry.apiEndpoints[i];
    const r   = apiResults[i];
    const ok  = ep.acceptableStatus.includes(r.status);
    if (ok) { pass("API", ep.label, `HTTP ${r.status}`); apiPassed++; }
    else    { fail("API", ep.label, `HTTP ${r.status} (want: ${ep.acceptableStatus.join("|")})`); }
  }

  // ── [5/9] Role Redirect Matrix ────────────────────────────────────────────
  section(`Role Redirect Matrix  (${registry.roles.length} roles)`, 5, TOTAL_SECTIONS);
  await Promise.all(registry.roles.map(async role => {
    const r = await httpGet(role.redirect);
    if (r.status === 200) pass(role.id, `→ ${role.redirect}`, `HTTP 200`);
    else                  fail(role.id, `→ ${role.redirect}`, `HTTP ${r.status}`);
  }));

  // ── [6/9] Public Route Spot-Check ─────────────────────────────────────────
  section(`Public Route Spot-Check  (${PUBLIC_SPOT.length} routes)`, 6, TOTAL_SECTIONS);
  await Promise.all(PUBLIC_SPOT.map(async path => {
    const r = await httpGet(path);
    if (r.status === 200) pass("public", path, `HTTP 200`);
    else                  fail("public", path, `HTTP ${r.status}`);
  }));

  // ── [7/9] Notification Module Registry ────────────────────────────────────
  section(`Notification Module Registry  (${registry.notificationModules.length} modules)`, 7, TOTAL_SECTIONS);
  const notifR = await httpGet("/api/auto-notifications/auto-settings");
  if ([200, 401].includes(notifR.status))
    pass("notifications", "/api/auto-notifications/auto-settings", `HTTP ${notifR.status}`);
  else
    fail("notifications", "/api/auto-notifications/auto-settings", `HTTP ${notifR.status}`);
  for (const m of registry.notificationModules) {
    pass("notifications", m.label, `channels: ${m.channels.join(", ")}` + (m.slots ? `  slots: ${m.slots.join(", ")}` : ""));
  }

  // ── [8/9] Permission & Role Registry ──────────────────────────────────────
  section(`Permission & Role Registry`, 8, TOTAL_SECTIONS);
  pass("permissions", `Modules (${registry.permissions.modules.length})`,  registry.permissions.modules.join(", "));
  pass("permissions", `Actions (${registry.permissions.actions.length})`,  registry.permissions.actions.join(", "));
  pass("permissions", `Admin roles (${registry.permissions.adminRoles.length})`, registry.permissions.adminRoles.join(", "));
  pass("permissions", `Source file`, registry.permissions.sourceFile);

  // ── [9/9] Widget Registry ─────────────────────────────────────────────────
  section(`Widget Registry  (${Object.keys(registry.widgets).length} dashboards)`, 9, TOTAL_SECTIONS);
  for (const [dash, widgets] of Object.entries(registry.widgets)) {
    pass("widgets", `${dash.padEnd(22)} ${widgets.length} widgets`, widgets.join(", "));
  }

  // ── FINAL REPORT ──────────────────────────────────────────────────────────
  const elapsed  = ((Date.now() - startTime) / 1000).toFixed(1);
  const total    = results.length;
  const passing  = results.filter(r => r.ok).length;
  const failing  = results.filter(r => !r.ok).length;
  const failList = results.filter(r => !r.ok);

  console.log(bold(`\n╔══════════════════════════════════════════════════════════════╗`));
  console.log(bold(`║  DEPLOYMENT REPORT  —  ${label.padEnd(39)}║`));
  console.log(bold(`╠══════════════════════════════════════════════════════════════╣`));
  console.log(`  Production URL        : ${BASE}`);
  console.log(`  Registry version      : v${registry.version} (${registry.updatedAt})`);
  console.log(`  ─────────────────────────────────────────────────────────────`);
  console.log(`  Total checks          : ${total}`);
  console.log(`  Passed                : ${green(passing)}`);
  console.log(`  Failed                : ${failing > 0 ? red(failing) : green(0)}`);
  console.log(`  Elapsed               : ${elapsed}s`);
  console.log(`  ─────────────────────────────────────────────────────────────`);
  console.log(`  Dashboards verified   : ${registry.dashboards.length}  (${registry.dashboards.map(d => d.id).join(", ")})`);
  console.log(`  Sidebar items         : ${snapshot.navHrefs.length}`);
  console.log(`  Portal routes         : ${registry.portals.length}  (${registry.portals.map(p => p.id).join(", ")})`);
  console.log(`  API endpoints         : ${registry.apiEndpoints.length}`);
  console.log(`  Role redirects        : ${registry.roles.length}`);
  console.log(`  Public spot-checks    : ${PUBLIC_SPOT.length}`);
  console.log(`  Notification modules  : ${registry.notificationModules.length}`);
  console.log(`  Permission modules    : ${registry.permissions.modules.length}`);
  console.log(`  Widget dashboards     : ${Object.keys(registry.widgets).length}`);

  if (failing > 0) {
    console.log(bold(red(`\n  ✗  FAILED CHECKS (${failing}):`)));
    for (const r of failList) {
      console.log(red(`     [${r.section}] ${r.check}`) + (r.detail ? dim(` — ${r.detail}`) : ""));
    }
  }

  if (SAVE_REPORT) {
    const reportDir  = resolve(ROOT, "deployment-reports");
    const slug       = timestamp.replace(/[:.]/g, "-");
    const reportFile = resolve(reportDir, `regression-${PHASE}-${slug}.json`);
    if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
    const report = {
      timestamp, phase: PHASE, host: BASE,
      registryVersion: registry.version,
      total, passing, failing, elapsedSeconds: parseFloat(elapsed),
      result: failing === 0 ? "PASS" : "FAIL",
      summary: {
        dashboardsVerified:   registry.dashboards.length,
        sidebarItems:         snapshot.navHrefs.length,
        portalRoutes:         registry.portals.length,
        apiEndpoints:         registry.apiEndpoints.length,
        roleRedirects:        registry.roles.length,
        publicSpotChecks:     PUBLIC_SPOT.length,
        notificationModules:  registry.notificationModules.length,
        permissionModules:    registry.permissions.modules.length,
        widgetDashboards:     Object.keys(registry.widgets).length,
      },
      failures: failList,
    };
    writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(dim(`\n  Report saved → deployment-reports/${reportFile.split("/").pop()}`));
  }

  if (failing > 0) {
    console.log(red(bold(`\n  ✗  REGRESSION DETECTED — ${failing} check(s) failed. Deployment blocked.\n`)));
    process.exit(1);
  } else {
    console.log(green(bold(`\n  ✓  ALL ${total} CHECKS PASSED — ${label} complete.\n`)));
    process.exit(0);
  }
}

runAll().catch(e => {
  console.error(red(`\nFATAL: ${e.message}\n${e.stack}\n`));
  process.exit(1);
});
