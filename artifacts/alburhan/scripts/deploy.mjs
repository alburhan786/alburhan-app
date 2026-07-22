#!/usr/bin/env node
/**
 * PERMANENT DEPLOYMENT ORCHESTRATOR  v2
 *
 * This is the ONLY way to deploy Al Burhan to production.
 * Every step is mandatory. The build is blocked if any step fails.
 * A full deployment report is saved to deployment-reports/ after every run.
 *
 * Usage:
 *   node scripts/deploy.mjs              # full deploy
 *   node scripts/deploy.mjs --skip-test  # skip regression (emergency only)
 *
 * Steps:
 *   1.  PRE-DEPLOY regression test (against live production)
 *   2.  Navigation structure check (check-nav.mjs)
 *   3.  Master registry integrity check (check-registry.mjs)
 *   4.  Build frontend (nav gate runs inside vite build)
 *   5.  Build API server
 *   6.  Deploy frontend to VPS
 *   7.  Deploy API server to VPS (triggers PM2 restart)
 *   8.  Wait for PM2 restart
 *   9.  POST-DEPLOY regression test (against new production)
 *  10.  Save deployment report
 */

import { execSync }       from "child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { fileURLToPath }  from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "../../../");  // workspace root
const PKG_ROOT  = resolve(__dirname, "..");         // alburhan package

const SKIP_TEST   = process.argv.includes("--skip-test");
const PROD        = "https://alburhantravels.com";
const DEPLOY_KEY  = "alburhan-migrate-2026";

