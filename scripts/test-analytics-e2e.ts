#!/usr/bin/env npx tsx
/**
 * E2E Test Script — Full Analytics Pipeline
 *
 * Tests the complete flow:
 *   1. Login to get session cookie
 *   2. Upload CSV with influencer usernames
 *   3. Start scraping (Apify)
 *   4. Wait for scraping to complete
 *   5. Save import (cache media to GCS)
 *   6. Trigger audience analytics on scraped influencers
 *   7. Wait for analytics to complete via SSE
 *   8. Verify analytics results in DB
 *
 * Usage:
 *   npx tsx scripts/test-analytics-e2e.ts <path-to-csv> [options]
 *
 * Options:
 *   --limit <n>        Max influencers to scrape (default: 50)
 *   --videos <n>       Videos per influencer (default: 5)
 *   --mode <mode>      Analysis mode: NLP_ONLY | HYBRID | FULL_VISION (default: HYBRID)
 *   --base-url <url>   Dev server URL (default: http://localhost:3000)
 *   --skip-scrape      Skip upload+scrape, use existing influencers
 *   --skip-analytics   Skip analytics, only do upload+scrape
 *
 * Example:
 *   npx tsx scripts/test-analytics-e2e.ts ./test-influencers.csv --limit 50 --videos 5 --mode HYBRID
 */

import fs from "fs";
import path from "path";

// ─── Config ─────────────────────────────────────────────────

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--"));
const getArg = (flag: string, fallback: string) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
};
const hasFlag = (flag: string) => args.includes(flag);

const BASE_URL = getArg("--base-url", "http://localhost:3000");
const LIMIT = Number(getArg("--limit", "50"));
const VIDEO_COUNT = Number(getArg("--videos", "5"));
const MODE = getArg("--mode", "HYBRID") as "NLP_ONLY" | "HYBRID" | "FULL_VISION";
const SKIP_SCRAPE = hasFlag("--skip-scrape");
const SKIP_ANALYTICS = hasFlag("--skip-analytics");

const EMAIL = "admin@mixsoon.com";
const PASSWORD = "admin123";

// ─── Helpers ────────────────────────────────────────────────

let sessionCookie = "";

function log(step: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${step}] ${msg}`);
}

function fail(step: string, msg: string): never {
  console.error(`\n❌ FAILED at step "${step}": ${msg}`);
  process.exit(1);
}

function pass(step: string, msg: string) {
  console.log(`✅ ${step}: ${msg}`);
}

async function fetchApi(
  urlPath: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${BASE_URL}${urlPath}`;
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Cookie: sessionCookie,
    },
  });
}

// ─── Step 1: Login ──────────────────────────────────────────

async function login() {
  log("LOGIN", `Authenticating as ${EMAIL}...`);

  // Get CSRF token first
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  if (!csrfRes.ok) fail("LOGIN", `Failed to get CSRF token: ${csrfRes.status}`);
  const { csrfToken } = await csrfRes.json();
  const csrfCookies = csrfRes.headers.getSetCookie?.() ?? [];

  // Sign in
  const signInRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookies.join("; "),
    },
    body: new URLSearchParams({
      email: EMAIL,
      password: PASSWORD,
      csrfToken,
    }),
    redirect: "manual",
  });

  const allCookies = signInRes.headers.getSetCookie?.() ?? [];
  if (allCookies.length === 0) {
    fail("LOGIN", "No session cookies returned. Check credentials.");
  }

  // Combine all cookies
  const cookieJar = [...csrfCookies, ...allCookies];
  sessionCookie = cookieJar
    .map((c) => c.split(";")[0])
    .join("; ");

  // Verify session
  const sessionRes = await fetchApi("/api/auth/session");
  const session = await sessionRes.json();
  if (!session?.user?.email) {
    fail("LOGIN", `Session verification failed. Got: ${JSON.stringify(session)}`);
  }

  pass("LOGIN", `Authenticated as ${session.user.email} (role: ${session.user.role})`);
}

// ─── Step 2: Upload CSV ─────────────────────────────────────

interface UploadResult {
  id: string;
  toScrape: string[];
  toRescrape: string[];
  skipped: string[];
  finalCount: number;
  videoCount: number;
}

