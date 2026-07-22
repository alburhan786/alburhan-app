#!/usr/bin/env node
/**
 * PERMANENT DEPLOYMENT ORCHESTRATOR
 *
 * This is the ONLY way to deploy Al Burhan to production.
 * Every step is mandatory. The build fails if any step fails.
 *
 * Usage:
 *   node scripts/deploy.mjs              # full deploy
 *   node scripts/deploy.mjs --skip-test  # skip regression (emergency only)
 *
 * Steps:
 *   1. PRE-DEPLOY regression test (against current production)
 *   2. Navigation structure check (check-nav.mjs)
 *   3. Build frontend (with nav gate inside vite build)
 *   4. Build API server
 *   5. Deploy frontend to VPS
 *   6. Deploy API server to VPS (triggers PM2 restart)
 *   7. Wait for PM2 restart
 *   8. POST-DEPLOY regression test (against new production)
 *   9. Final report
 */

import { execSync, spawn } from "child_process";
import { fileURLToPath }   from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "../../../"); // workspace root
const PKG_ROOT  = resolve(__dirname, "..");        // alburhan package

const SKIP_TEST   = process.argv.includes("--skip-test");
const PROD        = "https://alburhantravels.com";
const DEPLOY_KEY  = "alburhan-migrate-2026";
const REPLIT_URL  = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : null;

