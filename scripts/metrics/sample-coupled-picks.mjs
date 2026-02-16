import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
      continue;
    }
    out[key] = true;
  }
  return out;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function ensureDir(p) {
  const dir = String(p ?? "").trim();
  if (!dir || dir === ".") return;
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Sample coupled pair selections (writes pair=<n> logs for A/B tests).");
    console.log("");
    console.log("Usage:");
    console.log(
      "  node scripts/metrics/sample-coupled-picks.mjs --out <path> [--url <devUrl>] [--pack <pack>] [--pick <weighted|shuffle|random>] [--iterations <n>] [--intensity01 <0..1>] [--debug 1]",
    );
    console.log("");
    console.log("Examples:");
    console.log(
      "  node scripts/metrics/sample-coupled-picks.mjs --out artifacts/headless/sel.shuffle.log --pick shuffle --iterations 300",
    );
    console.log(
      "  node scripts/metrics/sample-coupled-picks.mjs --out artifacts/headless/sel.weighted.log --pick weighted --iterations 300 --intensity01 0.55",
    );
    process.exitCode = 0;
    return;
  }

  const baseUrl = String(args.url ?? process.env.DEV_URL ?? "http://127.0.0.1:5174/").trim();
  const pack = String(args.pack ?? "ai_generated_coupled_final").trim();
  const pick = String(args.pick ?? "weighted")
    .trim()
    .toLowerCase();
  const iterations = Math.max(
    1,
    Math.min(5000, Math.floor(num(args.iterations ?? args.runs ?? 200, 200))),
  );
  const intensity01 = Math.min(
    1,
    Math.max(0, num(args.intensity01 ?? args.intensity ?? args.mockIntensity01 ?? 0.55, 0.55)),
  );
  const outPath = String(args.out ?? "").trim();
  const debug = String(args.debug ?? "").trim() === "1";

  if (!outPath) throw new Error("missing required --out <path>");
  if (!["weighted", "shuffle", "random"].includes(pick)) {
    throw new Error(`invalid --pick ${JSON.stringify(pick)} (use weighted|shuffle|random)`);
  }

  const targetUrl = (() => {
    const u = new URL(baseUrl);
    u.searchParams.set("coupled", "1");
    u.searchParams.set("coupledPack", pack);
    u.searchParams.set("coupledPick", pick);
    return u.toString();
  })();

  console.log(`[sample-coupled-picks] target=${targetUrl}`);
  console.log(`[sample-coupled-picks] out=${outPath} pick=${pick} iterations=${iterations} intensity01=${intensity01}`);

  let browser;
  try {
    console.log("[sample-coupled-picks] launching chromium...");
    browser = await chromium.launch({ headless: true, timeout: 60_000 });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    if (debug) {
      page.on("console", (msg) => {
        try {
          console.log(`[browser:${msg.type()}] ${msg.text()}`);
        } catch {
          // ignore
        }
      });
      page.on("pageerror", (err) => {
        console.log(`[browser:pageerror] ${String(err)}`);
      });
    }

    console.log("[sample-coupled-picks] navigating...");
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

    console.log("[sample-coupled-picks] waiting for __nw_verify.sampleCoupledPicks...");
    await page.waitForFunction(() => {
      const v = globalThis.__nw_verify;
      return Boolean(v && typeof v.sampleCoupledPicks === "function");
    }, null, { timeout: 60_000 });

    console.log("[sample-coupled-picks] sampling...");
    const result = await page.evaluate(
      async ({ iterations, pick, intensity01 }) => {
        try {
          const v = globalThis.__nw_verify;
          if (!v || typeof v.sampleCoupledPicks !== "function") {
            return { ok: false, error: "missing __nw_verify.sampleCoupledPicks", picks: [] };
          }
          v.forcePresetGateOpen = true;
          const r = await v.sampleCoupledPicks({
            iterations,
            pickMode: pick,
            mockIntensity01: intensity01,
            reset: true,
          });
          return r;
        } catch (e) {
          return { ok: false, error: String(e), picks: [] };
        }
      },
      { iterations, pick, intensity01 },
    );

    if (!result || typeof result !== "object" || !result.ok) {
      const errText =
        result && typeof result === "object" ? String(result.error ?? "unknown") : "unknown";
      throw new Error(`sampleCoupledPicks failed: ${errText}`);
    }

    const picks = Array.isArray(result.picks) ? result.picks : [];
    const lines = picks.map((p) => {
      const pairRaw = Number(p?.pair);
      const pair = Number.isFinite(pairRaw) ? Math.floor(pairRaw) : -1;
      const qRaw = Number(p?.quality01);
      const q = Number.isFinite(qRaw) ? qRaw : null;
      const requestedMode = String(p?.requestedMode ?? "").trim();
      const mode = String(p?.mode ?? "").trim();
      const reason = String(p?.reason ?? "").trim();

      let line = `pair=${pair}`;
      if (q != null) line += ` q=${q.toFixed(4)}`;
      if (requestedMode) line += ` requested=${requestedMode}`;
      if (mode) line += ` mode=${mode}`;
      if (reason) line += ` reason=${reason}`;
      return line;
    });

    await ensureDir(path.dirname(outPath));
    await fs.writeFile(outPath, lines.join("\n") + "\n", "utf8");
    console.log(`[sample-coupled-picks] wrote ${picks.length} picks -> ${outPath}`);

    await browser.close();
  } finally {
    try {
      await browser?.close();
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error(err?.stack ? String(err.stack) : String(err));
  process.exitCode = 1;
});