async function uploadCsv(csvFilePath: string): Promise<UploadResult> {
  log("UPLOAD", `Uploading ${csvFilePath} (limit: ${LIMIT}, videos: ${VIDEO_COUNT})...`);

  const fileBuffer = fs.readFileSync(csvFilePath);
  const fileName = path.basename(csvFilePath);

  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer], { type: "text/csv" }), fileName);
  formData.append("usernameLimit", String(LIMIT));
  formData.append("videoCount", String(VIDEO_COUNT));

  const res = await fetchApi("/api/imports", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    fail("UPLOAD", `HTTP ${res.status}: ${err}`);
  }

  const data: UploadResult = await res.json();
  pass("UPLOAD", `Import ${data.id} created: ${data.toScrape.length} to scrape, ${data.toRescrape.length} to re-scrape, ${data.skipped.length} skipped`);

  return data;
}

// ─── Step 3: Start Scraping ─────────────────────────────────

async function startScraping(upload: UploadResult): Promise<void> {
  const totalToScrape = upload.toScrape.length + upload.toRescrape.length;
  if (totalToScrape === 0) {
    log("SCRAPE", "Nothing to scrape — all influencers already exist.");
    return;
  }

  log("SCRAPE", `Starting scrape for ${totalToScrape} influencers...`);

  const res = await fetchApi("/api/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      importId: upload.id,
      toScrape: upload.toScrape,
      toRescrape: upload.toRescrape,
      skipped: upload.skipped,
      videoCount: upload.videoCount,
      refreshSkippedProfiles: false,
      runAnalysis: false, // We'll trigger analytics separately
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    fail("SCRAPE", `HTTP ${res.status}: ${err}`);
  }

  // Read SSE stream
  const reader = res.body?.getReader();
  if (!reader) fail("SCRAPE", "No response body");

  const decoder = new TextDecoder();
  let processedCount = 0;
  let lastLog = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));

    for (const line of lines) {
      try {
        const data = JSON.parse(line.slice(5));

        if (data.type === "progress") {
          processedCount = data.current ?? processedCount;
          const now = Date.now();
          if (now - lastLog > 5000) {
            log("SCRAPE", `Progress: ${data.current}/${data.total} — ${data.username ?? ""}`);
            lastLog = now;
          }
        }

        if (data.type === "complete") {
          processedCount = data.processedCount;
          pass("SCRAPE", `Completed: ${data.processedCount} influencers, ${data.totalVideos} videos`);
          return;
        }

        if (data.type === "error") {
          fail("SCRAPE", data.error ?? "Unknown scrape error");
        }
      } catch {
        // Not JSON, ignore
      }
    }
  }

  if (processedCount > 0) {
    pass("SCRAPE", `Stream ended. Processed ${processedCount} influencers.`);
  } else {
    fail("SCRAPE", "Stream ended without completion event");
  }
}

// ─── Step 4: Save Import ────────────────────────────────────

async function saveImport(importId: string): Promise<void> {
  log("SAVE", `Saving import ${importId} (caching media to GCS)...`);

  const res = await fetchApi(`/api/imports/${importId}/save`, {
    method: "POST",
  });

  if (!res.ok) {
    const err = await res.text();
    fail("SAVE", `HTTP ${res.status}: ${err}`);
  }

  // Read SSE stream for save progress
  const reader = res.body?.getReader();
  if (!reader) {
    // Might not be SSE, just a regular response
    const data = await res.json().catch(() => null);
    if (data) {
      pass("SAVE", "Import saved");
      return;
    }
    fail("SAVE", "No response body");
  }

  const decoder = new TextDecoder();
  let lastLog = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));

    for (const line of lines) {
      try {
        const data = JSON.parse(line.slice(5));
        const now = Date.now();

        if (data.type === "progress" && now - lastLog > 5000) {
          log("SAVE", `Progress: ${data.current}/${data.total}`);
          lastLog = now;
        }

        if (data.type === "complete") {
          pass("SAVE", "Import saved successfully");
          return;
        }

        if (data.type === "error") {
          fail("SAVE", data.error ?? "Save failed");
        }
      } catch {}
    }
  }

  pass("SAVE", "Import save completed");
}

// ─── Step 5: Get Influencers from Import ────────────────────

