#!/bin/bash
set -e

echo "=== Building frontend ==="
BASE_PATH=/ pnpm --filter @workspace/alburhan run build

echo "=== Building API server ==="
pnpm --filter @workspace/api-server run build

echo "=== Build complete ==="
echo "Start with: pnpm --filter @workspace/api-server run start"
echo "Or: pm2 start ecosystem.config.cjs"
