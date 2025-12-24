# Performance Optimization Log (local)

- 2025-12-23 07:33 - Plan: target Depth sampling performance; start optimization pass.
- 2025-12-23 07:33 - DepthLayer: add adaptive processing interval/max-side cap and skip processing when opacity is near zero; expose procIntervalMs/procMaxSide in status.
- 2025-12-23 07:33 - Audio analysis: add dynamic FPS cap (30/45/60) with hysteresis based on frame-time p95; record control-plane events.
- 2025-12-23 07:33 - Preset prefetch: defer background prefetch when render is unstable or p95 exceeds threshold.
- 2025-12-23 07:33 - Compositor: add ProjectM bypass when opacity is near-zero to skip RT passes and composite work.
- 2025-12-23 08:01 - AIVJ audio expressiveness: shape energy with ceiling + accent boost, add tone guard on macro outputs to avoid over-bright/over-dark swings.
- 2025-12-23 08:16 - BeatTempo: add dynamic input FPS cap (10/20/30) based on render stability/audio validity/p95 to reduce worker load under pressure.
- 2025-12-23 08:24 - ProjectM audio feed: add dynamic cadence caps for FG/BG layers based on render stability/audio validity/p95 to trim audio feed cost under load.
- 2025-12-23 08:36 - Preset switch load shedding: add temporary pressure window that drops analysis/beat/PM audio feeds and pauses prefetch during preset loads.
- 2025-12-23 08:45 - AIVJ expressiveness: accent-driven delta/duration scaling plus bass/body fusion boost with beat-gated accent scaling.
- 2025-12-23 08:51 - Audio drive expressiveness: profile-specific accent scaling + slot pulse layer; AudioControls presets tuned for stronger musical motion.
- 2025-12-23 09:15 - AIVJ diagnostics: expose accent + slot pulse debug (Diagnostics/DecisionTrace) with aivj trace details.
- 2025-12-23 19:19 - Headless verify: add __nw_verify.getPerfCaps hook; verify perf caps + AIVJ accent observability + audio-drive presets + preset load shedding; verify-check enforces these checks.
- 2025-12-23 19:19 - Preset prefetch: defer prefetch pump until preset load pressure ends (avoid load+prefetch contention).
- 2025-12-23 19:19 - Audio analysis: decouple frequency/band computation from time-domain analysis; cap frequency updates to 30fps (time-domain still follows analysis fps cap).
- 2025-12-23 19:19 - DepthLayer: add processing cost telemetry + adaptive perfTier (interval/max-side/blur/scale degrade) to keep depth responsive under load.
