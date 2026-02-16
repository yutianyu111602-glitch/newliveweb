#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const defaultStatePath = path.join(projectRoot, "artifacts", "aivj", "batch-state.json");
const defaultQueuePath = path.join(projectRoot, "scripts", "aivj", "run-queue.json");
const htmlPath = path.join(__dirname, "dashboard.html");

const parseArgs = (argv) => {
  const map = new Map();
  const tokens = argv.slice(2);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token || !token.startsWith("--")) continue;
    const body = token.slice(2);
    if (!body) continue;
    if (body.includes("=")) {
      const [k, v] = body.split("=");
      if (k) map.set(k, v ?? "true");
      continue;
    }
    const k = body;
    const next = tokens[i + 1];
    if (next && !next.startsWith("--")) {
      map.set(k, next);
      i += 1;
    } else {
      map.set(k, "true");
    }
  }
  return {
    get: (k, fallback) => (map.has(k) ? map.get(k) : fallback),
  };
};

const stripBom = (text) => String(text ?? "").replace(/^\uFEFF/, "");

const resolvePathArg = (value, fallback) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return fallback;
  return path.isAbsolute(trimmed) ? trimmed : path.join(projectRoot, trimmed);
};

const resolveMaybePath = (value) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  return path.isAbsolute(trimmed) ? trimmed : path.join(projectRoot, trimmed);
};

const args = parseArgs(process.argv);
const statePath = resolvePathArg(args.get("state", ""), defaultStatePath);
const queuePathDefault = resolvePathArg(args.get("queue", ""), defaultQueuePath);

const readText = (filePath) => {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
};

const readJson = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(stripBom(raw));
  } catch {
    return null;
  }
};

const tailLines = (text, maxLines) => {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const sliced = lines.slice(Math.max(0, lines.length - maxLines));
  return sliced.join("\n").trimEnd();
};

const readTailLines = (filePath, maxLines, maxBytes = 512 * 1024) => {
  try {
    const stat = fs.statSync(filePath);
    const size = stat.size;
    if (!size) return [];
    const readSize = Math.min(size, maxBytes);
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(readSize);
    fs.readSync(fd, buffer, 0, readSize, size - readSize);
    fs.closeSync(fd);
    const text = buffer.toString("utf8");
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    return lines.slice(Math.max(0, lines.length - maxLines));
  } catch {
    return [];
  }
};

const countIndex = (indexPath) => {
  const raw = readText(indexPath);
  if (!raw) {
    return { total: 0, ok: 0, failed: 0, lastPresetId: "" };
  }
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  let ok = 0;
  let failed = 0;
  for (const line of lines) {
    if (line.includes('"status":"ok"')) {
      ok += 1;
    } else if (line.includes('"status":')) {
      failed += 1;
    }
  }
  let lastPresetId = "";
  const lastLine = lines[lines.length - 1];
  if (lastLine) {
    try {
      const obj = JSON.parse(lastLine);
      lastPresetId = String(obj.presetId ?? "");
    } catch {
      lastPresetId = "";
    }
  }
  return { total: lines.length, ok, failed, lastPresetId };
};

const getManifestCount = (pack) => {
  if (!pack) return 0;
  const manifestPath = path.join(
    projectRoot,
    "public",
    "presets",
    pack,
    "library-manifest.json"
  );
  const manifest = readJson(manifestPath);
  if (!manifest || !Array.isArray(manifest.presets)) return 0;
  return manifest.presets.length;
};

