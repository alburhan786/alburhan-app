import path from "path";
import { fileURLToPath } from "url";
import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times without risking some
// packages that are not bundle compatible
const allowlist = [
  "@anthropic-ai/sdk",
  "@google-cloud/storage",
  "@google/generative-ai",
  "adm-zip",
  "axios",
  "compression",
  "connect-pg-simple",
  "cookie-parser",
  "cors",
  "date-fns",
  "dotenv",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "google-auth-library",
  "helmet",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "node-cron",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pdfkit",
  "pg",
  "qrcode",
  "razorpay",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  const distDir = path.resolve(__dirname, "dist");
  await rm(distDir, { recursive: true, force: true });

  console.log("building server...");
  const pkgPath = path.resolve(__dirname, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter(
    (dep) =>
      !allowlist.includes(dep) &&
      !(pkg.dependencies?.[dep]?.startsWith("workspace:")),
  );

  // Inject messaging secrets from Replit build environment into the bundle.
  // This means the VPS does NOT need these in its .env file — they are baked
  // in at build time. DATABASE_URL, SESSION_SECRET etc. are intentionally
  // excluded because those are VPS-specific and must stay in the VPS .env.
  const messagingDefines: Record<string, string> = {};
  const injectKeys = [
    "FAST2SMS_API_KEY",
    "FAST2SMS_XXL_API_KEY",
    "BOTBEE_API_KEY",
    "BOTBEE_PHONE_NUMBER_ID",
    "BOTBEE_BUSINESS_ID",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_SECRET",
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
