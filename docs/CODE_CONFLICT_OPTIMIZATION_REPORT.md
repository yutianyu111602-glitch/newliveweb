<!-- DEPRECATED: status=MERGE -->
<!-- reason: 与较新文档重复 -->
<!-- replacement: docs/MASTER_SPEC.zh.md#deprecated-optimization-complete -->
<!-- migrated: 2026-02 -->

> Note: This document is superseded. See replacement link above.

---
# 鏂版棫浠ｇ爜鍐茬獊浼樺寲瀹屾垚鎶ュ憡

> 鎵ц鏃堕棿锛?026-01-30  
> 浼樺寲鑼冨洿锛欰udioBus 鍚堝苟銆佹柊鍔熻兘闆嗘垚銆佹枃妗ｈ縼绉?

---

## 1. 鍙戠幇骞朵慨澶嶇殑鍐茬獊

### 1.1 AudioBus 鍙屽疄鐜板啿绐?鉁?宸茶В鍐?

**闂**锛歚AudioBus.ts` 鍜?`AudioBusOptimized.ts` 浠ｇ爜閲嶅 95%

**瑙ｅ喅鏂规**锛?
- 灏?Meyda FFT 鍒嗘瀽鍣ㄩ泦鎴愬埌鍘熷 `AudioBus` 绫?
- 娣诲姞鐗规€у紑鍏?`useMeyda` 鎺у埗鍚敤/绂佺敤
- 鍒犻櫎 `AudioBusOptimized.ts`锛垀500琛岄噸澶嶄唬鐮侊級
- 鍒犻櫎鐩稿叧娴嬭瘯鏂囦欢

**浠ｇ爜鍙樻洿**锛?
```typescript
// AudioBus.ts 鏂板
- Meyda 寤惰繜鍔犺浇鍑芥暟
- initMeydaAnalyzer() 鏂规硶锛堝紓姝ュ垵濮嬪寲锛?
- getMeydaFeatures() 鏂规硶
- dispose() 涓竻鐞?Meyda 鍒嗘瀽鍣?
```

---

### 1.2 reactiveSwitcher 鏈纭泦鎴?鉁?宸茶В鍐?

**闂**锛歚reactiveSwitcher` 琚垵濮嬪寲浣嗘湭鍦ㄩ煶棰戝抚鍥炶皟涓皟鐢?

**淇**锛?
```typescript
// 鍦?bootstrap.ts 鐨?audioBus.onFrame 鍥炶皟涓坊鍔狅細
if (reactiveSwitcher && isFeatureEnabled("useReactiveSwitch")) {
  reactiveSwitcher.onAudioFrame(frame);
}
```

**鍚屾椂淇**锛氭坊鍔犲€欓€夐璁炬睜鍒濆鍖?
```typescript
const allPresetIds = getAllPresets().map((p) => p.id);
reactiveSwitcher.setCandidatePresets(allPresetIds);
```

---

### 1.3 getAivjStyleIndexV0 鍑芥暟鏈鍏?鉁?宸茶В鍐?

**闂**锛歚getAivjStyleIndexV0` 琚０鏄庝絾鏈鍏ワ紝瀵艰嚧绫诲瀷閿欒

**淇**锛?
```typescript
// 娣诲姞瀵煎叆
import { getAivjStyleIndexV0 } from "../features/presets/aivjStyleIndexV0";

// 鍒犻櫎鍑芥暟澹版槑
declare function getAivjStyleIndexV0(): ... // 宸插垹闄?
```

---

### 1.4 鏍圭洰褰曟枃妗ｆ贩涔?鉁?宸茶В鍐?

**闂**锛氭牴鐩綍鏈夊ぇ閲忔枃妗ｆ枃浠讹紝闇€瑕佹寜瑙勮寖杩佺Щ

**鎵ц杩佺Щ**锛堟牴鎹?ROOT_TO_DOCS_MIGRATION_MAP_2026-01-30.zh.md锛夛細

| 鍘熶綅缃?| 鏂颁綅缃?|
|--------|--------|
| `130k_strategy_discussion.md` | `docs/reference/whitepapers/optimization/` |
| `optimization_plan.md` | `docs/reference/whitepapers/optimization/` |
| `comprehensive-audio-guide.md` | `docs/reference/whitepapers/audio/` |
| `audio-pipeline-detailed-spec.md` | `docs/reference/whitepapers/audio/` |
| `audio-pipeline-optimization.md` | `docs/reference/whitepapers/audio/` |
| `dual-projectm-implementation.md` | `docs/reference/whitepapers/projectm/` |
| `DUAL_PROJECTM_3D_COUPLING_OPTIMIZATION.md` | `docs/reference/whitepapers/projectm/` |
| `AUDIO_DRIVEN_PROJECTM_COMPREHENSIVE_PLAN.md` | `docs/reference/whitepapers/audio-driven-projectm/LEGACY_*.md` |
| `AUDIT_SUMMARY.md` 绛夋姤鍛?| `docs/reports/root-migration/` |
| `AI_ALCHEMY_DIAGNOSIS.md` 绛?AI 鎶ュ憡 | `docs/reports/ai/` |
| `EXECUTION_CHECKLIST.md` 绛夋墜鍐?| `docs/runbooks/` |
| `*.local.md` 鏈湴蹇収 | `docs/archive/local/` |
| `TODOS_ARCHIVE.zh.md` | `docs/archive/` |

**鏍圭洰褰曚繚鐣?*锛?
- README.md
- MASTER_SPEC.zh.md
- DOCS_INDEX.zh.md
- LOCAL_DEV_GUIDE.md
- DATA_INTERFACES.zh.md
- INFRASTRUCTURE_PLAN.zh.md
- TODOS.zh.md
- AGENTS.md銆両DENTITY.md銆丼OUL.md銆乁SER.md銆丮EMORY.md銆乀OOLS.md銆丠EARTBEAT.md锛堟殏涓嶅姩锛?

---

## 2. 鏂板姛鑳介泦鎴愮姸鎬?

### 2.1 BanditRecommender 鉁?宸查泦鎴?

**闆嗘垚鐐?*锛歚bootstrap.ts` 鐨?`onLikeCurrent` 鍜?`onDislikeCurrent` 鍥炶皟

