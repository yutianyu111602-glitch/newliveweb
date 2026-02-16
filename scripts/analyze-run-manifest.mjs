import fs from "node:fs";
import path from "node:path";

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const args = { manifest: "public/run-manifest.json", selection: "logs/aivj-selection.log" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--manifest") args.manifest = String(argv[++i] ?? "");
    else if (a === "--selection") args.selection = String(argv[++i] ?? "");
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/analyze-run-manifest.mjs [--manifest public/run-manifest.json] [--selection logs/aivj-selection.log]"
      );
      process.exit(0);
    }
  }
  return args;
}

function topN(map, n) {
  return [...map.entries()]
    .sort((a, b) => {
      const d = Number(b[1]) - Number(a[1]);
      if (d) return d;
      return String(a[0]).localeCompare(String(b[0]));
    })
    .slice(0, n)
    .map(([k, v]) => ({ key: k, count: v }));
}

function inc(map, key, by = 1) {
  map.set(key, Number(map.get(key) ?? 0) + by);
}

function statsFromNumbers(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  const n = nums.length;
  if (!n) return null;
  nums.sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const p50 = nums[Math.floor((n - 1) * 0.5)];
  const p10 = nums[Math.floor((n - 1) * 0.1)];
  const p90 = nums[Math.floor((n - 1) * 0.9)];
  return {
    n,
    min: nums[0],
    max: nums[n - 1],
    mean,
    p10,
    p50,
    p90,
  };
}

function main() {
  const { manifest, selection } = parseArgs(process.argv);
  const projectRoot = process.cwd();
  const manifestPathAbs = path.resolve(projectRoot, manifest);
  const selectionPathAbs = path.resolve(projectRoot, selection);

  const runManifest = readJson(manifestPathAbs);
  const presets = Array.isArray(runManifest?.presets) ? runManifest.presets : [];

  const haveIds = new Set(
    presets
      .map((p) => String(p?.presetId ?? "").trim())
      .filter(Boolean)
  );

  // Selection analysis
  const selectionLogRaw = readTextIfExists(selectionPathAbs);
  const selectedIds = selectionLogRaw
    ? selectionLogRaw
        .split(/\r?\n/)
        .map((line) => {
          const m = String(line).match(/selected preset\s+([^\s\(]+)/i);
          return m ? String(m[1]).trim() : "";
        })
        .filter(Boolean)
    : [];

  const uniqueSelected = new Set(selectedIds);
  const uniqueMatched = new Set([...uniqueSelected].filter((id) => haveIds.has(id)));

  const matchedPrefixCounts = new Map();
  for (const id of uniqueMatched) {
    const prefix = String(id).includes("-") ? String(id).split("-").slice(0, 2).join("-") : id;
    inc(matchedPrefixCounts, prefix);
  }

  const expectedPrefix = "run3-crashsafe-15000-";
  const matchedWithExpectedPrefix = [...uniqueMatched].filter((id) => id.startsWith(expectedPrefix)).length;

  const selectedUniqueCount = uniqueSelected.size;
  const matchedUniqueCount = uniqueMatched.size;
  const matchRatio = selectedUniqueCount > 0 ? matchedUniqueCount / selectedUniqueCount : 0;

  // Failure reasons + quality stats
  const reasonCounts = new Map();
  const statusCounts = new Map();
  const tierCounts = new Map();
  const bandClassCounts = new Map();

  const avgLumaOk = [];
  const motionOk = [];

  for (const p of presets) {
    const status = String(p?.status ?? "unknown");
    inc(statusCounts, status);

    const tier = String(p?.tier ?? "unknown");
    inc(tierCounts, tier);

    if (status !== "ok") {
      const reasons = Array.isArray(p?.reasons) ? p.reasons : [];
      if (reasons.length === 0) inc(reasonCounts, "(no reason)");
      for (const r of reasons) {
        const key = String(r ?? "").trim() || "(empty)";
        inc(reasonCounts, key);
      }
      continue;
    }

    const metrics = p?.metrics;
    const avgLuma = Number(metrics?.avgLuma);
    const motion = Number(metrics?.motion);
    if (Number.isFinite(avgLuma)) avgLumaOk.push(avgLuma);
    if (Number.isFinite(motion)) motionOk.push(motion);

    const bandClass = String(metrics?.bandClass ?? "unknown");
    inc(bandClassCounts, bandClass);
  }

  const summary = {
    input: {
      manifest: { rel: manifest, abs: manifestPathAbs },
      selectionLog: {
        rel: selection,
        abs: selectionPathAbs,
        exists: selectionLogRaw != null,
      },
    },
    runManifest: {
      version: runManifest?.version ?? null,
      generatedAt: runManifest?.generatedAt ?? null,
      runName: runManifest?.runName ?? null,
      indexPath: runManifest?.indexPath ?? null,
      outDir: runManifest?.outDir ?? null,
      time: runManifest?.time ?? null,
      counts: runManifest?.counts ?? null,
      presetsLength: presets.length,
      presetIdsUnique: haveIds.size,
      statusCounts: Object.fromEntries(statusCounts.entries()),
      tierCounts: Object.fromEntries(tierCounts.entries()),
      bandClassCountsOk: Object.fromEntries(bandClassCounts.entries()),
      okMetrics: {
        avgLuma: statsFromNumbers(avgLumaOk),
        motion: statsFromNumbers(motionOk),
      },
      topFailureReasons: topN(reasonCounts, 10),
    },
    selectionMatch: {
      selectedUnique: selectedUniqueCount,
      matchedUnique: matchedUniqueCount,
      ratio: matchRatio,
      matchedWithExpectedPrefix,
      expectedPrefix,
      matchedPrefixTop: topN(matchedPrefixCounts, 10),
      sampleSelectedFirst20: selectedIds.slice(0, 20),
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
