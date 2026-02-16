# Summary of 14-Day Optimized Rendering Configuration

## 🎯 Optimization Goals
Based on baseline data analysis (14590 presets):
- **Motion=0 Bug**: 15.36% (2240) → Fixed by capturing prevGray in warmup
- **Luma=0 (Black screens)**: 12.46% (1817) → Will be filtered automatically
- **Over-filtered presets**: 39.48% → Reduced by relaxing thresholds

## ⚙️ Key Configuration Changes

### Quality Thresholds (Relaxed)
```
Before (Baseline):           After (Optimized):
├─ minAvgLuma: 0.06      →  ├─ minAvgLuma: 0.01     (Only filter pure black)
├─ maxAvgLuma: 0.96      →  ├─ maxAvgLuma: 0.99     (Only filter pure white)
└─ minMotion: 0.002      →  └─ minMotion: 0.0005    (5x more lenient)
```

### Timeout Configuration (Generous)
```
Before:                      After:
├─ timeoutMs: 20000ms    →  ├─ timeoutMs: 30000ms   (+50%)
├─ retryTimes: 2         →  ├─ retryTimes: 3        (+1 retry)
├─ watchdogIdle: 30s     →  ├─ watchdogIdle: 60s    (2x)
└─ watchdogMax: 60s      →  └─ watchdogMax: 120s    (2x)
```

### Capture Configuration (Optimized)
```
├─ warmupFrames: 60          (Ensures motion calculation has prevGray)
├─ captureCount: 5           (5 frames per preset)
├─ captureEvery: 30          (1 second intervals at 30fps)
└─ captureMaxFrames: 100     (Quality filtering pool)
```

## 📊 Expected Improvements

### Success Rate
```
Baseline:                    Optimized:
├─ OK rate: 99.9%        →  ├─ OK rate: >99.5%      (Maintained)
├─ Motion=0: 15.36%      →  ├─ Motion=0: <2%        (Bug fixed)
├─ Luma=0: 12.46%        →  ├─ Luma=0: ~12%         (Auto-filtered)
└─ Good quality: 60.52%  →  └─ Good quality: >85%   (+24% usable data)
```

### Processing Capacity
```
Target: 130,000 presets
Duration: Up to 14 days (336 hours)
Rate: ~5.4 presets/minute (0.09/sec)
Storage: ~150-200GB estimated
```

## 🔧 Motion Fix Implementation

### Root Cause
```typescript
// OLD CODE (Bug):
for (let i = 0; i < totalFrames; i++) {
  if (i < warmupFrames) continue;  // Skip warmup - prevGray = null!

  let motion;
  if (prevGray) {
    motion = computeMeanAbsDiff01(gray, prevGray);  // First frame: motion=undefined
  }
  prevGray = gray;
}
```

### Fix Applied
```typescript
// NEW CODE (Fixed):
// 1. Separate warmup loop
for (let i = 0; i < warmupFrames; i++) {
  render();
  if (i === warmupFrames - 1) {
    prevGray = computeGray01FromImageData(image.data);  // Capture last warmup frame
  }
}

// 2. Capture loop with valid prevGray
for (let i = warmupFrames; i < totalFrames; i++) {
  render();
  let motion = computeMeanAbsDiff01(gray, prevGray);  // Always has valid prevGray!
  prevGray = gray;
}
```

## 📁 Output Structure
```
d:/aidata/14day-techno-optimized-v1/
├─ frames-index.jsonl         (Metadata for all presets)
├─ render.log                  (Detailed processing log)
├─ frames/                     (Organized by hash prefix)
│  ├─ 00/
│  │  ├─ 01/
│  │  │  └─ 0001abc...xyz/
│  │  │     ├─ frame-000.webp
│  │  │     ├─ frame-001.webp
│  │  │     ├─ frame-002.webp
│  │  │     ├─ frame-003.webp
│  │  │     └─ frame-004.webp
│  │  └─ ...
│  └─ ff/
└─ checkpoints/                (Progress checkpoints every 1000)
```

## 🚀 Launch Commands

### Start Rendering
```powershell
# Automated start with monitoring
powershell -ExecutionPolicy Bypass -File "c:\Users\pc\code\newliveweb\scripts\aivj\start-14day-run.ps1" -AutoConfirm

# Or manual start
node c:\Users\pc\code\newliveweb\scripts\aivj\render-14day-optimized.mjs
```

### Monitor Progress
```powershell
# Real-time monitoring dashboard
powershell -ExecutionPolicy Bypass -File "c:\Users\pc\code\newliveweb\scripts\aivj\monitor-14day-run.ps1"

# Quick status check
powershell -ExecutionPolicy Bypass -File "c:\Users\pc\code\newliveweb\scripts\aivj\analyze-preset-quality.ps1" -JsonlPath "d:\aidata\14day-techno-optimized-v1\frames-index.jsonl"
```

## ⚠️  Critical Notes

1. **Dev Server Required**: Must keep `npm run dev` running on port 5174
2. **Disk Space**: Ensure D: drive has >200GB free space
3. **No Sleep**: Disable Windows sleep/hibernation for 14-day run
4. **Checkpoints**: Automatic resume from last checkpoint if interrupted
5. **Quality Filtering**: Post-processing can further filter luma=0 presets

## 🎓 Data Quality Expectations

### Usable Training Data
```
Total rendered: ~130,000
├─ Status OK: ~129,000 (99%)
├─ Motion=0 (filtered): ~2,600 (2%)
├─ Luma=0 (filtered): ~16,000 (12%)
└─ High quality: ~110,000 (85%)
    ├─ Good brightness range (0.01-0.99)
    ├─ Good motion (>0.0005)
    └─ 5 frames each = 550,000 training images
```

### Training Dataset Size
```
110,000 presets × 5 frames × ~15KB/frame ≈ 8.25GB images
Plus metadata and logs ≈ 10GB total
```

---

**Status**: ✅ Code optimized and motion bug fixed
**Ready**: ✅ Configuration files created
**Next**: 🚀 Start 14-day rendering pipeline
