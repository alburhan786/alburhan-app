#!/bin/bash
# VPS build script — bypasses pnpm workspace filter issues
set -e

ROOT="/var/www/alburhan"
API_DIR="$ROOT/artifacts/api-server"
DIST_DIR="$API_DIR/dist"

echo "==> Building api-server for VPS..."

# Ensure esbuild is available (approve it if needed)
cd "$ROOT"
if [ ! -f "$ROOT/node_modules/esbuild/bin/esbuild" ] && [ ! -f "$ROOT/node_modules/.bin/esbuild" ]; then
  echo "==> Running pnpm approve-builds for esbuild..."
  echo "esbuild" | pnpm approve-builds 2>/dev/null || true
  pnpm install --no-frozen-lockfile 2>/dev/null || true
fi

# Build using Node.js directly with esbuild (no pnpm filter needed)
node --input-type=module << 'SCRIPT'
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync, rmSync } from 'fs';

const require = createRequire(import.meta.url);

const ROOT = '/var/www/alburhan';
const API_DIR = path.join(ROOT, 'artifacts', 'api-server');
const DIST_DIR = path.join(API_DIR, 'dist');

// Remove old dist
try { rmSync(DIST_DIR, { recursive: true, force: true }); } catch(e) {}

// Read package.json for externals
const pkg = JSON.parse(readFileSync(path.join(API_DIR, 'package.json'), 'utf-8'));
const allDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
];
const allowlist = [
  '@anthropic-ai/sdk',
  '@google/generative-ai',
  'axios',
  'connect-pg-simple',
  'cors',
  'date-fns',
  'drizzle-orm',
  'drizzle-zod',
  'express',
  'express-rate-limit',
  'express-session',
  'jsonwebtoken',
  'memorystore',
  'multer',
  'nanoid',
  'nodemailer',
  'openai',
  'passport',
  'passport-local',
  'pg',
  'stripe',
  'uuid',
  'ws',
  'xlsx',
  'zod',
  'zod-validation-error',
];
const externals = allDeps.filter(
  (dep) =>
    !allowlist.includes(dep) &&
    !pkg.dependencies?.[dep]?.startsWith('workspace:')
);

// Find esbuild
let esbuild;
try {
  esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
} catch(e) {
  esbuild = require('esbuild');
}

const { build } = esbuild;

await build({
  entryPoints: [path.join(API_DIR, 'src', 'index.ts')],
  platform: 'node',
  bundle: true,
  format: 'cjs',
  outfile: path.join(DIST_DIR, 'index.cjs'),
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.url': '__importMetaUrl',
  },
  banner: {
    js: 'var __importMetaUrl = require("url").pathToFileURL(__filename).href;',
  },
  minify: true,
  external: externals,
  logLevel: 'info',
  tsconfig: path.join(API_DIR, 'tsconfig.json'),
});

console.log('✅ api-server built successfully!');
SCRIPT

echo "==> Restarting pm2..."
pm2 restart api-server

echo "✅ Done! Server is live."
