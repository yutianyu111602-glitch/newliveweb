import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const OUT_DIR = process.env.VERIFY_OUT_DIR ?? path.resolve('artifacts', 'headless');
const PORT = Number(process.env.VERIFY_PORT ?? 5174);
const HOST = process.env.VERIFY_HOST ?? '127.0.0.1';
const URL = process.env.VERIFY_URL ?? `http://${HOST}:${PORT}/`;
const HARD_TIMEOUT_MS = Number(process.env.VERIFY_HARD_TIMEOUT_MS ?? 480000);

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function waitForHttpOk(url, timeoutMs = 60_000) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      // Treat 2xx and 3xx as OK. In practice, a running dev server can respond with
      // redirects (e.g. trailing slash normalization). We only need to know it's alive.
      if (res.status >= 200 && res.status < 400) return;
      lastErr = new Error(`HTTP ${res.status} ${res.statusText}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw lastErr ?? new Error('Timed out waiting for dev server');
}

async function looksLikeViteIndexHtml(url, timeoutMs = 2_500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'text/html' },
      signal: controller.signal,
    });
    if (!(res.status >= 200 && res.status < 400)) return false;
    const text = await res.text();
    // Vite dev index HTML typically includes the client entry.
    return text.includes('/@vite/client') || text.includes('"/@vite/client"') || text.includes("'/@vite/client'");
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForViteDevServer(url, timeoutMs = 2_500) {
  // A plain HTTP 200 at `/` can be a false positive (proxy, captive portal, stale service).
  // Vite dev servers always expose `@vite/client`.
  // Prefer checking the HTML for a Vite client reference (less flaky than requesting
  // the client JS directly during transient dev-server hiccups).
  if (await looksLikeViteIndexHtml(url, timeoutMs)) return;

  await waitForHttpOk(url, timeoutMs);
  const viteClientUrl = new URL('/@vite/client', url).toString();
  await waitForHttpOk(viteClientUrl, timeoutMs);
}

async function killProcessTree(child) {
  if (!child || typeof child.pid !== 'number') return;
  if (process.platform === 'win32') {
    // Ensure we kill cmd.exe and its descendants (npx/vite/node) so Node can exit.
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

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function runNodeScript(args, { cwd, env } = {}) {
  const child = spawn(process.execPath, args, {
    cwd: cwd ?? process.cwd(),
    env: env ?? process.env,
    stdio: 'inherit',
    windowsHide: true,
    shell: false,
  });
  const code = await new Promise((resolve) => child.on('exit', (c) => resolve(c ?? 1)));
  return code;
}

async function runScenariosAndMergeIntoReport({ outDir }) {
  const reportPath = path.join(outDir, 'report.json');
  if (!(await fileExists(reportPath))) {
    console.warn(`[verify-dev] --scenarios skipped (missing report.json at ${reportPath})`);
    return 0;
  }

  // Ensure report-field-map exists for S3 jitter extraction.
  const mapCode = await runNodeScript(['scripts/metrics/map-report-fields.mjs', reportPath, path.join(outDir, 'report-field-map.json')]);
  if (mapCode !== 0) return mapCode;

  const s1 = await runNodeScript(['scripts/scenarios/run-s1.mjs']);
  if (s1 !== 0) return s1;
  const s2 = await runNodeScript(['scripts/scenarios/run-s2.mjs']);
  if (s2 !== 0) return s2;
  const s3 = await runNodeScript(['scripts/scenarios/run-s3.mjs']);
  if (s3 !== 0) return s3;

  try {
    const reportRaw = await fs.readFile(reportPath, 'utf8');
    const report = JSON.parse(reportRaw);

    const readScenario = async (name) => {
      const p = path.join(outDir, `scenario-${name}.json`);
      if (!(await fileExists(p))) return null;
      const raw = await fs.readFile(p, 'utf8');
      return JSON.parse(raw);
    };

    const scenarios = {
      S1: await readScenario('s1'),
      S2: await readScenario('s2'),
      S3: await readScenario('s3'),
      mergedAt: new Date().toISOString(),
    };

    report.scenarios = scenarios;
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log('[verify-dev] --scenarios merged into report.json');
  } catch (e) {
    console.error('[verify-dev] --scenarios failed to merge into report.json:', e);
    return 1;
  }

  return 0;
}

async function main() {
  const exitWith = async (code) => {
    const exitCode = Number.isFinite(code) ? code : 0;
    process.exitCode = exitCode;
    await new Promise((r) => setTimeout(r, 20));
    process.exit(exitCode);
  };
  const args = process.argv.slice(2);
  const runScenarios = args.includes('--scenarios');
  if (args.includes('--help') || args.includes('-h')) {
    console.log('verify-dev: start/reuse Vite then run Playwright verification');
    console.log('Usage: node scripts/verify-dev.mjs [--scenarios]');
    console.log('Env: VERIFY_HOST, VERIFY_PORT, VERIFY_URL, VERIFY_OUT_DIR');
    console.log('Flags: --scenarios (run S1/S2/S3 and merge into artifacts/headless/report.json)');
    console.log(`Default VERIFY_URL: ${URL}`);
    console.log(`Default VERIFY_OUT_DIR: ${OUT_DIR}`);
    process.exitCode = 0;
    return;
  }

  let vite;
  await ensureDir(OUT_DIR);
  let hardTimeoutId = null;
  if (Number.isFinite(HARD_TIMEOUT_MS) && HARD_TIMEOUT_MS > 0) {
    hardTimeoutId = setTimeout(async () => {
      console.error(`[verify-dev] hard timeout after ${HARD_TIMEOUT_MS}ms`);
      try {
        if (typeof vite !== 'undefined') {
          await killProcessTree(vite);
        }
      } catch {
        // ignore
      }
      await exitWith(2);
    }, HARD_TIMEOUT_MS);
  }
  const devLogPath = path.join(OUT_DIR, 'dev-server.log');

  // If a dev server is already running (common when user keeps `npm run dev` in a separate terminal),
  // just reuse it and avoid spawning another Vite instance.
  try {
    console.log(`[verify-dev] Checking existing dev server: ${URL}`);
    await waitForViteDevServer(URL, 2_500);
    console.log('[verify-dev] Reusing existing dev server');
    const env = {
      ...process.env,
      VERIFY_URL: URL,
      VERIFY_OUT_DIR: OUT_DIR,
      VERIFY_HARD_TIMEOUT_MS: String(HARD_TIMEOUT_MS),
      NW_VERIFY: '1',
      VITE_NW_VERIFY: '1',
    };
    const verify = spawn(process.execPath, ['scripts/headless-verify.mjs'], {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
      windowsHide: true,
      shell: false,
    });

    const verifyCode = await new Promise((resolve) => {
      verify.on('exit', (code) => resolve(code ?? 1));
    });

    if (verifyCode === 0 && runScenarios) {
      const sc = await runScenariosAndMergeIntoReport({ outDir: OUT_DIR });
      if (sc !== 0) {
        await fs.writeFile(devLogPath, '[verify-dev] scenarios failed\n', 'utf8');
        if (hardTimeoutId) clearTimeout(hardTimeoutId);
        await exitWith(3);
        return;
      }
    }

    await fs.writeFile(devLogPath, '[verify-dev] Reused existing dev server\n', 'utf8');
    console.log(`Dev log: ${devLogPath}`);
    if (hardTimeoutId) clearTimeout(hardTimeoutId);
    await exitWith(verifyCode);
    return;
  } catch {
    // continue to spawn Vite below
  }

  // Start Vite using the project's vite.config.ts (which pins port=5174, strictPort=true).
  // IMPORTANT: do not pass positional args like "127.0.0.1 5174" (that becomes the Vite root and breaks config loading).
  // Use npx vite directly to avoid npm arg mangling that can drop flags on Windows.
  // Start Vite using the project's vite.config.ts (which pins port=5174, strictPort=true).
  const viteEnv = {
    ...process.env,
    NW_VERIFY: '1',
    VITE_NW_VERIFY: '1',
  };
  if (process.platform === 'win32') {
    // Some Windows environments intermittently throw spawn EINVAL when spawning .cmd shims.
    // Running through cmd.exe is the most reliable.
    const cmdLine = `npx --no-install vite --host=${HOST} --port=${PORT} --strictPort --clearScreen=false`;
    console.log(`[verify-dev] Starting Vite via cmd.exe: ${cmdLine}`);
    vite = spawn('cmd.exe', ['/d', '/s', '/c', cmdLine], {
      cwd: process.cwd(),
      env: viteEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });
  } else {
    const npxCmd = 'npx';
    const viteArgs = ['--no-install', 'vite', `--host=${HOST}`, `--port=${PORT}`, '--strictPort', '--clearScreen=false'];
    console.log(`[verify-dev] Starting Vite via npx on ${HOST}:${PORT}`);
    vite = spawn(npxCmd, viteArgs, {
      cwd: process.cwd(),
      env: viteEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });
  }

  const logChunks = [];
  const onData = (chunk) => {
    const text = chunk.toString('utf8');
    process.stdout.write(text);
    logChunks.push(text);
  };
  vite.stdout.on('data', onData);
  vite.stderr.on('data', onData);

  let exited = false;
  let startedOk = true;
  vite.on('exit', (code) => {
    exited = true;
    logChunks.push(`\n[vite] exited with code ${code}\n`);
  });

  // If Vite fails to bind (common when you already run `npm run dev` in another terminal),
  // proceed using the existing server instead of treating it as a hard failure.
  const onStartError = (text) => {
    if (!startedOk) return;
    const lower = String(text).toLowerCase();
    if (lower.includes('eaddrinuse') || lower.includes('eacces') || lower.includes('permission denied') || lower.includes('address already in use')) {
      startedOk = false;
    }
  };
  vite.stdout.on('data', onStartError);
  vite.stderr.on('data', onStartError);

  try {
    console.log(`[verify-dev] Waiting for HTTP OK: ${URL}`);
    await waitForHttpOk(URL, 60_000);

    console.log('[verify-dev] Running headless verification');

    // Run Playwright verification in a separate Node process to avoid module/loader edge cases.
    const env = {
      ...process.env,
      VERIFY_URL: URL,
      VERIFY_OUT_DIR: OUT_DIR,
      VERIFY_HARD_TIMEOUT_MS: String(HARD_TIMEOUT_MS),
      NW_VERIFY: '1',
      VITE_NW_VERIFY: '1',
    };
    const verify = spawn(process.execPath, ['scripts/headless-verify.mjs'], {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
      windowsHide: true,
      shell: false,
    });

    const verifyCode = await new Promise((resolve) => {
      verify.on('exit', (code) => resolve(code ?? 1));
    });

    if (verifyCode === 0 && runScenarios) {
      const sc = await runScenariosAndMergeIntoReport({ outDir: OUT_DIR });
      if (sc !== 0) {
        console.error('[verify-dev] scenarios failed');
        process.exitCode = 3;
      }
    }

    await fs.writeFile(devLogPath, logChunks.join(''), 'utf8');
    console.log(`Dev log: ${devLogPath}`);

    process.exitCode = verifyCode;
  } finally {
    // Only stop Vite if we actually started it successfully.
    if (startedOk) {
      if (!exited) {
        console.log('[verify-dev] Stopping Vite');
        await killProcessTree(vite);
      }
      await new Promise((r) => setTimeout(r, 800));
      if (!exited) {
        await killProcessTree(vite);
      }
    }
  }

  if (hardTimeoutId) clearTimeout(hardTimeoutId);

  await exitWith(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error('verify-dev failed:', err);
  process.exitCode = 1;
  process.exit(1);
});
