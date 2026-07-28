import path from "path";
import { fileURLToPath } from "url";
import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildAll() {
  const distDir = path.resolve(__dirname, "dist");
  await rm(distDir, { recursive: true, force: true });

  console.log("building server...");
  const pkgPath = path.resolve(__dirname, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));

  const runtimeDeps = Object.keys(pkg.dependencies || {});
  const devDeps = Object.keys(pkg.devDependencies || {});

  // ── External list: devDependencies (build tools / type stubs — never needed
  // at runtime) + workspace packages + pdfkit (the ONE runtime exception).
  //
  // pdfkit loads AFM/ICC font data from __dirname at runtime and MUST remain
  // external so the VPS node_modules/pdfkit keeps those data files intact.
  //
  // Every other runtime dependency (pkg.dependencies) is BUNDLED into the CJS
  // output so the VPS needs NO node_modules directory at all.  Adding a new
  // dependency to package.json is therefore sufficient — no allowlist to update.
  const RUNTIME_EXTERNAL = new Set(["pdfkit"]);

  const externals: string[] = [
    // devDependencies — only needed during the build, not at runtime
    ...devDeps,
    // pdfkit — intentionally external (reads font files from disk at runtime)
    "pdfkit",
  ].filter((dep) => !(pkg.dependencies?.[dep]?.startsWith("workspace:")));

  // Validation: log every runtime dep that would be external (should be none
  // except pdfkit) so CI / the build output catches regressions immediately.
  const unexpectedExternals = runtimeDeps.filter(
    (dep) =>
      externals.includes(dep) &&
      !RUNTIME_EXTERNAL.has(dep) &&
      !pkg.dependencies?.[dep]?.startsWith("workspace:"),
  );
  if (unexpectedExternals.length > 0) {
    console.error(
      `  ❌ BUILD ERROR: the following runtime deps are marked external and will\n` +
      `     cause MODULE_NOT_FOUND on the VPS (no node_modules):\n` +
      unexpectedExternals.map((d) => `       - ${d}`).join("\n") + "\n" +
      `     Fix: remove them from devDependencies or add them to dependencies only.`,
    );
    process.exit(1);
  }

  // Summary
  const bundledRuntime = runtimeDeps.filter(
    (d) => !externals.includes(d) && !d.startsWith("@workspace/"),
  );
  console.log(`  📦 Bundling ${bundledRuntime.length} runtime deps into CJS`);
  console.log(`  🔗 External (devDeps + pdfkit): ${externals.filter(d => !d.startsWith("@types/")).length} packages`);

  // Inject messaging secrets from Replit build environment into the bundle.
  // The VPS does NOT need these in its .env — they are baked in at build time.
  // DATABASE_URL and SESSION_SECRET are intentionally excluded (VPS-specific).
  const messagingDefines: Record<string, string> = {};
  const injectKeys = [
    "FAST2SMS_API_KEY",
    "FAST2SMS_XXL_API_KEY",
    "BOTBEE_API_KEY",
    // BOTBEE_PHONE_NUMBER_ID intentionally excluded — hardcoded in botbee.ts as CORRECT_PHONE_NUMBER_ID
    "BOTBEE_BUSINESS_ID",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_SECRET",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "SMTP_FROM_NAME",
    // Meta WhatsApp Cloud API v30.0 — primary WhatsApp provider (BotBee is fallback)
    "META_ACCESS_TOKEN",
    "META_PHONE_NUMBER_ID",
    "META_WABA_ID",
    "META_BUSINESS_ACCOUNT_ID",
    "META_APP_ID",
    "META_APP_SECRET",
    "META_VERIFY_TOKEN",
    "META_WEBHOOK_SECRET",
    "META_API_VERSION",
    // Firebase Cloud Messaging (Admin SDK — baked into bundle for VPS)
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
    // Firebase web config (served via /api/push/firebase-web-config for SW init)
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
    "VITE_FIREBASE_VAPID_KEY",
    // Lemin AI RCS — baked in so VPS has no separate .env dependency
    "LEMIN_API_KEY",
    "LEMIN_BASE_URL",
    "LEMIN_DIAL_CODE",
    "LEMIN_AGENT",
  ];
  for (const key of injectKeys) {
    const val = process.env[key];
    if (val && val !== "your_actual_key_here" && val !== "your_key_here") {
      messagingDefines[`process.env.${key}`] = JSON.stringify(val);
      console.log(`  ✅ Injecting ${key} (len=${val.length}) into bundle`);
    } else {
      console.log(`  ⚠️  ${key} not set in build env — VPS must supply via .env`);
    }
  }

  await esbuild({
    entryPoints: [path.resolve(__dirname, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.resolve(distDir, "index.cjs"),
    define: {
      "process.env.NODE_ENV": '"production"',
      "import.meta.url": "__importMetaUrl",
      ...messagingDefines,
    },
    banner: {
      js: `var __importMetaUrl = require("url").pathToFileURL(__filename).href;`,
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
