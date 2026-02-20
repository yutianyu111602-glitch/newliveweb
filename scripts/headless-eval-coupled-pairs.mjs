#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import readline from 'node:readline';
import { chromium } from 'playwright';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');

const isoCompact = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}`;
};

const getNpmForwardedArgs = () => {
  const raw = process.env.npm_config_argv;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const remain = Array.isArray(parsed?.remain) ? parsed.remain : [];
    return remain.filter((x) => typeof x === 'string');
  } catch {
    return [];
  }
};

const parseArgs = (args) => {
  const flags = new Map();
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (typeof token !== 'string') continue;
    if (token.startsWith('--')) {
      const name = token.slice(2);
      const next = args[i + 1];
      if (typeof next === 'string' && !next.startsWith('--')) {
        flags.set(name, next);
        i += 1;
      } else {
        flags.set(name, '');
      }
      continue;
    }
    if (token.startsWith('-')) continue;
    positionals.push(token);
  }
  return { flags, positionals };
};

const resolveArg = (parsed, name, fallback = undefined) => {
  if (parsed.flags.has(name)) return parsed.flags.get(name);
  return fallback;
};

const resolveBool = (parsed, name, fallback = false) => {
  const v = resolveArg(parsed, name, undefined);
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (!s) return true;
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
  return fallback;
};

const splitCsv = (value) =>
  String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

const clampInt = (n, min, max) => Math.max(min, Math.min(max, Math.floor(n)));

const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg'];
const isAudioName = (name) => {
  const lower = String(name || '').toLowerCase();
  for (const ext of AUDIO_EXTS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
};

const shortUrlLabel = (url) => {
  const s = String(url || '').trim();
  if (!s) return 'na';
  const noQuery = s.split('?')[0];
  const normalized = noQuery.replace(/\\\\/g, '/');
  const parts = normalized.split('/');
  const last = parts[parts.length - 1] || '';
  return last || normalized || s;
};

// --- Structured error codes for meta.error.code ---
const classifyErrorCode = (error) => {
  const msg = String(error?.message || error || '');
  if (msg.includes('FATAL_WEBGL_SWIFTSHADER')) return 'FATAL_WEBGL_SWIFTSHADER';
  if (msg.includes('MANIFEST_MISMATCH')) return 'FATAL_MANIFEST_MISMATCH';
  if (msg.includes('Timed out waiting for dev server') || msg.includes('Dev server not reachable')) return 'FATAL_VITE_NOT_READY';
  if (/page\.goto.*timeout|navigation.*timeout/i.test(msg)) return 'FATAL_PAGE_GOTO_TIMEOUT';
  if (msg.includes('browserMaxRestarts exceeded')) return 'FATAL_BROWSER_RESTART_LIMIT';
  if (msg.includes('no-samples-collected')) return 'FATAL_NO_SAMPLES';
  if (/browser has been closed|Target closed|Target page.*closed/i.test(msg)) return 'FATAL_PLAYWRIGHT_CRASH';
  if (/audio.*not usable|requireAudio/i.test(msg)) return 'FATAL_AUDIO';
  if (/no free port/i.test(msg)) return 'FATAL_NO_FREE_PORT';
  return 'UNKNOWN';
};

async function pickFirstAudioFileInDir(dirPath) {
  let dir = null;
  try {
    dir = await fsp.opendir(dirPath);
    for await (const ent of dir) {
      if (!ent?.isFile?.()) continue;
      const name = String(ent.name ?? '');
      if (isAudioName(name)) {
        return path.join(dirPath, name);
      }
    }
  } catch {
    // ignore
  } finally {
    try {
      await dir?.close?.();
    } catch {
      // ignore
    }
  }
  return null;
}

async function pickFirstAudioFileInDirDeep(dirPath, opts = {}) {
  const maxSubdirsRaw = Number(opts?.maxSubdirs ?? 80);
  const maxSubdirs = Number.isFinite(maxSubdirsRaw) ? clampInt(maxSubdirsRaw, 0, 500) : 80;

  const rootPick = await pickFirstAudioFileInDir(dirPath);
  if (rootPick) return rootPick;
  if (!maxSubdirs) return null;

  const subdirs = [];
  let dir = null;
  try {
    dir = await fsp.opendir(dirPath);
    for await (const ent of dir) {
      if (!ent?.isDirectory?.()) continue;
      const name = String(ent.name ?? '').trim();
      if (!name) continue;
      subdirs.push(path.join(dirPath, name));
      if (subdirs.length >= maxSubdirs) break;
    }
  } catch {
    // ignore
  } finally {
    try {
      await dir?.close?.();
    } catch {
      // ignore
    }
  }

  for (const sd of subdirs) {
    const found = await pickFirstAudioFileInDir(sd);
    if (found) return found;
  }
  return null;
}

async function resolveAudioSelection(opts = {}) {
  const audioFileRaw = String(opts?.audioFile ?? '').trim();
  const audioRootRaw = String(opts?.audioRoot ?? '').trim();

  const statIsFile = async (p) => {
    if (!p) return false;
    try {
      const st = await fsp.stat(p);
      return st.isFile();
    } catch {
      return false;
    }
  };
  const statIsDir = async (p) => {
    if (!p) return false;
    try {
      const st = await fsp.stat(p);
      return st.isDirectory();
    } catch {
      return false;
    }
  };

  if (audioFileRaw) {
    const abs = path.resolve(audioFileRaw);
    if (!(await statIsFile(abs))) {
      throw new Error(`--audioFile not found or not a file: ${abs}`);
    }
    return { requested: { audioFile: audioFileRaw || null, audioRoot: audioRootRaw || null }, audioFile: abs, pickedFrom: 'audioFile' };
  }

  const candidates = [];
  if (audioRootRaw) candidates.push(audioRootRaw);
  // Default local music roots (non-recursive scan; first matching file wins).
  candidates.push('D:/CloudMusic');
  candidates.push('D:/test MP3');

  for (const root of candidates) {
    const absRoot = path.resolve(String(root || '').trim());
    if (!absRoot) continue;
    if (!(await statIsDir(absRoot))) continue;
    const found = await pickFirstAudioFileInDirDeep(absRoot, { maxSubdirs: 80 });
    if (found && (await statIsFile(found))) {
      return { requested: { audioFile: null, audioRoot: audioRootRaw || null }, audioFile: found, pickedFrom: absRoot };
    }
  }

  return { requested: { audioFile: null, audioRoot: audioRootRaw || null }, audioFile: null, pickedFrom: 'none' };
}

async function sampleVizFromProjectMVerify(page, opts) {
  const intervalMs = clampInt(Number(opts?.intervalMs || 250), 0, 5000);
  const warmupSamples = clampInt(Number(opts?.warmupSamples || 2), 0, 20);
  const measureSamples = clampInt(Number(opts?.measureSamples || 6), 1, 60);
  const total = warmupSamples + measureSamples;

  const read = async () => {
    return await page.evaluate(() => {
      // eslint-disable-next-line no-underscore-dangle
      const v = window.__projectm_verify ?? {};
      const perPm = v?.perPm ?? {};
      const fg = perPm?.fg ?? {};
      const bg = perPm?.bg ?? {};

      const toNum = (x) => {
        const n = Number(x);
        return Number.isFinite(n) ? n : null;
      };

      const fgLuma = toNum(fg?.avgLuma ?? v?.avgLuma);
      const bgLuma = toNum(bg?.avgLuma);

      const fgColor = {
        r: toNum(fg?.avgColorR ?? v?.avgColorR),
        g: toNum(fg?.avgColorG ?? v?.avgColorG),
        b: toNum(fg?.avgColorB ?? v?.avgColorB),
      };
      const bgColor = {
        r: toNum(bg?.avgColorR),
        g: toNum(bg?.avgColorG),
        b: toNum(bg?.avgColorB),
      };

      return { fgLuma, bgLuma, fgColor, bgColor };
    });
  };

  const compositeLuma = (s) => {
    const vals = [];
    if (typeof s?.fgLuma === 'number') vals.push(s.fgLuma);
    if (typeof s?.bgLuma === 'number') vals.push(s.bgLuma);
    if (!vals.length) return null;
    let sum = 0;
    for (const v of vals) sum += v;
    return sum / vals.length;
  };

  const colorDeltaMean = (a, b) => {
    const okColor = (c) =>
      c &&
      typeof c.r === 'number' &&
      typeof c.g === 'number' &&
      typeof c.b === 'number';
    if (!okColor(a) || !okColor(b)) return null;
    const dr = Math.abs(b.r - a.r);
    const dg = Math.abs(b.g - a.g);
    const db = Math.abs(b.b - a.b);
    return (dr + dg + db) / 3;
  };

  let prev = null;
  let lumaSum = 0;
  let lumaN = 0;
  let motionSum = 0;
  let motionN = 0;

  for (let i = 0; i < total; i += 1) {
    if (intervalMs) await page.waitForTimeout(intervalMs);

    const cur = await read();
    const luma = compositeLuma(cur);
    if (luma != null && i >= warmupSamples) {
      lumaSum += luma;
      lumaN += 1;
    }

    if (prev && i >= warmupSamples) {
      const prevL = compositeLuma(prev);
      const dluma = prevL != null && luma != null ? Math.abs(luma - prevL) : null;

      const cVals = [];
      const fgCd = colorDeltaMean(prev.fgColor, cur.fgColor);
      const bgCd = colorDeltaMean(prev.bgColor, cur.bgColor);
      if (fgCd != null) cVals.push(fgCd);
      if (bgCd != null) cVals.push(bgCd);
      const dcolor = cVals.length ? cVals.reduce((a, b) => a + b, 0) / cVals.length : null;

      let motion = null;
      if (dluma != null && dcolor != null) motion = 0.65 * dluma + 0.35 * dcolor;
      else if (dluma != null) motion = dluma;
      else if (dcolor != null) motion = dcolor;

      if (motion != null) {
        motionSum += motion;
        motionN += 1;
      }
    }

    prev = cur;
  }

  return {
    ok: true,
    vizAvgLuma: lumaN ? lumaSum / lumaN : null,
    vizAvgFrameDelta: motionN ? motionSum / motionN : null,
  };
}

function makeWavClickTrack(opts = {}) {
  const sampleRate = Number(opts.sampleRate ?? 44100);
  const bpm = Number(opts.bpm ?? 120);
  const durationSec = Number(opts.durationSec ?? 18);
  const pulseMs = Number(opts.pulseMs ?? 12);
  const amp = Math.max(0, Math.min(1, Number(opts.amp ?? 0.9)));

  const totalSamples = Math.max(1, Math.floor(durationSec * sampleRate));
  const samples = new Int16Array(totalSamples);
  const beatInterval = Math.max(1, Math.floor((60 / bpm) * sampleRate));
  const pulseLen = Math.max(1, Math.floor((pulseMs / 1000) * sampleRate));

  for (let i = 0; i < totalSamples; i += beatInterval) {
    for (let j = 0; j < pulseLen && i + j < totalSamples; j++) {
      const t = j / pulseLen;
      const env = Math.exp(-6 * t);
      const v = Math.round(amp * env * 32767);
      samples[i + j] = Math.max(-32768, Math.min(32767, v));
    }
  }

  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const riffSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(riffSize, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  const data = Buffer.alloc(dataSize);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(samples[i], i * 2);
  }
  return Buffer.concat([header, data]);
}

async function ensureAudioFromFile(page, opts = {}) {
  const audioFile = String(opts?.audioFile ?? '').trim();
  if (!audioFile) return { ok: false, error: 'no-audio-file' };

  const waitMs = clampInt(Number(opts?.waitMs ?? 800), 0, 30_000);
  const requireSignal = Boolean(opts?.requireSignal ?? true);
  const minRms = Number.isFinite(Number(opts?.minRms)) ? Number(opts.minRms) : 0.0005;
  const pollEveryMs = clampInt(Number(opts?.pollEveryMs ?? 200), 50, 2000);

  await page.waitForSelector('#audio-file', { state: 'attached', timeout: 60_000 });
  await page.setInputFiles('#audio-file', audioFile);

  // Keep volume high so analysis has signal. Speaker output is muted via Chromium flag (--mute-audio).
  try {
    await page.waitForSelector('#audio-volume', { state: 'attached', timeout: 15_000 });
    await page.evaluate(() => {
      const el = document.querySelector('#audio-volume');
      if (!(el instanceof HTMLInputElement)) return;
      el.value = '100';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  } catch {
    // ignore
  }

  // Autoplay policy: need a user gesture. Use a real Playwright click.
  await page.mouse.click(10, 10);
  await page.waitForTimeout(120);

  // Wait for the play button to become enabled (load/decode is async).
  try {
    await page.waitForSelector('#audio-toggle', { state: 'attached', timeout: 15_000 });
    await page.waitForFunction(() => {
      const btn = document.querySelector('#audio-toggle');
      return btn instanceof HTMLButtonElement && !btn.disabled;
    }, null, { timeout: 20_000 });
  } catch {
    // ignore
  }

  // If UI still shows "Play", click it to ensure playback starts.
  try {
    await page.waitForSelector('#audio-toggle', { state: 'attached', timeout: 15_000 });
    const toggleText = await page.evaluate(() => {
      const btn = document.querySelector('#audio-toggle');
      return btn instanceof HTMLButtonElement ? String(btn.textContent || '') : '';
    });
    if (/play/i.test(toggleText) || toggleText.includes('\u64ad\u653e')) {
      await page.click('#audio-toggle', { force: true });
    }
  } catch {
    // ignore
  }

  const deadline = Date.now() + waitMs;
  let snap = null;
  let rms = null;
  while (true) {
    snap = await page.evaluate(() => {
      // eslint-disable-next-line no-underscore-dangle
      const pm = window.__projectm_verify ?? {};
      const toNum = (x) => {
        const n = Number(x);
        return Number.isFinite(n) ? n : null;
      };
      return {
        pm: {
          lastAudioRms: toNum(pm?.lastAudioRms),
          lastAudioPeak: toNum(pm?.lastAudioPeak),
        },
      };
    });
    rms = snap?.pm && typeof snap.pm.lastAudioRms === 'number' ? snap.pm.lastAudioRms : null;
    if (!requireSignal) return { ok: true, snapshot: snap };
    if (rms != null && rms >= minRms) return { ok: true, snapshot: snap };
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(pollEveryMs);
  }

  return { ok: false, error: `audio-silent rms=${rms}`, snapshot: snap };
}

async function ensureAudioClickTrack(page, opts = {}) {
  const waitMs = clampInt(Number(opts?.waitMs ?? 800), 0, 30_000);
  const requireSignal = Boolean(opts?.requireSignal ?? true);
  const minRms = Number.isFinite(Number(opts?.minRms)) ? Number(opts.minRms) : 0.0005;
  const bpm = Number.isFinite(Number(opts?.bpm)) ? Number(opts.bpm) : 120;
  const pollEveryMs = clampInt(Number(opts?.pollEveryMs ?? 200), 50, 2000);

  await page.waitForSelector('#audio-file', { state: 'attached', timeout: 60_000 });
  const wav = makeWavClickTrack({ bpm, durationSec: 22 });
  await page.setInputFiles('#audio-file', {
    name: 'eval-click.wav',
    mimeType: 'audio/wav',
    buffer: wav,
  });

  // Keep volume high so analysis has signal. Speaker output is muted via Chromium flag (--mute-audio).
  try {
    await page.waitForSelector('#audio-volume', { state: 'attached', timeout: 15_000 });
    await page.evaluate(() => {
      const el = document.querySelector('#audio-volume');
      if (!(el instanceof HTMLInputElement)) return;
      el.value = '100';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  } catch {
    // ignore
  }

  await page.mouse.click(10, 10);
  await page.waitForTimeout(120);

  // Wait for the play button to become enabled (load/decode is async).
  try {
    await page.waitForSelector('#audio-toggle', { state: 'attached', timeout: 15_000 });
    await page.waitForFunction(() => {
      const btn = document.querySelector('#audio-toggle');
      return btn instanceof HTMLButtonElement && !btn.disabled;
    }, null, { timeout: 20_000 });
  } catch {
    // ignore
  }

  try {
    await page.waitForSelector('#audio-toggle', { state: 'attached', timeout: 15_000 });
    const toggleText = await page.evaluate(() => {
      const btn = document.querySelector('#audio-toggle');
      return btn instanceof HTMLButtonElement ? String(btn.textContent || '') : '';
    });
    if (/play/i.test(toggleText) || toggleText.includes('\u64ad\u653e')) {
      await page.click('#audio-toggle', { force: true });
    }
  } catch {
    // ignore
  }

  const deadline = Date.now() + waitMs;
  let snap = null;
  let rms = null;
  while (true) {
    snap = await page.evaluate(() => {
      // eslint-disable-next-line no-underscore-dangle
      const pm = window.__projectm_verify ?? {};
      const toNum = (x) => {
        const n = Number(x);
        return Number.isFinite(n) ? n : null;
      };
      return {
        pm: {
          lastAudioRms: toNum(pm?.lastAudioRms),
          lastAudioPeak: toNum(pm?.lastAudioPeak),
        },
      };
    });
    rms = snap?.pm && typeof snap.pm.lastAudioRms === 'number' ? snap.pm.lastAudioRms : null;
    if (!requireSignal) return { ok: true, snapshot: snap };
    if (rms != null && rms >= minRms) return { ok: true, snapshot: snap };
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(pollEveryMs);
  }

  return { ok: false, error: `audio-silent rms=${rms}`, snapshot: snap };
}

async function waitForHttpOk(url, timeoutMs = 60_000) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.status >= 200 && res.status < 400) return;
      lastErr = new Error(`HTTP ${res.status} ${res.statusText}`);
    } catch (e) {
      lastErr = e;
    }
    await sleep(400);
  }
  throw lastErr ?? new Error('Timed out waiting for dev server');
}

async function looksLikeViteIndexHtml(url, timeoutMs = 2_500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', headers: { Accept: 'text/html' }, signal: controller.signal });
    if (!(res.status >= 200 && res.status < 400)) return false;
    const text = await res.text();
    return text.includes('/@vite/client') || text.includes('"/@vite/client"') || text.includes("'/@vite/client'");
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForViteDevServer(url, timeoutMs = 2_500) {
  if (await looksLikeViteIndexHtml(url, timeoutMs)) return;
  await waitForHttpOk(url, timeoutMs);
  const viteClientUrl = new URL('/@vite/client', url).toString();
  await waitForHttpOk(viteClientUrl, timeoutMs);
}

/**
 * Probe for a free TCP port starting at `start`, checking up to `maxProbe` ports.
 * Returns the first available port.
 */
async function findFreePort(start = 5174, maxProbe = 50) {
  for (let p = start; p < start + maxProbe; p++) {
    const ok = await new Promise((resolve) => {
      const srv = net.createServer();
      srv.unref();
      srv.on('error', () => resolve(false));
      srv.listen(p, '127.0.0.1', () => {
        srv.close(() => resolve(true));
      });
    });
    if (ok) return p;
  }
  throw new Error(`No free port found in range ${start}–${start + maxProbe - 1}`);
}

async function killProcessTree(child) {
  if (!child || typeof child.pid !== 'number') return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        shell: false,
      });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }
  try {
    child.kill('SIGTERM');
  } catch {
    // ignore
  }
}

async function loadPairsManifest(pack, manifestFilename = 'pairs-manifest.v0.json') {
  const manifestPath = path.join(PROJECT_ROOT, 'public', 'presets', pack, manifestFilename);
  const raw = await fsp.readFile(manifestPath, 'utf8');
  const data = JSON.parse(raw);
  const pairs = Array.isArray(data?.pairs) ? data.pairs : null;
  if (!pairs) throw new Error(`Invalid pairs manifest: ${manifestPath}`);
  const ids = new Set();
  const byId = new Map();
  const pairIdsByIndex = new Array(pairs.length).fill(null);
  const idToIndex = new Map();
  for (let idx = 0; idx < pairs.length; idx += 1) {
    const it = pairs[idx];
    if (!it || typeof it !== 'object') continue;
    const n = Number(it.pair);
    if (!Number.isFinite(n)) continue;
    const pid = Math.floor(n);
    ids.add(pid);
    pairIdsByIndex[idx] = pid;
    if (!idToIndex.has(pid)) idToIndex.set(pid, idx);
    const fgUrl = typeof it.fgUrl === 'string' ? it.fgUrl : null;
    const bgUrl = typeof it.bgUrl === 'string' ? it.bgUrl : null;
    if (fgUrl || bgUrl) byId.set(pid, { fgUrl, bgUrl });
  }
  return { manifestPath, manifestFilename, pairCount: pairs.length, uniquePairIds: ids.size, allowedPairIds: ids, byId, pairIdsByIndex, idToIndex };
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

async function readJsonlVisitedByPack(evalPath) {
  const visitedByPack = new Map();
  const linesByPack = new Map();
  let totalLines = 0;

  if (!evalPath || !fs.existsSync(evalPath)) {
    return { ok: true, totalLines, visitedByPack, linesByPack };
  }

  try {
    const rl = readline.createInterface({
      input: fs.createReadStream(evalPath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line) continue;
      totalLines += 1;
      let obj = null;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const pack = typeof obj?.pack === 'string' ? obj.pack : '';
      const pairRaw = obj?.pair;
      const pair = Number.isFinite(Number(pairRaw)) ? Math.floor(Number(pairRaw)) : null;
      if (!pack || pair == null) continue;

      if (!visitedByPack.has(pack)) visitedByPack.set(pack, new Set());
      visitedByPack.get(pack).add(pair);

      const prev = linesByPack.get(pack) || 0;
      linesByPack.set(pack, prev + 1);
    }
    return { ok: true, totalLines, visitedByPack, linesByPack };
  } catch (e) {
    return { ok: false, error: String(e?.message || e || ''), totalLines, visitedByPack, linesByPack };
  }
}

async function seedCoupledShuffleState(page, { pack, packInfo, visited, reason }) {
  const len = Number(packInfo?.pairCount);
  if (!Number.isFinite(len) || len <= 0) return { ok: false, error: 'bad-len' };
  const ids = Array.isArray(packInfo?.pairIdsByIndex) ? packInfo.pairIdsByIndex : null;
  if (!ids || ids.length !== len) return { ok: false, error: 'bad-ids' };
  const seen = visited && typeof visited?.has === 'function' ? visited : new Set();

  const missingIdx = [];
  const seenIdx = [];
  for (let i = 0; i < len; i += 1) {
    const pid = ids[i];
    if (typeof pid === 'number' && Number.isFinite(pid) && seen.has(pid)) {
      seenIdx.push(i);
    } else {
      missingIdx.push(i);
    }
  }

  shuffleInPlace(missingIdx);
  shuffleInPlace(seenIdx);
  const order = missingIdx.concat(seenIdx);

  try {
    await page.evaluate(
      ({ packName, packLen, packOrder, why }) => {
        try {
          localStorage.setItem(
            'nw.coupledPairs.shuffleState.v0',
            JSON.stringify({
              v: 0,
              pack: String(packName || ''),
              len: Number(packLen) || 0,
              pos: 0,
              order: Array.isArray(packOrder) ? packOrder : [],
              updatedAt: Date.now(),
              seededBy: String(why || ''),
            })
          );
        } catch {
          // ignore
        }
      },
      { packName: pack, packLen: len, packOrder: order, why: reason || 'eval:resume' }
    );
  } catch (e) {
    return { ok: false, error: String(e?.message || e || '') };
  }

  return { ok: true, len, missingFirst: missingIdx.length };
}

async function main() {
  const argv = [...process.argv.slice(2), ...getNpmForwardedArgs()];
  const parsed = parseArgs(argv);

  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('headless-eval-coupled-pairs: run long coupled-pair sampling and export eval.jsonl');
    console.log('Usage: node scripts/headless-eval-coupled-pairs.mjs --pack ai_generated_coupled_final');
    console.log(
      'Flags: --pack/--packs, --host, --port, --coupledPick random|shuffle|weighted, --targetCoverage, --maxHours, --outDir, --reloadEvery, --resume'
    );
    console.log('Sample flags: --downsampleSize, --intervalMs, --warmupSamples, --measureSamples');
    console.log('Bootstrap flags: --presetLibrarySource, --runManifestUrl');
    console.log(
      'Browser flags: --gpuMode off|safe|force-d3d11, --muteAudio (default: true), --startMaximized, --viewportWidth 1280 --viewportHeight 720 --deviceScaleFactor 1.5'
    );
    console.log(
      'Audio flags: --audioMode file|click|none (default: file), --audioFile <absPath> | --audioRoot <dir> (defaults: D:/CloudMusic then D:/test MP3), --requireAudio'
    );
    console.log('Stuck flags: --pickTimeoutMs 10000 --stuckMaxConsecutive 3 --stuckMaxRestarts 6 --browserMaxRestarts 20');
    console.log(
      'Timeout flags: --gotoTimeoutMs 30000 --viteReadyTimeoutMs 90000 (navigation + dev server ready timeouts)'
    );
    console.log(
      'Heuristic flags: --motionMin 0.000015 --lumaMin 0.06 (override okHeuristic thresholds for low-motion / too-dark)'
    );
    console.log('Manifest flags: --pairsManifest pairs-manifest.v0.json (filename inside public/presets/<pack>/, default: pairs-manifest.v0.json)');
    console.log('Vite flags: --noSpawnVite, --vitePort auto|<port> (default: auto), --headed');
    console.log('GPU flags: --requireGpu (fail-fast if SwiftShader detected; implied when --headed + gpuMode!=off)');
    console.log('Resume flags: --resume (continue in existing outDir by reading eval.jsonl/meta.json)');
    process.exitCode = 0;
    return;
  }

  const host = String(resolveArg(parsed, 'host', '127.0.0.1')).trim() || '127.0.0.1';
  const vitePortRaw = String(resolveArg(parsed, 'vitePort', resolveArg(parsed, 'port', 'auto'))).trim();
  const vitePortMode = vitePortRaw.toLowerCase() === 'auto' ? 'auto' : 'fixed';
  const port = await (async () => {
    if (vitePortMode === 'auto') {
      const p = await findFreePort(5174, 50);
      console.log(`[eval] vitePort=auto → resolved to ${p}`);
      return p;
    }
    return Number(vitePortRaw) || 5174;
  })();
  const coupledPickRaw = String(resolveArg(parsed, 'coupledPick', 'random'));
  const coupledPick = (() => {
    const v = coupledPickRaw.trim().toLowerCase();
    if (v === 'random' || v === 'shuffle' || v === 'weighted') return v;
    throw new Error(`Invalid --coupledPick '${coupledPickRaw}'. Expected random|shuffle|weighted.`);
  })();

  const targetSamplesRaw = Number(resolveArg(parsed, 'targetSamples', '0'));
  const targetSamples = Number.isFinite(targetSamplesRaw) ? clampInt(targetSamplesRaw, 0, 2_000_000) : 0;

  const coupledGammaRaw = String(resolveArg(parsed, 'coupledGamma', '')).trim();
  const coupledGamma = coupledGammaRaw ? Number(coupledGammaRaw) : null;
  const coupledExploreRaw = String(resolveArg(parsed, 'coupledExplore', '')).trim();
  const coupledExplore = coupledExploreRaw ? Number(coupledExploreRaw) : null;
  const coupledDedupNRaw = String(resolveArg(parsed, 'coupledDedupN', '')).trim();
  const coupledDedupN = coupledDedupNRaw ? clampInt(Number(coupledDedupNRaw), 0, 1_000_000) : null;
  const coupledDedupPenaltyRaw = String(resolveArg(parsed, 'coupledDedupPenalty', '')).trim();
  const coupledDedupPenalty = coupledDedupPenaltyRaw ? Number(coupledDedupPenaltyRaw) : null;
  const targetCoverageRaw = Number(resolveArg(parsed, 'targetCoverage', '0.99'));
  const targetCoverage = Number.isFinite(targetCoverageRaw)
    ? Math.max(0.01, Math.min(1.0, targetCoverageRaw))
    : 0.99;
  const maxHoursRaw = Number(resolveArg(parsed, 'maxHours', '10'));
  const maxHoursInput = Number.isFinite(maxHoursRaw) ? Math.max(0.01, maxHoursRaw) : 10;
  // P1.2B: 预算下限保护 - 允许重启/导航超时的最小预算 (约 7.2 分钟)
  const MIN_MAX_HOURS = 0.12;
  const maxHoursWasClamped = maxHoursInput < MIN_MAX_HOURS;
  const maxHours = Math.max(MIN_MAX_HOURS, maxHoursInput);
  const maxMs = maxHours * 60 * 60 * 1000;
  if (maxHoursWasClamped) {
    console.warn(`[eval] WARNING: maxHours=${maxHoursInput} is too small for restart-prone flow; clamped to ${maxHours}`);
  }

  const reloadEveryRaw = Number(resolveArg(parsed, 'reloadEvery', '800'));
  const reloadEvery = Number.isFinite(reloadEveryRaw) ? Math.max(0, Math.floor(reloadEveryRaw)) : 800;

  // Keep this aligned with headless-verify.mjs defaults so the app reliably has a preset library
  // in a fresh Playwright context (localStorage is empty by default).
  const presetLibrarySource =
    String(resolveArg(parsed, 'presetLibrarySource', 'run3-crashsafe-15000')).trim() || 'run3-crashsafe-15000';
  const runManifestUrl = String(resolveArg(parsed, 'runManifestUrl', '/run-manifest.json')).trim() || '/run-manifest.json';

  const downsampleSizeRaw = Number(resolveArg(parsed, 'downsampleSize', '12'));
  const downsampleSize = Number.isFinite(downsampleSizeRaw) ? Math.max(2, Math.min(64, Math.floor(downsampleSizeRaw))) : 12;
  const intervalMsRaw = Number(resolveArg(parsed, 'intervalMs', '250'));
  const intervalMs = Number.isFinite(intervalMsRaw) ? Math.max(0, Math.min(5000, Math.floor(intervalMsRaw))) : 250;
  const warmupSamplesRaw = Number(resolveArg(parsed, 'warmupSamples', '2'));
  const warmupSamples = Number.isFinite(warmupSamplesRaw) ? Math.max(0, Math.min(20, Math.floor(warmupSamplesRaw))) : 2;
  const measureSamplesRaw = Number(resolveArg(parsed, 'measureSamples', '6'));
  const measureSamples = Number.isFinite(measureSamplesRaw) ? Math.max(1, Math.min(60, Math.floor(measureSamplesRaw))) : 6;

  const noSpawnVite = resolveBool(parsed, 'noSpawnVite', false);
  const headed = resolveBool(parsed, 'headed', false);
  const resume = resolveBool(parsed, 'resume', false);
  const gpuModeRaw = String(resolveArg(parsed, 'gpuMode', 'safe')).trim().toLowerCase();
  const gpuMode = ['off', 'safe', 'force-d3d11'].includes(gpuModeRaw) ? gpuModeRaw : 'safe';
  const requireGpuExplicit = resolveBool(parsed, 'requireGpu', undefined);
  // Imply --requireGpu when headed + GPU enabled (most common real-hardware path)
  const requireGpu = requireGpuExplicit != null ? requireGpuExplicit : (headed && gpuMode !== 'off');
  const muteAudio = resolveBool(parsed, 'muteAudio', true);
  const startMaximized = resolveBool(parsed, 'startMaximized', false);

  const viewportWidthRaw = Number(resolveArg(parsed, 'viewportWidth', '1280'));
  const viewportWidth = Number.isFinite(viewportWidthRaw) ? clampInt(viewportWidthRaw, 640, 7680) : 1280;
  const viewportHeightRaw = Number(resolveArg(parsed, 'viewportHeight', '720'));
  const viewportHeight = Number.isFinite(viewportHeightRaw) ? clampInt(viewportHeightRaw, 480, 4320) : 720;
  const deviceScaleFactorRaw = Number(resolveArg(parsed, 'deviceScaleFactor', '1.5'));
  const deviceScaleFactor = Number.isFinite(deviceScaleFactorRaw)
    ? Math.max(0.5, Math.min(2, deviceScaleFactorRaw))
    : 1.5;

  const pickTimeoutMsRaw = Number(resolveArg(parsed, 'pickTimeoutMs', '10000'));
  const pickTimeoutMs = Number.isFinite(pickTimeoutMsRaw) ? clampInt(pickTimeoutMsRaw, 500, 60_000) : 10_000;
  const stuckMaxConsecutiveRaw = Number(resolveArg(parsed, 'stuckMaxConsecutive', '3'));
  const stuckMaxConsecutive = Number.isFinite(stuckMaxConsecutiveRaw)
    ? clampInt(stuckMaxConsecutiveRaw, 1, 50)
    : 3;
  const stuckMaxRestartsRaw = Number(resolveArg(parsed, 'stuckMaxRestarts', '6'));
  const stuckMaxRestarts = Number.isFinite(stuckMaxRestartsRaw) ? clampInt(stuckMaxRestartsRaw, 0, 50) : 6;

  const browserMaxRestartsRaw = Number(resolveArg(parsed, 'browserMaxRestarts', '20'));
  const browserMaxRestarts = Number.isFinite(browserMaxRestartsRaw) ? clampInt(browserMaxRestartsRaw, 0, 200) : 20;

  // P0: Configurable timeouts for diagnosability (Step 2)
  const gotoTimeoutMsRaw = Number(resolveArg(parsed, 'gotoTimeoutMs', '30000'));
  const gotoTimeoutMs = Number.isFinite(gotoTimeoutMsRaw) ? clampInt(gotoTimeoutMsRaw, 1000, 300_000) : 30_000;
  const viteReadyTimeoutMsRaw = Number(resolveArg(parsed, 'viteReadyTimeoutMs', '90000'));
  const viteReadyTimeoutMs = Number.isFinite(viteReadyTimeoutMsRaw) ? clampInt(viteReadyTimeoutMsRaw, 5000, 600_000) : 90_000;

  // P5.1: Configurable heuristic thresholds (data-driven defaults from sweep P90/P50 analysis)
  // Old hardcoded: 0.002 motion, 0.06 luma.  Sweep showed P50(motion)=1.14e-5, P95=2.55e-3.
  // Default motionMin=0.000015 ≈ P55 of sweep — splits the pack roughly in half.
  const motionMinRaw = Number(resolveArg(parsed, 'motionMin', '0.000015'));
  const motionMin = Number.isFinite(motionMinRaw) ? Math.max(0, motionMinRaw) : 0.000015;
  const lumaMinRaw = Number(resolveArg(parsed, 'lumaMin', '0.06'));
  const lumaMin = Number.isFinite(lumaMinRaw) ? Math.max(0, Math.min(1, lumaMinRaw)) : 0.06;

  // A) Configurable manifest filename (avoids manual swap workflow for filtered packs)
  const pairsManifest = String(resolveArg(parsed, 'pairsManifest', 'pairs-manifest.v0.json')).trim() || 'pairs-manifest.v0.json';

  const requireAudio = resolveBool(parsed, 'requireAudio', false);
  const audioModeRaw = String(resolveArg(parsed, 'audioMode', 'file')).trim().toLowerCase();
  const audioMode = ['file', 'click', 'none'].includes(audioModeRaw) ? audioModeRaw : 'file';
  const audioFileArg = String(resolveArg(parsed, 'audioFile', '')).trim();
  const audioRootArg = String(resolveArg(parsed, 'audioRoot', '')).trim();
  const audioSel = audioMode === 'file' ? await resolveAudioSelection({ audioFile: audioFileArg, audioRoot: audioRootArg }) : null;
  const audioFile = audioSel?.audioFile ?? null;

  const packsArg = resolveArg(parsed, 'packs', '');
  const packArg = resolveArg(parsed, 'pack', '');
  const packs = [...new Set([...splitCsv(packsArg), ...splitCsv(packArg), ...parsed.positionals])];
  const selectedPacks = packs.length ? packs : ['ai_generated_coupled_final'];

  const outDirArg = resolveArg(parsed, 'outDir', '');
  const outDir = outDirArg
    ? path.resolve(PROJECT_ROOT, outDirArg)
    : path.resolve(PROJECT_ROOT, 'artifacts', 'coupled-eval', isoCompact());
  await ensureDir(outDir);

  const evalPath = path.join(outDir, 'eval.jsonl');
  const metaPath = path.join(outDir, 'meta.json');
  const viteLogPath = path.join(outDir, 'vite.log');

  const baseUrl = `http://${host}:${port}/`;

  // Validate manifests early to fail fast.
  const packManifests = [];
  for (const pack of selectedPacks) {
    const m = await loadPairsManifest(pack, pairsManifest);
    packManifests.push({ pack, ...m });
  }

  // P1.2A: 全局计时统计 - 跟踪启动开销以便诊断时间预算问题
  const timingStats = {
    navTimeoutCount: 0,
    navTotalMs: 0,
    browserRestartCount: 0,
    restartTotalMs: 0,
    audioCheckCount: 0,
    audioCheckFailCount: 0,
    audioCheckTotalMs: 0,
    sampleLoopStartIso: null,
  };

  const makeBaseMeta = (startedAt) => ({
    kind: 'coupled_eval.v0',
    startedAt,
    finishedAt: null,
    urlBase: baseUrl,
    vitePort: port,
    vitePortMode,
    coupledPick,
    targetSamples: targetSamples || null,
    // P1.2A: 时间预算分解
    budget: {
      inputMaxHours: maxHoursInput,
      effectiveMaxHours: maxHours,
      wasClamped: maxHoursWasClamped,
      startTimeIso: startedAt,
      deadlineTimeIso: new Date(new Date(startedAt).getTime() + maxMs).toISOString(),
    },
    coupledParams:
      coupledGamma != null || coupledExplore != null || coupledDedupN != null || coupledDedupPenalty != null
        ? {
          coupledGamma: Number.isFinite(Number(coupledGamma)) ? Number(coupledGamma) : null,
          coupledExplore: Number.isFinite(Number(coupledExplore)) ? Number(coupledExplore) : null,
          coupledDedupN: coupledDedupN,
          coupledDedupPenalty: Number.isFinite(Number(coupledDedupPenalty)) ? Number(coupledDedupPenalty) : null,
        }
        : null,
    packs: packManifests.map((p) => ({
      pack: p.pack,
      manifestFile: p.manifestFilename,
      manifestPath: path.relative(PROJECT_ROOT, p.manifestPath).replace(/\\\\/g, '/'),
      pairCount: p.pairCount,
      uniquePairIds: p.uniquePairIds,
      targetCoverage,
      targetUniquePairs: Math.ceil(p.pairCount * targetCoverage),
    })),
    limits: { maxHours, reloadEvery },
    // P0: Configurable timeouts for meta evidence
    timeouts: { gotoMs: gotoTimeoutMs, viteReadyMs: viteReadyTimeoutMs, gotoWaitUntil: 'domcontentloaded' },
    // P1.2A: 运行时计时统计
    timing: { ...timingStats },
    sample: { downsampleSize, intervalMs, warmupSamples, measureSamples },
    stuck: { pickTimeoutMs, stuckMaxConsecutive, stuckMaxRestarts, browserMaxRestarts },
    heuristic: { motionMin, lumaMin },
    warnings: maxHoursWasClamped ? ['maxHours_too_small_for_restart_prone_flow'] : [],
    fields: {
      tMs: 'unix ms timestamp',
      pack: 'coupled pack id',
      pair: 'pair id',
      warpDiff: 'warp_diff from pairs-manifest (if present)',
      cxDiff: 'cx_diff from pairs-manifest (if present)',
      quality01: 'runtime merged quality01 (if available)',
      intensity01: 'audio-derived intensity01 (if available)',
      vizAvgLuma: 'avg luma proxy derived from __projectm_verify.perPm.{fg,bg}.avgLuma',
      vizAvgFrameDelta: 'avg motion proxy derived from delta(__projectm_verify.perPm avgLuma/avgColor)',
      pmAvgLumaFg: 'ProjectM avgLuma for fg (perPm.fg.avgLuma)',
      pmAvgLumaBg: 'ProjectM avgLuma for bg (perPm.bg.avgLuma)',
      pageErrorsSinceLast: 'count of pageerror since last record',
      consoleErrorsSinceLast: 'count of console.error since last record',
      okHeuristic: 'boolean based on thresholds',
      reasons: 'array of heuristic failure reasons',
    },
    progress: {},
    audio: {
      requireAudio,
      mode: audioMode,
      requested: audioSel?.requested ?? { audioFile: audioFileArg || null, audioRoot: audioRootArg || null },
      pickedFrom: audioSel?.pickedFrom ?? (audioMode === 'click' ? 'click' : 'none'),
      audioFile,
    },
    browser: {
      muteAudio,
      startMaximized,
      viewport: startMaximized
        ? { mode: 'maximized' }
        : { mode: 'fixed', width: viewportWidth, height: viewportHeight, deviceScaleFactor },
    },
  });

  let meta = makeBaseMeta(new Date().toISOString());
  if (resume && fs.existsSync(metaPath)) {
    try {
      const prev = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
      if (prev && prev.kind === 'coupled_eval.v0') {
        const startedAt = typeof prev.startedAt === 'string' ? prev.startedAt : meta.startedAt;
        const errors = Array.isArray(prev.errors) ? prev.errors.slice() : [];
        if (prev.error) {
          errors.push({ at: new Date().toISOString(), ...prev.error });
        }
        meta = {
          ...prev,
          ...makeBaseMeta(startedAt),
          finishedAt: null,
          error: undefined,
          errors,
          resumedAt: new Date().toISOString(),
        };
      }
    } catch {
      // ignore resume meta parse errors; will overwrite with a fresh meta below.
    }
  } else if (!resume && (fs.existsSync(metaPath) || fs.existsSync(evalPath))) {
    // Avoid silently appending to old runs.
    console.warn(
      `[eval] WARNING: outDir already contains meta/eval (${outDir}). Pass --resume to continue safely, or pick a fresh --outDir.`
    );
  }

  await fsp.writeFile(metaPath, `${JSON.stringify({ ...meta, finishedAt: null }, null, 2)}\n`, 'utf8');

  let vite = null;
  let ws = null;
  let browser = null;
  let context = null;
  let page = null;
  let activePack = null;
  let activeIter = 0;
  const viteLog = fs.createWriteStream(viteLogPath, { flags: 'a' });

  const endStream = async (s) => {
    if (!s) return;
    await new Promise((resolve) => {
      try {
        s.end(() => resolve());
      } catch {
        resolve();
      }
    });
  };

  let startMs = Date.now();

  try {
    // Prefer reusing an existing Vite.
    try {
      await waitForViteDevServer(baseUrl, 2_500);
      viteLog.write(`[eval] Reusing existing dev server: ${baseUrl}\n`);
    } catch {
      if (noSpawnVite) {
        throw new Error(`Dev server not reachable at ${baseUrl} (and --noSpawnVite set)`);
      }
      const cmdLine = `npx --no-install vite --host=${host} --port=${port} --strictPort --clearScreen=false`;
      viteLog.write(`[eval] Starting Vite via cmd.exe: ${cmdLine}\n`);
      vite = spawn('cmd.exe', ['/d', '/s', '/c', cmdLine], {
        cwd: PROJECT_ROOT,
        env: { ...process.env, NW_VERIFY: '1', VITE_NW_VERIFY: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      });
      vite.stdout.on('data', (c) => viteLog.write(c));
      vite.stderr.on('data', (c) => viteLog.write(c));
      await waitForHttpOk(baseUrl, viteReadyTimeoutMs);
    }

    ws = fs.createWriteStream(evalPath, { flags: 'a' });

    const resumeState = resume ? await readJsonlVisitedByPack(evalPath) : { ok: true, totalLines: 0, visitedByPack: new Map(), linesByPack: new Map() };
    const visitedByPack = resumeState?.visitedByPack instanceof Map ? resumeState.visitedByPack : new Map();
    if (resume) {
      if (!resumeState?.ok) {
        viteLog.write(`[eval] WARNING: --resume set but failed to read eval.jsonl: ${String(resumeState?.error || 'unknown')}\n`);
      } else {
        const packs = Array.from(visitedByPack.keys()).sort();
        viteLog.write(
          `[eval] resume: loaded eval.jsonl totalLines=${Number(resumeState?.totalLines || 0)} packs=${packs.join(',')}\n`
        );
        for (const p of packs) {
          const nLines = Number(resumeState?.linesByPack?.get?.(p) || 0);
          const nUnique = visitedByPack.get(p)?.size || 0;
          viteLog.write(`[eval] resume: pack=${p} lines=${nLines} uniquePairs=${nUnique}\n`);
        }
      }
    }

    const browserArgs = [
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      // Windows: avoid hanging on localhost when a system proxy is configured.
      '--no-proxy-server',
      // Windows-specific: avoid occlusion heuristics that can pause rendering/timers.
      '--disable-features=CalculateNativeWinOcclusion',
    ];
    if (muteAudio) browserArgs.push('--mute-audio');
    if (startMaximized && headed) browserArgs.push('--start-maximized');
    if (gpuMode !== 'off') {
      // Conservative defaults (similar to headless-verify safe mode).
      browserArgs.push('--enable-gpu-rasterization', '--enable-zero-copy');
      if (gpuMode === 'force-d3d11') {
        browserArgs.push(
          '--use-angle=d3d11',
          '--use-gl=desktop',
          '--ignore-gpu-blocklist',
          '--disable-software-rasterizer'
        );
      }
    }

    browser = await chromium.launch({
      headless: !headed,
      args: browserArgs,
    });

    context = await browser.newContext(
      startMaximized && headed
        ? { viewport: null }
        : {
          viewport: { width: viewportWidth, height: viewportHeight },
          deviceScaleFactor,
        }
    );
    page = await context.newPage();
    page.setDefaultNavigationTimeout(gotoTimeoutMs);
    page.setDefaultTimeout(gotoTimeoutMs);

    // Ensure verify-mode behavior is enabled early enough for bootstrap.
    const initVerifyScript = ({ presetLibrarySource, runManifestUrl }) => {
      try {
        localStorage.setItem('presetLibrarySource', String(presetLibrarySource || 'run3-crashsafe-15000'));
        localStorage.setItem('nw.runManifestUrl', String(runManifestUrl || '/run-manifest.json'));
        localStorage.setItem('nw.aivj.enabled', 'true');
      } catch {
        // ignore
      }

      // eslint-disable-next-line no-underscore-dangle
      window.__nw_verify = window.__nw_verify || {};
      // eslint-disable-next-line no-underscore-dangle
      window.__nw_verify.forcePresetGateOpen = true;
      // eslint-disable-next-line no-underscore-dangle
      window.__nw_verify.disableAutoAudio = true;

      // Visible progress overlay so humans can tell the sampler is alive.
      try {
        const id = 'nw-eval-overlay';
        const mount = () => {
          if (document.getElementById(id)) return;
          const el = document.createElement('div');
          el.id = id;
          el.style.position = 'fixed';
          el.style.left = '8px';
          el.style.top = '8px';
          el.style.zIndex = '999999';
          el.style.padding = '6px 8px';
          el.style.font = '12px/1.25 monospace';
          el.style.whiteSpace = 'pre';
          el.style.borderRadius = '6px';
          el.style.background = 'rgba(0,0,0,0.55)';
          el.style.color = '#e8e8e8';
          el.style.pointerEvents = 'none';
          el.textContent = 'eval: booting...';
          const root = document.body || document.documentElement;
          if (root) root.appendChild(el);
        };
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', mount, { once: true });
        } else {
          mount();
        }
      } catch {
        // ignore
      }

      // Helpers for long-running sampling (attached once per navigation).
      // eslint-disable-next-line no-underscore-dangle
      window.__nw_eval = window.__nw_eval || {};
      // eslint-disable-next-line no-underscore-dangle
      window.__nw_eval.sampleViz = async (opts) => {
        try {
          const selector = String(opts?.selector || '#viz-canvas');
          const source = document.querySelector(selector);
          if (!(source instanceof HTMLCanvasElement)) return { ok: false, error: 'missing-canvas' };

          const downsampleSize = Math.max(2, Math.min(64, Math.floor(Number(opts?.downsampleSize || 12))));
          const intervalMs = Math.max(0, Math.min(5000, Math.floor(Number(opts?.intervalMs || 250))));
          const warmupSamples = Math.max(0, Math.min(20, Math.floor(Number(opts?.warmupSamples || 2))));
          const measureSamples = Math.max(1, Math.min(60, Math.floor(Number(opts?.measureSamples || 6))));
          const total = warmupSamples + measureSamples;

          const size = downsampleSize;
          const sampler =
            typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(size, size) : document.createElement('canvas');
          sampler.width = size;
          sampler.height = size;
          const ctx = sampler.getContext('2d', { willReadFrequently: true });
          if (!ctx) return { ok: false, error: 'no-ctx' };

          let prev = null;
          let lumaSum = 0;
          let lumaN = 0;
          let deltaSum = 0;
          let deltaN = 0;

          const waitFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
          for (let i = 0; i < total; i += 1) {
            await waitFrame();
            if (intervalMs) await new Promise((r) => setTimeout(r, intervalMs));

            ctx.drawImage(source, 0, 0, size, size);
            const image = ctx.getImageData(0, 0, size, size);
            const data = image.data;

            // Luma (sRGB weights).
            let sum = 0;
            for (let j = 0; j < data.length; j += 4) {
              const r = data[j] ?? 0;
              const g = data[j + 1] ?? 0;
              const b = data[j + 2] ?? 0;
              sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
            }
            const n = size * size;
            const avgLuma = n ? sum / (n * 255) : 0;
            if (i >= warmupSamples) {
              lumaSum += avgLuma;
              lumaN += 1;
            }

            if (prev && prev.length === data.length) {
              let diffSum = 0;
              for (let j = 0; j < data.length; j += 4) {
                diffSum += Math.abs((data[j] ?? 0) - (prev[j] ?? 0));
                diffSum += Math.abs((data[j + 1] ?? 0) - (prev[j + 1] ?? 0));
                diffSum += Math.abs((data[j + 2] ?? 0) - (prev[j + 2] ?? 0));
              }
              const avgDelta = n ? diffSum / (n * 3 * 255) : 0;
              if (i >= warmupSamples) {
                deltaSum += avgDelta;
                deltaN += 1;
              }
            }

            if (!prev || prev.length !== data.length) prev = new Uint8ClampedArray(data.length);
            prev.set(data);
          }

          return {
            ok: true,
            vizAvgLuma: lumaN ? lumaSum / lumaN : null,
            vizAvgFrameDelta: deltaN ? deltaSum / deltaN : null,
          };
        } catch (e) {
          return { ok: false, error: String(e?.message || e || '') };
        }
      };
    };

    await page.addInitScript(initVerifyScript, { presetLibrarySource, runManifestUrl });

    let pageErrorCount = 0;
    let consoleErrorCount = 0;
    let pageCrashCount = 0;
    let pageCloseCount = 0;
    // Circular buffer of recent page events for failure evidence
    const pageEventsBuffer = [];
    const PAGE_EVENTS_MAX = 200;
    const pushPageEvent = (type, text) => {
      pageEventsBuffer.push({ ts: new Date().toISOString(), type, text: String(text || '').slice(0, 600) });
      if (pageEventsBuffer.length > PAGE_EVENTS_MAX) pageEventsBuffer.shift();
    };
    // Current lifecycle phase for meta.error diagnostics
    let currentPhase = 'init';
    const attachPageDiagnostics = () => {
      try {
        page.on('pageerror', (err) => {
          pageErrorCount += 1;
          try {
            const msg = String(err?.message || err || '').replace(/\r?\n/g, ' | ').slice(0, 600);
            viteLog.write(`[pageerror] ${msg}\n`);
            pushPageEvent('pageerror', msg);
          } catch {
            // ignore
          }
        });
        page.on('console', (msg) => {
          if (msg.type() !== 'error') return;
          consoleErrorCount += 1;
          try {
            const text = String(msg.text() || '').replace(/\r?\n/g, ' | ').slice(0, 600);
            viteLog.write(`[console.error] ${text}\n`);
            pushPageEvent('console.error', text);
          } catch {
            // ignore
          }
        });
        page.on('requestfailed', (req) => {
          try {
            const text = `${req.url()} ${req.failure()?.errorText || ''}`;
            pushPageEvent('requestfailed', text);
          } catch {
            // ignore
          }
        });
        page.on('crash', () => {
          pageCrashCount += 1;
          try {
            viteLog.write(`[page] crash count=${pageCrashCount}\n`);
          } catch {
            // ignore
          }
        });
        page.on('close', () => {
          pageCloseCount += 1;
          try {
            viteLog.write(`[page] close count=${pageCloseCount}\n`);
          } catch {
            // ignore
          }
        });
      } catch {
        // ignore
      }
    };
    attachPageDiagnostics();

    // Reset startMs to after browser launch so timing excludes vite+browser setup
    startMs = Date.now();
    const deadlineMs = startMs + maxMs;

    const setOverlay = async (text) => {
      try {
        await page.evaluate((t) => {
          const el = document.getElementById('nw-eval-overlay');
          if (el) el.textContent = String(t || '');
        }, String(text || ''));
      } catch {
        // ignore
      }
    };

    const isClosedTargetError = (error) => {
      const msg = String(error?.message || error || '');
      return /Target page, context or browser has been closed/i.test(msg) || /browser has been closed/i.test(msg) || /has been closed/i.test(msg);
    };

    let browserRestartCount = 0;
    const recreateBrowserSession = async (reason, error) => {
      const restartStartMs = Date.now();
      browserRestartCount += 1;
      timingStats.browserRestartCount = browserRestartCount;
      if (browserRestartCount > browserMaxRestarts) {
        throw new Error(`browserMaxRestarts exceeded: ${browserRestartCount}/${browserMaxRestarts}`);
      }
      const errLine = String(error?.message || error || '').replace(/\r?\n/g, ' | ').slice(0, 800);
      try {
        viteLog.write(`[eval] RESTART browser count=${browserRestartCount} reason=${String(reason || '')} err=${errLine}\n`);
      } catch {
        // ignore
      }
      await setOverlay(`eval: restarting browser\nreason=${String(reason || '')}\ncount=${browserRestartCount}\nerr=${errLine}`);

      try {
        if (page) await page.close({ runBeforeUnload: false });
      } catch {
        // ignore
      }
      try {
        if (context) await context.close();
      } catch {
        // ignore
      }
      try {
        if (browser) await browser.close();
      } catch {
        // ignore
      }

      browser = await chromium.launch({
        headless: !headed,
        args: browserArgs,
      });
      context = await browser.newContext(
        startMaximized && headed
          ? { viewport: null }
          : {
            viewport: { width: viewportWidth, height: viewportHeight },
            deviceScaleFactor,
          }
      );
      page = await context.newPage();
      page.setDefaultNavigationTimeout(gotoTimeoutMs);
      page.setDefaultTimeout(gotoTimeoutMs);
      await page.addInitScript(initVerifyScript, { presetLibrarySource, runManifestUrl });
      attachPageDiagnostics();
      // P1.2A: 记录重启耗时
      timingStats.restartTotalMs += Date.now() - restartStartMs;
    };

    for (const packInfo of packManifests) {
      const pack = packInfo.pack;
      activePack = pack;
      activeIter = 0;

      // Time budget is global across packs. If we ran out, stop cleanly instead of
      // bootstrapping a new pack and then collecting 0 samples (which would look like a bug).
      if (Date.now() >= deadlineMs) {
        try {
          viteLog.write(`[eval] time budget exhausted; skipping remaining packs (next=${pack})\n`);
        } catch {
          // ignore
        }
        await setOverlay(`eval: time budget exhausted\nlastPack=${pack}`);
        break;
      }

      const targetUnique = Math.ceil(packInfo.pairCount * targetCoverage);
      const visited = visitedByPack.get(pack) ?? new Set();
      visitedByPack.set(pack, visited);

      if (visited.size >= targetUnique) {
        viteLog.write(`[eval] pack=${pack} already-done visited=${visited.size}/${targetUnique}; skipping sampling\n`);
        meta.progress[pack] = { iter: 0, visited: visited.size, target: targetUnique, done: true };
        await fsp.writeFile(metaPath, `${JSON.stringify({ ...meta, finishedAt: null }, null, 2)}\n`, 'utf8');
        continue;
      }

      const u = new URL(baseUrl);
      u.searchParams.set('coupled', '1');
      u.searchParams.set('coupledPack', pack);
      u.searchParams.set('coupledPick', coupledPick);
      u.searchParams.set('coupling3d', 'on');
      if (pairsManifest && pairsManifest !== 'pairs-manifest.v0.json') {
        u.searchParams.set('coupledManifest', pairsManifest);
      }

      if (Number.isFinite(Number(coupledGamma))) u.searchParams.set('coupledGamma', String(coupledGamma));
      if (Number.isFinite(Number(coupledExplore))) u.searchParams.set('coupledExplore', String(coupledExplore));
      if (typeof coupledDedupN === 'number') u.searchParams.set('coupledDedupN', String(coupledDedupN));
      if (Number.isFinite(Number(coupledDedupPenalty))) u.searchParams.set('coupledDedupPenalty', String(coupledDedupPenalty));

      const url = u.toString();
      viteLog.write(`[eval] pack=${pack} coupledManifest=${pairsManifest} pairCount=${packInfo.pairCount} url=${url}\n`);

      // Audio drive plan (silent output, but must provide non-zero analysis unless explicitly disabled).
      const audioPlan = (() => {
        if (audioMode === 'none') return { mode: 'none', audioFile: null };
        if (audioMode === 'click') return { mode: 'click', audioFile: null };
        if (audioFile) return { mode: 'file', audioFile };
        return requireAudio ? { mode: 'click', audioFile: null } : { mode: 'none', audioFile: null };
      })();

      const bootstrapPack = async (phase) => {
        currentPhase = `bootstrap:${String(phase || 'init')}`;
        viteLog.write(`[eval] pack=${pack} bootstrap phase=${String(phase || '')}\n`);

        // HTTP preflight: verify Vite actually responds before wasting 60s on page.goto
        const httpPreflight = async (targetUrl) => {
          currentPhase = `preflight:${String(phase || 'init')}`;
          const preflightStart = Date.now();
          try {
            const baseOnly = new URL(targetUrl).origin + '/';
            const res = await fetch(baseOnly, { method: 'GET' });
            const ms = Date.now() - preflightStart;
            const result = { ok: res.status >= 200 && res.status < 400, status: res.status, ms };
            viteLog.write(`[eval] pack=${pack} preflight:${result.ok ? 'ok' : 'fail'} status=${res.status} ${ms}ms url=${baseOnly}\n`);
            timingStats.preflightResults = timingStats.preflightResults || [];
            timingStats.preflightResults.push(result);
            return result;
          } catch (e) {
            const ms = Date.now() - preflightStart;
            const result = { ok: false, status: -1, ms, error: String(e?.message || e || '').slice(0, 500) };
            viteLog.write(`[eval] pack=${pack} preflight:error ${ms}ms ${result.error}\n`);
            timingStats.preflightResults = timingStats.preflightResults || [];
            timingStats.preflightResults.push(result);
            return result;
          }
        };

        const gotoWithRetries = async (targetUrl) => {
          currentPhase = `goto:${String(phase || 'init')}`;
          // Run HTTP preflight before 1st attempt to detect Vite-down vs Playwright-navigation issues
          const pf = await httpPreflight(targetUrl);
          if (!pf.ok) {
            viteLog.write(`[eval] pack=${pack} preflight:FAILED — Vite HTTP not reachable, skipping goto retries\n`);
            return false;
          }

          const attempts = 4;
          let lastErr = null;
          for (let i = 1; i <= attempts; i++) {
            try {
              viteLog.write(`[eval] pack=${pack} goto:try${i}/${attempts} url=${targetUrl}\n`);
              // Use domcontentloaded: faster than load/networkidle and avoids hanging on
              // HMR websocket or lazy-loaded resources that prevent 'load' from firing.
              await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: gotoTimeoutMs });
              viteLog.write(`[eval] pack=${pack} goto:ok waitUntil=domcontentloaded\n`);
              return true;
            } catch (err) {
              lastErr = err;
              const msg = String(err?.message || err || 'goto error');
              viteLog.write(`[eval] pack=${pack} goto:warn${i} timeout=${gotoTimeoutMs}ms ${msg}\n`);
              // P1.2A: 记录导航超时计数
              if (msg.toLowerCase().includes('timeout')) {
                timingStats.navTimeoutCount += 1;
                timingStats.navTotalMs += gotoTimeoutMs;
              }
              // Screenshot on failure for evidence
              try {
                const screenshotPath = path.join(outDir, `nav_fail_try${i}.png`);
                await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
                viteLog.write(`[eval] pack=${pack} goto:screenshot saved ${screenshotPath}\n`);
              } catch { /* ignore */ }
              // If this looks like a transient navigation error, backoff and retry.
              await new Promise((r) => setTimeout(r, 600));
            }
          }
          // Final fallback: even if goto never reported success, the page might still be alive.
          // We proceed to selector-based readiness checks below; they'll throw if truly dead.
          if (lastErr) {
            viteLog.write(`[eval] pack=${pack} goto:failed (continuing to selector checks) ${String(lastErr)}\n`);
            // Dump page events buffer for post-mortem
            try {
              const eventsPath = path.join(outDir, `playwright-events-${pack}.log`);
              const eventsText = pageEventsBuffer.map((e) => `${e.ts} [${e.type}] ${e.text}`).join('\n');
              await fsp.writeFile(eventsPath, eventsText + '\n', 'utf8');
              viteLog.write(`[eval] pack=${pack} events log dumped: ${eventsPath} (${pageEventsBuffer.length} events)\n`);
            } catch { /* ignore */ }
          }
          return false;
        };

        currentPhase = `goto:${String(phase || 'init')}`;
        viteLog.write(`[eval] pack=${pack} goto:start host=${host}\n`);
        let gotoOk = await gotoWithRetries(url);

        // Step 3: Host fallback — if goto failed with primary host, try alternate
        if (!gotoOk) {
          const altHost = host === '127.0.0.1' ? 'localhost' : host === 'localhost' ? '127.0.0.1' : null;
          if (altHost) {
            const altUrl = url.replace(`//${host}:`, `//${altHost}:`);
            viteLog.write(`[eval] pack=${pack} goto:host-fallback trying ${altHost}\n`);
            timingStats.hostFallbackAttempted = true;
            gotoOk = await gotoWithRetries(altUrl);
            if (gotoOk) {
              viteLog.write(`[eval] pack=${pack} goto:host-fallback succeeded with ${altHost}\n`);
              timingStats.hostFallbackSucceeded = true;
              timingStats.effectiveHost = altHost;
            } else {
              viteLog.write(`[eval] pack=${pack} goto:host-fallback also failed with ${altHost}\n`);
              timingStats.hostFallbackSucceeded = false;
            }
          }
        }

        // Treat core DOM attachment as the real readiness signal.
        // If navigation is still "in flight", Playwright can block selector waits;
        // tolerate that by using a longer timeout here.
        currentPhase = `dom_ready:${String(phase || 'init')}`;
        await page.waitForSelector('#viz-canvas', { state: 'attached', timeout: 90_000 });
        await page.waitForSelector('#preset-next', { state: 'attached', timeout: 90_000 });
        viteLog.write(`[eval] pack=${pack} preset-next:attached\n`);

        // Ensure auto-cycle is off.
        await page.evaluate(() => {
          const el = document.querySelector('#preset-auto-toggle');
          if (!(el instanceof HTMLInputElement)) return;
          if (!el.checked) return;
          el.checked = false;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        viteLog.write(`[eval] pack=${pack} preset-auto-toggle:off\n`);

        // Ensure verify hooks are available.
        await page.waitForFunction(() => {
          // eslint-disable-next-line no-underscore-dangle
          return typeof window.__nw_verify?.getVerifyState === 'function';
        }, null, { timeout: 60_000 });
        viteLog.write(`[eval] pack=${pack} verify-hooks:ok\n`);
        try {
          await page.waitForFunction(() => (window).__nw_verify?.ready === true, null, { timeout: 60_000 });
          viteLog.write(`[eval] pack=${pack} verify-ready:ok\n`);
        } catch {
          viteLog.write(`[eval] pack=${pack} verify-ready:timeout\n`);
        }

        // Re-assert verify flags (bootstrap may replace the object).
        await page.evaluate(() => {
          // eslint-disable-next-line no-underscore-dangle
          window.__nw_verify = window.__nw_verify || {};
          // eslint-disable-next-line no-underscore-dangle
          window.__nw_verify.forcePresetGateOpen = true;
          // eslint-disable-next-line no-underscore-dangle
          window.__nw_verify.disableAutoAudio = true;
        });

        // Ensure coupled manifest is actually loaded so coupled.enabled flips true.
        // Clicking preset-next can be blocked by gates early in boot; this action forces the load path.
        try {
          const initOk = await page.evaluate(async (expectedPack) => {
            // eslint-disable-next-line no-underscore-dangle
            const a = (window.__nw_verify && window.__nw_verify.actions) || null;
            const fn = a && typeof a.coupledInit === 'function' ? a.coupledInit : null;
            if (!fn) return null;
            // Some implementations ignore the arg; it's fine.
            return await fn(`eval:${String(expectedPack || '')}`);
          }, pack);
          viteLog.write(`[eval] pack=${pack} coupledInit ok=${String(initOk)}\n`);
        } catch (e) {
          viteLog.write(`[eval] pack=${pack} coupledInit error=${String(e?.message || e || '')}\n`);
        }

        try {
          await page.waitForFunction(
            (expectedPack) => {
              // eslint-disable-next-line no-underscore-dangle
              const s = window.__nw_verify?.getVerifyState?.();
              const c = s?.coupled;
              return Boolean(c?.enabled) && String(c?.pack || '') === String(expectedPack);
            },
            pack,
            { timeout: 60_000 }
          );
          viteLog.write(`[eval] pack=${pack} coupled-enabled:ok\n`);
        } catch {
          let snap = null;
          try {
            snap = await page.evaluate(() => {
              // eslint-disable-next-line no-underscore-dangle
              return window.__nw_verify?.getVerifyState?.() ?? null;
            });
          } catch {
            // ignore
          }
          viteLog.write(`[eval] pack=${pack} coupled-enabled:timeout snapshot=${JSON.stringify(snap)}\n`);
        }

        // If we already collected samples for this pack and we're using shuffle mode,
        // seed the shuffle state so the runtime prioritizes "missing" pairs first.
        // This avoids wasting hours re-visiting already-covered pairs after a restart/resume.
        if (coupledPick === 'shuffle' && visited.size > 0) {
          const seeded = await seedCoupledShuffleState(page, {
            pack,
            packInfo,
            visited,
            reason: `eval:resume visited=${visited.size}`,
          });
          viteLog.write(
            `[eval] pack=${pack} seed-shuffle ok=${Boolean(seeded?.ok)} missingFirst=${seeded?.missingFirst ?? 'na'}/${seeded?.len ?? 'na'}\n`
          );
        }

        // Audio drive (speaker output muted via Chromium flag when enabled; analysis must be non-zero).
        currentPhase = `audio_probe:${String(phase || 'init')}`;
        if (audioPlan.mode === 'file' && audioPlan.audioFile) {
          const audio = await ensureAudioFromFile(page, { audioFile: audioPlan.audioFile, waitMs: 1200, requireSignal: true });
          if (!audio.ok) {
            viteLog.write(
              `[eval] pack=${pack} audio:file FAILED err=${String(audio?.error || 'unknown')}; falling back to click-track\n`
            );
            const fallback = await ensureAudioClickTrack(page, { waitMs: 1200, requireSignal: true, bpm: 120 });
            const pm = fallback?.snapshot?.pm ?? null;
            const rms = pm && typeof pm.lastAudioRms === 'number' ? pm.lastAudioRms : null;
            const peak = pm && typeof pm.lastAudioPeak === 'number' ? pm.lastAudioPeak : null;
            viteLog.write(
              `[eval] pack=${pack} audio:click(fallback) ok=${Boolean(fallback?.ok)} muted=${muteAudio ? 1 : 0} lastAudioRms=${rms} lastAudioPeak=${peak}\n`
            );
            if (!fallback.ok) throw new Error(`audio(file+fallback) not usable: ${fallback.error || 'unknown'}`);
          } else {
            const pm = audio?.snapshot?.pm ?? null;
            const rms = pm && typeof pm.lastAudioRms === 'number' ? pm.lastAudioRms : null;
            const peak = pm && typeof pm.lastAudioPeak === 'number' ? pm.lastAudioPeak : null;
            viteLog.write(
              `[eval] pack=${pack} audio:file ok=${Boolean(audio?.ok)} muted=${muteAudio ? 1 : 0} lastAudioRms=${rms} lastAudioPeak=${peak}\n`
            );
          }
        } else if (audioPlan.mode === 'click') {
          const audio = await ensureAudioClickTrack(page, { waitMs: 1200, requireSignal: true, bpm: 120 });
          const pm = audio?.snapshot?.pm ?? null;
          const rms = pm && typeof pm.lastAudioRms === 'number' ? pm.lastAudioRms : null;
          const peak = pm && typeof pm.lastAudioPeak === 'number' ? pm.lastAudioPeak : null;
          viteLog.write(
            `[eval] pack=${pack} audio:click ok=${Boolean(audio?.ok)} muted=${muteAudio ? 1 : 0} lastAudioRms=${rms} lastAudioPeak=${peak}\n`
          );
          if (!audio.ok) throw new Error(`audio(click) not usable: ${audio.error || 'unknown'}`);
        } else {
          viteLog.write(`[eval] pack=${pack} audio:none\n`);
          if (requireAudio) throw new Error('requireAudio set but audio mode is none');
        }

        try {
          currentPhase = `webgl_probe:${String(phase || 'init')}`;
          const glInfo = await page.evaluate(() => {
            try {
              const c = document.createElement('canvas');
              const gl =
                c.getContext('webgl2', { preserveDrawingBuffer: false }) ||
                c.getContext('webgl', { preserveDrawingBuffer: false });
              if (!gl) return { ok: false, error: 'no-webgl' };
              const anyGl = gl;
              const ext = anyGl.getExtension?.('WEBGL_debug_renderer_info');
              const vendor = ext
                ? String(anyGl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '')
                : String(anyGl.getParameter(anyGl.VENDOR) || '');
              const renderer = ext
                ? String(anyGl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '')
                : String(anyGl.getParameter(anyGl.RENDERER) || '');
              return { ok: true, vendor, renderer };
            } catch (e) {
              return { ok: false, error: String(e?.message || e || '') };
            }
          });
          viteLog.write(`[eval] pack=${pack} webgl=${JSON.stringify(glInfo)}\n`);
          try {
            meta.runtime = meta.runtime || {};
            meta.runtime.gpuMode = gpuMode;
            meta.runtime.headed = headed;
            meta.runtime.requireGpu = requireGpu;
            meta.runtime.webgl = glInfo;
            await fsp.writeFile(metaPath, `${JSON.stringify({ ...meta, finishedAt: null }, null, 2)}\n`, 'utf8');
          } catch {
            // ignore
          }

          const renderer = String(glInfo?.renderer || '');
          const isSwiftShader = renderer && renderer.toLowerCase().includes('swiftshader');
          if (gpuMode !== 'off' && isSwiftShader) {
            const msg = `FATAL_WEBGL_SWIFTSHADER: renderer="${renderer}". On Windows, use --headed to actually use the RTX GPU.`;
            viteLog.write(`[eval] ${msg}\n`);
            if (requireGpu) {
              try {
                meta.runtime = meta.runtime || {};
                meta.error = { code: 'FATAL_WEBGL_SWIFTSHADER', renderer, message: msg };
                await fsp.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
              } catch { /* ignore */ }
              throw new Error(msg);
            }
          }
        } catch (glErr) {
          // SwiftShader fail-fast errors must propagate; swallow only non-fatal WebGL probe errors
          if (glErr?.message?.includes('FATAL_WEBGL_SWIFTSHADER')) throw glErr;
        }

        // Coupled should be enabled for this pack before we start sampling, but on some runs
        // the flag can lag even though picks are already switchable. Treat this as best-effort;
        // the self-test below is the real guardrail.
        await setOverlay(`eval: starting\npack=${pack}\nwaiting coupled...`);
        try {
          await page.waitForFunction(
            (expectedPack) => {
              // eslint-disable-next-line no-underscore-dangle
              const s = window.__nw_verify?.getVerifyState?.();
              const c = s?.coupled;
              if (!c) return false;
              const packOk = String(c?.pack || '') === String(expectedPack);
              if (!packOk) return false;
              // Either explicitly enabled, or we've at least recorded a pick timestamp.
              const hasPickTime = typeof c?.lastPick?.timeMs === 'number' && c.lastPick.timeMs > 0;
              return Boolean(c?.enabled) || hasPickTime;
            },
            pack,
            { timeout: 60_000 }
          );
          viteLog.write(`[eval] pack=${pack} coupled-ready:ok\n`);
        } catch {
          let snap = null;
          try {
            snap = await page.evaluate(() => {
              // eslint-disable-next-line no-underscore-dangle
              return window.__nw_verify?.getVerifyState?.() ?? null;
            });
          } catch {
            // ignore
          }
          viteLog.write(`[eval] pack=${pack} coupled-ready:timeout snapshot=${JSON.stringify(snap)}\n`);
        }

        // Ensure ProjectM is actually running before we start driving coupled picks.
        // cycleToNextCoupledPair() is gated on projectLayerReady, so without this
        // the UI click can be a no-op (lastPick stays null).
        await setOverlay(`eval: waiting render\npack=${pack}`);
        try {
          await page.waitForFunction(
            () => {
              // eslint-disable-next-line no-underscore-dangle
              const s = window.__nw_verify?.getVerifyState?.();
              const v = s?.projectmVerify;
              const frames = Number(v?.framesRendered ?? 0);
              return Boolean(v?.initialized) && frames >= 10 && !v?.aborted;
            },
            null,
            { timeout: 90_000 }
          );
          const v = await page.evaluate(() => {
            // eslint-disable-next-line no-underscore-dangle
            return window.__nw_verify?.getVerifyState?.()?.projectmVerify ?? null;
          });
          viteLog.write(
            `[eval] pack=${pack} projectm-ready ok=1 frames=${Number(v?.framesRendered ?? 0)} aborted=${Number(v?.aborted ? 1 : 0)}\n`
          );
        } catch {
          let snap = null;
          try {
            snap = await page.evaluate(() => {
              // eslint-disable-next-line no-underscore-dangle
              return window.__nw_verify?.getVerifyState?.() ?? null;
            });
          } catch {
            // ignore
          }
          viteLog.write(`[eval] pack=${pack} projectm-ready:timeout snapshot=${JSON.stringify(snap)}\n`);
        }

        // Self-test: ensure we can actually advance picks (otherwise abort early).
        await setOverlay(`eval: self-test\npack=${pack}`);
        const dumpVerifySnapshot = async (label) => {
          try {
            const snap = await page.evaluate(() => {
              // eslint-disable-next-line no-underscore-dangle
              const s = window.__nw_verify?.getVerifyState?.() ?? null;
              const v = s?.projectmVerify ?? null;
              const statusEl = document.querySelector('#preset-status');
              // eslint-disable-next-line no-underscore-dangle
              const debug = window.__nw_verify?._coupledNextDebug ?? null;
              return {
                href: String(location?.href || ''),
                projectmVerify: v
                  ? {
                    initialized: Boolean(v.initialized),
                    framesRendered: Number(v.framesRendered ?? 0),
                    lastRenderTimeMs: Number(v.lastRenderTimeMs ?? 0),
                    aborted: Boolean(v.aborted),
                    abortReason: v.abortReason ?? null,
                  }
                  : null,
                presetStatus: String(statusEl?.textContent || '').trim() || null,
                coupled: s?.coupled ?? null,
                presetIds: s?.presetIds ?? null,
                coupledNextDebug: debug,
                pm: s?.pm
                  ? {
                    initialized: s.pm.initialized,
                    framesRendered: s.pm.framesRendered,
                    lastRenderTimeMs: s.pm.lastRenderTimeMs,
                    lastAudioRms: s.pm.lastAudioRms,
                    lastAudioPeak: s.pm.lastAudioPeak,
                  }
                  : null,
              };
            });
            viteLog.write(`[eval] pack=${pack} self-test snapshot:${label} ${JSON.stringify(snap)}\n`);
          } catch {
            // ignore
          }
        };

        const selfPickTimeoutMs = Math.max(pickTimeoutMs, 30_000);
        for (let st = 0; st < 2; st += 1) {
          const prevTime = await page.evaluate(() => {
            // eslint-disable-next-line no-underscore-dangle
            const s = window.__nw_verify?.getVerifyState?.();
            const t = s?.coupled?.lastPick?.timeMs;
            return typeof t === 'number' ? t : 0;
          });
          await page.waitForFunction(() => {
            const el = document.querySelector('#preset-next');
            return el instanceof HTMLButtonElement && !el.disabled;
          }, null, { timeout: 15_000 });
          // Prefer the verify action hook (bypasses flaky DOM click wiring/gates under headless).
          await page.evaluate(() => {
            // eslint-disable-next-line no-underscore-dangle
            const a = (window.__nw_verify && window.__nw_verify.actions) || null;
            const fn = a && typeof a.coupledNext === 'function' ? a.coupledNext : null;
            if (fn) {
              try {
                void fn('eval:self-test');
                return;
              } catch {
                // ignore
              }
            }
            const el = document.querySelector('#preset-next');
            if (el instanceof HTMLButtonElement) el.click();
          });
          try {
            await page.waitForFunction(
              (prev) => {
                // eslint-disable-next-line no-underscore-dangle
                const s = window.__nw_verify?.getVerifyState?.();
                const t = s?.coupled?.lastPick?.timeMs;
                return typeof t === 'number' && t !== prev;
              },
              prevTime,
              { timeout: selfPickTimeoutMs }
            );
          } catch (e) {
            await dumpVerifySnapshot(`pick-timeout st=${st}`);
            throw e;
          }

          // Ensure the pick actually applied (avoid passing self-test while presets never load).
          const expected = await page.evaluate((expectedPack) => {
            // eslint-disable-next-line no-underscore-dangle
            const s = window.__nw_verify?.getVerifyState?.();
            const c = s?.coupled;
            const lastPick = c?.lastPick;
            const pair = Number(lastPick?.pair);
            const pid = Number.isFinite(pair) ? Math.floor(pair) : null;
            const pack = String(c?.pack || '');
            const expPack = String(expectedPack || '');
            if (pid == null || !pack || pack !== expPack) return { ok: false, pid: null, expFg: null, expBg: null };
            return {
              ok: true,
              pid,
              expFg: `coupled:${expPack}:${pid}:fg`,
              expBg: `coupled:${expPack}:${pid}:bg`,
            };
          }, pack);
          if (!expected?.ok) throw new Error('self-test:missing-pair-after-click');
          try {
            await page.waitForFunction(
              ({ expFg, expBg }) => {
                // eslint-disable-next-line no-underscore-dangle
                const s = window.__nw_verify?.getVerifyState?.();
                const presetIds = s?.presetIds;
                return String(presetIds?.fg || '') === String(expFg) && String(presetIds?.bg || '') === String(expBg);
              },
              { expFg: expected.expFg, expBg: expected.expBg },
              { timeout: selfPickTimeoutMs }
            );
          } catch (e) {
            await dumpVerifySnapshot(`presetIds-timeout st=${st}`);
            throw e;
          }

          // Give ProjectM a beat to render at least one frame after apply.
          await sleep(250);
        }
        viteLog.write(`[eval] pack=${pack} self-test:ok\n`);
      };

      const bootstrapWithRetries = async (phase) => {
        let bootAttempts = 0;
        const isRecoverable = (error) => {
          if (isClosedTargetError(error)) return true;
          const msg = String(error?.message || error || '').toLowerCase();
          // Audio can be flaky across reload/restart boundaries on Windows Chromium; treat it as recoverable.
          if (msg.includes('audio-silent')) return true;
          if (msg.includes('audio(') && msg.includes('not usable')) return true;
          if (msg.includes('requireaudio')) return true;
          return false;
        };
        while (true) {
          try {
            await bootstrapPack(
              bootAttempts ? `${String(phase || 'boot')}:retry${bootAttempts}` : String(phase || 'boot')
            );
            return;
          } catch (error) {
            if (!isRecoverable(error) || bootAttempts >= stuckMaxRestarts) throw error;
            bootAttempts += 1;
            await recreateBrowserSession(`bootstrap:${pack}`, error);
          }
        }
      };

      await bootstrapWithRetries('init');

      // P1.2A: 标记采样循环开始时间
      currentPhase = 'sampling';
      if (!timingStats.sampleLoopStartIso) {
        timingStats.sampleLoopStartIso = new Date().toISOString();
        meta.timing = { ...timingStats };
        await fsp.writeFile(metaPath, `${JSON.stringify({ ...meta, finishedAt: null }, null, 2)}
`, 'utf8');
      }

      let iter = 0;
      let lastPageErr = pageErrorCount;
      let lastConsoleErr = consoleErrorCount;
      let consecutivePickTimeouts = 0;
      let recoveries = 0;

      while ((targetSamples ? iter < targetSamples : visited.size < targetUnique) && Date.now() < deadlineMs) {
        iter += 1;
        activeIter = iter;
        try {
          if (reloadEvery && iter % reloadEvery === 0) {
            viteLog.write(`[eval] pack=${pack} reload iter=${iter}\n`);
            await page.reload({ waitUntil: 'commit', timeout: 60_000 });
            await page.waitForSelector('#preset-next', { state: 'attached', timeout: 60_000 });
            await page.waitForFunction(() => {
              // eslint-disable-next-line no-underscore-dangle
              return typeof window.__nw_verify?.getVerifyState === 'function';
            }, null, { timeout: 60_000 });
            await page.evaluate(() => {
              // eslint-disable-next-line no-underscore-dangle
              window.__nw_verify = window.__nw_verify || {};
              // eslint-disable-next-line no-underscore-dangle
              window.__nw_verify.forcePresetGateOpen = true;
              // eslint-disable-next-line no-underscore-dangle
              window.__nw_verify.disableAutoAudio = true;
            });

            // Ensure auto-cycle stays off after reload.
            await page.evaluate(() => {
              const el = document.querySelector('#preset-auto-toggle');
              if (!(el instanceof HTMLInputElement)) return;
              if (!el.checked) return;
              el.checked = false;
              el.dispatchEvent(new Event('change', { bubbles: true }));
            });

            // Reload kills audio; re-drive it.
            const reloadAudioWaitMs = 1800;
            const reloadAudioAttempts = 3;
            let reloadAudioOk = true;
            let reloadAudioErr = null;
            if (audioPlan.mode === 'file' && audioPlan.audioFile) {
              reloadAudioOk = false;
              for (let attempt = 1; attempt <= reloadAudioAttempts; attempt += 1) {
                const a = await ensureAudioFromFile(page, {
                  audioFile: audioPlan.audioFile,
                  waitMs: reloadAudioWaitMs,
                  pollEveryMs: 200,
                  requireSignal: true,
                });
                if (a.ok) {
                  reloadAudioOk = true;
                  break;
                }
                reloadAudioErr = a?.error || 'unknown';
                viteLog.write(
                  `[eval] pack=${pack} reload audio:file FAILED attempt=${attempt}/${reloadAudioAttempts} err=${String(
                    reloadAudioErr
                  )}; falling back to click-track\n`
                );
                const fb = await ensureAudioClickTrack(page, { waitMs: reloadAudioWaitMs, pollEveryMs: 200, requireSignal: true, bpm: 120 });
                if (fb.ok) {
                  reloadAudioOk = true;
                  break;
                }
                reloadAudioErr = fb?.error || reloadAudioErr;
                await page.waitForTimeout(300);
              }
            } else if (audioPlan.mode === 'click') {
              reloadAudioOk = false;
              for (let attempt = 1; attempt <= reloadAudioAttempts; attempt += 1) {
                const a = await ensureAudioClickTrack(page, { waitMs: reloadAudioWaitMs, pollEveryMs: 200, requireSignal: true, bpm: 120 });
                if (a.ok) {
                  reloadAudioOk = true;
                  break;
                }
                reloadAudioErr = a?.error || 'unknown';
                await page.waitForTimeout(300);
              }
            } else if (requireAudio) {
              reloadAudioOk = false;
              reloadAudioErr = 'requireAudio set but audio mode is none (after reload)';
            }

            if (!reloadAudioOk) {
              const err = new Error(`reload audio failed: ${String(reloadAudioErr || 'unknown')}`);
              viteLog.write(`[eval] pack=${pack} reload audio FAILED -> restart browser (${err.message})\n`);
              await recreateBrowserSession(`reload-audio:${pack}:${iter}`, err);
              await bootstrapWithRetries(`reload-audio-restart${browserRestartCount}`);
              consecutivePickTimeouts = 0;
              lastPageErr = pageErrorCount;
              lastConsoleErr = consoleErrorCount;
              await setOverlay(`eval: resumed after audio restart\npack=${pack}\niter=${iter}\nvisited=${visited.size}/${targetUnique}`);
              continue;
            }

            // Coupled must stay enabled after reload (avoid silently collecting nothing).
            try {
              await page.waitForFunction(
                (expectedPack) => {
                  // eslint-disable-next-line no-underscore-dangle
                  const s = window.__nw_verify?.getVerifyState?.();
                  const c = s?.coupled;
                  if (!c) return false;
                  return Boolean(c?.enabled) && String(c?.pack || '') === String(expectedPack);
                },
                pack,
                { timeout: 60_000 }
              );
            } catch {
              let snap = null;
              try {
                snap = await page.evaluate(() => {
                  // eslint-disable-next-line no-underscore-dangle
                  return window.__nw_verify?.getVerifyState?.() ?? null;
                });
              } catch {
                // ignore
              }
              viteLog.write(`[eval] pack=${pack} coupled-after-reload:timeout snapshot=${JSON.stringify(snap)}\n`);
            }
          }

          const prevTime = await page.evaluate(() => {
            // eslint-disable-next-line no-underscore-dangle
            const s = window.__nw_verify?.getVerifyState?.();
            const t = s?.coupled?.lastPick?.timeMs;
            return typeof t === 'number' ? t : 0;
          });

          let waitPhase = 'button';
          try {
            // Require the UI to be actually clickable (don’t bypass disabled buttons).
            await page.waitForFunction(() => {
              const el = document.querySelector('#preset-next');
              return el instanceof HTMLButtonElement && !el.disabled;
            }, null, { timeout: pickTimeoutMs });

            // Trigger coupled pair cycle via preset-next (same path as a human click).
            await page.evaluate(() => {
              // eslint-disable-next-line no-underscore-dangle
              const a = (window.__nw_verify && window.__nw_verify.actions) || null;
              const fn = a && typeof a.coupledNext === 'function' ? a.coupledNext : null;
              if (fn) {
                try {
                  void fn('eval:iter');
                  return;
                } catch {
                  // ignore
                }
              }
              const el = document.querySelector('#preset-next');
              if (el instanceof HTMLButtonElement) el.click();
            });

            // Wait for a new pick entry.
            waitPhase = 'pick';
            await page.waitForFunction(
              (prev) => {
                // eslint-disable-next-line no-underscore-dangle
                const s = window.__nw_verify?.getVerifyState?.();
                const t = s?.coupled?.lastPick?.timeMs;
                return typeof t === 'number' && t !== prev;
              },
              prevTime,
              { timeout: pickTimeoutMs }
            );

            // Ensure the actual preset ids have been applied for this pick.
            waitPhase = 'presetIds';
            const expected = await page.evaluate((expectedPack) => {
              // eslint-disable-next-line no-underscore-dangle
              const s = window.__nw_verify?.getVerifyState?.();
              const c = s?.coupled;
              const lastPick = c?.lastPick;
              const pair = Number(lastPick?.pair);
              const pid = Number.isFinite(pair) ? Math.floor(pair) : null;
              const pack = String(c?.pack || '');
              const expPack = String(expectedPack || '');
              if (pid == null || !pack || pack !== expPack) return { ok: false, pid: null, expFg: null, expBg: null };
              return {
                ok: true,
                pid,
                expFg: `coupled:${expPack}:${pid}:fg`,
                expBg: `coupled:${expPack}:${pid}:bg`,
              };
            }, pack);
            if (!expected?.ok) throw new Error('missing-pair-after-click');
            // NOTE: Playwright waitForFunction accepts a single arg payload. Passing two args
            // would silently treat the 2nd as "options" and cause expBg=undefined, making this
            // wait never succeed (and producing garbage/empty eval output).
            await page.waitForFunction(
              ({ expFg, expBg }) => {
                // eslint-disable-next-line no-underscore-dangle
                const s = window.__nw_verify?.getVerifyState?.();
                const presetIds = s?.presetIds;
                return String(presetIds?.fg || '') === String(expFg) && String(presetIds?.bg || '') === String(expBg);
              },
              { expFg: expected.expFg, expBg: expected.expBg },
              { timeout: pickTimeoutMs }
            );

            consecutivePickTimeouts = 0;
          } catch (error) {
            consecutivePickTimeouts += 1;

            const statusText = await page.evaluate(() => {
              const el = document.querySelector('#preset-status');
              return String(el?.textContent || '').trim() || null;
            });
            const btnDisabled = await page.evaluate(() => {
              const el = document.querySelector('#preset-next');
              return el instanceof HTMLButtonElement ? Boolean(el.disabled) : null;
            });
            const coupledDiag = await page.evaluate(() => {
              // eslint-disable-next-line no-underscore-dangle
              const s = window.__nw_verify?.getVerifyState?.();
              const c = s?.coupled ?? null;
              const lastPick = c?.lastPick ?? null;
              // eslint-disable-next-line no-underscore-dangle
              const pm = window.__projectm_verify ?? {};
              const toNum = (x) => {
                const n = Number(x);
                return Number.isFinite(n) ? n : null;
              };
              return {
                coupled: {
                  enabled: Boolean(c?.enabled),
                  pack: c?.pack ?? null,
                  pickMode: c?.pickMode ?? null,
                  lastPickTimeMs: typeof lastPick?.timeMs === 'number' ? lastPick.timeMs : null,
                  lastPickPair: lastPick?.pair ?? null,
                },
                audio: { lastAudioRms: toNum(pm?.lastAudioRms), lastAudioPeak: toNum(pm?.lastAudioPeak) },
              };
            });
            const errLine = String(error?.message || error || '').replace(/\r?\n/g, ' | ').slice(0, 260);

            viteLog.write(
              `[eval] pack=${pack} iter=${iter} WARN pick-timeout phase=${waitPhase} err=${JSON.stringify(
                errLine
              )} n=${consecutivePickTimeouts}/${stuckMaxConsecutive} disabled=${btnDisabled} status=${JSON.stringify(
                statusText
              )} diag=${JSON.stringify(coupledDiag)}\n`
            );
            await setOverlay(
              `eval: stuck (pick-timeout)\npack=${pack}\niter=${iter}\nvisited=${visited.size}/${targetUnique}\ntimeouts=${consecutivePickTimeouts}/${stuckMaxConsecutive}\ndisabled=${btnDisabled}\nstatus=${statusText || ''}`
            );

            if (consecutivePickTimeouts >= stuckMaxConsecutive) {
              recoveries += 1;
              viteLog.write(`[eval] pack=${pack} RECOVER pick-timeout recoveries=${recoveries}/${stuckMaxRestarts}\n`);
              if (recoveries > stuckMaxRestarts) {
                throw new Error(`stuck: pick-timeout x${consecutivePickTimeouts}, recoveries=${recoveries}/${stuckMaxRestarts}`);
              }

              await page.reload({ waitUntil: 'commit', timeout: 60_000 });
              await page.waitForSelector('#preset-next', { state: 'attached', timeout: 60_000 });
              await page.waitForFunction(() => typeof window.__nw_verify?.getVerifyState === 'function', null, { timeout: 60_000 });
              await page.evaluate(() => {
                // eslint-disable-next-line no-underscore-dangle
                window.__nw_verify = window.__nw_verify || {};
                // eslint-disable-next-line no-underscore-dangle
                window.__nw_verify.forcePresetGateOpen = true;
                // eslint-disable-next-line no-underscore-dangle
                window.__nw_verify.disableAutoAudio = true;
              });
              await page.evaluate(() => {
                const el = document.querySelector('#preset-auto-toggle');
                if (!(el instanceof HTMLInputElement)) return;
                if (!el.checked) return;
                el.checked = false;
                el.dispatchEvent(new Event('change', { bubbles: true }));
              });

              if (audioPlan.mode === 'file' && audioPlan.audioFile) {
                let ok = false;
                let lastErr = null;
                for (let attempt = 1; attempt <= 2; attempt += 1) {
                  const a = await ensureAudioFromFile(page, { audioFile: audioPlan.audioFile, waitMs: 1600, pollEveryMs: 200, requireSignal: true });
                  if (a.ok) { ok = true; break; }
                  lastErr = a?.error || 'unknown';
                  viteLog.write(
                    `[eval] pack=${pack} recover audio:file FAILED attempt=${attempt}/2 err=${String(lastErr)}; falling back to click-track\n`
                  );
                  const fb = await ensureAudioClickTrack(page, { waitMs: 1600, pollEveryMs: 200, requireSignal: true, bpm: 120 });
                  if (fb.ok) { ok = true; break; }
                  lastErr = fb?.error || lastErr;
                  await page.waitForTimeout(300);
                }
                if (!ok) {
                  const err = new Error(`recover audio failed: ${String(lastErr || 'unknown')}`);
                  viteLog.write(`[eval] pack=${pack} recover audio FAILED -> restart browser (${err.message})\n`);
                  await recreateBrowserSession(`recover-audio:${pack}:${iter}`, err);
                  await bootstrapWithRetries(`recover-audio-restart${browserRestartCount}`);
                  consecutivePickTimeouts = 0;
                  lastPageErr = pageErrorCount;
                  lastConsoleErr = consoleErrorCount;
                  await setOverlay(`eval: resumed after audio restart\npack=${pack}\niter=${iter}\nvisited=${visited.size}/${targetUnique}`);
                  continue;
                }
              } else if (audioPlan.mode === 'click') {
                let ok = false;
                let lastErr = null;
                for (let attempt = 1; attempt <= 2; attempt += 1) {
                  const a = await ensureAudioClickTrack(page, { waitMs: 1600, pollEveryMs: 200, requireSignal: true, bpm: 120 });
                  if (a.ok) { ok = true; break; }
                  lastErr = a?.error || 'unknown';
                  await page.waitForTimeout(300);
                }
                if (!ok) {
                  const err = new Error(`recover audio failed: ${String(lastErr || 'unknown')}`);
                  viteLog.write(`[eval] pack=${pack} recover audio FAILED -> restart browser (${err.message})\n`);
                  await recreateBrowserSession(`recover-audio:${pack}:${iter}`, err);
                  await bootstrapWithRetries(`recover-audio-restart${browserRestartCount}`);
                  consecutivePickTimeouts = 0;
                  lastPageErr = pageErrorCount;
                  lastConsoleErr = consoleErrorCount;
                  await setOverlay(`eval: resumed after audio restart\npack=${pack}\niter=${iter}\nvisited=${visited.size}/${targetUnique}`);
                  continue;
                }
              } else if (requireAudio) {
                const err = new Error('recover: requireAudio set but audio mode is none');
                viteLog.write(`[eval] pack=${pack} recover audio FAILED -> restart browser (${err.message})\n`);
                await recreateBrowserSession(`recover-audio:${pack}:${iter}`, err);
                await bootstrapWithRetries(`recover-audio-restart${browserRestartCount}`);
                consecutivePickTimeouts = 0;
                lastPageErr = pageErrorCount;
                lastConsoleErr = consoleErrorCount;
                await setOverlay(`eval: resumed after audio restart\npack=${pack}\niter=${iter}\nvisited=${visited.size}/${targetUnique}`);
                continue;
              }

              await page.waitForFunction(
                (expectedPack) => {
                  // eslint-disable-next-line no-underscore-dangle
                  const s = window.__nw_verify?.getVerifyState?.();
                  const c = s?.coupled;
                  return Boolean(c?.enabled) && String(c?.pack || '') === String(expectedPack);
                },
                pack,
                { timeout: 60_000 }
              );

              consecutivePickTimeouts = 0;
              await setOverlay(`eval: recovered\npack=${pack}\niter=${iter}\nvisited=${visited.size}/${targetUnique}`);
            }
            continue;
          }

          // Wait for UI status to settle (avoid sampling mid-load).
          try {
            await page.waitForFunction(() => {
              const el = document.querySelector('#preset-status');
              if (!(el instanceof HTMLElement)) return true;
              const textRaw = String(el.textContent || '');
              const lower = textRaw.toLowerCase();
              return !lower.includes('loading') && !textRaw.includes('\u52a0\u8f7d');
            }, null, { timeout: 10_000 });
          } catch {
            // ok
          }

          const snapshot = await page.evaluate(() => {
            // eslint-disable-next-line no-underscore-dangle
            const s = window.__nw_verify?.getVerifyState?.();
            const presetIds = s?.presetIds ?? null;
            const presetFgId = typeof presetIds?.fg === 'string' ? String(presetIds.fg) : null;
            const presetBgId = typeof presetIds?.bg === 'string' ? String(presetIds.bg) : null;
            const coupled = s?.coupled ?? null;
            const lastPick = coupled?.lastPick ?? null;

            // eslint-disable-next-line no-underscore-dangle
            const pm = window.__projectm_verify ?? {};
            const perPm = pm?.perPm ?? {};
            const fg = perPm?.fg ?? {};
            const bg = perPm?.bg ?? {};
            const toNum = (x) => {
              const n = Number(x);
              return Number.isFinite(n) ? n : null;
            };
            const pmAvgLumaFg = Number.isFinite(Number(fg?.avgLuma)) ? Number(fg.avgLuma) : null;
            const pmAvgLumaBg = Number.isFinite(Number(bg?.avgLuma)) ? Number(bg.avgLuma) : null;
            const lastAudioRms = toNum(pm?.lastAudioRms);
            const lastAudioPeak = toNum(pm?.lastAudioPeak);
            const pmFramesFg = toNum(fg?.frames ?? fg?.framesRendered ?? null);
            const pmFramesBg = toNum(bg?.frames ?? bg?.framesRendered ?? null);
            const pmFrames = toNum(pm?.frames ?? pm?.framesRendered ?? null);

            return {
              coupledPack: typeof coupled?.pack === 'string' ? coupled.pack : null,
              presetFgId,
              presetBgId,
              lastPick,
              pmAvgLumaFg,
              pmAvgLumaBg,
              lastAudioRms,
              lastAudioPeak,
              pmFramesFg,
              pmFramesBg,
              pmFrames,
            };
          });

          const viz = await sampleVizFromProjectMVerify(page, {
            intervalMs,
            warmupSamples,
            measureSamples,
          });

          const nowMs = Date.now();
          const pageErrorsSinceLast = pageErrorCount - lastPageErr;
          const consoleErrorsSinceLast = consoleErrorCount - lastConsoleErr;
          lastPageErr = pageErrorCount;
          lastConsoleErr = consoleErrorCount;

          const pick = snapshot?.lastPick ?? null;
          const pairIdRaw = pick && typeof pick === 'object' ? pick.pair : null;
          const pairId = Number.isFinite(Number(pairIdRaw)) ? Math.floor(Number(pairIdRaw)) : null;
          if (pairId != null) visited.add(pairId);

          const vizAvgLuma = viz?.ok && Number.isFinite(Number(viz?.vizAvgLuma)) ? Number(viz.vizAvgLuma) : null;
          const vizAvgFrameDelta =
            viz?.ok && Number.isFinite(Number(viz?.vizAvgFrameDelta)) ? Number(viz.vizAvgFrameDelta) : null;

          const reasons = [];
          if (pageErrorsSinceLast > 0) reasons.push('pageerror');
          if (consoleErrorsSinceLast > 0) reasons.push('consoleerror');
          if (vizAvgLuma != null) {
            if (vizAvgLuma <= lumaMin) reasons.push('too-dark');
            if (vizAvgLuma >= 0.96) reasons.push('too-bright');
          } else {
            reasons.push('no-luma');
          }
          if (vizAvgFrameDelta != null) {
            if (vizAvgFrameDelta < motionMin) reasons.push('low-motion');
          } else {
            reasons.push('no-motion-sample');
          }

          const okHeuristic = reasons.length === 0;

          const out = {
            tMs: nowMs,
            pack,
            pair: pairId,
            warpDiff: Number.isFinite(Number(pick?.warpDiff)) ? Number(pick.warpDiff) : null,
            cxDiff: Number.isFinite(Number(pick?.cxDiff)) ? Number(pick.cxDiff) : null,
            quality01: Number.isFinite(Number(pick?.quality01)) ? Number(pick.quality01) : null,
            intensity01: Number.isFinite(Number(pick?.intensity01)) ? Number(pick.intensity01) : null,
            presetFgId: typeof snapshot?.presetFgId === 'string' ? snapshot.presetFgId : null,
            presetBgId: typeof snapshot?.presetBgId === 'string' ? snapshot.presetBgId : null,
            vizAvgLuma,
            vizAvgFrameDelta,
            pmAvgLumaFg: snapshot?.pmAvgLumaFg ?? null,
            pmAvgLumaBg: snapshot?.pmAvgLumaBg ?? null,
            audioRms: typeof snapshot?.lastAudioRms === 'number' ? snapshot.lastAudioRms : null,
            audioPeak: typeof snapshot?.lastAudioPeak === 'number' ? snapshot.lastAudioPeak : null,
            pageErrorsSinceLast,
            consoleErrorsSinceLast,
            okHeuristic,
            reasons,
          };

          // Fail-fast assertion: pair must be in the loaded manifest (防止前端加载错误 manifest)
          if (pairId != null && packInfo.allowedPairIds && !packInfo.allowedPairIds.has(pairId)) {
            const msg = `MANIFEST_MISMATCH: pair=${pairId} not in manifest (${packInfo.manifestFilename}, ${packInfo.allowedPairIds.size} pairs). Browser may have loaded a different manifest.`;
            viteLog.write(`[eval] FATAL ${msg}\n`);
            throw new Error(msg);
          }

          ws.write(`${JSON.stringify(out)}\n`);
          const urlEnt = pairId != null ? packInfo?.byId?.get(pairId) : null;
          const fgLabel = shortUrlLabel(urlEnt?.fgUrl);
          const bgLabel = shortUrlLabel(urlEnt?.bgUrl);
          const audioRms = typeof snapshot?.lastAudioRms === 'number' ? snapshot.lastAudioRms : null;
          const audioPeak = typeof snapshot?.lastAudioPeak === 'number' ? snapshot.lastAudioPeak : null;
          const framesFg = typeof snapshot?.pmFramesFg === 'number' ? snapshot.pmFramesFg : null;
          const framesBg = typeof snapshot?.pmFramesBg === 'number' ? snapshot.pmFramesBg : null;
          const frames = typeof snapshot?.pmFrames === 'number' ? snapshot.pmFrames : null;
          const presetFgShort = shortUrlLabel(out.presetFgId);
          const presetBgShort = shortUrlLabel(out.presetBgId);
          await setOverlay(
            `pair=${pairId ?? 'na'} visited=${visited.size}/${targetUnique} iter=${iter}\npack=${pack}\nfg=${fgLabel}\nbg=${bgLabel}\nq01=${out.quality01 ?? 'na'
            } luma=${vizAvgLuma != null ? vizAvgLuma.toFixed(3) : 'na'} motion=${vizAvgFrameDelta != null ? vizAvgFrameDelta.toFixed(4) : 'na'
            }\naudioRms=${audioRms != null ? audioRms.toFixed(4) : 'na'} peak=${audioPeak != null ? audioPeak.toFixed(4) : 'na'
            } frames=${framesFg ?? 'na'}/${framesBg ?? 'na'} pmFrames=${frames ?? 'na'}\npreset=${presetFgShort} | ${presetBgShort}`
          );

          if (iter % 50 === 0) {
            const elapsedMin = (Date.now() - startMs) / 60000;
            meta.progress[pack] = { iter, visited: visited.size, target: targetUnique, elapsedMin: Number(elapsedMin.toFixed(1)) };
            await fsp.writeFile(metaPath, `${JSON.stringify({ ...meta, finishedAt: null }, null, 2)}\n`, 'utf8');
            viteLog.write(`[eval] pack=${pack} iter=${iter} visited=${visited.size}/${targetUnique} elapsedMin=${elapsedMin.toFixed(1)}\n`);
          }
        } catch (error) {
          if (!isClosedTargetError(error)) throw error;
          try {
            viteLog.write(`[eval] pack=${pack} iter=${iter} WARN target-closed -> restart browser\n`);
          } catch {
            // ignore
          }
          await recreateBrowserSession(`iter:${pack}:${iter}`, error);
          // Re-bootstrap pack state and keep visited set (avoid collecting "not switching" garbage).
          await bootstrapWithRetries(`restart${browserRestartCount}`);
          consecutivePickTimeouts = 0;
          lastPageErr = pageErrorCount;
          lastConsoleErr = consoleErrorCount;
          await setOverlay(`eval: resumed after restart\npack=${pack}\niter=${iter}\nvisited=${visited.size}/${targetUnique}`);
          continue;
        }
      }

      meta.progress[pack] = {
        iter,
        visited: visited.size,
        target: targetSamples ? targetSamples : targetUnique,
        targetMode: targetSamples ? 'samples' : 'coverage',
        done: targetSamples ? iter >= targetSamples : visited.size >= targetUnique,
      };
      // P1.2A: 更新 timing 统计
      meta.timing = { ...timingStats };
      await fsp.writeFile(metaPath, `${JSON.stringify({ ...meta, finishedAt: null }, null, 2)}\n`, 'utf8');

      if (targetSamples) {
        viteLog.write(`[eval] pack=${pack} done samples=${iter}/${targetSamples} unique=${visited.size}/${targetUnique}\n`);
      } else {
        viteLog.write(`[eval] pack=${pack} done visited=${visited.size}/${targetUnique}\n`);
      }

      // Hard guard: if we collected nothing for a non-empty target, this run is garbage.
      // Fail fast so downstream training doesn't silently proceed with empty eval.jsonl.
      if (targetUnique > 0 && visited.size === 0) {
        throw new Error(`no-samples-collected: pack=${pack} targetUnique=${targetUnique}`);
      }
    }

    // P1.2A: 最终更新 timing 统计
    meta.timing = { ...timingStats, elapsedSec: (Date.now() - startMs) / 1000 };
    meta.finishedAt = new Date().toISOString();
    await fsp.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}
