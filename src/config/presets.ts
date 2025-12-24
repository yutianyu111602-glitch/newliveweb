export type PresetDescriptor = {
  id: string;
  name?: string;
  label?: string;
  url?: string;
  path?: string;
  wasmCompat?: import("../types/presets").WasmCompatInfo;
  blendTuning?: {
    energyToOpacityAmount?: number;
    energyCurve?: number;
    accentContribution?: number;
    bassMotionAmount?: number;
    highSparkleAmount?: number;
  };
};

// Fix the built-in presets to use consistent properties
export const BUILT_IN_PRESETS: readonly PresetDescriptor[] = [
  {
    id: "bass-driven",
    name: "Bass Motion",
    path: "/presets/bass.milk",
    url: "/presets/bass.milk",
    blendTuning: {
      bassMotionAmount: 0.8,
      highSparkleAmount: 0.2
    }
  },
  {
    id: "default",
    name: "Default",
    path: "/presets/default.milk",
    url: "/presets/default.milk",
    blendTuning: {
      energyToOpacityAmount: 0.25,
      energyCurve: 1.7,
      accentContribution: 0.3
    }
  },
  {
    id: "martin-liquid-gold",
    label: "martin · Liquid Gold",
    path: "/presets/martin-liquid-gold.milk",
    url: "/presets/martin-liquid-gold.milk",
  },
  {
    id: "geiss-starfish-1",
    label: "Geiss · Starfish 1",
    path: "/presets/geiss-starfish-1.milk",
    url: "/presets/geiss-starfish-1.milk",
  },
];

let runtimePresets: PresetDescriptor[] = [];

const BROKEN_PRESET_STORAGE_KEY = "nw.presets.broken";

const loadBrokenPresetIds = (): string[] => {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(BROKEN_PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((v) => String(v)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
};

const persistBrokenPresetIds = (ids: Set<string>) => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(BROKEN_PRESET_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
};

const badPresetIds = new Set<string>(loadBrokenPresetIds());

export const registerRuntimePresets = (presets: PresetDescriptor[]) => {
  runtimePresets = presets;
};

export const getAllPresets = (): PresetDescriptor[] => {
  return [...BUILT_IN_PRESETS, ...runtimePresets].filter(
    (preset) => !badPresetIds.has(preset.id)
  );
};

export const findPresetById = (id: string): PresetDescriptor | undefined =>
  getAllPresets().find((preset) => preset.id === id);

export const getNextPreset = (
  currentId: string | null
): PresetDescriptor | undefined => {
  const presets = getAllPresets();
  if (!presets.length) {
    return undefined;
  }
  const currentIndex = currentId
    ? presets.findIndex((preset) => preset.id === currentId)
    : -1;
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % presets.length : 0;
  return presets[nextIndex];
};

export const markPresetAsBroken = (id: string) => {
  badPresetIds.add(id);
  persistBrokenPresetIds(badPresetIds);
};

export const clearBrokenPresets = () => {
  badPresetIds.clear();
  persistBrokenPresetIds(badPresetIds);
};
