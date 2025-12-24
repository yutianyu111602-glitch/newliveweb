import type { LibraryManifestV0 } from "../types/presets";

type LoadManifestOptions = {
  requireWasmSafe?: boolean;
};

export async function loadLibraryManifest(
  manifestUrl: string = `${
    import.meta.env.BASE_URL
  }presets/library-manifest.json`,
  options: LoadManifestOptions = {}
): Promise<LibraryManifestV0> {
  const res = await fetch(manifestUrl, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to load manifest ${manifestUrl}: ${res.status} ${res.statusText}. Ensure 'npm run sync:presets' has been run.`
    );
  }

  const data = (await res.json()) as LibraryManifestV0;

  if (
    data.version !== "v0" &&
    data.version !== "v1" &&
    data.version !== "v2" &&
    data.version !== "v3"
  ) {
    throw new Error(
      `Unsupported manifest version: ${String((data as any).version)}`
    );
  }

  // For v0 we only rely on the base fields; extra fields are treated as optional.
  const requireWasmSafe = options.requireWasmSafe ?? false;
  let filteredOutByWasmCompat = 0;
  let presets = data.presets ?? [];

  if (requireWasmSafe) {
    const filtered = presets.filter((entry) => entry.wasmCompat?.ok !== false);
    filteredOutByWasmCompat = presets.length - filtered.length;
    presets = filtered;
  }

  return { ...data, presets, filteredOutByWasmCompat };
}