interface InfluencerBasic {
  id: string;
  username: string;
  videoCount: number;
}

async function getImportInfluencers(importId: string): Promise<InfluencerBasic[]> {
  log("FETCH", "Fetching influencers from import...");

  const res = await fetchApi(`/api/influencers?importId=${importId}`);
  if (!res.ok) {
    // Fallback: get all influencers
    const allRes = await fetchApi("/api/influencers");
    if (!allRes.ok) fail("FETCH", `HTTP ${allRes.status}`);
    const data = await allRes.json();
    const influencers = (data.influencers ?? data).slice(0, LIMIT);
    return influencers.map((i: { id: string; username: string; videos?: unknown[] }) => ({
      id: i.id,
      username: i.username,
      videoCount: i.videos?.length ?? 0,
    }));
  }

  const data = await res.json();
  const influencers = (data.influencers ?? data).slice(0, LIMIT);

  pass("FETCH", `Got ${influencers.length} influencers`);
  return influencers.map((i: { id: string; username: string; videos?: unknown[]; _count?: { videos: number } }) => ({
    id: i.id,
    username: i.username,
    videoCount: i._count?.videos ?? i.videos?.length ?? 0,
  }));
}

// ─── Step 6: Run Analytics ──────────────────────────────────

async function runAnalytics(influencers: InfluencerBasic[]): Promise<void> {
  // Filter to influencers with enough videos
  const eligible = influencers.filter((i) => i.videoCount >= 3);
  log("ANALYTICS", `${eligible.length}/${influencers.length} influencers eligible (3+ videos)`);

  if (eligible.length === 0) {
    log("ANALYTICS", "No eligible influencers. Skipping analytics.");
    return;
  }

  // Run analytics on first 5 (or fewer) to test
  const testBatch = eligible.slice(0, 5);
  log("ANALYTICS", `Running ${MODE} analysis on ${testBatch.length} influencers...`);

  const results: { username: string; status: string; error?: string }[] = [];

  for (const inf of testBatch) {
    log("ANALYTICS", `Starting analysis for @${inf.username}...`);

    // Trigger analysis
    const res = await fetchApi("/api/analytics/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ influencerId: inf.id, mode: MODE }),
    });

    if (!res.ok) {
      const err = await res.text();
      log("ANALYTICS", `Failed for @${inf.username}: ${err}`);
      results.push({ username: inf.username, status: "FAILED", error: err });
      continue;
    }

    const { runId } = await res.json();
    log("ANALYTICS", `Run ${runId} started for @${inf.username}`);

    // Listen to SSE for progress
    const sseResult = await waitForAnalysis(inf.id, inf.username);
    results.push({ username: inf.username, ...sseResult });
  }

  // Summary
  console.log("\n─── Analytics Results ───");
  const succeeded = results.filter((r) => r.status === "COMPLETED");
  const failed = results.filter((r) => r.status !== "COMPLETED");

  for (const r of results) {
    const icon = r.status === "COMPLETED" ? "✅" : "❌";
    console.log(`  ${icon} @${r.username}: ${r.status}${r.error ? ` — ${r.error}` : ""}`);
  }

  console.log(`\n  Total: ${succeeded.length}/${results.length} succeeded`);

  if (succeeded.length === 0 && testBatch.length > 0) {
    fail("ANALYTICS", "All analytics runs failed");
  }
}