const detectPhase = (logTail) => {
  if (!logTail) return "idle";
  const markers = [
    ["render", "[overnight] render frames"],
    ["embed", "[overnight] embed CLIP"],
    ["cluster", "[overnight] cluster embeddings"],
    ["policy", "[overnight] write style policy"],
    ["qa", "[qa] OK:"],
    ["done", "[overnight] done."],
  ];
  let phase = "starting";
  let lastIndex = -1;
  for (const [key, marker] of markers) {
    const idx = logTail.lastIndexOf(marker);
    if (idx >= 0 && idx >= lastIndex) {
      lastIndex = idx;
      phase = key;
    }
  }
  return phase;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeRelPath = (value) =>
  String(value ?? "")
    .replace(/[\\/]+/g, "/")
    .replace(/^\/+/, "");

const resolveUnderRoot = (rootDir, relPath) => {
  if (!rootDir) return "";
  const rel = normalizeRelPath(relPath);
  if (!rel) return "";
  const rootAbs = path.resolve(rootDir);
  const abs = path.resolve(rootAbs, rel);
  if (abs === rootAbs) return abs;
  if (abs.startsWith(rootAbs + path.sep)) return abs;
  return "";
};

const readRecentThumbs = (indexPath, limit, frameIndex, options) => {
  const sampleLines = clamp(Number(options.sampleLines || 400), 50, 2000);
  const lines = readTailLines(indexPath, sampleLines);
  if (!lines.length) return [];

  const lumaMin = Number.isFinite(options.lumaMin) ? options.lumaMin : 0.05;
  const motionMin = Number.isFinite(options.motionMin) ? options.motionMin : 0.02;
  const mode = options.mode === "either" ? "either" : "both";

  const strict = [];
  const fallback = [];

  for (let i = lines.length - 1; i >= 0 && strict.length < limit; i -= 1) {
    const line = lines[i];
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      const frames = Array.isArray(obj.frames) ? obj.frames : [];
      if (!frames.length) continue;
      const idx = clamp(Number(frameIndex) || 0, 0, frames.length - 1);
      const frameRel = frames[idx] || frames[0];
      if (!frameRel) continue;
      const metrics = obj.metrics || {};
      const luma = Number(metrics.avgLuma ?? 0);
      const motion = Number(metrics.motion ?? 0);
      const meets =
        mode === "either"
          ? luma >= lumaMin || motion >= motionMin
          : luma >= lumaMin && motion >= motionMin;
      const item = {
        presetId: String(obj.presetId ?? ""),
        frameRel,
        luma,
        motion,
      };
      if (meets) {
        strict.push(item);
      } else if (fallback.length < limit) {
        fallback.push(item);
      }
    } catch {
      // ignore
    }
  }

  const thumbs = strict.slice();
  if (thumbs.length < limit) {
    thumbs.push(...fallback.slice(0, limit - thumbs.length));
  }
  return thumbs.reverse();
};

const buildStatus = () => {
  const state = readJson(statePath);
  const current = state?.currentJob ?? {};
  const pack = String(current.pack ?? "");
  const targetFromState = Number(current.targetCount ?? 0);
  const targetCount = targetFromState || getManifestCount(pack);

  const stateOutDir = current?.outDir ? String(current.outDir) : "";
  const outDir = stateOutDir
    ? (path.isAbsolute(stateOutDir)
        ? stateOutDir
        : path.join(projectRoot, stateOutDir))
    : (pack ? path.join(projectRoot, "artifacts", "aivj", pack) : "");
  const indexPath = outDir ? path.join(outDir, "frames-index.jsonl") : "";
  const counts = indexPath ? countIndex(indexPath) : { total: 0, ok: 0, failed: 0, lastPresetId: "" };

  const styleIndexPath = pack
    ? path.join(projectRoot, "public", "presets", pack, "aivj-style-index.v1.json")
    : "";
  const policyPath = pack
    ? path.join(projectRoot, "public", "presets", pack, "aivj-style-policy.v0.json")
    : "";
  const qaIndexPath = outDir ? path.join(outDir, "qa-samples", "index.html") : "";

  const queuePath = resolvePathArg(state?.queuePath ?? "", queuePathDefault);
  const queue = readJson(queuePath);

  const logCandidates = [
    resolveMaybePath(current?.liveLogPath),
    resolveMaybePath(current?.logPath),
  ].filter(Boolean);
  const logPath = logCandidates.find((p) => fs.existsSync(p)) || logCandidates[0] || "";
  const logTail = logPath ? tailLines(readText(logPath), 200) : "";

  return {
    updatedAt: new Date().toISOString(),
    state,
    queue,
    progress: {
      pack,
      status: String(current.status ?? "idle"),
      targetCount,
      indexPath,
      outDir,
      total: counts.total,
      ok: counts.ok,
      failed: counts.failed,
      percent: targetCount > 0 ? Math.min(100, (counts.total / targetCount) * 100) : 0,
      lastPresetId: counts.lastPresetId,
    },
    outputs: {
      styleIndexPath,
      styleIndexReady: styleIndexPath ? fs.existsSync(styleIndexPath) : false,
      policyPath,
      policyReady: policyPath ? fs.existsSync(policyPath) : false,
      qaIndexPath,
      qaReady: qaIndexPath ? fs.existsSync(qaIndexPath) : false,
    },
    log: {
      path: logPath,
      tail: logTail,
      phase: detectPhase(logTail),
    },
  };
};

