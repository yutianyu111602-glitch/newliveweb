#!/usr/bin/env node
/**
 * Build a live summary + blacklist from a checkpointed preset-audit.json without
 * stopping the running audit process.
 *
 * This intentionally avoids JSON.parse() to keep memory stable on 100MB+ files.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const argMap = new Map();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (token === "-h" || token === "--help") argMap.set("help", "true");
    if (!token.startsWith("--")) continue;
    const body = token.slice(2);
    if (!body) continue;
    if (body.includes("=")) {
      const [key, rawValue] = body.split("=");
      if (key) argMap.set(key, rawValue ?? "true");
      continue;
    }
    const key = body;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      argMap.set(key, next);
      i += 1;
    } else {
      argMap.set(key, "true");
    }
  }
}

const resolveArg = (key, fallback) => {
  if (!argMap.has(key)) return fallback;
  const value = argMap.get(key);
  return value ?? fallback;
};

const parseBool = (value, fallback = false) => {
  if (value == null) return fallback;
  const s = String(value).trim().toLowerCase();
  if (!s) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
};

const help = parseBool(resolveArg("help", "false"));

const inRaw = String(resolveArg("in", "")).trim();
const inPath = inRaw ? path.resolve(inRaw) : null;
const outDir = path.resolve(
  String(resolveArg("outDir", inPath ? path.dirname(inPath) : process.cwd()))
);
const auditPath = inPath ?? path.join(outDir, "preset-audit.json");

const summaryOut = path.resolve(outDir, resolveArg("summaryOut", "preset-audit.summary.json"));
const blacklistOut = path.resolve(outDir, resolveArg("blacklistOut", "preset-audit.blacklist.json"));

const blacklistMode = String(resolveArg("blacklistMode", "quality")).trim().toLowerCase();
const missingQuality = String(resolveArg("missingQuality", "drop")).trim().toLowerCase(); // drop|unsafe|safe
const includeReasonsByRelPath = parseBool(resolveArg("includeReasonsByRelPath", "false"));

const topNValue = Number(resolveArg("topN", "50"));
const topN = Number.isFinite(topNValue) && topNValue > 0 ? Math.floor(topNValue) : 50;

const logEveryEntriesValue = Number(resolveArg("logEveryEntries", "10000"));
const logEveryEntries =
  Number.isFinite(logEveryEntriesValue) && logEveryEntriesValue > 0
    ? Math.floor(logEveryEntriesValue)
    : 0;

if (
  help ||
  !auditPath ||
  !["quality", "crash", "none"].includes(blacklistMode) ||
  !["drop", "unsafe", "safe"].includes(missingQuality)
) {
  console.log("Snapshot preset-audit.json into summary/blacklist (streaming, low-memory)");
  console.log(
    "Usage: node scripts/snapshot-preset-audit.mjs --outDir <audit out dir> [--in <preset-audit.json>]\n" +
      "  --summaryOut <file>               default preset-audit.summary.json\n" +
      "  --blacklistOut <file>             default preset-audit.blacklist.json\n" +
      "  --blacklistMode quality|crash|none\n" +
      "  --missingQuality drop|unsafe|safe default drop\n" +
      "  --includeReasonsByRelPath true|false (default false)\n" +
      "  --topN 50                         top reasons/tags/categories to include\n" +
      "  --logEveryEntries 10000           progress heartbeat (0=quiet)\n"
  );
  process.exit(help ? 0 : 2);
}

const inc = (map, key, by = 1) => {
  const k = String(key ?? "").trim() || "unknown";
  map.set(k, (map.get(k) ?? 0) + by);
};

const normalizeReason = (reason) => {
  const s = String(reason ?? "").trim();
  if (!s) return "unknown";
  if (s === "wasm-abort") return "wasm-abort";
  if (s === "render-failed") return "render-failed";
  if (s === "probe-timeout") return "probe-timeout";
  if (s === "probe-error") return "probe-error";
  if (s === "probe-unavailable") return "probe-unavailable";
  if (/aborted/i.test(s)) return "Aborted(...)";
  if (/exception catching is not enabled/i.test(s)) return "Emscripten:exception-catching-disabled";
  if (/runtimeerror/i.test(s)) return "RuntimeError";
  if (s.length > 160) return "long-error";
  return s;
};

const parseJsonValueFromLine = (line) => {
  const idx = line.indexOf(":");
  if (idx < 0) return undefined;
  let v = line.slice(idx + 1).trim();
  if (v.endsWith(",")) v = v.slice(0, -1).trim();
  return JSON.parse(v);
};

const parseJsonStringItemLine = (line) => {
  const s = String(line ?? "").trim();
  if (!s || s.startsWith("]")) return null;
  let v = s;
  if (v.endsWith(",")) v = v.slice(0, -1);
  return JSON.parse(v);
};

const shouldBlacklist = (entry) => {
  if (!entry?.relPath) return false;

  const hasQuality = entry.qualityOk === true || entry.qualityOk === false;
  if (!hasQuality) {
    if (missingQuality === "unsafe") return true;
    return false; // drop|safe
  }

  if (entry.qualityOk === true) return false;

  if (blacklistMode === "quality") return true;

  if (blacklistMode === "crash") {
    for (const r of entry.reasonsRaw ?? []) {
      const s = String(r ?? "");
      if (!s) continue;
      if (
        s === "wasm-abort" ||
        s === "render-failed" ||
        s === "probe-timeout" ||
        s === "probe-error" ||
        s === "probe-unavailable" ||
        /aborted/i.test(s)
      ) {
        return true;
      }
    }
    return false;
  }

  return false;
};

const toTopList = (map) =>
  [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);

const start = Date.now();
console.log(`[snapshot] Reading: ${auditPath}`);

await fsp.mkdir(outDir, { recursive: true });

const reasonCounts = new Map();
const tagCounts = new Map();
const categoryCounts = new Map();
const warningCounts = new Map();

let sourceRoot = null;
let scanned = 0;
let withQuality = 0;
let qualityOk = 0;
let qualityBad = 0;
let qualityMissing = 0;

let blacklistedCount = 0;
const badSourceRelPaths = [];
const badReasonsByRelPath = includeReasonsByRelPath ? {} : null;

let current = null;
let inTags = false;
let inWarnings = false;
let inReasons = false;
let qualityOpen = false;

const flush = () => {
  if (!current?.relPath) {
    current = null;
    inTags = false;
    inWarnings = false;
    inReasons = false;
    qualityOpen = false;
    return;
  }

  scanned += 1;

  const cat = current.primaryCategory ?? "uncategorized";
  inc(categoryCounts, cat);

  for (const t of current.tags ?? []) inc(tagCounts, t);
  for (const w of current.warnings ?? []) inc(warningCounts, w);

  const hasQuality = current.qualityOk === true || current.qualityOk === false;
  if (hasQuality) {
    withQuality += 1;
    if (current.qualityOk) qualityOk += 1;
    else qualityBad += 1;
    for (const r of current.reasonsRaw ?? []) inc(reasonCounts, normalizeReason(r));
  } else {
    qualityMissing += 1;
  }

  if (blacklistMode !== "none" && shouldBlacklist(current)) {
    badSourceRelPaths.push(current.relPath);
    blacklistedCount += 1;
    if (includeReasonsByRelPath) {
      badReasonsByRelPath[current.relPath] = (current.reasonsRaw ?? []).map(String);
    }
  }

  if (logEveryEntries && scanned % logEveryEntries === 0) {
    const elapsedSec = Math.max(1, (Date.now() - start) / 1000);
    console.log(
      `[snapshot] scanned=${scanned} withQuality=${withQuality} ok=${qualityOk} bad=${qualityBad} missing=${qualityMissing} rate=${(scanned / elapsedSec).toFixed(1)}/s`
    );
  }

  current = null;
  inTags = false;
  inWarnings = false;
  inReasons = false;
  qualityOpen = false;
};

const rl = readline.createInterface({
  input: fs.createReadStream(auditPath, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  const s = String(line ?? "");
  const t = s.trim();
  if (!t) continue;

  if (sourceRoot == null && t.startsWith('"sourceRoot"')) {
    try {
      sourceRoot = String(parseJsonValueFromLine(t));
    } catch {
      // ignore
    }
    continue;
  }

  if (t.startsWith('"relPath"')) {
    flush();
    try {
      const relPath = String(parseJsonValueFromLine(t));
      current = {
        relPath,
        primaryCategory: null,
        tags: [],
        warnings: [],
        reasonsRaw: [],
        qualityOk: null,
      };
    } catch {
      current = null;
    }
    continue;
  }

  if (!current) continue;

  if (inTags) {
    if (t.startsWith("]")) {
      inTags = false;
    } else {
      try {
        const item = parseJsonStringItemLine(t);
        if (item != null) current.tags.push(String(item));
      } catch {
        // ignore
      }
    }
    continue;
  }

  if (inWarnings) {
    if (t.startsWith("]")) {
      inWarnings = false;
    } else {
      try {
        const item = parseJsonStringItemLine(t);
        if (item != null) current.warnings.push(String(item));
      } catch {
        // ignore
      }
    }
    continue;
  }

  if (inReasons) {
    if (t.startsWith("]")) {
      inReasons = false;
    } else {
      try {
        const item = parseJsonStringItemLine(t);
        if (item != null) current.reasonsRaw.push(String(item));
      } catch {
        // ignore
      }
    }
    continue;
  }

  if (t.startsWith('"primaryCategory"')) {
    try {
      const v = parseJsonValueFromLine(t);
      current.primaryCategory = v == null ? null : String(v);
    } catch {
      // ignore
    }
    continue;
  }

  if (t.startsWith('"tags"')) {
    if (t.includes("[]")) continue;
    if (t.includes("[")) inTags = true;
    continue;
  }

  if (t.startsWith('"warnings"')) {
    if (t.includes("[]")) continue;
    if (t.includes("[")) inWarnings = true;
    continue;
  }

  if (t.startsWith('"quality"')) {
    if (t.includes("null")) {
      current.qualityOk = null;
      qualityOpen = false;
    } else if (t.includes("{")) {
      qualityOpen = true;
    }
    continue;
  }

  if (qualityOpen && t.startsWith('"ok"')) {
    if (t.includes("true")) current.qualityOk = true;
    else if (t.includes("false")) current.qualityOk = false;
    continue;
  }

  if (qualityOpen && t.startsWith('"reasons"')) {
    if (t.includes("[]")) {
      // empty reasons
    } else if (t.includes("[")) {
      inReasons = true;
    }
    continue;
  }

  if (qualityOpen && (t === "}," || t === "}")) {
    qualityOpen = false;
  }
}

flush();

const elapsedSec = Math.max(0.001, (Date.now() - start) / 1000);

const summary = {
  version: "v0",
  generatedAt: new Date().toISOString(),
  sourceRoot,
  input: auditPath,
  totals: {
    scanned,
    withQuality,
    ok: qualityOk,
    bad: qualityBad,
    missing: qualityMissing,
  },
  top: {
    reasons: toTopList(reasonCounts),
    tags: toTopList(tagCounts),
    categories: toTopList(categoryCounts),
    warnings: toTopList(warningCounts),
  },
  meta: {
    elapsedSec: Number(elapsedSec.toFixed(3)),
    scannedPerSec: Number((scanned / elapsedSec).toFixed(2)),
    blacklistMode,
    missingQuality,
    includeReasonsByRelPath,
  },
};

const blacklist = {
  version: "v0",
  generatedAt: new Date().toISOString(),
  sourceRoot,
  badSourceRelPaths,
  ...(includeReasonsByRelPath ? { badReasonsByRelPath } : {}),
  meta: {
    scanned,
    blacklisted: blacklistedCount,
    blacklistMode,
    missingQuality,
  },
};

await fsp.writeFile(summaryOut, JSON.stringify(summary, null, 2) + "\n", "utf8");
await fsp.writeFile(blacklistOut, JSON.stringify(blacklist, null, 2) + "\n", "utf8");

console.log(`[snapshot] Wrote summary:   ${summaryOut}`);
console.log(`[snapshot] Wrote blacklist: ${blacklistOut}`);
console.log(
  `[snapshot] totals scanned=${scanned} withQuality=${withQuality} ok=${qualityOk} bad=${qualityBad} missing=${qualityMissing} elapsed=${elapsedSec.toFixed(
    1
  )}s`
);