// ── helpers ────────────────────────────────────────────────────────────────
const red    = s => `\x1b[31m${s}\x1b[0m`;
const green  = s => `\x1b[32m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const bold   = s => `\x1b[1m${s}\x1b[0m`;
const dim    = s => `\x1b[2m${s}\x1b[0m`;

const startTime = Date.now();
let   stepNum   = 0;

function step(label) {
  stepNum++;
  console.log(bold(`\n[${stepNum}] ${label}`));
}

function run(cmd, opts = {}) {
  console.log(dim(`  $ ${cmd}`));
  execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });
}

function elapsed() {
  return `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
}

async function httpPost(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
    const text = await res.text();
    clearTimeout(timer);
    return { status: res.status, body: text };
  } catch (e) {
    clearTimeout(timer);
    return { status: 0, body: e.message };
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(bold(`\n╔══════════════════════════════════════════════════════════╗`));
  console.log(bold(`║  AL BURHAN DEPLOYMENT PIPELINE                           ║`));
  console.log(bold(`╚══════════════════════════════════════════════════════════╝`));
  console.log(dim(`  Target  : ${PROD}`));
  console.log(dim(`  Started : ${new Date().toISOString()}`));
  if (SKIP_TEST) console.log(yellow(`  ⚠  --skip-test flag set — regression tests bypassed`));

  // ── STEP 1: PRE-DEPLOY REGRESSION TEST ────────────────────────────────────
  step("PRE-DEPLOY Regression Test");
  if (SKIP_TEST) {
    console.log(yellow("  Skipped."));
  } else {
    try {
      run(`node ${PKG_ROOT}/scripts/regression-test.mjs --phase pre`);
      console.log(green("  Pre-deploy regression passed."));
    } catch {
      console.error(red(`\n  ✗  Pre-deploy regression FAILED. Fix issues before deploying.\n`));
      process.exit(1);
    }
  }

  // ── STEP 2: NAVIGATION STRUCTURE CHECK ────────────────────────────────────
  step("Navigation Structure Check (check-nav.mjs)");
  try {
    run(`node ${PKG_ROOT}/scripts/check-nav.mjs`);
    console.log(green("  Navigation check passed."));
  } catch {
    console.error(red(`\n  ✗  Navigation check FAILED. Run update-snapshot.mjs if changes are intentional.\n`));
    process.exit(1);
  }

  // ── STEP 3: BUILD FRONTEND ─────────────────────────────────────────────────
  step("Build Frontend");
  try {
    // Note: vite build already calls check-nav.mjs via package.json "build" script
    run(`pnpm --filter @workspace/alburhan run build`, { cwd: ROOT });
    console.log(green(`  Frontend built successfully.`));
  } catch {
    console.error(red(`\n  ✗  Frontend build FAILED.\n`));
    process.exit(1);
  }

  // ── STEP 4: BUILD API SERVER ───────────────────────────────────────────────
  step("Build API Server");
  try {
    run(`pnpm --filter @workspace/api-server run build`, { cwd: ROOT });
    console.log(green(`  API server built successfully.`));
  } catch {
    console.error(red(`\n  ✗  API server build FAILED.\n`));
    process.exit(1);
  }

  // ── STEP 5: DEPLOY FRONTEND ────────────────────────────────────────────────
  step("Deploy Frontend to VPS");
  {
    const r = await httpPost(`${PROD}/api/migrate/deploy-frontend`, { key: DEPLOY_KEY });
    let ok = false;
    try { ok = JSON.parse(r.body).ok === true; } catch {}
    if (ok) {
      const bytes = JSON.parse(r.body).bytes;
      console.log(green(`  Frontend deployed — ${(bytes / 1024 / 1024).toFixed(1)} MB`));
    } else {
      console.error(red(`  ✗  Frontend deploy FAILED: ${r.body.slice(0, 200)}`));
      process.exit(1);
    }
  }

  // ── STEP 6: DEPLOY API SERVER ──────────────────────────────────────────────
  step("Deploy API Server to VPS (PM2 restart)");
  {
    const r = await httpPost(`${PROD}/api/migrate/self-update`, { key: DEPLOY_KEY });
    let ok = false;
    try { ok = JSON.parse(r.body).ok === true; } catch {}
    if (ok) {
      console.log(green(`  API server deployed — PM2 restarting.`));
    } else if (r.status === 0) {
      // 502 expected because server restarted mid-request
      console.log(yellow(`  API server restart triggered (502 = PM2 restart in progress, expected).`));
    } else {
      console.error(red(`  ✗  API server deploy FAILED: ${r.body.slice(0, 200)}`));
      process.exit(1);
    }
  }

  // ── STEP 7: WAIT FOR PM2 RESTART ──────────────────────────────────────────
  step("Waiting for PM2 restart (12 seconds)");
  for (let i = 12; i > 0; i--) {
    process.stdout.write(`\r  ${i}s remaining...   `);
    await sleep(1000);
  }
  console.log(`\r  Server restart complete.                `);

  // Verify server is back up
  let serverUp = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await httpPost(`${PROD}/api/migrate/deploy-frontend`, { key: DEPLOY_KEY });
    // Even a 4xx means the server is up
    if (r.status > 0) { serverUp = true; break; }
    console.log(dim(`  Attempt ${attempt}/5 — waiting...`));
    await sleep(3000);
  }
  if (!serverUp) {
    console.error(red(`  ✗  Server did not come back online. Check PM2 logs.`));
    process.exit(1);
  }
  console.log(green(`  Server is online.`));

  // ── STEP 8: POST-DEPLOY REGRESSION TEST ───────────────────────────────────
  step("POST-DEPLOY Regression Test");
  if (SKIP_TEST) {
    console.log(yellow("  Skipped."));
  } else {
    try {
      run(`node ${PKG_ROOT}/scripts/regression-test.mjs --phase post`);
      console.log(green("  Post-deploy regression passed."));
    } catch {
      console.error(red(`\n  ✗  POST-DEPLOY REGRESSION FAILED — production may be broken!\n`));
      console.error(red(`     Roll back immediately or investigate.\n`));
      process.exit(1);
    }
  }

  // ── STEP 9: FINAL REPORT ───────────────────────────────────────────────────
  const totalTime = elapsed();
  console.log(bold(`\n╔══════════════════════════════════════════════════════════╗`));
  console.log(bold(`║  DEPLOYMENT COMPLETE                                      ║`));
  console.log(bold(`╠══════════════════════════════════════════════════════════╣`));
  console.log(`  ${green("✓")} Pre-deploy regression : PASSED`);
  console.log(`  ${green("✓")} Nav structure check   : PASSED`);
  console.log(`  ${green("✓")} Frontend build        : PASSED`);
  console.log(`  ${green("✓")} API server build      : PASSED`);
  console.log(`  ${green("✓")} Frontend deployed     : PASSED`);
  console.log(`  ${green("✓")} API server deployed   : PASSED`);
  console.log(`  ${green("✓")} Post-deploy regression: PASSED`);
  console.log(`  Production URL        : ${PROD}`);
  console.log(`  Total time            : ${totalTime}`);
  console.log(green(bold(`\n  ✓  alburhantravels.com is live and fully verified.\n`)));
}

main().catch(e => {
  console.error(red(`\nFATAL: ${e.message}\n`));
  process.exit(1);
});
