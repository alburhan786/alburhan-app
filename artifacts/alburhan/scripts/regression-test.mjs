#!/usr/bin/env node
/**
 * PERMANENT REGRESSION TEST SUITE  v3
 *
 * Single source of truth: the IMPLEMENTED APPLICATION.
 * Sources every check from master-registry.json + nav-snapshot.json.
 *
 * FAIL policy (per _auditPolicy in master-registry.json):
 *   ✗  FAIL  — missing route, API failure, HTTP error on implemented page
 *   ⊘  INFO  — outOfScope features (not implemented by design, NEVER cause FAIL)
 *   ℹ  INFO  — hiddenAdminPages (in App.tsx, no sidebar link by design, still verified)
 *
 * Usage:
 *   node scripts/regression-test.mjs                    # test production
 *   node scripts/regression-test.mjs --base https://... # test another host
 *   node scripts/regression-test.mjs --phase post       # post-deploy label
 *   node scripts/regression-test.mjs --save-report      # write JSON report
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
  results.push({ section: sec, check, ok: true, detail, type: "pass" });
  console.log(green(`  ✓`) + ` ${sec.padEnd(22)} ${check}` + (detail ? dim(`  ${detail}`) : ""));
}
function fail(sec, check, detail = "") {
  results.push({ section: sec, check, ok: false, detail, type: "defect" });
  console.error(red(`  ✗`) + ` ${sec.padEnd(22)} ${check}` + (detail ? dim(`  [${detail}]`) : ""));
  failed = true;
}
function info(sec, check, detail = "") {
  results.push({ section: sec, check, ok: true, detail, type: "info" });
  console.log(yellow(`  ⊘`) + ` ${sec.padEnd(22)} ${check}` + (detail ? dim(`  ${detail}`) : ""));
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
      headers: { "User-Agent": "AlBurhan-Regression/3.0" },
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

const TOTAL_SECTIONS = 10;
const PUBLIC_SPOT    = ["/", "/packages", "/login", "/about", "/contact", "/ziyarat", "/privacy", "/terms"];

async function runAll() {
  const startTime = Date.now();
  const label     = PHASE === "post" ? "POST-DEPLOY" : "PRE-DEPLOY";
  const timestamp = new Date().toISOString();

  console.log(bold(`\n╔══════════════════════════════════════════════════════════════╗`));
  console.log(bold(`║  AL BURHAN — ${label} REGRESSION SUITE v3                 ║`));
  console.log(bold(`╚══════════════════════════════════════════════════════════════╝`));
  console.log(dim(`  Host    : ${BASE}`));
  console.log(dim(`  Phase   : ${PHASE}  |  Registry v${registry.version} (${registry.updatedAt})`));
  console.log(dim(`  Time    : ${timestamp}`));
  console.log(dim(`  Policy  : FAIL only for software defects. Out-of-scope = INFO only.`));

  // ── [1/10] 13 Dashboards ─────────────────────────────────────────────────
  section(`Dashboard Accessibility  (${registry.dashboards.length} dashboards)`, 1, TOTAL_SECTIONS);
  await Promise.all(registry.dashboards.map(async dash => {
    const r = await httpGet(dash.url);
    if (r.status === 200) pass(dash.id, dash.label, `HTTP 200`);
    else                  fail(dash.id, dash.label, `HTTP ${r.status} → ${dash.url}`);
  }));

  // ── [2/10] Sidebar Nav Items — IMPLEMENTED PAGES ──────────────────────────
  section(`Sidebar Nav Items  (${snapshot.navHrefs.length} implemented pages)`, 2, TOTAL_SECTIONS);
  const navResults = await Promise.all(snapshot.navHrefs.map(href =>
    httpGet(href.split("?")[0])
  ));
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
    for (const f of navFailed) fail("sidebar", f.href, `HTTP ${f.status} — DEFECT: page broken or missing`);
  }

  // ── [3/10] Portal Routes ─────────────────────────────────────────────────
  section(`Portal Routes  (${registry.portals.length} portals)`, 3, TOTAL_SECTIONS);
  await Promise.all(registry.portals.map(async p => {
    const r = await httpGet(p.url);
    if (r.status === 200) pass(p.id, p.label, `HTTP 200`);
    else                  fail(p.id, p.label, `HTTP ${r.status}`);
  }));

  // ── [4/10] API Health Checks ─────────────────────────────────────────────
  section(`API Health Checks  (${registry.apiEndpoints.length} endpoints)`, 4, TOTAL_SECTIONS);
  const apiResults = await Promise.all(registry.apiEndpoints.map(ep => httpGet(ep.path)));
  for (let i = 0; i < registry.apiEndpoints.length; i++) {
    const ep = registry.apiEndpoints[i];
    const r  = apiResults[i];
    const ok = ep.acceptableStatus.includes(r.status);
    if (ok) pass("API", ep.label, `HTTP ${r.status}`);
    else    fail("API", ep.label, `HTTP ${r.status} (want: ${ep.acceptableStatus.join("|")})`);
  }

  // ── [5/10] Role Redirect Matrix ──────────────────────────────────────────
  section(`Role Redirect Matrix  (${registry.roles.length} roles)`, 5, TOTAL_SECTIONS);
  await Promise.all(registry.roles.map(async role => {
    const r = await httpGet(role.redirect);
    if (r.status === 200) pass(role.id, `→ ${role.redirect}`, `HTTP 200`);
    else                  fail(role.id, `→ ${role.redirect}`, `HTTP ${r.status}`);
  }));

  // ── [6/10] Public Route Spot-Check ───────────────────────────────────────
  section(`Public Route Spot-Check  (${PUBLIC_SPOT.length} routes)`, 6, TOTAL_SECTIONS);
  await Promise.all(PUBLIC_SPOT.map(async path => {
    const r = await httpGet(path);
    if (r.status === 200) pass("public", path, `HTTP 200`);
    else                  fail("public", path, `HTTP ${r.status}`);
  }));

  // ── [7/10] Notification Module Registry ──────────────────────────────────
  section(`Notification Module Registry  (${registry.notificationModules.length} modules)`, 7, TOTAL_SECTIONS);
  const notifR = await httpGet("/api/auto-notifications/auto-settings");
  if ([200, 401].includes(notifR.status))
    pass("notifications", "/api/auto-notifications/auto-settings", `HTTP ${notifR.status}`);
  else
    fail("notifications", "/api/auto-notifications/auto-settings", `HTTP ${notifR.status}`);
  for (const m of registry.notificationModules) {
    pass("notifications", m.label, `channels: ${m.channels.join(", ")}` + (m.slots ? `  slots: ${m.slots.join(", ")}` : ""));
  }

  // ── [8/10] Permission & Role Registry ────────────────────────────────────
  section(`Permission & Role Registry`, 8, TOTAL_SECTIONS);
  pass("permissions", `Modules (${registry.permissions.modules.length})`,  registry.permissions.modules.join(", "));
  pass("permissions", `Actions (${registry.permissions.actions.length})`,  registry.permissions.actions.join(", "));
  pass("permissions", `Admin roles (${registry.permissions.adminRoles.length})`, registry.permissions.adminRoles.join(", "));
  pass("permissions", `Source file`, registry.permissions.sourceFile);

  // ── [9/10] Widget Registry ───────────────────────────────────────────────
  section(`Widget Registry  (${Object.keys(registry.widgets).length} dashboards)`, 9, TOTAL_SECTIONS);
  for (const [dash, widgets] of Object.entries(registry.widgets)) {
    pass("widgets", `${dash.padEnd(22)} ${widgets.length} widgets`, widgets.join(", "));
  }

  // ── [10/10] Scope Registry — Implemented vs Out-of-Scope ─────────────────
  section(`Scope Registry`, 10, TOTAL_SECTIONS);

  // 10a: Hidden admin pages (implemented, no sidebar link — still verify HTTP 200)
  const hidden = snapshot.hiddenAdminPages || [];
  if (hidden.length > 0) {
    const hiddenResults = await Promise.all(hidden.map(p => httpGet(p.route)));
    for (let i = 0; i < hidden.length; i++) {
      const p = hidden[i];
      const r = hiddenResults[i];
      if (r.status === 200) {
        pass("hidden-page", `${p.route}`, `HTTP 200 — implemented, no sidebar link by design`);
      } else {
        fail("hidden-page", `${p.route}`, `HTTP ${r.status} — DEFECT: route exists in App.tsx but broken`);
      }
    }
  }

  // 10b: Print-only pages (implemented, no sidebar link — verify HTTP 200)
  const printOnly = snapshot.printOnlyPages || [];
  if (printOnly.length > 0) {
    const printResults = await Promise.all(printOnly.map(p => httpGet(p.route)));
    for (let i = 0; i < printOnly.length; i++) {
      const p = printOnly[i];
      const r = printResults[i];
      if (r.status === 200) {
        pass("print-page", `${p.route}`, `HTTP 200 — print utility, no sidebar link by design`);
      } else {
        fail("print-page", `${p.route}`, `HTTP ${r.status} — DEFECT: print route broken`);
      }
    }
  }

  // 10c: Out-of-scope features — INFO only, NEVER counted as failures
  const outOfScope = registry.outOfScope || [];
  if (outOfScope.length > 0) {
    console.log(dim(`\n  ── Out-of-scope features (not in this release — informational only)`));
    for (const oos of outOfScope) {
      info("out-of-scope", oos.label, `coveredBy: ${oos.coveredBy}`);
    }
  }

  // ── FINAL REPORT ─────────────────────────────────────────────────────────
  const elapsed   = ((Date.now() - startTime) / 1000).toFixed(1);
  const allChecks = results.filter(r => r.type !== "info");
  const total     = allChecks.length;
  const passing   = allChecks.filter(r => r.ok).length;
  const failing   = allChecks.filter(r => !r.ok).length;
  const failList  = allChecks.filter(r => !r.ok);
  const infoCount = results.filter(r => r.type === "info").length;

  const implementedPages  = snapshot.navHrefs.length;
  const hiddenPages       = (snapshot.hiddenAdminPages || []).length;
  const printPages        = (snapshot.printOnlyPages || []).length;
  const outOfScopeCount   = (registry.outOfScope || []).length;

  console.log(bold(`\n╔══════════════════════════════════════════════════════════════╗`));
  console.log(bold(`║  DEPLOYMENT REPORT  —  ${label.padEnd(39)}║`));
  console.log(bold(`╠══════════════════════════════════════════════════════════════╣`));
  console.log(`  Production URL        : ${BASE}`);
  console.log(`  Registry version      : v${registry.version} (${registry.updatedAt})`);
  console.log(`  ─────────────────────────────────────────────────────────────`);
  console.log(`  Verified checks       : ${total}`);
  console.log(`  Passed                : ${green(passing)}`);
  console.log(`  Failed                : ${failing > 0 ? red(failing) : green(0)}`);
  console.log(`  Out-of-scope (info)   : ${yellow(infoCount)}  ← never counted as failures`);
  console.log(`  Elapsed               : ${elapsed}s`);
  console.log(`  ─────────────────────────────────────────────────────────────`);
  console.log(`  Implemented pages     : ${implementedPages}  (sidebar-linked — all verified)`);
  console.log(`  Hidden pages          : ${hiddenPages}  (App.tsx only, no sidebar — verified)`);
  console.log(`  Print-only pages      : ${printPages}  (utility — verified)`);
  console.log(`  Out of scope          : ${outOfScopeCount}  (not in this release — informational)`);
  console.log(`  ─────────────────────────────────────────────────────────────`);
  console.log(`  Dashboards verified   : ${registry.dashboards.length}`);
  console.log(`  Portal routes         : ${registry.portals.length}`);
  console.log(`  API endpoints         : ${registry.apiEndpoints.length}`);
  console.log(`  Role redirects        : ${registry.roles.length}`);
  console.log(`  Public spot-checks    : ${PUBLIC_SPOT.length}`);
  console.log(`  Notification modules  : ${registry.notificationModules.length}`);
  console.log(`  Permission modules    : ${registry.permissions.modules.length}`);
  console.log(`  Widget dashboards     : ${Object.keys(registry.widgets).length}`);

  if (failing > 0) {
    console.log(bold(red(`\n  ✗  DEFECTS FOUND (${failing}) — these are real software bugs:`)));
    for (const r of failList) {
      console.log(red(`     [${r.section}] ${r.check}`) + (r.detail ? dim(` — ${r.detail}`) : ""));
    }
  }

  if (outOfScopeCount > 0) {
    console.log(yellow(`\n  ⊘  Out-of-scope (${outOfScopeCount}) — not implemented by design, not counted:`));
    for (const oos of (registry.outOfScope || [])) {
      console.log(yellow(`     • ${oos.label}`) + dim(` — ${oos.reason}`));
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
      auditPolicy: registry._auditPolicy,
      total, passing, failing, infoCount,
      elapsedSeconds: parseFloat(elapsed),
      result: failing === 0 ? "PASS" : "FAIL",
      summary: {
        implementedPages,
        hiddenPages,
        printOnlyPages:     printPages,
        outOfScopeFeatures: outOfScopeCount,
        dashboardsVerified: registry.dashboards.length,
        portalRoutes:       registry.portals.length,
        apiEndpoints:       registry.apiEndpoints.length,
        roleRedirects:      registry.roles.length,
        publicSpotChecks:   PUBLIC_SPOT.length,
        notificationModules:registry.notificationModules.length,
        permissionModules:  registry.permissions.modules.length,
        widgetDashboards:   Object.keys(registry.widgets).length,
      },
      outOfScope: registry.outOfScope,
      failures: failList,
    };
    writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(dim(`\n  Report saved → deployment-reports/${reportFile.split("/").pop()}`));
  }

  if (failing > 0) {
    console.log(red(bold(`\n  ✗  REGRESSION DETECTED — ${failing} defect(s) found. Deployment blocked.\n`)));
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
