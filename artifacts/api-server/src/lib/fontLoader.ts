// @ts-nocheck
/**
 * fontLoader.ts — Download and cache Noto Sans Regular (supports ₹ U+20B9)
 *
 * PDFKit's built-in Helvetica cannot render the Indian Rupee sign (U+20B9).
 * This module downloads Noto Sans Regular from Google Fonts CDN on first use
 * and caches it to /tmp so subsequent PDF generations are instant.
 *
 * If the download fails (offline VPS, CDN down) the module returns null and
 * callers fall back to Helvetica (₹ will appear as a placeholder glyph).
 *
 * Concurrency: the in-flight Promise is cached so concurrent first-requests
 * all await the same download rather than racing past the _initialized flag
 * and receiving null.
 */

import fs from "fs";

const CACHE_PATH = "/tmp/noto-sans-regular.ttf";
// Google Fonts CDN — stable versioned URL for Noto Sans v42 Regular subset
const CDN_URL =
  "https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9A99d.ttf";

// Cache the in-flight Promise so concurrent callers await the same download.
// Resolved to a Buffer once available, or null on failure.
let _pendingLoad: Promise<Buffer | null> | null = null;

export function loadNotoSansFont(): Promise<Buffer | null> {
  if (!_pendingLoad) {
    _pendingLoad = _doLoad();
  }
  return _pendingLoad;
}

async function _doLoad(): Promise<Buffer | null> {
  try {
    // 1. Use cached copy on disk if available (instant — no network needed)
    if (fs.existsSync(CACHE_PATH)) {
      const buf = fs.readFileSync(CACHE_PATH);
      console.log("[FontLoader] ✅ Noto Sans loaded from cache");
      return buf;
    }

    // 2. Download from CDN (15-second timeout)
    console.log("[FontLoader] Downloading Noto Sans Regular from CDN…");
    const resp = await fetch(CDN_URL, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 50000) throw new Error("TTF file too small — CDN may have returned error page");

    // 3. Cache to disk for next run
    try { fs.writeFileSync(CACHE_PATH, buf); } catch {}

    console.log(`[FontLoader] ✅ Noto Sans downloaded (${buf.length} bytes) and cached`);
    return buf;
  } catch (e: any) {
    console.warn("[FontLoader] ⚠️  Noto Sans unavailable:", e?.message, "— ₹ will use Helvetica fallback");
    // Reset so a future call can retry (e.g. after a transient network failure)
    _pendingLoad = null;
    return null;
  }
}

/** Kick off a background download when this module is first imported. */
loadNotoSansFont().catch(() => null);