async function waitForAnalysis(
  influencerId: string,
  username: string,
): Promise<{ status: string; error?: string }> {
  // Poll SSE endpoint
  const MAX_WAIT = 10 * 60 * 1000; // 10 min
  const POLL_INTERVAL = 3000;
  const started = Date.now();

  while (Date.now() - started < MAX_WAIT) {
    try {
      const res = await fetchApi(`/api/analytics/${influencerId}`);
      if (res.ok) {
        const data = await res.json();
        const run = data.latestRun;

        if (run?.status === "COMPLETED") {
          pass("ANALYTICS", `@${username}: Completed (confidence: ${data.analytics?.confidence ? Math.round(data.analytics.confidence * 100) : "?"}%)`);
          return { status: "COMPLETED" };
        }

        if (run?.status === "FAILED") {
          return { status: "FAILED", error: run.errorMessage ?? "Unknown" };
        }

        if (run?.progressMsg) {
          log("ANALYTICS", `@${username}: ${run.progressMsg} (${run.progress ?? 0}%)`);
        }
      }
    } catch {}

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  return { status: "TIMEOUT", error: "Exceeded 10 minute wait" };
}

// ─── Step 7: Verify Results ─────────────────────────────────

async function verifyResults(influencers: InfluencerBasic[]): Promise<void> {
  log("VERIFY", "Checking analytics results...");

  let verified = 0;
  let missing = 0;

  for (const inf of influencers.slice(0, 5)) {
    const res = await fetchApi(`/api/analytics/${inf.id}`);
    if (!res.ok) {
      missing++;
      continue;
    }

    const data = await res.json();
    if (!data.analytics) {
      missing++;
      continue;
    }

    const a = data.analytics;
    const checks: string[] = [];

    // Verify data structure
    if (a.genderBreakdown && typeof a.genderBreakdown.male === "number") {
      checks.push("gender");
    }
    if (a.ageBrackets && typeof a.ageBrackets["18-24"] === "number") {
      checks.push("age");
    }
    if (Array.isArray(a.topCountries) && a.topCountries.length > 0) {
      checks.push("countries");
    }
    if (Array.isArray(a.topInterests) && a.topInterests.length > 0) {
      checks.push("interests");
    }
    if (a.influencerGender && a.influencerGender !== "unknown") {
      checks.push("face");
    }
    if (a.ethnicityBreakdown && Object.keys(a.ethnicityBreakdown).length > 0) {
      checks.push("ethnicity");
    }

    log("VERIFY", `@${inf.username}: [${checks.join(", ")}] confidence=${Math.round(a.confidence * 100)}%`);
    verified++;
  }

  if (verified > 0) {
    pass("VERIFY", `${verified} influencers have analytics data`);
  }
  if (missing > 0) {
    log("VERIFY", `${missing} influencers missing analytics (may not have enough comments)`);
  }
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log("\n🧪 MIXSOON Analytics E2E Test");
  console.log("════════════════════════════════════════");
  console.log(`  Server:    ${BASE_URL}`);
  console.log(`  Limit:     ${LIMIT} influencers`);
  console.log(`  Videos:    ${VIDEO_COUNT} per influencer`);
  console.log(`  Mode:      ${MODE}`);
  console.log(`  CSV:       ${csvPath ?? "(skip-scrape mode)"}`);
  console.log("════════════════════════════════════════\n");

  // Step 1: Login
  await login();

  let importId = "";
  let influencers: InfluencerBasic[] = [];

  if (!SKIP_SCRAPE) {
    if (!csvPath) {
      fail("SETUP", "No CSV file provided. Usage: npx tsx scripts/test-analytics-e2e.ts <csv-path>");
    }

    if (!fs.existsSync(csvPath)) {
      fail("SETUP", `CSV file not found: ${csvPath}`);
    }

    // Step 2: Upload CSV
    const upload = await uploadCsv(csvPath);
    importId = upload.id;

    // Step 3: Start scraping
    await startScraping(upload);

    // Step 4: Save import
    await saveImport(importId);

    // Step 5: Get influencers
    influencers = await getImportInfluencers(importId);
  } else {
    log("SCRAPE", "Skipping scrape — using existing influencers");
    // Get existing influencers from DB
    const res = await fetchApi("/api/influencers?limit=50");
    if (!res.ok) fail("FETCH", `HTTP ${res.status}`);
    const data = await res.json();
    influencers = (data.influencers ?? data).slice(0, LIMIT).map(
      (i: { id: string; username: string; videos?: unknown[]; _count?: { videos: number } }) => ({
        id: i.id,
        username: i.username,
        videoCount: i._count?.videos ?? i.videos?.length ?? 0,
      }),
    );
    pass("FETCH", `Got ${influencers.length} existing influencers`);
  }

  if (!SKIP_ANALYTICS) {
    // Step 6: Run analytics
    await runAnalytics(influencers);

    // Step 7: Verify
    await verifyResults(influencers);
  }

  console.log("\n════════════════════════════════════════");
  console.log("🎉 E2E Test Complete!");
  console.log("════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n💥 Unexpected error:", err);
  process.exit(1);
});
