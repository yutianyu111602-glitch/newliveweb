import {
  type CoupledPairsManifestV0,
  type CoupledPairsQualityV0,
  setCoupledPairsManifest,
} from "./coupledPairsStore";

export const loadCoupledPairsManifestFromUrl = async (
  url: string,
): Promise<CoupledPairsManifestV0 | null> => {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(trimmed, { cache: "no-store" });
    if (!res.ok) {
      console.warn(
        "[coupled-pairs] fetch failed",
        res.status,
        res.statusText,
        trimmed,
      );
      return null;
    }
    const data = (await res.json()) as CoupledPairsManifestV0;
    if (!data || typeof data !== "object") return null;
    if (!Array.isArray((data as any).pairs)) return null;
    return data;
  } catch (err) {
    console.warn("[coupled-pairs] fetch error", err);
    return null;
  }
};

const deriveQualityUrl = (manifestUrl: string): string | null => {
  const trimmed = String(manifestUrl || "").trim();
  if (!trimmed) return null;
  // Same folder, fixed filename for trainer output.
  // Example: /presets/<pack>/pairs-manifest.v0.json -> /presets/<pack>/pairs-quality.v0.json
  if (trimmed.endsWith("pairs-manifest.v0.json")) {
    return trimmed.replace(/pairs-manifest\.v0\.json$/, "pairs-quality.v0.json");
  }
  return null;
};

const loadCoupledPairsQualityFromUrl = async (
  url: string,
): Promise<CoupledPairsQualityV0 | null> => {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(trimmed, { cache: "no-store" });
    if (!res.ok) {
      console.warn(
        "[coupled-pairs] failed to load pairs-quality",
        res.status,
        res.statusText,
        trimmed,
      );
      return null;
    }
    const data = (await res.json()) as CoupledPairsQualityV0;
    if (!data || typeof data !== "object") return null;
    if (!Array.isArray((data as any).pairs)) return null;
    return data;
  } catch (err) {
    console.warn("[coupled-pairs] failed to load pairs-quality", err, trimmed);
    return null;
  }
};

export const loadAndSetCoupledPairsManifest = async (url: string) => {
  const manifest = await loadCoupledPairsManifestFromUrl(url);
  if (manifest) {
    const qualityUrl = deriveQualityUrl(url);
    if (qualityUrl) {
      const quality = await loadCoupledPairsQualityFromUrl(qualityUrl);
      if (quality && quality.pack === manifest.pack) {
        const m = new Map<number, number>();
        for (const p of quality.pairs) {
          if (!p || typeof p !== "object") continue;
          const id = Number((p as any).pair);
          const q = Number((p as any).quality01);
          if (!Number.isFinite(id) || !Number.isFinite(q)) continue;
          m.set(id, q);
        }
        if (m.size) {
          console.info("[coupled-pairs] loaded pairs-quality", {
            pack: manifest.pack,
            url: qualityUrl,
            std: Number((quality as any)?.qualityStats?.std ?? NaN),
            pairs: quality.pairs.length,
          });
          const pairs = manifest.pairs.map((pair) => {
            const q = m.get(pair.pair);
            if (q == null) return pair;
            return { ...pair, quality01: q };
          });
          setCoupledPairsManifest({ ...manifest, pairs });
          return { ...manifest, pairs };
        }
      }
    }
  }
  setCoupledPairsManifest(manifest);
  return manifest;
};
