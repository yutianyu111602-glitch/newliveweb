import type { LibraryManifestV0 } from '../types/presets';
import type { PresetDescriptor } from './presets';

export function mapManifestToPresetDescriptors(manifest: LibraryManifestV0): PresetDescriptor[] {
  if (!manifest.presets || !Array.isArray(manifest.presets)) {
    return [];
  }

  return manifest.presets.map((entry): PresetDescriptor => ({
    id: entry.id,
    label: entry.label,
    url: entry.url,
    wasmCompat: entry.wasmCompat
  }));
}
