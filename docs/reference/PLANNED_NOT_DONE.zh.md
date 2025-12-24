# newliveweb 锛氬凡璁″垝浣嗗皻鏈  惤鍦颁簨椤规竻鍗曪紙 punch list 锛?

> 鐩  殑锛氭妸鏁ｈ惤鍦ㄥ  浠借  鍒?鎵嬪唽閲岀殑鈥滃凡鍐欒繘璁″垝浣嗚繕娌″仛鈥濈殑浜嬮」鏀舵暃鎴愪竴涓  彲鎵 ц 娓呭崟銆?> 鏉冨 ▉ 鍏ュ彛浠嶇劧鏄?`MASTER_SPEC.zh.md`锛涙湰鏂囧彧鏄 € 滃緟鍔炴眹鎬烩 € 濓紝渚夸簬鎺ㄨ繘涓庡垎娲俱 €?

---

## A. Phase C / 鑳屾櫙鍙  彃鎷旓紙璁″垝宸插啓锛屽綋鍓嶆湭瀹屾暣瀹炵幇锛?

- **Video 鑳屾櫙瀹屾暣瀹炵幇**

  - 鏉ユ簮锛歚 MASTER_SPEC.zh.md`锛圥hase C-7 棰勫煁锛夈€乣INFRASTRUCTURE_PLAN.zh.md`锛圥 hase C 锛? - 鐜扮姸锛歚 background.type` 宸查鐣?`video`锛宺egistry 鍙瘑鍒苟绂佺敤 liquid/camera锛屼絾鏈瀹屾暣 Video layer锛堣В鐮?绾圭悊/鐢熷懡鍛ㄦ湡/UI锛夈€?  - 鏈€灏忚惤鍦板缓璁細鍏堝仛鈥滄湰鍦版枃浠?URL 鈫?video texture 鈫?full-screen quad鈥濈殑鏈€灏忓眰锛屽疄鐜?`Layer`鎺ュ彛 +`BackgroundRegistry` 鍙傛暟 schema锛堜粎 URL/loop/opacity锛夈€?  - 楠屾敹锛歚npm run verify:dev` 閫氳繃锛涘垏鎹?background.type 涓嶆姤閿欙紱鏃犳潈闄愬脊绐椼 €?

- **BackgroundModule 鎺ュ彛鍖栦笌 controller 鍒囨崲閫昏緫鏀舵暃**
  - 鏉ユ簮锛歚 INFRASTRUCTURE_PLAN.zh.md`锛圥 hase C / Background Plugin 锛? - 鏈 € 灏忚惤鍦板缓璁  細瀹氫箟缁熶竴鎺ュ彛锛坕 nit/applyParams/dispose/getParamDefs 锛夛紝鎶?liquid/camera/video 浠ュ悓涓 € 閫氶亾鎸傚埌 registry 锛沀 I/Random/Favorites 鍙 Е 杈?state+schema 銆?

---

## B. Phase D / MIDI 锛堣  鍒掑凡鍐欙紝褰撳墠涓衡 € 滈  鐣?鏈 € 灏忓疄鐜扳 € 濓級

- \*_MIDI 缁戝畾淇濆瓨涓?Learn UI 瀹屾暣鍖?_
  - 鏉ユ簮锛歚 INFRASTRUCTURE_PLAN.zh.md`锛圥hase D锛夈€乣DATA_INTERFACES.zh.md`锛圡 IDI mapping 瑙勫垝锛? - 鐜扮姸锛氬凡鏈?Connect/Learn/Unbind 鐨勬渶灏忛摼璺  紝浣?binding 妯″瀷銆佹寔涔呭寲涓庢洿瀹屾暣鐨?target 浣撶郴浠嶆湁鎵 ╁ 睍绌洪棿銆? - 鏈 € 灏忚惤鍦板缓璁  細 SettingsStore 鎸佷箙鍖?bindings 锛堜笉杩?Favorites 锛夛紝骞舵敮鎸侊細 macro 锛坒 usion/motion/sparkle 锛夈 € 乻 lot 锛圡 acroSlot 锛夈 € 侊紙鍙 € 夛級 param 锛坰 chema key 锛夈 €? - 楠屾敹锛氭棤璁惧  鏃?0 鎶ラ敊锛涙湁璁惧  鏃?Learn 鎴愬姛锛涘埛鏂板悗浠嶄繚鐣欑粦瀹氥 €?

---

## C. P2 / 寮轰簰鐩稿奖鍝嶏紙璁″垝宸插啓锛屽綋鍓嶆湭鍋氾級

- **ProjectM 杈撳嚭閲囨牱锛坅 vgLuma/avgColor 锛夆啋 鑳屾櫙璋冨埗闂  幆**

  - 鏉ユ簮锛歚 REFRACTOR_PLAN_CLEAN.zh.md`锛圥2锛夈€乣REFRACTOR_SPEC_FOR_AI.zh.md`锛圥 2 锛? - 鍐呭  锛氫粠 ProjectM 杈撳嚭鍋氫綆棰戠粺璁 ★ 紙寤鸿  鍏?avgLuma 锛夛紝鐢ㄦ帶鍒跺櫒锛堥檺閫熺 Н 鍒?PI/PID 锛夎皟鑺傝儗鏅?tint/contrast 鎴?ProjectM opacity 锛岃 В 鍐斥 € 滅湅涓嶈  PM / 杩囨洕 / 鑹插亸鈥濄 €? - 鏈 € 灏忚惤鍦板缓璁  細鍙  仛 avgLuma + 鍙  紑鍏?+ 寮哄害鍙傛暟锛堥粯璁ゅ叧闂  級锛汥 iagnostics 閲屽睍绀洪噰鏍峰 € 笺 €? - 楠屾敹锛氶粯璁ゅ叧闂  笉鏀瑰彉鐜扮姸锛涘紑鍚  悗 avgLuma 鍙  涓旂敾闈  笉鍙戞暎锛泇 erify 閫氳繃銆?

- \*_Compositor v1 锛圧 enderTarget + 鍚堟垚 shader 锛?_
  - 鏉ユ簮锛歚 REFRACTOR_PLAN_CLEAN.zh.md`锛圥2锛夈€乣REFRACTOR_SPEC_FOR_AI.zh.md`锛圥 2 锛? - 鍐呭  锛氭妸鑳屾櫙/ProjectM 娓叉煋鍒?RT 锛屽啀鐢?shader 鍋?overlay/screen/add 绛夆 € 滅湡瀹炲悎鎴愨 € 濓紝骞剁粺涓 € 鑹插僵绌洪棿澶勭悊銆? - 鏈 € 灏忚惤鍦板缓璁  細鍏堝仛 RT 璺  緞浣嗕繚鎸佽緭鍑虹瓑浠凤紙榛樿  off 锛夛紝閫愭  鏇挎崲鐜版湁 three blending 銆?

---

## D. LiquidMetal 鍙  帶鍙傛暟鈥滅己鍙ｂ € 濓紙璁″垝宸插啓锛屽綋鍓嶆湭鍋氾級

- \*_LiquidMetal 澧炲姞 tint/hue/contrast/paletteStrength 绛?_
  - 鏉ユ簮锛歚 REFRACTOR_PLAN_CLEAN.zh.md`锛堜笅涓 € 闃舵  鍏抽敭缂哄彛锛? - 鍔ㄦ満锛氬惁鍒欏彧鑳介潬 brightness 锛岃瀺鍚堢 ┖ 闂磋繃绐勶紝闅惧仛 P2 鐨勨 € 滆壊鍋忔不鐞?椋庢牸缁熶竴鈥濄 €? - 鏈 € 灏忚惤鍦板缓璁  細鍏堝姞 1~2 涓  紙 contrast + tintStrength 锛夛紝鎺ュ叆 ParamSchema + Inspector + Random 锛堥粯璁?random=false 锛夈 €?