const host = String(args.get("host", "127.0.0.1"));
const port = Number(args.get("port", "5190"));
const devBase = String(args.get("devBase", "http://127.0.0.1:5174")).replace(/\/+$/, "");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const sendJson = (res, obj) => {
  const payload = JSON.stringify(obj, null, 2);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    ...CORS_HEADERS,
  });
  res.end(payload);
};

const sendText = (res, text, contentType) => {
  res.writeHead(200, {
    "Content-Type": contentType,
    ...CORS_HEADERS,
  });
  res.end(text);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  if (url.pathname === "/api/status") {
    return sendJson(res, buildStatus());
  }

  if (url.pathname === "/api/log") {
    const status = buildStatus();
    const payload = {
      path: status.log.path,
      tail: status.log.tail,
      phase: status.log.phase,
    };
    return sendJson(res, payload);
  }

  if (url.pathname === "/api/thumbs") {
    const status = buildStatus();
    const packParam = String(url.searchParams.get("pack") || status.progress.pack || "");
    const outDir = String(status.progress.outDir ?? "");
    const limit = clamp(Number(url.searchParams.get("n") || "6"), 1, 12);
    const frameIndex = clamp(Number(url.searchParams.get("frame") || "1"), 0, 2);
    const lumaMin = Number(url.searchParams.get("lumaMin") || "0.05");
    const motionMin = Number(url.searchParams.get("motionMin") || "0.02");
    const mode = String(url.searchParams.get("mode") || "both");
    const sampleLines = Number(url.searchParams.get("sampleLines") || "400");
    let indexPath = "";
    let urlForFrame = null;
    if (outDir && fs.existsSync(outDir)) {
      indexPath = path.join(outDir, "frames-index.jsonl");
      urlForFrame = (frameRel) => `/file?path=${encodeURIComponent(frameRel)}`;
    } else if (packParam) {
      indexPath = path.join(projectRoot, "artifacts", "aivj", packParam, "frames-index.jsonl");
      urlForFrame = (frameRel) => `${devBase}/artifacts/aivj/${packParam}/${frameRel}`;
    }
    if (!indexPath || !fs.existsSync(indexPath) || !urlForFrame) {
      return sendJson(res, { pack: packParam, baseUrl: devBase, thumbs: [] });
    }
    const thumbs = readRecentThumbs(indexPath, limit, frameIndex, {
      lumaMin,
      motionMin,
      mode,
      sampleLines,
    }).map((item) => ({
      presetId: item.presetId,
      frameRel: item.frameRel,
      url: urlForFrame(item.frameRel),
      luma: item.luma,
      motion: item.motion,
    }));
    return sendJson(res, {
      pack: packParam,
      baseUrl: devBase,
      filter: { lumaMin, motionMin, mode, sampleLines, frameIndex, limit },
      thumbs,
    });
  }

  if (url.pathname === "/api/run-manifest") {
    const status = buildStatus();
    const outDir = String(status.progress.outDir ?? "");
    const runManifestPath = outDir ? path.join(outDir, "run-manifest.json") : "";
    if (!runManifestPath || !fs.existsSync(runManifestPath)) {
      res.writeHead(404, {
        "Content-Type": "application/json; charset=utf-8",
        ...CORS_HEADERS,
      });
      res.end(JSON.stringify({ error: "run-manifest not found" }));
      return;
    }
    return sendText(res, readText(runManifestPath), "application/json; charset=utf-8");
  }

  if (url.pathname === "/file") {
    const status = buildStatus();
    const outDir = String(status.progress.outDir ?? "");
    const relPath = String(url.searchParams.get("path") ?? "");
    const abs = resolveUnderRoot(outDir, relPath);
    if (!abs || !fs.existsSync(abs)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    const contentType =
      ext === ".webp"
        ? "image/webp"
        : ext === ".png"
          ? "image/png"
          : "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      ...CORS_HEADERS,
    });
    fs.createReadStream(abs).pipe(res);
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    const html = readText(htmlPath);
    return sendText(res, html, "text/html; charset=utf-8");
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(port, host, () => {
  console.log(`[aivj-dashboard] http://${host}:${port}`);
  console.log(`[aivj-dashboard] state=${statePath}`);
  console.log(`[aivj-dashboard] queue=${queuePathDefault}`);
});
