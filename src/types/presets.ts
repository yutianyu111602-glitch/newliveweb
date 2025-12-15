export type ManifestVersion = 'v0' | 'v1' | 'v2' | 'v3';

export type WasmCompatInfo = {
  ok: boolean;
  errorType?: string;
  message?: string;
  probedAt?: string;
  exitCode?: number;
  probeTool?: string;
};

export type PresetEntryV0 = {
  // Required v0 fields
  id: string; // Global unique ID, equals relPath in current implementation
  label: string; // UI label (file name without extension)
  relPath: string; // Path relative to sourceRoot, always using "/"
  url: string; // e.g. "/presets/" + relPath
  pack: string; // Top-level pack folder, e.g. "presets"
  fileName: string; // File name with extension, e.g. "foo.milk"
  fileSize: number; // Size in bytes

  // Optional metadata
  meta?: {
    title?: string | null;
    author?: string | null;
    // Allow additional metadata fields from future manifest versions
    [k: string]: unknown;
  };

  // Optional compatibility annotations (v1+)
  wasmCompat?: WasmCompatInfo;
  dangerFlags?: string[];
};

export type LibraryManifestV0 = {
  version: ManifestVersion; // Currently "v0"
  generatedAt: string; // ISO timestamp (UTC)
  sourceRoot: string; // Windows scan root for MegaPack (for display only)
  totalFilesScanned: number; // Total .milk files scanned (including excluded)
  totalPresetsIncluded: number; // Number of entries actually included in presets[]
  presets: PresetEntryV0[];

  // Optional probe metadata (v1+)
  probedWith?: string;
  filteredOutByWasmCompat?: number;
};
