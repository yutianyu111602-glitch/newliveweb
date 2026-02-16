# UI 妯″潡娓呭崟 & 鏁版嵁閫氳矾鎬昏  锛坣 ewliveweb 锛?

> 璇存槑锛?025-12-19 鏀舵暃锛夛細鏈  枃鏄?P1 鐨勨 € 滄墜宸ュ贰妫 € checklist 鈥濄 € 傛墽琛?楠屾敹浠?`TODOS.zh.md` 涓哄叆鍙ｏ紝鏈  畬鎴愰」闆嗕腑鍦?`docs/reports/UNFINISHED_TODOS_ROADMAP.local.zh.md`銆?
> 鐩  爣锛氫负鈥滃叏 UI / 鍏ㄦ ā 鍧楃獥鍙ｅぇ鏀?+ 鍏ㄩ摼璺 € 氳矾宸 ℃ 鈥濇彁渚涘彲鏍稿  鐨勬竻鍗曘 €?
> 绾︽潫锛堟部鐢ㄥ綋鍓嶅伐绋嬪叡璇嗭級锛?

- 涓嶆敼娓叉煋/闊抽 /AIVJ/鍙傛暟娑堣垂閫昏緫锛堥櫎闈炲彂鐜伴 € 氳矾鏂 /鏄犲皠閿欒  锛夈 €?- UI 鏀瑰姩浼樺厛鍋氬竷灞 €/缁撴瀯/鍒嗙粍/婧 ㈠ 嚭绛栫暐锛涘敖閲忎笉寮曞叆鏂伴  鏍煎彉閲忎笌鏂伴  鑹层 €?

---

## 1) 妯″潡娓呭崟锛堟寜 UI 褰 ㈡€ 侊級

### A. Toolbar Sections 锛堥〉闈  富闈 ㈡ 澘涓  殑妯″潡绐楋級

杩欎簺妯″潡鐨?DOM 缁撴瀯鐢?`renderShell()` 鐢熸垚锛屼富鍏ュ彛锛?

- `src/app/renderShell.ts`
- `src/app/bootstrap.ts` 璐熻矗缁戝畾 controller + 鏁版嵁婧?

Note: toolbar sections/rows are tagged with `data-group="live|debug|advanced"`.
Debug/Advanced groups are hidden by default and toggled via the toolbar bar buttons.
| 妯″潡 | DOM / 鍏抽敭 id | Controller / 閫昏緫鏂囦欢 | 鏁版嵁婧? | 鍐欏叆閫氶亾 |
| ---------------------- | --------------------------------------- | ---------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| Audio Transport | `#audio-*` | `src/app/controllers/audioTransportController.ts` | `AudioBus` | 鎺 т 欢鐩存帴璋冪敤 controller 锛堟挱鏀?杈撳叆/URL 锛? |
| Background Mixer | `#bg-type` / layer toggles | `src/app/controllers/backgroundMixerUiController.ts` | `VisualStateV2.background` + layers | `applyBackgroundTypePatch` / `applyBackgroundLayerPatch` |
| Macros (knobs + slots) | `#macro-*` / `#macro-slots` | `src/app/controllers/macroSlotsController.ts` | `VisualStateV2.global.macroSlots` + AIVJ/MIDI | `setMacroValue*` / `updateMacroSlot` |
| ProjectM Blend | `#pm-*` | 缁戝畾鍦?`bootstrap.ts`锛? Inspector/MIDI 鍙  啓锛? | `ProjectMLayer.getBlendParams()` | `applyProjectMBlendPatch` |
| Inspector | `#inspector-*` / `#inspector-container` | `src/app/controllers/inspectorController.ts` | `paramSchema` + getters | `applyInspectorPatch(scope, patch)` |
| MIDI | `#midi-*` | `src/app/controllers/midiController.ts` | Settings store + MIDI events | 鍚?patch 鍑芥暟锛歅 rojectM / Background / Audio / BeatTempo / Macros |

### B. Floating Panels 锛堟诞鍔ㄩ潰鏉跨被妯″潡绐楋級

| 妯″潡       | DOM / 鍏抽敭 id      | 閫昏緫鏂囦欢                               | 鏁版嵁婧?         | 鍐欏叆閫氶亾          |
| ----------- | -------------------- | ------------------------------------------ | ----------------- | --------------------- |
| Diagnostics | `#diagnostics-panel` | `src/features/console/DiagnosticsPanel.ts` | runtime info      | 鍙  灞曠ず          |
| Favorites   | `#favorites-panel`   | `src/features/favorites/FavoritesPanel.ts` | favorites storage | `onLoad` / `onDelete` |

