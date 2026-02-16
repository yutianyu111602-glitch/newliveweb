#!/usr/bin/env node
/**
 * AIVJ style-index self-check.
 *
 * Usage:
 *   node scripts/aivj/check-style-index.mjs --manifestUrl http://127.0.0.1:5174/presets/<pack>/library-manifest.json
 *
 * Exit codes:
 *   0: OK (v1 or v0 valid)
 *   2: No valid style index found
 */

const HARD_TIMEOUT_MS = Number(process.env.AIVJ_SCRIPT_TIMEOUT_MS ?? 120000);

const parseArgs = (argv) => {
  const map = new Map();
  const tokens = argv.slice(2);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token || !String(token).startsWith("--")) continue;
    const body = String(token).slice(2);
    if (!body) continue;

    if (body.includes("=")) {
      const [key, raw] = body.split("=");
      if (key) map.set(key, raw ?? "true");
      continue;
    }

    const key = body;
    const next = tokens[i + 1];
    if (next && !String(next).startsWith("--")) {
      map.set(key, next);
      i += 1;
    } else {
      map.set(key, "true");
    }
  }

  const get = (key, fallback) => (map.has(key) ? map.get(key) : fallback);
  const has = (key) => map.has(key);
  return { get, has };
};

const stripQuery = (url) => {
  const s = String(url ?? "");
  const q = s.indexOf("?");
  return { base: q >= 0 ? s.slice(0, q) : s, suffix: q >= 0 ? s.slice(q) : "" };
};

const urlFor = (manifestUrl, fileName) => {
  const { base, suffix } = stripQuery(manifestUrl);
  if (base.endsWith("library-manifest.json")) {
    return base.replace(/library-manifest\.json$/, fileName) + suffix;
  }
  const trimmed = base.endsWith("/") ? base : `${base}/`;
  return `${trimmed}${fileName}${suffix}`;
};

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

const validateIndex = (obj, version) => {
  if (!obj || typeof obj !== "object") return { ok: false, reason: "not-an-object" };
  if (obj.version !== version) return { ok: false, reason: `version!=${version}` };
  if (!Array.isArray(obj.entries)) return { ok: false, reason: "entries-not-array" };
  // Minimal entry schema: presetId + authorKey + energy
  let validCount = 0;
  for (const e of obj.entries) {
    if (!e || typeof e !== "object") continue;
    if (!isNonEmptyString(e.presetId)) continue;
    if (!isNonEmptyString(e.authorKey)) continue;
    if (!(e.energy === "calm" || e.energy === "groove" || e.energy === "peak")) continue;
    validCount += 1;
  }
  if (obj.entries.length > 0 && validCount === 0) {
    return { ok: false, reason: "no-valid-entries" };
  }
  return { ok: true, reason: `entries=${obj.entries.length} valid=${validCount}` };
};

const validatePolicyV0 = (obj) => {
  if (!obj || typeof obj !== "object") return { ok: false, reason: "not-an-object" };
  if (obj.version !== "v0") return { ok: false, reason: "version!=v0" };
  return { ok: true, reason: "ok" };
};

const fetchJson = async (url) => {
  const started = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(url, { cache: "no-store", signal: controller.signal });
  } catch (e) {
    clearTimeout(timeoutId);
    return { ok: false, status: null, ms: Date.now() - started, error: String(e?.message ?? e) };
  }
  clearTimeout(timeoutId);

  const ms = Date.now() - started;
  if (!res.ok) {
    return { ok: false, status: res.status, ms, error: `http-${res.status}` };
  }

  try {
    const json = await res.json();
    return { ok: true, status: res.status, ms, json };
  } catch (e) {
    return { ok: false, status: res.status, ms, error: `json-parse: ${String(e?.message ?? e)}` };
  }
};

