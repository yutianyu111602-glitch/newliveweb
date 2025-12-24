# newliveweb · Architecture Notes

> Purpose: keep rendering/audio layers modular and ready for future camera/depth (LiDAR) streams without patching all over the codebase.
> Canonical: `MASTER_SPEC.zh.md` (this file is a focused architecture note; append-only).

## Layer Model
- All visual surfaces implement `Layer` (`src/layers/Layer.ts`): `init(scene, renderer)`, `update(dt)`, optional `onResize`, and `dispose`.
- `SceneManager` (`src/SceneManager.ts`) owns renderer, camera, resize handling, and drives a list of `Layer` instances.
- Current layers:
  - `LiquidMetalLayerV2`: background shader, audio-reactive.
  - `ProjectMLayer`: ProjectM canvas texture, additive blend atop the background.
- Camera/depth (future-ready):
  - `CameraLayer` consumes `CAMERA_FEATURE` config and a `LiDARClient`; currently uses local camera via getUserMedia as a placeholder.
  - Scaffolding in `src/camera/LiDARClient.ts` (stream lifecycle) and `src/camera/DepthStream.ts` (depth payload placeholder).
- Future camera/depth layer: implement `Layer`, consume a `MediaStream` or decoded depth/color textures, and mount as a full-screen quad with its own material/blending. No need to touch existing layers—just register it with `SceneManager`.

## Data / Config Surfaces
- Manifest & presets: `config/presetLibraries.ts`, `lib/loadManifest.ts`, `config/presetManifest.ts`.
- Audio: `audio/AudioController.ts` emits `AudioData` to layers.
- Random/Favorites: coordinated in `main.ts`, uses layer APIs only (no cross-layer coupling).

## Extensibility Guidelines
- New visual sources (e.g., LiDAR/camera) = new `Layer` class; avoid modifying existing layers.
- Cross-cutting data (streams, intrinsics, feature flags) should live in `config/*` or a dedicated module (e.g., future `src/camera/*`), not inside layers.
- Keep `main.ts` as the orchestrator only: wiring UI/state → layer methods, not embedding rendering logic.

## Dev / Run Notes (summary)
- Dev: `npm run dev -- --host 127.0.0.1 --port <port> --strictPort`.
- Build: `npm run build` → outputs `dist/`.
- Preview: `npm run preview -- --host --port <port>` (requires `dist/`).
- If a port is “in use”, check with `netstat -ano | findstr <port>` then `taskkill /F /PID <pid>` (admin shell).