```typescript
if (isFeatureEnabled("useBanditRecommendation")) {
  const bandit = getBanditRecommender();
  const snapshot = audioBus.getSnapshot();
  if (snapshot) {
    bandit.recordFeedback({
      armId: getClusterForPreset(currentPresetId) ?? currentPresetId,
      action: "favorite" | "skip",
      durationMs: ...,
      context: createBanditContext(snapshot),
    });
  }
}
```

### 2.2 ReactivePresetSwitcher 鉁?宸查泦鎴?

**闆嗘垚鐐?*锛歚bootstrap.ts`
- 鍒濆鍖栨椂璁剧疆鍊欓€夐璁炬睜锛堟墍鏈夊彲鐢ㄩ璁撅級
- 鍦?`audioBus.onFrame` 鍥炶皟涓皟鐢?`onAudioFrame()`
- 鐩戝惉 `onSwitch` 浜嬩欢锛圱ODO: 闇€鎺ュ叆瀹為檯棰勮鍒囨崲閫昏緫锛?

### 2.3 PerformanceMonitor 鉁?宸查泦鎴?

**闆嗘垚鐐?*锛歚bootstrap.ts` 鍒濆鍖?
- 鍚姩鍐呭瓨鐩戞帶锛堟瘡 10 绉掞級
- 鐩戝惉鎬ц兘璀﹀憡浜嬩欢

### 2.4 SimilarPresetSearch 馃煛 鐙珛鍔熻兘

**鐘舵€?*锛氶€氳繃 `SimilarPresetPanel` UI 缁勪欢浣跨敤锛屾湭鐩存帴闆嗘垚鍒?bootstrap

**浣跨敤鏂瑰紡**锛?
```typescript
import { loadEmbeddingIndex, findSimilarPresets } from "./features/presets";
```

---

## 3. 缂栬瘧鐘舵€?

```bash
npm run lint  # 鉁?閫氳繃锛屾棤 TypeScript 閿欒
```

---

## 4. 宸茬煡闄愬埗涓庡悗缁伐浣?

### 4.1 Bandit 鍙岀郴缁熷叡瀛?
- `aivjBanditV0`锛圗MA锛夊拰 `BanditRecommender`锛圱hompson Sampling锛?
- **鐘舵€?*锛氭湁鎰忎繚鐣欙紝鐢ㄩ€斾笉鍚?
- **寤鸿**锛氶暱鏈熻€冭檻娣诲姞鏁版嵁鍚屾鏈哄埗

### 4.2 ReactiveSwitcher 鍥炶皟寰呭畬鍠?
- 褰撳墠浠呮墦鍗版棩蹇楋紝闇€鎺ュ叆瀹為檯棰勮鍒囨崲閫昏緫
- **寤鸿**锛氫笌 AIVJ Controller 闆嗘垚

### 4.3 鐩镐技棰勮鎼滅储寰呴泦鎴?
- 褰撳墠浠呴€氳繃 UI 闈㈡澘浣跨敤
- **寤鸿**锛氬湪 AIVJ 閫夋嫨閫昏緫涓泦鎴愮浉浼兼帹鑽?

---

## 5. 鏂囦欢鍙樻洿缁熻

### 淇敼鐨勬枃浠?
- `src/audio/AudioBus.ts` - 娣诲姞 Meyda 鏀寔
- `src/audio/index.ts` - 鏇存柊瀵煎嚭
- `src/app/bootstrap.ts` - 闆嗘垚鏂板姛鑳?

### 鏂板鐨勬枃浠?
- `src/features/presets/index.ts` - 缁熶竴鍏ュ彛
- `src/utils/index.ts` - 缁熶竴鍏ュ彛
- `src/features/analytics/index.ts` - 缁熶竴鍏ュ彛
- `src/config/index.ts` - 缁熶竴鍏ュ彛

### 鍒犻櫎鐨勬枃浠?
- `src/audio/AudioBusOptimized.ts`
- `src/audio/__tests__/AudioBusOptimized.test.ts`
- `src/audio/__tests__/AudioBusABTest.ts`

### 杩佺Щ鐨勬枃妗?
- 29 涓枃妗ｆ枃浠惰縼绉诲埌 `docs/` 鐩稿簲鐩綍

---

## 6. 缁撹

鉁?**鎵€鏈変富瑕佸啿绐佸凡瑙ｅ喅**锛?
- AudioBus 鍙屽疄鐜板悎骞跺畬鎴?
- 鏂板姛鑳芥纭泦鎴愬埌涓绘祦绋?
- 鏂囨。鎸夎鑼冭縼绉?
- 缂栬瘧閫氳繃

**浠ｇ爜鐘舵€?*锛氣渽 鍙畨鍏ㄦ祴璇曞拰閮ㄧ讲