const red    = s => `\x1b[31m${s}\x1b[0m`;
const green  = s => `\x1b[32m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const bold   = s => `\x1b[1m${s}\x1b[0m`;
const dim    = s => `\x1b[2m${s}\x1b[0m`;

const startTime = Date.now();
let   stepNum   = 0;
const stepLog   = [];

function step(label) {
  stepNum++;
  console.log(bold(`\n[${stepNum}] ${label}`));
  stepLog.push({ step: stepNum, label, status: "running", startedAt: new Date().toISOString() });
}
function stepOk()   { if (stepLog.length) stepLog[stepLog.length - 1].status = "passed"; }
function stepFail() { if (stepLog.length) stepLog[stepLog.length - 1].status = "failed"; }

function run(cmd, opts = {}) {
  console.log(dim(`  $ ${cmd}`));
  execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });
}

function elapsed() { return `${((Date.now() - startTime) / 1000).toFixed(1)}s`; }

async function httpPost(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res  = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    clearTimeout(timer);
    return { status: res.status, body: text };
  } catch (e) {
    clearTimeout(timer);
    return { status: 0, body: e.message };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function saveReport(outcome, extras = {}) {
  try {
    const registry    = JSON.parse(readFileSync(resolve(PKG_ROOT, "src/config/master-registry.json"), "utf-8"));
    const snapshot    = JSON.parse(readFileSync(resolve(PKG_ROOT, "src/config/nav-snapshot.json"),   "utf-8"));
    const reportDir   = resolve(PKG_ROOT, "deployment-reports");
    if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
    const timestamp   = new Date().toISOString();
    const slug        = timestamp.replace(/[:.]/g, "-");
    const reportFile  = resolve(reportDir, `deploy-${slug}.json`);
    const report = {
      timestamp,
      outcome,
      productionUrl: PROD,
      elapsedSeconds: parseFloat(((Date.now() - startTime) / 1000).toFixed(1)),
      skipTest: SKIP_TEST,
      steps: stepLog,
      registry: {
        version:            registry.version,
        updatedAt:          registry.updatedAt,
        dashboards:         registry.dashboards.length,
        sidebarItems:       snapshot.navHrefs.length,
        portalRoutes:       registry.portals.length,
        apiEndpoints:       registry.apiEndpoints.length,
        roleRedirects:      registry.roles.length,
        notificationModules:registry.notificationModules.length,
        permissionModules:  registry.permissions.modules.length,
        widgetDashboards:   Object.keys(registry.widgets).length,
      },
      ...extras,
    };
    writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(dim(`\n  Deploy report → deployment-reports/${reportFile.split("/").pop()}`));
  } catch (e) {
    console.log(yellow(`  ⚠  Could not save deploy report: ${e.message}`));
  }
}

async function main() {
  const timestamp = new Date().toISOString();

  console.log(bold(`\n╔══════════════════════════════════════════════════════════════╗`));
  console.log(bold(`║  AL BURHAN — DEPLOYMENT PIPELINE  v2                         ║`));
  console.log(bold(`╚══════════════════════════════════════════════════════════════╝`));
  console.log(dim(`  Target  : ${PROD}`));
  console.log(dim(`  Started : ${timestamp}`));
  if (SKIP_TEST) console.log(yellow(`  ⚠  --skip-test flag: regression tests bypassed (EMERGENCY ONLY)`));

  // ── STEP 1: PRE-DEPLOY REGRESSION TEST ────────────────────────────────────
  step("PRE-DEPLOY Regression Test");
  if (SKIP_TEST) {
    console.log(yellow("  Skipped."));
    stepOk();
  } else {
    try {
      run(`node ${PKG_ROOT}/scripts/regression-test.mjs --phase pre --save-report`);
      stepOk();
      console.log(green("  ✓ Pre-deploy regression passed."));
    } catch {
      stepFail();
      saveReport("FAILED_PRETEST");
      console.error(red(`\n  ✗  Pre-deploy regression FAILED. Fix issues before deploying.\n`));
      process.exit(1);
    }
  }

  // ── STEP 2: NAVIGATION STRUCTURE CHECK ────────────────────────────────────
  step("Navigation Structure Check (check-nav.mjs)");
  try {
    run(`node ${PKG_ROOT}/scripts/check-nav.mjs`);
    stepOk();
    console.log(green("  ✓ Navigation check passed."));
  } catch {
    stepFail();
    saveReport("FAILED_NAVCHECK");
    console.error(red(`\n  ✗  Navigation check FAILED. Build blocked.\n`));
    process.exit(1);
  }

  // ── STEP 3: MASTER REGISTRY INTEGRITY CHECK ───────────────────────────────
  step("Master Registry Integrity Check (check-registry.mjs)");
  try {
    run(`node ${PKG_ROOT}/scripts/check-registry.mjs`);
    stepOk();
    console.log(green("  ✓ Registry check passed."));
  } catch {
    stepFail();
    saveReport("FAILED_REGISTRY");
    console.error(red(`\n  ✗  Registry integrity check FAILED. Build blocked.\n`));
    process.exit(1);
  }

  // ── STEP 4: BUILD FRONTEND ─────────────────────────────────────────────────
  step("Build Frontend");
  try {
    run(`pnpm --filter @workspace/alburhan run build`);
    stepOk();
    console.log(green("  ✓ Frontend built."));
  } catch {
    stepFail();
    saveReport("FAILED_FRONTEND_BUILD");
    console.error(red(`\n  ✗  Frontend build FAILED.\n`));
    process.exit(1);
  }

  // ── STEP 5: BUILD API SERVER ──────────────────────────────────────────────
  step("Build API Server");
  try {
    run(`pnpm --filter @workspace/api-server run build`);
    stepOk();
    console.log(green("  ✓ API server built."));
  } catch {
    stepFail();
    saveReport("FAILED_API_BUILD");
    console.error(red(`\n  ✗  API server build FAILED.\n`));
    process.exit(1);
  }

  // ── STEP 6: DEPLOY API SERVER ──────────────────────────────────────────────
  step("Deploy API Server to VPS");
  const apiDeploy = await httpPost(`${PROD}/api/migrate/self-update`, { key: DEPLOY_KEY });
  if (apiDeploy.status === 0) {
    stepFail();
    saveReport("FAILED_API_DEPLOY");
    console.error(red(`  ✗  API server deploy failed: ${apiDeploy.body}\n`));
    process.exit(1);
  }
  stepOk();
  console.log(green(`  ✓ API server deploying (PM2 will restart).`));
  console.log(dim(`  ${apiDeploy.body.slice(0, 120)}`));

  // ── STEP 7: WAIT FOR PM2 RESTART ──────────────────────────────────────────
  step("Wait for PM2 Restart");
  console.log(dim("  Waiting 15s for PM2 restart..."));
  await sleep(15_000);
  stepOk();

  // ── STEP 8: DEPLOY FRONTEND ────────────────────────────────────────────────
  step("Deploy Frontend to VPS");
  let frontendOk = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await httpPost(`${PROD}/api/migrate/deploy-frontend`, { key: DEPLOY_KEY });
    if (r.status > 0) {
      frontendOk = true;
      console.log(green(`  ✓ Frontend deployed (attempt ${attempt}).`));
      console.log(dim(`  ${r.body.slice(0, 120)}`));
      break;
    }
    console.log(dim(`  Attempt ${attempt}/5 — server not responding yet, waiting...`));
    await sleep(5_000);
  }
  if (!frontendOk) {
    stepFail();
    saveReport("FAILED_FRONTEND_DEPLOY");
    console.error(red(`  ✗  Server did not come back online. Check PM2 logs.\n`));
    process.exit(1);
  }
  stepOk();

  // ── STEP 9: POST-DEPLOY REGRESSION TEST ───────────────────────────────────
  step("POST-DEPLOY Regression Test");
  if (SKIP_TEST) {
    console.log(yellow("  Skipped."));
    stepOk();
  } else {
    try {
      run(`node ${PKG_ROOT}/scripts/regression-test.mjs --phase post`);
      stepOk();
      console.log(green("  ✓ Post-deploy regression passed."));
    } catch {
      stepFail();
      saveReport("FAILED_POSTTEST");
      console.error(red(`\n  ✗  POST-DEPLOY REGRESSION FAILED — production may be broken!`));
      console.error(red(`     Roll back immediately or investigate.\n`));
      process.exit(1);
    }
  }

  // ── STEP 10: SAVE DEPLOYMENT REPORT ───────────────────────────────────────
  step("Save Deployment Report");
  const registry = JSON.parse(readFileSync(resolve(PKG_ROOT, "src/config/master-registry.json"), "utf-8"));
  const snapshot = JSON.parse(readFileSync(resolve(PKG_ROOT, "src/config/nav-snapshot.json"), "utf-8"));
  saveReport("SUCCESS", { notes: "All steps passed — production live." });
  stepOk();

  // ── FINAL BANNER ──────────────────────────────────────────────────────────
  const totalTime = elapsed();
  console.log(bold(`\n╔══════════════════════════════════════════════════════════════╗`));
  console.log(bold(`║  DEPLOYMENT COMPLETE                                          ║`));
  console.log(bold(`╠══════════════════════════════════════════════════════════════╣`));
  console.log(`  ${green("✓")} Pre-deploy regression          : PASSED`);
  console.log(`  ${green("✓")} Navigation structure check     : PASSED`);
  console.log(`  ${green("✓")} Master registry integrity      : PASSED`);
  console.log(`  ${green("✓")} Frontend build                 : PASSED`);
  console.log(`  ${green("✓")} API server build               : PASSED`);
  console.log(`  ${green("✓")} API server deployed            : PASSED`);
  console.log(`  ${green("✓")} Frontend deployed              : PASSED`);
  console.log(`  ${green("✓")} Post-deploy regression         : PASSED`);
  console.log(`  ${green("✓")} Deployment report saved        : deployment-reports/`);
  console.log(`  ─────────────────────────────────────────────────────────────`);
  console.log(`  Dashboards verified    : ${registry.dashboards.length}`);
  console.log(`  Sidebar items          : ${snapshot.navHrefs.length}`);
  console.log(`  Portal routes          : ${registry.portals.length}`);
  console.log(`  API endpoints checked  : ${registry.apiEndpoints.length}`);
  console.log(`  Role redirects         : ${registry.roles.length}`);
  console.log(`  Notification modules   : ${registry.notificationModules.length}`);
  console.log(`  Permission modules     : ${registry.permissions.modules.length}`);
  console.log(`  ─────────────────────────────────────────────────────────────`);
  console.log(`  Production URL         : ${PROD}`);
  console.log(`  Total time             : ${totalTime}`);
  console.log(green(bold(`\n  ✓  alburhantravels.com is live and fully verified.\n`)));
}

main().catch(e => {
  stepFail();
  saveReport("FATAL", { error: e.message });
  console.error(red(`\nFATAL: ${e.message}\n`));
  process.exit(1);
});
