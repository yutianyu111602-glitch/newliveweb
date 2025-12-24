export type PresetLibrarySource =
  | "full"
  | "full-safe"
  | "curated"
  | "curated-safe"
  | "mega";

export interface PresetLibraryConfig {
  id: PresetLibrarySource;
  label: string;
  manifestUrl: string;
  description?: string;
  requireWasmSafe?: boolean;
}

export const PRESET_LIBRARIES: PresetLibraryConfig[] = [
  {
    id: "mega",
    label: "大库 · Mega(子集)",
    manifestUrl: `${
      import.meta.env.BASE_URL
    }presets/mega/library-manifest.json`,
    description:
      "本地子集（由 npm run sync:presets 生成），用于小规模验证/调参；不替代 full/full-safe。",
  },
  {
    id: "full",
    label: "大库 · 全部",
    manifestUrl: `${import.meta.env.BASE_URL}presets/library-manifest.json`,
  },
  {
    id: "full-safe",
    label: "大库 · 安全",
    manifestUrl: `${
      import.meta.env.BASE_URL
    }presets/library-manifest.v1.safe.json`,
    requireWasmSafe: true,
  },
  {
    id: "curated",
    label: "精选 · 全部",
    manifestUrl: `${
      import.meta.env.BASE_URL
    }presets-curated/library-manifest.json`,
  },
  {
    id: "curated-safe",
    label: "精选 · 安全",
    manifestUrl: `${
      import.meta.env.BASE_URL
    }presets-curated/library-manifest.v1.safe.json`,
    requireWasmSafe: true,
  },
];

export const DEFAULT_LIBRARY_SOURCE: PresetLibrarySource = "curated-safe";

export const getLibraryConfig = (
  source: PresetLibrarySource
): PresetLibraryConfig => {
  return (
    PRESET_LIBRARIES.find((lib) => lib.id === source) ?? PRESET_LIBRARIES[0]
  );
};
