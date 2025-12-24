// Optional, dev-oriented hints shown in the UI (not required for production).
// Configure via `.env.local` (Vite): `VITE_TEST_AUDIO_LIBRARY_PATH`, `VITE_PRESET_PACK_PATH`.
export const TEST_AUDIO_LIBRARY_PATH =
  String(import.meta.env.VITE_TEST_AUDIO_LIBRARY_PATH ?? "").trim();
export const PRESET_PACK_PATH = String(
  import.meta.env.VITE_PRESET_PACK_PATH ?? ""
).trim();