`, 'utf8');

    console.log(JSON.stringify({ ok: true, outDir, evalPath, metaPath }, null, 2));
  } catch (error) {
    const pack = activePack ?? 'unknown';
    const iter = Number.isFinite(Number(activeIter)) ? activeIter : 0;
    const errLine = String(error?.stack || error?.message || error || '')
      .replace(/\r?\n/g, ' | ')
      .slice(0, 3000);
    try {
      viteLog.write(`[eval] ERROR pack=${pack} iter=${iter} err=${errLine}\n`);
    } catch {
      // ignore
    }
    try {
      const code = classifyErrorCode(error);
      const lastUrl = (() => {
        try { return page?.url?.() || null; } catch { return null; }
      })();
      const lastPreflight = timingStats.preflightResults?.length
        ? timingStats.preflightResults[timingStats.preflightResults.length - 1]
        : null;
      meta.finishedAt = new Date().toISOString();
      meta.timing = { ...timingStats, elapsedSec: (Date.now() - startMs) / 1000 };
      meta.error = {
        code,
        pack,
        iter,
        phase: currentPhase,
        message: String(error?.message || error || '').slice(0, 4000),
        stack: String(error?.stack || '').slice(0, 4000),
        lastUrl,
        lastPreflight,
      };
      // Dump page events buffer on fatal error
      try {
        if (pageEventsBuffer.length > 0) {
          const eventsPath = path.join(outDir, `playwright-events-fatal.log`);
          const eventsText = pageEventsBuffer.map((e) => `${e.ts} [${e.type}] ${e.text}`).join('\n');
          await fsp.writeFile(eventsPath, eventsText + '\n', 'utf8');
        }
      } catch { /* ignore */ }
      await fsp.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    } catch {
      // ignore
    }
    throw error;
  } finally {
    try {
      if (page) await page.close();
    } catch {
      // ignore
    }
    try {
      if (context) await context.close();
    } catch {
      // ignore
    }
    try {
      if (browser) await browser.close();
    } catch {
      // ignore
    }
    try {
      await endStream(ws);
    } catch {
      // ignore
    }
    try {
      if (vite) {
        try {
          vite.stdout?.removeAllListeners?.('data');
          vite.stderr?.removeAllListeners?.('data');
        } catch {
          // ignore
        }
        await killProcessTree(vite);
      }
    } catch {
      // ignore
    }
    try {
      await endStream(viteLog);
    } catch {
      // ignore
    }
  }
}

main().catch((error) => {
  console.error('[headless-eval-coupled-pairs] Failed:', error);
  process.exitCode = 1;
});