async function main() {
  const args = parseArgs(process.argv);
  const help = args.has("help") || args.has("h");
  const manifestUrl = String(args.get("manifestUrl", "")).trim();

  if (help || !manifestUrl) {
    console.log("AIVJ style-index self-check");
    console.log(
      "Usage: node scripts/aivj/check-style-index.mjs --manifestUrl http://127.0.0.1:5174/presets/<pack>/library-manifest.json"
    );
    process.exit(manifestUrl ? 0 : 2);
  }

  const v1Url = urlFor(manifestUrl, "aivj-style-index.v1.json");
  const v0Url = urlFor(manifestUrl, "aivj-style-index.v0.json");
  const policyUrl = urlFor(manifestUrl, "aivj-style-policy.v0.json");

  console.log(`[aivj-check] manifestUrl: ${manifestUrl}`);
  console.log(`[aivj-check] v1: ${v1Url}`);
  console.log(`[aivj-check] v0: ${v0Url}`);
  console.log(`[aivj-check] policy(v0): ${policyUrl}`);

  // Simulate runtime behavior: try v1 first, strict fallback to v0.
  const v1 = await fetchJson(v1Url);
  if (v1.ok) {
    const verdict = validateIndex(v1.json, "v1");
    if (verdict.ok) {
      console.log(`[aivj-check] HIT: v1 (http=${v1.status} ${v1.ms}ms) ${verdict.reason}`);
    } else {
      console.log(
        `[aivj-check] v1 invalid (http=${v1.status} ${v1.ms}ms): ${verdict.reason} -> fallback to v0`
      );
    }
  } else {
    const s = v1.status == null ? "net" : `http=${v1.status}`;
    console.log(`[aivj-check] v1 missing/unreachable (${s} ${v1.ms}ms): ${v1.error} -> fallback to v0`);
  }

  let picked = null;
  if (v1.ok && validateIndex(v1.json, "v1").ok) {
    picked = { version: "v1", url: v1Url };
  } else {
    const v0 = await fetchJson(v0Url);
    if (v0.ok) {
      const verdict = validateIndex(v0.json, "v0");
      if (verdict.ok) {
        console.log(`[aivj-check] HIT: v0 (http=${v0.status} ${v0.ms}ms) ${verdict.reason}`);
        picked = { version: "v0", url: v0Url };
      } else {
        console.log(`[aivj-check] v0 invalid (http=${v0.status} ${v0.ms}ms): ${verdict.reason}`);
      }
    } else {
      const s = v0.status == null ? "net" : `http=${v0.status}`;
      console.log(`[aivj-check] v0 missing/unreachable (${s} ${v0.ms}ms): ${v0.error}`);
    }
  }

  // Policy is optional.
  const policy = await fetchJson(policyUrl);
  if (policy.ok) {
    const verdict = validatePolicyV0(policy.json);
    if (verdict.ok) {
      console.log(`[aivj-check] policy: ok (http=${policy.status} ${policy.ms}ms)`);
    } else {
      console.log(`[aivj-check] policy: invalid (http=${policy.status} ${policy.ms}ms): ${verdict.reason}`);
    }
  } else {
    const s = policy.status == null ? "net" : `http=${policy.status}`;
    console.log(`[aivj-check] policy: missing/unreachable (${s} ${policy.ms}ms): ${policy.error}`);
  }

  if (picked) {
    console.log(`[aivj-check] RESULT: runtime will use ${picked.version} (${picked.url})`);
    process.exit(0);
  }

  console.log("[aivj-check] RESULT: no valid style index found (v1/v0)");
  process.exit(2);
}

const timeoutId = Number.isFinite(HARD_TIMEOUT_MS) && HARD_TIMEOUT_MS > 0
  ? setTimeout(() => {
      console.error(`[aivj-check] timeout after ${HARD_TIMEOUT_MS}ms`);
      process.exit(2);
    }, HARD_TIMEOUT_MS)
  : null;

Promise.resolve()
  .then(() => main())
  .then(() => {
    process.exitCode = 0;
  })
  .catch((e) => {
    console.error(`[aivj-check] FATAL: ${String(e?.message ?? e)}`);
    process.exitCode = 2;
  })
  .finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
    setTimeout(() => process.exit(process.exitCode ?? 0), 0);
  });
