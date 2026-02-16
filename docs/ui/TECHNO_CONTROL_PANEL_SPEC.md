Techno Control Panel UI Spec (Ableton-style)

Purpose
- Keep many parameters, but organized and collapsible.
- Ableton Live native plugin feel: macro row, grouped modules, consistent knobs.
- Fast live control + safe defaults.

Core Interaction Rules
- Macro row always visible (8 macros).
- Panels are collapsible; only 2-3 key panels expanded by default.
- Each control shows label, value, unit; double-click resets to default.
- Shift-drag for fine control, Alt-drag for coarse control.
- Parameters can be mapped to macros (simple "Assign" hover button).

Layout Sketch (ASCII)
+----------------------------------------------------------------------------------+
| Macro 1  Macro 2  Macro 3  Macro 4  Macro 5  Macro 6  Macro 7  Macro 8            |
| [value]  [value]  [value]  [value]  [value]  [value]  [value]  [value]           |
+----------------------------------------------------------------------------------+
| [v] Performance        | [v] Audio Reactivity   | [>] FFT / Spectrum             |
| [v] Fusion / Overlay   | [>] Capture / Render   | [>] Reliability                |
| [>] Output / Storage   | [>] Advanced / Debug   | [>] UI / Layout                 |
+----------------------------------------------------------------------------------+
| Panel content (knobs, sliders, toggles, dropdowns)                               |
| - Uniform knob sizes, per-panel color accents                                    |
| - Value readout below each knob                                                  |
| - Collapse panels to keep focus                                                  |
+----------------------------------------------------------------------------------+

Panel Grouping (with defaults and ranges)
- Performance (default open)
  - Mode: Techno | Fusion | Capture (default: Techno)
  - Reactivity: 0.5..2.0 (default: 1.2) -> maps to audioKickBoost + audioBassBoost
  - Motion: 0.8..1.6 (default: 1.1) -> maps to timeScale
  - Brightness Clamp Min: 0..1 (default: 0.02) -> frameLumaMin
  - Brightness Clamp Max: 0..1 (default: 0.90) -> frameLumaMax
  - Capture Density: 1..6 (default: 4) -> captureCount

- Audio Reactivity (default open)
  - BPM Mode: Fixed | Range (default: Range)
  - BPM: 60..200 (default: 132) -> audioBpm
  - BPM Min: 90..200 (default: 122) -> audioBpmMin
  - BPM Max: 90..200 (default: 145) -> audioBpmMax
  - Swing: 0..0.25 (default: 0.08) -> audioSwing
  - Kick Boost: 0.6..2.5 (default: 1.6) -> audioKickBoost
  - Bass Boost: 0.5..2.0 (default: 1.4) -> audioBassBoost
  - Hat Boost: 0.4..2.0 (default: 1.2) -> audioHatBoost
  - Clap Boost: 0.4..2.0 (default: 1.0) -> audioClapBoost
  - Audio Seed: integer (default: presetSeed) -> audioSeed

- FFT / Spectrum (collapsed)
  - FFT Enable: on/off (default: off)
  - FFT Smooth: 0..1 (default: 0.6)
  - Band Weights Low/Mid/High: 0..2 (default: 1.0/0.8/0.6)
  - FFT -> Overlay Depth: 0..1 (default: 0.7)
  - FFT -> Overlay Mix: 0..1 (default: 0.5)
  - FFT -> Frame Pick Bias: 0..1 (default: 0.5)

- Fusion / Overlay (collapsed)
  - Overlay Mode: none | parallax (default: none)
  - Overlay Blend: screen | add | overlay | multiply (default: screen)
  - Overlay Mix: 0..1 (default: 0.55) -> overlayMix
  - Overlay Depth Px: 0..128 (default: 14) -> overlayDepthPx
  - Overlay Scale: 0..0.25 (default: 0.06) -> overlayScale
  - Overlay Seed: integer (default: 202501) -> overlaySeed
  - Overlay Source: manifest/path (default: same pack)

- Capture / Render (collapsed)
  - Warmup Frames: 0..300 (default: 120) -> warmupFrames
  - Capture Every: 10..120 (default: 60) -> captureEvery
  - Capture Max Frames: 3..12 (default: 8) -> captureMaxFrames
  - Out Size: 128..512 (default: 224) -> outSize
  - Format: webp | png (default: webp)
  - WebP Quality: 0.6..1.0 (default: 0.92) -> webpQuality

- Reliability (collapsed)
  - Timeout Ms: 5000..90000 (default: 45000) -> timeoutMs
  - Prewarm Timeout Ms: 30000..180000 (default: 120000) -> prewarmTimeoutMs
  - Retry Times: 0..6 (default: 3) -> retryTimes
  - Refresh Every: 20..150 (default: 90) -> refreshEvery

- Output / Storage (collapsed)
  - OutDir (default: D:\aidata\...)
  - Upload Root (default: Z:\code\aidata)
  - Upload After Job: on/off (default: on)
  - Skip Post: on/off (default: off)

- Advanced / Debug (collapsed)
  - timeMode: fixedStep | realtime (default: fixedStep)
  - fixedStepFps: 1..120 (default: 30)
  - forceNewWasmModule: on/off (default: off)
  - headless: on/off (default: on)
  - logEvery: 10..50 (default: 25)

- UI / Layout (collapsed)
  - Collapse All / Expand All
  - Show Advanced By Default: on/off (default: off)
  - Macro Row Height: small/medium/large (default: medium)

Parameter Storage
- See `newliveweb/docs/ui/techno-control-params.json` for a structured list of defaults,
  ranges, and internal mappings.