---

## 2) 鍙傛暟绯荤粺涓庢暟鎹 € 氳矾锛堝繀椤婚『鐣咃級

### 2.1 鍙傛暟瀹氫箟锛堝崟涓 € 鐪熸簮锛?

- `src/state/paramSchema.ts`
  - `ParamDef.kind` 鍐冲畾 UI 鎺 т 欢褰 ㈡€? - `ParamDef.group` 鍐冲畾 Inspector 鍒嗙粍 + scope 鏄犲皠

### 2.2 Inspector 閫氳矾

- 鐢熸垚 UI 锛歚 src/app/controllers/inspectorController.ts`

  - `getScopeForDef(def.group)`锛歚 group 鈫?scope`
  - `renderDefRow(def)`锛歚 def.kind 鈫?DOM 鎺 т 欢`
  - `onContainerInput()`锛歚 DOM event 鈫?applyInspectorPatch(scope, {key: value})`

- 钀藉湴搴旂敤锛歚 src/app/bootstrap.ts`
  - `applyInspectorPatch(scope, patch)`锛? - `audio.beatTempo` 鈫?`beatTempo.setConfig()`
    - `audio.controls` 鈫?`applyAudioControlsPatch()`
    - `projectm.blend` 鈫?`ProjectMLayer.setBlendParams()` + compositor
    - `background.*` 鈫?`applyBackgroundTypePatch` / `applyBackgroundLayerPatch`

### 2.3 MIDI 閫氳矾

- UI/缁戝畾锛歚 src/app/controllers/midiController.ts`

  - 鐩  爣绫诲瀷锛歮 acro / slot / param
  - param id 绾﹀畾锛? - `projectm.<key>`
    - `audio.controls.<key>`
    - `audio.beatTempo.<key>`
    - `background.<layer>.<key>`锛堣  controller 鍐呭疄鐜帮級

- 钀藉湴搴旂敤锛氬悓鏍峰湪 `bootstrap.ts` 閫氳繃娉ㄥ叆鐨?patch 鍑芥暟鍐欏叆銆?

### 2.4 AIVJ 閫氳矾锛堝畯鐨勫崟鍐欏叆閾撅級

- AI 浜 х 墿锛歚 src/features/aivj/unifiedAivjController.ts`

  - Scheme B 锛歴 low bank 鍙  啓鍥?saved state 锛沘 ccent runtime-only

- 钀藉湴搴旂敤锛堣繍琛屾椂锛夛細`src/app/bootstrap.ts`
  - unified single-writer 锛欰 udioControls + AIVJ 鍚堟垚鍚庣粺涓 € 鍐欏叆瀹? - overlayBudget runtime 娑堣垂锛氬奖鍝嶅悇 layer opacity multiplier + ProjectM retreat 锛坮 untime-only 锛?

---

## 3) 鍏ㄩ摼璺  贰妫 € 娓呭崟锛堟墽琛屾椂閫愭潯鎵撳嬀锛?

- [!] `paramSchema` 鏂板 /璋冩暣鐨?key 鑳藉湪 Inspector 涓  寜 group 鍑虹幇锛堥粯璁ゅ彲瑙佹 €х 鍚堥  鏈燂級
- [!] `group 鈫?scope` 鏄犲皠瑕嗙洊鎵 € 鏈夐渶瑕佸湪 Inspector 灞曠ず鐨勫弬鏁扮粍
- [!] Inspector 涓  瘡绫?row 锛坣 umber/enum/bool/string 锛夊湪 320px+ 涓嶆孩鍑恒 € 佷笉閬  尅銆佷笉涓叉爮
- [!] MIDI 锛氭墍鏈?target 锛坢 acro/slot/param 锛夊啓鍏ラ兘鑳藉埌杈惧  搴?patch 钀藉湴鐐?- [!] AIVJ 锛歮 idiLock/hold/off/ai 鍥涙 € 佸垏鎹  笉浜掔浉鍐欑 ┛ 锛泂 low bank write-back 棰戠巼鍙  帶
- [!] Diagnostics 锛欰 IVJ debug 銆丄 udioFrame 銆丳 rojectM 鐘舵 € 佸瓧娈典笌杩愯  鏃朵竴鑷?- [!] Favorites 锛氫繚瀛?杞藉叆/瀵规瘮/瀵煎嚭 CSV 鍦?UI 涓?headless 涓嬮兘鍙  敤

### 鑷  姩宸 ℃ 锛堣緟鍔 ╋ 級

- `npm run audit:dataflow`
  - 杈撳嚭锛歚 artifacts/audit/dataflow-inspector-groups.md`
  - 浣滅敤锛氭  鏌?`paramSchema` 涓  殑 `group` 鏄  惁琚?Inspector 鐨?`getScopeForDef(def.group)` 瑕嗙洊锛堟帓闄ゆ槑纭  笉璧?Inspector 鐨勭粍锛屼緥濡?`Global/Macros`锛?

