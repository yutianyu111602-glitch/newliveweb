export type PresetDescriptor = {
  id: string;
  label: string;
  url: string;
  wasmCompat?: import('../types/presets').WasmCompatInfo;
};

export const BUILT_IN_PRESETS: PresetDescriptor[] = [
  {
    id: 'default',
    label: 'Default · LiquidMetal Blend',
    url: '/presets/default.milk'
  },
  {
    id: 'martin-liquid-gold',
    label: 'martin · Liquid Gold',
    url: '/presets/martin-liquid-gold.milk'
  },
  {
    id: 'geiss-starfish-1',
    label: 'Geiss · Starfish 1',
    url: '/presets/geiss-starfish-1.milk'
  }
];

let runtimePresets: PresetDescriptor[] = [];
const badPresetIds = new Set<string>();

export const registerRuntimePresets = (presets: PresetDescriptor[]) => {
  runtimePresets = presets;
};

export const getAllPresets = (): PresetDescriptor[] => {
  return [...BUILT_IN_PRESETS, ...runtimePresets].filter((preset) => !badPresetIds.has(preset.id));
};

export const findPresetById = (id: string): PresetDescriptor | undefined =>
  getAllPresets().find((preset) => preset.id === id);

export const getNextPreset = (currentId: string | null): PresetDescriptor | undefined => {
  const presets = getAllPresets();
  if (!presets.length) {
    return undefined;
  }
  const currentIndex = currentId ? presets.findIndex((preset) => preset.id === currentId) : -1;
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % presets.length : 0;
  return presets[nextIndex];
};

export const markPresetAsBroken = (id: string) => {
  badPresetIds.add(id);
};

export const clearBrokenPresets = () => {
  badPresetIds.clear();
};
