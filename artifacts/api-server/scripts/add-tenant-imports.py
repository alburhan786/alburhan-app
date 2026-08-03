#!/usr/bin/env python3
"""
Batch 0 — Add getTenantId import to all 60 tenant-scoped route files.
This is a SAFE, zero-behaviour-change pass: the import is added but not called.
Calling getTenantId() and adding predicates is done in subsequent batches.

UTILITY files explicitly excluded (no tenant filter needed):
  auth.ts, delete-auth.ts, e2e.ts, error-logs.ts, gallery.ts,
  health.ts, index.ts, meta.ts, storage.ts, system-health.ts
"""
import os, re, sys

ROUTES_DIR = "artifacts/api-server/src/routes"
IMPORT_LINE = 'import { getTenantId } from "../lib/tenantContext.js";'

# Files that are pure utilities — no tenant filter needed
UTILITY_SKIP = {
    "auth.ts", "delete-auth.ts", "e2e.ts", "error-logs.ts",
    "gallery.ts", "health.ts", "index.ts", "meta.ts",
    "storage.ts", "system-health.ts",
}

added = []
skipped_already = []
skipped_utility = []
failed = []

for fname in sorted(os.listdir(ROUTES_DIR)):
    if not fname.endswith(".ts"):
        continue
    if fname in UTILITY_SKIP:
        skipped_utility.append(fname)
        continue

    path = os.path.join(ROUTES_DIR, fname)
    with open(path, "r") as f:
        content = f.read()

    if "getTenantId" in content:
        skipped_already.append(fname)
        continue

    lines = content.split("\n")

    # Find the best insertion point: after the last top-level import line
    # but before any non-import, non-blank, non-comment content starts.
    last_import_idx = -1
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("import ") and " from " in stripped:
            last_import_idx = i
        elif stripped.startswith("import ") and stripped.endswith("{"):
            # multiline import start — skip
            last_import_idx = i
        # Stop scanning after we've passed the initial block (hit non-import code)
        elif (last_import_idx >= 0
              and stripped
              and not stripped.startswith("//")
              and not stripped.startswith("*")
              and not stripped.startswith("/*")
              and not stripped.startswith("import")
              and not stripped.startswith("}")):
            break

    if last_import_idx < 0:
        # No import found — put after first non-comment line
        for i, line in enumerate(lines):
            if line.strip() and not line.strip().startswith("//"):
                last_import_idx = i
                break

    if last_import_idx < 0:
        failed.append(fname)
        print(f"  FAIL  {fname} — could not find insertion point")
        continue

    lines.insert(last_import_idx + 1, IMPORT_LINE)
    new_content = "\n".join(lines)

    with open(path, "w") as f:
        f.write(new_content)
    added.append(fname)
    print(f"  ✓ {fname}")

print(f"\n{'='*60}")
print(f"  Added import: {len(added)} files")
print(f"  Already had:  {len(skipped_already)} files")
print(f"  Utility skip: {len(skipped_utility)} files (no filter needed)")
print(f"  Failed:       {len(failed)} files")
print(f"{'='*60}")
if failed:
    print("FAILED FILES:", failed)
    sys.exit(1)
print("Batch 0 import pass COMPLETE — zero behaviour change")