---

## E. 瀹忚  鏃嬮挳鈥滄槧灏勨 € 濋棴鐜  紙璁″垝宸插啓锛屽綋鍓嶆湭鍋氾級

- **computeMacroPatch 锛堝畯杈撳叆 鈫?瀵?projectm/background 鐨勭 ǔ 瀹氭槧灏勶級**
  - 鏉ユ簮锛歚 INFRASTRUCTURE_PLAN.zh.md`锛堝畯鏄犲皠鎺ュ彛锛? - 鐜扮姸锛氬畯鏃嬮挳涓?MacroSlot 鐨?state/UI 宸插瓨鍦  紝浣嗚繕娌 ℃ 湁鎶婂畠浠  槧灏勫埌鈥滃彲瑙ｉ噴鐨勫皯鏁板瓧娈碘 € 濄 €? - 鏈 € 灏忚惤鍦板缓璁  細鍏堝疄鐜伴潪甯镐繚瀹堢殑鏄犲皠锛堜緥濡?fusion 鈫?ProjectM opacity 鐨勫井寮卞亸绉伙級锛屽苟纭  繚涓嶄細瑕嗙洊楂樼骇闈 ㈡ 澘鐨勭簿璋冿紙蹇呰  鏃跺紩鍏?pinned/閿佸畾绛栫暐锛夈 €?

---

## F. 宸ョ ▼/楠屾敹閾捐矾涓庡彲鐢ㄦ €э 紙鎵嬪唽閲屾彁鍒扮殑鏈  畬鎴愰」锛?

- \*_Mixxx 鎺ュ叆锛堣繛鎺ユ寜閽?+ 鐘舵 €?+ 閲嶈繛锛?_

  - 鏉ユ簮锛歚 LOCAL_DEV_GUIDE.md`
  - 鏈 € 灏忚惤鍦板缓璁  細鍙  仛 UI 鍏ュ彛 + 閰嶇疆淇濆瓨 + 鐘舵 € 佺伅锛岄煶棰戞祦鎺ュ叆鍚庡啀鎵 ╁ 睍銆?