---

## 4) Headless 鍙  鍖栦骇鐗 ╋ 紙璇佹槑 UI 纭  疄鏀瑰彉锛?

- `artifacts/headless/screenshot.png`锛歠 ullPage
- `artifacts/headless/toolbar.png`锛歵 oolbar 灞 € 閮?- `artifacts/headless/inspector-overlayBudget.png`锛欼 nspector 瀹瑰櫒锛坥 verlayBudget 杩囨护瑙嗗浘锛?- `artifacts/headless/midi.png`锛歁 IDI 妯″潡绐楋紙鐢ㄤ簬楠岃瘉绐勫  搴﹀竷灞 € 涓嶄覆鏍忥級
- `artifacts/headless/audio.png`锛欰 udio 妯″潡绐楋紙鐢ㄤ簬楠岃瘉杈撳叆/URL/鎸夐挳瀵嗛泦琛岀殑鏍呮牸鎹 ㈣ 锛?- `artifacts/headless/presets.png`锛歅 resets 妯″潡绐楋紙鐢ㄤ簬楠岃瘉搴?閫夋嫨/瀵煎叆/鑷  姩鍒囨崲鐨勫瘑闆嗚  甯冨眬锛?- `artifacts/headless/visual.png`锛歏 isual 妯″潡绐楋紙鐢ㄤ簬楠岃瘉 AIVJ 閰嶇疆 + 鑳屾櫙鍥惧眰鎺 у 埗鐨勫瘑闆嗚  甯冨眬锛?- `artifacts/headless/background.png`锛欱 ackground 鎺 у 埗琛岋紙浣嶄簬 Visual 妯″潡鍐咃紱鐢ㄤ簬鍗曠嫭鏍稿  鑳屾櫙/鍥惧眰涓よ  鍦ㄧ獎瀹戒笅鐨勬爡鏍兼崲琛岋級
- `artifacts/headless/macros.png`锛歁 acros 妯″潡绐楋紙鐢ㄤ簬楠岃瘉瀹忔棆閽  尯鍧楀湪绐勫  涓嬩笉鎸ゅ帇锛?- `artifacts/headless/projectm.png`锛歅 rojectM Blend 妯″潡绐楋紙鐢ㄤ簬楠岃瘉娣峰悎/涓嶉 € 忔槑搴?闊抽  椹卞姩琛屽竷灞 € 锛?- `artifacts/headless/show.png`锛歋 how 妯″潡绐楋紙鐢ㄤ簬楠岃瘉婕斿嚭閰嶇疆鎸夐挳琛屽竷灞 € 锛?- `artifacts/headless/favorites.png`锛欶 avorites 鍒楄〃瑙嗗浘锛堢敤浜庨獙璇?header/actions 涓嶆孩鍑猴級
- `artifacts/headless/favorites-compare.png`锛欶 avorites 瀵规瘮瑙嗗浘锛堢敤浜庨獙璇佽〃澶?琛ㄦ牸婊氬姩甯冨眬锛?- `artifacts/headless/diagnostics.png`锛欴 iagnostics 闈 ㈡ 澘锛堢敤浜庨獙璇侀暱琛屼笉鎾戠垎甯冨眬锛?
  浠ヤ笂鎴  浘鐢ㄤ簬閬垮厤鈥滄敼浜嗕絾 fullPage 娌″睍绀衡 € 濈殑璇  垽銆?

## 鏈  獙璇侀」鐩?

- 鍏ㄩ摼璺  獙鏀舵竻鍗曪紙 7 椤癸級
