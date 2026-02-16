#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const argMap = new Map();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token || !token.startsWith("--")) continue;
    const body = token.slice(2);
    if (!body) continue;
    if (body.includes("=")) {
      const [k, v] = body.split("=");
      if (k) argMap.set(k, v ?? "true");
      continue;
    }
    const k = body;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      argMap.set(k, next);
      i += 1;
    } else {
      argMap.set(k, "true");
    }
  }
}

const resolveArg = (key, fallback) => {
  if (!argMap.has(key)) return fallback;
  const v = argMap.get(key);
  return v ?? fallback;
};

const manifestPath = String(resolveArg("manifest", "")).trim();
if (!manifestPath) {
  console.error(
    "Usage: node scripts/build-aivj-style-policy-v0.mjs --manifest <path/to/library-manifest.json> [--out <path/to/aivj-style-policy.v0.json>]"
  );
  process.exit(2);
}

const absManifestPath = path.resolve(manifestPath);
const outPathArg = String(resolveArg("out", "")).trim();
const absOutPath = outPathArg
  ? path.resolve(outPathArg)
  : path.join(path.dirname(absManifestPath), "aivj-style-policy.v0.json");

const pack = path.basename(path.dirname(absManifestPath));

const policy = {
  version: "v0",
  generatedAt: new Date().toISOString(),
  pack,
  // Default preserves current runtime behavior.
  preferSameAuthorChance: 1,
  // Keep in sync with runtime defaults unless you intentionally tune it.
  motionThresholds: {
    calmMax: 0.42,
    grooveMax: 0.72,
  },
  // Optional overrides for techno profiles.
  profileMap: {
    ambient: "calm",
    drone: "calm",
    dub: "groove",
    videoVj: "groove",
    peakRave: "peak",
  },
};

await fs.mkdir(path.dirname(absOutPath), { recursive: true });
await fs.writeFile(absOutPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
console.log(`[aivj-style-policy:v0] wrote -> ${absOutPath}`);