- **鈥滄棤鍙  敤 presets 鈥濇彁绀轰笌闅忔満浣撻獙鍏滃簳**

  - 鏉ユ簮锛歚 LOCAL_DEV_GUIDE.md`
  - 鐜扮姸锛歮 anifest 涓虹 ┖ 鏃朵粛浼氶殢鏈哄弬鏁颁絾涓嶄細鍔犺浇鏂?preset 锛岀敤鎴锋劅鐭ヤ細鍥版儜銆? - 鏈 € 灏忚惤鍦板缓璁  細 Random 鏃舵  娴?presets 涓虹 ┖ 锛屾樉绀轰竴鏉￠潪闃诲  鎻愮ず銆?

- \*_wasm compat 宸ュ叿閾剧 ǔ 瀹氬寲锛坧 rojectm-preset-probe 宕 ╂ 簝锛?_
  - 鏉ユ簮锛歚 LOCAL_DEV_GUIDE.md`
  - 璇存槑锛氳繖鏇村亸 C++/宸ュ叿閾炬帓闅滐紱鍓嶇  鍙  渶瑕佸  manifest/compat 瀛楁  淇濇寔鈥滃  閿?+ 鍙  娴嬧 € 濄 €?

---

## G. 鏂囨。鈥滈檲鏃?寰呭  榻愨 € 濇彁绀?

- `PROJECTM_INTEGRATION.md` 浠嶄互 `AudioController/main.ts` 鍙欒堪涓轰富锛堜笌褰撳墠 `bootstrap + AudioBus` 宸蹭笉涓 € 鑷达級銆? - 寤鸿  锛氬彧杩藉姞涓 € 娈碘 € 滅幇鐘跺  榻愯 ˉ 鍏呪 € 濓紝涓嶈  瑕嗙洊鍘熸枃銆?

---

## H. 杩涘害璁板綍锛堝彧杩藉姞锛?

### 2025-12-16

- 宸茶惤鍦帮細 LiquidMetal 鏂板  `contrast` 鍙傛暟锛圠 ayer + ParamSchema + Inspector 鍙  皟锛涢粯璁?random=false 锛夈 €?

---

### 2025-12-16 对齐补充（二次）：部分 punch list 条目已落地

> 说明：本文保留历史段落不删除；当实现已完成时，只在这里追加现状对齐，并把剩余工作指回 `TODOS.zh.md`。

- 已落地（避免重复开工）

  - 本地音频输入（MediaStream）：`AudioBus.loadInputDevice(deviceId?)` + `StreamAudioProcessor.loadFromStream` + 工具栏 `#audio-input-device/#audio-input-use` + localStorage 记忆。
  - MIDI：bindings 持久化（Settings，不进入 Favorites）与 Learn UX 最小闭环。
  - ProjectM 输出采样：`avgLuma` 最小实现 + Diagnostics 可观测。
  - 宏映射：`computeMacroPatch` 最小实现（保守映射）。

- 仍未落地（执行以 `TODOS.zh.md` 为准）
  - 闭环控制（限速积分/PI 等）
  - Compositor v1（RenderTarget + 合成 shader，默认 off）
  - LiquidMetal 更多可控参数（tint/hue/paletteStrength 等）

---

## 2025-12-16 对齐补充（三次）：本文件可读性修复说明 + 最新现状

> 说明：本文件前半部分存在历史编码/格式问题（典型表现为大量“锛?/宸插啓/褰撳墠”之类的乱码标点）。为遵守“只追加，不覆盖/不删除”，这里不改旧段落，只在本节给出可读的摘要与现状对齐。
>
> 执行口径：以 `DOCS_INDEX.zh.md` → `MASTER_SPEC.zh.md` 为权威入口；可执行任务以 `TODOS.zh.md` 为准。

### A. 背景（Camera/Video）

- 已落地：camera/video 背景护栏（拒权/错误提示、必要时回退 liquid、Video autoplay 被拒可 Retry），并在 Diagnostics 展示 `bg=` / `bgStatus=`。

### B. MIDI

- 已落地：bindings 持久化（Settings，不进入 Favorites）与 Learn UX 最小闭环；无设备不报错。

### C. P2 强互相影响（默认关闭）

- 已落地：
  - ProjectM 输出采样 `avgLuma`（默认 off，可通过 query 开启，Diagnostics 可观测）
  - 闭环控制 PI（默认 off，可通过 query 开启）
  - Compositor v1（默认 off，通过 query `?compositor=1` 开启）

### D/E. LiquidMetal 参数缺口 / 宏映射

- 已落地（最小）：`contrast` 已接入 ParamSchema + Inspector；宏映射 `computeMacroPatch` 已有保守实现。
- 仍可扩展：tint/hue/paletteStrength 等“风格化参数”属于后续增量（建议新建 TODO 再推进）。

### F. 工具链

- 已落地：wasm compat 探测链路稳定化（`projectm-preset-probe` 在 Windows 下不再 `probe_no_output`），并有样本规模验证。

### 2025-12-16 对齐补充（四次）：避免误读（以最新对齐为准）

> 提示：本文中的“对齐补充（二次）/仍未落地”属于历史快照口径；其结论已被“对齐补充（三次）”覆盖。
> 当前真实未完成项以 `TODOS.zh.md` 为准（本文件仅保留为历史备忘录）。
