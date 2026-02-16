#!/usr/bin/env node
/**
 * Local WebUI for monitoring coupled overnight runs.
 *
 * Why this exists:
 * - PowerShell log tails are fine, but user wanted a browser dashboard.
 * - Avoids touching runtime UI code; reads artifacts + logs only.
 *
 * Usage:
 *   node newliveweb/scripts/monitor-webui.mjs --stamp 2026-02-15_163645 --port 5195
 *
 * Opens:
 *   http://127.0.0.1:5195/
 */

import http from "node:http";
import path from "node:path";
import url from "node:url";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { spawn } from "node:child_process";
import readline from "node:readline";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NW_ROOT = path.resolve(__dirname, ".."); // .../newliveweb
const STATIC_DIR = path.join(__dirname, "monitor-webui");

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(s) {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function parseArgs(argv) {
  const out = {
    host: "127.0.0.1",
    port: 5195,
    stamp: "",
    evalDir: "",
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const n = i + 1 < argv.length ? argv[i + 1] : "";
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    if (a === "--host") {
      out.host = String(n || "");
      i++;
      continue;
    }
    if (a === "--port") {
      out.port = Number(n);
      i++;
      continue;
    }
    if (a === "--stamp") {
      out.stamp = String(n || "");
      i++;
      continue;
    }
    if (a === "--evalDir") {
      out.evalDir = String(n || "");
      i++;
      continue;
    }
  }
  return out;
}

async function pathExists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function findLatestOvernightEvalDir(rootDir) {
  try {
    const entries = await fsp.readdir(rootDir, { withFileTypes: true });
    const dirs = entries.filter(
      (e) => e.isDirectory() && e.name.startsWith("overnight-"),
    );
    if (dirs.length === 0) return null;

    let best = null;
    for (const d of dirs) {
      const full = path.join(rootDir, d.name);
      let st;
      try {
        st = await fsp.stat(full);
      } catch {
        continue;
      }
      if (!best || st.mtimeMs > best.mtimeMs) {
        best = { full, name: d.name, mtimeMs: st.mtimeMs };
      }
    }
    return best ? best.full : null;
  } catch {
    return null;
  }
}

async function readJsonFile(p) {
  try {
    const raw = await fsp.readFile(p, "utf8");
    const j = safeJsonParse(raw);
    if (!j.ok) return { ok: false, error: `JSON parse failed: ${j.error}` };
    return { ok: true, value: j.value };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function readFileTailText(p, maxBytes = 512 * 1024) {
  const st = await fsp.stat(p);
  const toRead = Math.min(maxBytes, st.size);
  const start = Math.max(0, st.size - toRead);

  const fh = await fsp.open(p, "r");
  try {
    const buf = Buffer.alloc(toRead);
    const { bytesRead } = await fh.read(buf, 0, toRead, start);
    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    await fh.close().catch(() => {});
  }
}

async function readLastNonEmptyLine(p, maxBytes = 512 * 1024) {
  const tail = await readFileTailText(p, maxBytes);
  const lines = tail.split(/\r?\n/).filter((x) => x.trim().length > 0);
  if (lines.length === 0) return "";
  return lines[lines.length - 1];
}

async function readTailLines(p, maxLines = 200, maxBytes = 2 * 1024 * 1024) {
  const tail = await readFileTailText(p, maxBytes);
  const lines = tail.split(/\r?\n/);
  const out = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    out.push(line);
    if (out.length >= maxLines) break;
  }
  out.reverse();
  return out.join("\n");
}

async function deriveUniqueVisitedFromEvalJsonl(evalJsonlPath, maxBytes = 350 * 1024 * 1024) {
  const st = await fsp.stat(evalJsonlPath);
  if (st.size > maxBytes) {
    return {
      ok: false,
      error: `eval.jsonl too large (${Math.round(st.size / (1024 * 1024))}MB), skipping derived progress`,
    };
  }

  const sets = new Map(); // pack -> Set(pairId)
  let lines = 0;
  let parseFail = 0;
  const re = /"pack":"(?<pack>[^"]+)".*?"pair":(?<pair>-?\d+)/;

  const rl = readline.createInterface({
    input: fs.createReadStream(evalJsonlPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line) continue;
    lines += 1;
    const m = re.exec(line);
    if (!m || !m.groups) {
      parseFail += 1;
      continue;
    }
    const pack = m.groups.pack;
    const pair = Number(m.groups.pair);
    if (!Number.isFinite(pair)) {
      parseFail += 1;
      continue;
    }
    if (!sets.has(pack)) sets.set(pack, new Set());
    sets.get(pack).add(pair);
  }

  const byPack = {};
  for (const [pack, set] of sets.entries()) {
    byPack[pack] = { visitedUnique: set.size };
  }

  return { ok: true, value: { lines, parseFail, byPack } };
}

function runExecFile(cmd, args, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const t = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      resolve({ ok: false, code: null, stdout, stderr: `${stderr}\n(timeout)` });
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

let NVIDIA_CACHE = { atMs: 0, data: null };
async function getNvidiaSnapshotCached() {
  const now = Date.now();
  if (NVIDIA_CACHE.data && now - NVIDIA_CACHE.atMs < 7000) return NVIDIA_CACHE.data;

  // Query form is easier to render as key/value.
  const args = [
    "--query-gpu=name,utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw,clocks.gr,clocks.mem",
    "--format=csv,noheader,nounits",
  ];
  const r = await runExecFile("nvidia-smi", args, { timeoutMs: 5000 });
  if (r.ok) {
    const lines = r.stdout
      .trim()
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    const parsed = lines.map((line) => {
      const parts = line.split(",").map((x) => x.trim());
      return {
        name: parts[0] ?? "",
        utilGpuPct: Number(parts[1] ?? "NaN"),
        utilMemPct: Number(parts[2] ?? "NaN"),
        memUsedMb: Number(parts[3] ?? "NaN"),
        memTotalMb: Number(parts[4] ?? "NaN"),
        tempC: Number(parts[5] ?? "NaN"),
        powerW: Number(parts[6] ?? "NaN"),
        clockGrMHz: Number(parts[7] ?? "NaN"),
        clockMemMHz: Number(parts[8] ?? "NaN"),
      };
    });
    const data = { ok: true, kind: "query", at: nowIso(), gpus: parsed };
    NVIDIA_CACHE = { atMs: now, data };
    return data;
  }

  // Fallback: plain nvidia-smi.
  const r2 = await runExecFile("nvidia-smi", [], { timeoutMs: 5000 });
  const data = {
    ok: r2.ok,
    kind: "plain",
    at: nowIso(),
    stdout: (r2.stdout || "").slice(-8000),
    stderr: (r2.stderr || "").slice(-2000),
  };
  NVIDIA_CACHE = { atMs: now, data };
  return data;
}

function mimeTypeFor(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".txt" || ext === ".log") return "text/plain; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendText(res, code, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(code, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  res.end(text);
}

function toPosixSlash(p) {
  return String(p || "").replace(/\\/g, "/");
}

function clampInt(n, lo, hi, fallback) {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function normalizeStampFromEvalDir(evalDir) {
  const base = path.basename(evalDir);
  if (base.startsWith("overnight-")) return base.slice("overnight-".length);
  return "";
}

function buildKnownPaths(stamp, evalDir) {
  const artifactsRoot = path.join(NW_ROOT, "artifacts");

  const overnightLogsDir = path.join(artifactsRoot, "overnight-logs");
  const runLog = stamp
    ? path.join(overnightLogsDir, `run-coupled-quality-overnight.${stamp}.log`)
    : "";
  const monitorLog = stamp
    ? path.join(overnightLogsDir, `overnight-${stamp}.monitor.log`)
    : "";
  const watchLog = stamp
    ? path.join(overnightLogsDir, `watch-coupled-eval-progress.v4.${stamp}.log`)
    : "";

  const metaJson = evalDir ? path.join(evalDir, "meta.json") : "";
  const evalJsonl = evalDir ? path.join(evalDir, "eval.jsonl") : "";
  const evalViteLog = evalDir ? path.join(evalDir, "vite.log") : "";

  return {
    artifactsRoot,
    overnightLogsDir,
    runLog,
    monitorLog,
    watchLog,
    metaJson,
    evalJsonl,
    evalViteLog,
  };
}

async function resolveRuntimeConfig(cli) {
  const coupledEvalRoot = path.join(NW_ROOT, "artifacts", "coupled-eval");

  let evalDir = cli.evalDir ? path.resolve(cli.evalDir) : "";
  if (!evalDir && cli.stamp) {
    evalDir = path.join(coupledEvalRoot, `overnight-${cli.stamp}`);
  }
  if (!evalDir) {
    const latest = await findLatestOvernightEvalDir(coupledEvalRoot);
    if (latest) evalDir = latest;
  }
  if (evalDir && !(await pathExists(evalDir))) {
    evalDir = "";
  }

  let stamp = cli.stamp || "";
  if (!stamp && evalDir) {
    stamp = normalizeStampFromEvalDir(evalDir);
  }

  const known = buildKnownPaths(stamp, evalDir);
  return { stamp, evalDir, known };
}

const DERIVED_CACHE = {
  evalJsonl: { key: "", mtimeMs: 0, size: 0, derived: null, lastLine: "", lastObj: null },
  qualityJson: new Map(), // path -> {mtimeMs, size, obj}
};

async function readQualityStatsCached(p) {
  try {
    if (!(await pathExists(p))) return null;
    const st = await fsp.stat(p);
    const prev = DERIVED_CACHE.qualityJson.get(p);
    if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) return prev.obj;
    const raw = await fsp.readFile(p, "utf8");
    const j = safeJsonParse(raw);
    if (!j.ok) return null;
    DERIVED_CACHE.qualityJson.set(p, { mtimeMs: st.mtimeMs, size: st.size, obj: j.value });
    return j.value;
  } catch {
    return null;
  }
}

async function computeStatus(cfg) {
  const { stamp, evalDir, known } = cfg;
  const status = {
    ok: true,
    at: nowIso(),
    stamp,
    evalDir: evalDir ? toPosixSlash(evalDir) : "",
    stage: "unknown",
    runStartedAt: null,
    alerts: [],
    paths: {
      runLog: known.runLog ? toPosixSlash(known.runLog) : "",
      monitorLog: known.monitorLog ? toPosixSlash(known.monitorLog) : "",
      watchLog: known.watchLog ? toPosixSlash(known.watchLog) : "",
      metaJson: known.metaJson ? toPosixSlash(known.metaJson) : "",
      evalJsonl: known.evalJsonl ? toPosixSlash(known.evalJsonl) : "",
      evalViteLog: known.evalViteLog ? toPosixSlash(known.evalViteLog) : "",
    },
    eval: {
      meta: null,
      metaError: null,
      derived: null,
      derivedError: null,
      last: null,
      evalJsonl: null,
    },
    outputs: {
      qualities: [],
      modelCheckpoint: null,
    },
    gpu: {
      nvidiaSmi: null,
    },
  };

  // Eval meta
  if (known.metaJson && (await pathExists(known.metaJson))) {
    const mj = await readJsonFile(known.metaJson);
    if (mj.ok) status.eval.meta = mj.value;
    else status.eval.metaError = mj.error;
  } else if (known.metaJson) {
    status.eval.metaError = "meta.json missing";
  }

  const runStartedAtMs =
    typeof status.eval.meta?.startedAt === "string"
      ? Date.parse(status.eval.meta.startedAt)
      : NaN;
  if (Number.isFinite(runStartedAtMs)) {
    status.runStartedAt = new Date(runStartedAtMs).toISOString();
  }
  const evalRunning =
    status.eval.meta &&
    status.eval.meta.kind === "coupled_eval.v0" &&
    !status.eval.meta.finishedAt;
  const webglRenderer = String(status.eval.meta?.runtime?.webgl?.renderer || "");
  if (webglRenderer && /swiftshader/i.test(webglRenderer)) {
    status.alerts.push({
      level: "warn",
      kind: "webgl_swiftshader",
      message: "WebGL renderer is SwiftShader (software/CPU). For RTX 4090 rendering, use headed mode.",
    });
  }

  // Eval jsonl stat + derived progress + last record
  if (known.evalJsonl && (await pathExists(known.evalJsonl))) {
    const st = await fsp.stat(known.evalJsonl);
    const ageSec = (Date.now() - st.mtimeMs) / 1000;
    status.eval.evalJsonl = {
      sizeBytes: st.size,
      mtime: new Date(st.mtimeMs).toISOString(),
      ageSec: Math.max(0, Math.round(ageSec)),
    };
    if (ageSec > 180 && evalRunning) {
      status.alerts.push({
        level: ageSec > 600 ? "error" : "warn",
        kind: "eval_stale",
        message: `eval.jsonl has not updated for ${Math.round(ageSec)}s (possible stuck).`,
      });
    }

    const cacheKey = known.evalJsonl;
    const c = DERIVED_CACHE.evalJsonl;
    if (c.key === cacheKey && c.mtimeMs === st.mtimeMs && c.size === st.size && c.derived) {
      status.eval.derived = c.derived;
      status.eval.last = c.lastObj;
    } else {
      const d = await deriveUniqueVisitedFromEvalJsonl(known.evalJsonl);
      if (d.ok) status.eval.derived = d.value;
      else status.eval.derivedError = d.error;

      let lastObj = null;
      try {
        const lastLine = await readLastNonEmptyLine(known.evalJsonl, 512 * 1024);
        if (lastLine) {
          const parsed = safeJsonParse(lastLine);
          if (parsed.ok) lastObj = parsed.value;
        }
      } catch {
        // ignore
      }
      status.eval.last = lastObj;

      DERIVED_CACHE.evalJsonl = {
        key: cacheKey,
        mtimeMs: st.mtimeMs,
        size: st.size,
        derived: status.eval.derived,
        lastLine: "",
        lastObj,
      };
    }
  } else if (known.evalJsonl) {
    status.eval.derivedError = "eval.jsonl missing";
  }

  // Stage heuristic
  // - If eval meta finishedAt exists => eval_done
  // - If fresh checkpoint exists (mtime >= startedAt) => trained
  // - If fresh quality JSON exists (mtime >= startedAt) => scored
  // - If verify artifacts dir exists => verified_or_running
  let stage = "unknown";
  const meta = status.eval.meta;
  if (meta && meta.kind === "coupled_eval.v0") stage = "eval";
  if (meta && meta.finishedAt) stage = "eval_done";

  // Discover quality outputs (packs from meta)
  const packs = Array.isArray(meta?.packs) ? meta.packs : [];
  let hasFreshQuality = false;
  for (const pi of packs) {
    const pack = String(pi?.pack || "");
    if (!pack) continue;
    const qPath = path.join(NW_ROOT, "public", "presets", pack, "pairs-quality.v0.json");
    if (await pathExists(qPath)) {
      const st = await fsp.stat(qPath);
      const q = await readQualityStatsCached(qPath);
      const freshForRun = Number.isFinite(runStartedAtMs) ? st.mtimeMs >= runStartedAtMs : true;
      status.outputs.qualities.push({
        pack,
        path: toPosixSlash(qPath),
        mtime: new Date(st.mtimeMs).toISOString(),
        sizeBytes: st.size,
        freshForRun,
        qualityStats: q?.qualityStats || null,
      });
      if (freshForRun) hasFreshQuality = true;
    } else {
      status.outputs.qualities.push({
        pack,
        path: toPosixSlash(qPath),
        exists: false,
      });
    }
  }

  // Model checkpoint
  const modelPath = path.join(NW_ROOT, "outputs", "coupling", "models", "coupling_net_final.pth");
  let hasFreshCheckpoint = false;
  if (await pathExists(modelPath)) {
    const st = await fsp.stat(modelPath);
    const freshForRun = Number.isFinite(runStartedAtMs) ? st.mtimeMs >= runStartedAtMs : true;
    status.outputs.modelCheckpoint = {
      path: toPosixSlash(modelPath),
      mtime: new Date(st.mtimeMs).toISOString(),
      sizeBytes: st.size,
      freshForRun,
    };
    if (freshForRun) hasFreshCheckpoint = true;
  } else {
    status.outputs.modelCheckpoint = { path: toPosixSlash(modelPath), exists: false };
  }

  if (hasFreshCheckpoint) stage = "trained";
  if (hasFreshQuality) stage = "scored";
  if (meta && meta.finishedAt && !hasFreshCheckpoint && !hasFreshQuality) stage = "eval_done";

  // Verify artifacts
  const verifyDir = stamp
    ? path.join(NW_ROOT, "artifacts", "headless-coupled", `overnight-${stamp}`)
    : "";
  if (verifyDir && (await pathExists(verifyDir))) {
    stage = "verified_or_running";
  }

  status.stage = stage;

  status.gpu.nvidiaSmi = await getNvidiaSnapshotCached();
  return status;
}

function printHelp() {
  const lines = [
    "",
    "monitor-webui.mjs",
    "",
    "Local Web UI for monitoring coupled overnight runs.",
    "",
    "Usage:",
    "  node newliveweb/scripts/monitor-webui.mjs --stamp 2026-02-15_163645 --port 5195",
    "",
    "Options:",
    "  --host   Bind host (default 127.0.0.1)",
    "  --port   Bind port (default 5195)",
    "  --stamp  Run stamp (e.g. 2026-02-15_163645). If omitted, auto-picks newest overnight-* eval dir.",
    "  --evalDir Explicit eval directory (overrides --stamp).",
    "",
  ];
  process.stdout.write(lines.join("\n"));
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    printHelp();
    process.exit(0);
  }

  const cfg = await resolveRuntimeConfig(cli);

  if (!cfg.evalDir) {
    console.error(`[monitor-webui] No evalDir found. Expected under: ${path.join(NW_ROOT, "artifacts", "coupled-eval")}`);
    console.error(`[monitor-webui] Tip: pass --stamp 2026-02-15_163645 or --evalDir <path>`);
  } else {
    console.log(`[monitor-webui] stamp=${cfg.stamp || "(unknown)"}`);
    console.log(`[monitor-webui] evalDir=${cfg.evalDir}`);
  }

  if (!(await pathExists(STATIC_DIR))) {
    console.error(`[monitor-webui] Missing static dir: ${STATIC_DIR}`);
    process.exit(2);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const u = new url.URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      const pathname = u.pathname || "/";

      if (pathname === "/api/status") {
        const status = await computeStatus(cfg);
        sendJson(res, 200, status);
        return;
      }

      if (pathname === "/api/log") {
        const kind = String(u.searchParams.get("kind") || "");
        const lines = clampInt(Number(u.searchParams.get("lines") || "200"), 1, 2000, 200);

        const known = cfg.known;
        const table = {
          run: known.runLog,
          monitor: known.monitorLog,
          watch: known.watchLog,
          evalvite: known.evalViteLog,
          evaljsonl: known.evalJsonl,
          meta: known.metaJson,
        };

        const p = table[kind] || "";
        if (!p) {
          sendText(res, 400, `unknown kind=${kind}\nknown=${Object.keys(table).join(",")}\n`);
          return;
        }
        if (!(await pathExists(p))) {
          sendText(res, 404, `missing: ${p}\n`);
          return;
        }
        const text = await readTailLines(p, lines);
        sendText(res, 200, text, "text/plain; charset=utf-8");
        return;
      }

      // Static
      let rel = pathname;
      if (rel === "/") rel = "/index.html";

      // Prevent path traversal
      const safeRel = rel.replace(/\\/g, "/");
      const fsPath = path.normalize(path.join(STATIC_DIR, safeRel));
      if (!fsPath.startsWith(STATIC_DIR)) {
        sendText(res, 400, "bad path");
        return;
      }
      if (!(await pathExists(fsPath))) {
        sendText(res, 404, "not found");
        return;
      }

      const data = await fsp.readFile(fsPath);
      res.writeHead(200, {
        "content-type": mimeTypeFor(fsPath),
        "cache-control": "no-store",
      });
      res.end(data);
    } catch (e) {
      sendJson(res, 500, { ok: false, at: nowIso(), error: String(e?.stack || e) });
    }
  });

  server.listen(cli.port, cli.host, () => {
    console.log(`[monitor-webui] listening on http://${cli.host}:${cli.port}/`);
  });
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
