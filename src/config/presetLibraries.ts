export type PresetLibrarySource = 'full' | 'full-safe' | 'curated' | 'curated-safe';

export interface PresetLibraryConfig {
  id: PresetLibrarySource;
  label: string;
  manifestUrl: string;
  description?: string;
  requireWasmSafe?: boolean;
}

export const PRESET_LIBRARIES: PresetLibraryConfig[] = [
  {
    id: 'full',
    label: '大库 · 全部',
    manifestUrl: '/presets/library-manifest.json'
  },
  {
    id: 'full-safe',
    label: '大库 · 安全',
    manifestUrl: '/presets/library-manifest.v1.safe.json',
    requireWasmSafe: true
  },
  {
    id: 'curated',
    label: '精选 · 全部',
    manifestUrl: '/presets-curated/library-manifest.json'
  },
  {
    id: 'curated-safe',
    label: '精选 · 安全',
    manifestUrl: '/presets-curated/library-manifest.v1.safe.json',
    requireWasmSafe: true
  }
];

export const DEFAULT_LIBRARY_SOURCE: PresetLibrarySource = 'curated-safe';

export const getLibraryConfig = (source: PresetLibrarySource): PresetLibraryConfig => {
  return PRESET_LIBRARIES.find((lib) => lib.id === source) ?? PRESET_LIBRARIES[0];
};
