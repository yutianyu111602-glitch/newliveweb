import type { VisualStateV2 } from "../../features/visualState/visualStateStore";
import type { ParamDef } from "../../state/paramSchema";
import { getLang } from "../i18n";
import { listen } from "../bindings/domBindings";

export type InspectorScope =
  | "audio.beatTempo"
  | "audio.controls"
  | "renderer.compositor"
  | "background.params"
  | "background.type"
  | "background.underlay"
  | "background.layer.liquid"
  | "background.layer.basic"
  | "background.layer.camera"
  | "background.layer.video"
  | "background.layer.depth"
  | "projectm.blend"
  | "projectm.presetTuning";

type BackgroundType = VisualStateV2["background"]["type"];

function escapeHtml(text: string) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type InspectorController = {
  isOpen: () => boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  render: () => void;
  refreshStatus: () => void;
  dispose: () => void;
};

export function initInspectorController(opts: {
  dom: {
    container: HTMLElement | null | undefined;
    toggleButton: HTMLButtonElement | null | undefined;
    searchInput: HTMLInputElement | null | undefined;
    showAdvancedToggle: HTMLInputElement | null | undefined;
    resetButton: HTMLButtonElement | null | undefined;
    status: HTMLElement | null | undefined;
  };
  getState: () => VisualStateV2;
  getProjectMBlendSnapshot: () => Record<string, unknown>;
  getLiquidDefaults: () => Record<string, unknown>;
  defs: {
    audioBeatTempo: readonly ParamDef[];
    audioControls: readonly ParamDef[];
    rendererCompositor: readonly ParamDef[];
    backgroundType: readonly ParamDef[];
    underlayLiquid: readonly ParamDef[];
    projectmBlend: readonly ParamDef[];
    projectmPresetTuning: readonly ParamDef[];
    getBackgroundLayer: (type: BackgroundType) => readonly ParamDef[];
    includeCamera: boolean;
    includeDepth: boolean;
  };
  getAudioBeatTempoValues: () => Record<string, unknown>;
  getAudioControlsValues: () => Record<string, unknown>;
  getRendererCompositorValues: () => Record<string, unknown>;
  cameraDevices: {
    refresh: () => void | Promise<void>;
    getOptions: () => Array<{ id: string; label: string }>;
  };
  getProjectMPresetTuningValues: () => Record<string, unknown>;
  applyInspectorPatch: (
    scope: InspectorScope,
    patch: Record<string, unknown>
  ) => void;
}): InspectorController {
  const {
    dom,
    getState,
    getProjectMBlendSnapshot,
    getLiquidDefaults,
    defs,
    getAudioBeatTempoValues,
    getAudioControlsValues,
    getRendererCompositorValues,
    cameraDevices,
    getProjectMPresetTuningValues,
    applyInspectorPatch,
  } = opts;

  const s = (zh: string, en: string) => (getLang() === "zh" ? zh : en);

  const container = dom.container ?? null;
  const toggleButton = dom.toggleButton ?? null;
  const searchInput = dom.searchInput ?? null;
  const showAdvancedToggle = dom.showAdvancedToggle ?? null;
  const resetButton = dom.resetButton ?? null;
  const statusEl = dom.status ?? null;

  let open = false;
  let query = "";
  let showAdvanced = false;

  const getInspectorDefs = () => {
    return [
      ...defs.audioBeatTempo,
      ...defs.audioControls,
      ...defs.rendererCompositor,
      ...defs.backgroundType,
      ...defs.getBackgroundLayer("liquid"),
      ...defs.getBackgroundLayer("basic"),
      ...(defs.includeCamera ? defs.getBackgroundLayer("camera") : []),
      ...defs.getBackgroundLayer("video"),
      ...(defs.includeDepth ? defs.getBackgroundLayer("depth") : []),
      ...defs.projectmBlend,
      ...defs.projectmPresetTuning,
    ];
  };

  const getScopeForDef = (def: { group: string }): InspectorScope => {
    if (def.group.startsWith("Audio/BeatTempo")) return "audio.beatTempo";
    if (def.group.startsWith("Audio/Controls")) return "audio.controls";
    if (def.group.startsWith("Renderer/Compositor"))
      return "renderer.compositor";
    if (def.group.startsWith("ProjectM/Blend")) return "projectm.blend";
    if (def.group.startsWith("ProjectM/PresetTuning"))
      return "projectm.presetTuning";
    if (def.group.startsWith("Background/Type")) return "background.type";
    if (def.group.startsWith("Background/Liquid"))
      return "background.layer.liquid";
    if (def.group.startsWith("Background/Basic"))
      return "background.layer.basic";
    if (def.group.startsWith("Background/Camera"))
      return "background.layer.camera";
    if (def.group.startsWith("Background/Video"))
      return "background.layer.video";
    if (def.group.startsWith("Background/Depth"))
      return "background.layer.depth";
    if (def.group.startsWith("Background/Underlay"))
      return "background.underlay";
    return "background.params";
  };

  const getInspectorDef = (scope: InspectorScope, key: string) => {
    const state = getState();
    if (scope === "audio.beatTempo")
      return defs.audioBeatTempo.find((d) => d.key === key) ?? null;
    if (scope === "audio.controls")
      return defs.audioControls.find((d) => d.key === key) ?? null;
    if (scope === "renderer.compositor")
      return defs.rendererCompositor.find((d) => d.key === key) ?? null;
    if (scope === "projectm.blend")
      return defs.projectmBlend.find((d) => d.key === key) ?? null;
    if (scope === "projectm.presetTuning")
      return defs.projectmPresetTuning.find((d) => d.key === key) ?? null;
    if (scope === "background.type")
      return defs.backgroundType.find((d) => d.key === key) ?? null;
    if (scope === "background.underlay")
      return defs.underlayLiquid.find((d) => d.key === key) ?? null;
    if (scope.startsWith("background.layer.")) {
      const layer = scope.slice("background.layer.".length) as BackgroundType;
      return defs.getBackgroundLayer(layer).find((d) => d.key === key) ?? null;
    }
    return (
      defs
        .getBackgroundLayer(state.background.type)
        .find((d) => d.key === key) ?? null
    );
  };

  const refreshStatus = () => {
    if (!statusEl) return;
    const state = getState();
    const openText = open ? s("展开", "Expanded") : s("收起", "Collapsed");
    const seed = Number.isFinite(Number(state?.global?.seed))
      ? String(state.global.seed)
      : "0";
    const bg = state?.background?.type ?? "liquid";
    const extra = statusEl.dataset.extra;
    statusEl.textContent = `${openText} - seed=${seed} - bg=${bg} - fav=v2${
      extra ? ` - ${extra}` : ""
    }`;
  };

  const setOpen = (next: boolean) => {
    open = Boolean(next);
    if (container) container.style.display = open ? "flex" : "none";
    refreshStatus();
    if (open) render();
  };

  const isChangedFromDefault = (def: ParamDef, current: unknown): boolean => {
    if (def.kind === "number") {
      const v = Number(current);
      if (!Number.isFinite(v)) return false;
      const span = Math.abs(def.max - def.min);
      const step = def.step != null ? Math.abs(Number(def.step)) : 0;
      const threshold = Math.max(step * 2, span * 0.04, 1e-6);
      return Math.abs(v - Number(def.default)) > threshold;
    }
    if (def.kind === "bool") {
      return Boolean(current ?? def.default) !== Boolean(def.default);
    }
    if (def.kind === "enum") {
      return String(current ?? def.default) !== String(def.default);
    }
    if (def.kind === "string") {
      const v = String(current ?? def.default).trim();
      const d = String(def.default ?? "").trim();
      return v !== d;
    }
    return false;
  };

  const render = () => {
    if (!container) return;
    const state = getState();
    const blend = getProjectMBlendSnapshot();

    const q = query.trim().toLowerCase();
    const filtered = getInspectorDefs().filter((def) => {
      if (!showAdvanced && def.advanced) return false;
      if (!q) return true;
      const hay = `${def.group} ${def.key}`.toLowerCase();
      return hay.includes(q);
    });

    const macroMappedProjectM = new Set(["opacity", "energyToOpacityAmount"]);
    const macroMappedLiquid = new Set([
      "opacity",
      "brightness",
      "contrast",
      "timeScale",
      "waveAmplitude",
      "metallicAmount",
      "metallicSpeed",
    ]);

    const getLayerParams = (type: BackgroundType) => {
      const bg = state.background as any;
      const layers = bg?.layers ?? null;
      if (layers && typeof layers === "object" && layers[type]) {
        return layers[type] as Record<string, unknown>;
      }
      if (state.background.type === type) {
        return (state.background.params ?? {}) as Record<string, unknown>;
      }
      return {};
    };

    const getCurrentValueForDef = (def: ParamDef, scope: InspectorScope) => {
      const key = def.key;
      if (scope === "audio.beatTempo")
        return (getAudioBeatTempoValues() as any)?.[key];
      if (scope === "audio.controls")
        return (getAudioControlsValues() as any)?.[key];
      if (scope === "renderer.compositor")
        return (getRendererCompositorValues() as any)?.[key];
      if (scope === "projectm.blend") return (blend as any)?.[key];
      if (scope === "projectm.presetTuning")
        return (getProjectMPresetTuningValues() as any)?.[key];
      if (scope === "background.type") return state.background.type;
      if (scope === "background.underlay") {
        const underlay =
          (state.background as any).underlayLiquidParams ?? getLiquidDefaults();
        return (underlay as any)?.[key];
      }
      if (scope === "background.layer.liquid")
        return (getLayerParams("liquid") as any)?.[key];
      if (scope === "background.layer.basic")
        return (getLayerParams("basic") as any)?.[key];
      if (scope === "background.layer.camera")
        return (getLayerParams("camera") as any)?.[key];
      if (scope === "background.layer.video")
        return (getLayerParams("video") as any)?.[key];
      return (state.background.params as any)?.[key];
    };

    const getDefScore = (
      def: ParamDef,
      scope: InspectorScope,
      current: unknown
    ): number => {
      let score = 0;
      const changed = isChangedFromDefault(def, current);
      if (changed) score += 120;

      if (scope === "background.type") score += 80;
      if (scope === "projectm.blend" && macroMappedProjectM.has(def.key))
        score += 90;
      if (scope === "background.layer.liquid" && macroMappedLiquid.has(def.key))
        score += 85;

      if (def.key === "variant") score += 70;
      if (def.key === "audioSensitivity" || def.key === "audioReactive")
        score += 55;
      if (def.random === true) score += 10;
      if (def.advanced) score -= 10;
      return score;
    };

    const renderDefRow = (def: ParamDef) => {
      const scope = getScopeForDef(def);
      const key = def.key;
      const title = `${def.group} / ${key}`;
      const current = getCurrentValueForDef(def, scope);
      const changed = isChangedFromDefault(def, current);
      const isMacroMapped =
        (scope === "projectm.blend" && macroMappedProjectM.has(key)) ||
        (scope === "background.layer.liquid" && macroMappedLiquid.has(key));

      const resetText = escapeHtml(s("重置", "reset"));

      if (def.kind === "number") {
        const min = Number(def.min);
        const max = Number(def.max);
        const step = def.step != null ? Number(def.step) : 0.01;
        const value = Number.isFinite(Number(current))
          ? Number(current)
          : Number(def.default);
        const display = Number.isFinite(value)
          ? value.toFixed(3)
          : String(value);
        return `
              <div class="toolbar__row" data-scope="${escapeHtml(
                scope
              )}" data-key="${escapeHtml(key)}"${
          changed ? ' data-param-changed="true"' : ""
        }${isMacroMapped ? ' data-midi-bound="true"' : ""}>
                <label class="toolbar__volume" title="${escapeHtml(title)}">
                  <span class="toolbar__title">${escapeHtml(key)}</span>
                  <input
                    type="range"
                    data-role="number-range"
                    data-key="${escapeHtml(key)}"
                    min="${min}"
                    max="${max}"
                    step="${step}"
                    value="${escapeHtml(String(value))}"
                  />
                  <input
                    class="toolbar__input"
                    type="number"
                    data-role="number-input"
                    data-key="${escapeHtml(key)}"
                    min="${min}"
                    max="${max}"
                    step="${step}"
                    value="${escapeHtml(String(value))}"
                    title="${escapeHtml(display)}"
                  />
                </label>
                <button class="toolbar__button toolbar__button--compact" data-role="reset-param" data-key="${escapeHtml(
                  key
                )}">${resetText}</button>
              </div>
            `;
      }

      if (def.kind === "enum") {
        const value = String(current ?? def.default);
        const options = (def.values as readonly string[])
          .map(
            (v) =>
              `<option value="${escapeHtml(v)}" ${
                v === value ? "selected" : ""
              }>${escapeHtml(v)}</option>`
          )
          .join("");
        return `
              <div class="toolbar__row" data-scope="${escapeHtml(
                scope
              )}" data-key="${escapeHtml(key)}"${
          changed ? ' data-param-changed="true"' : ""
        }${isMacroMapped ? ' data-midi-bound="true"' : ""}>
                <label class="toolbar__hint toolbar__hint--select" title="${escapeHtml(
                  title
                )}">
                  <span>${escapeHtml(key)}</span>
                  <select class="toolbar__select toolbar__select--compact" data-role="enum-select" data-key="${escapeHtml(
                    key
                  )}">
                    ${options}
                  </select>
                </label>
                <button class="toolbar__button toolbar__button--compact" data-role="reset-param" data-key="${escapeHtml(
                  key
                )}">${resetText}</button>
              </div>
            `;
      }

      if (def.kind === "bool") {
        const checked = Boolean(current ?? def.default);
        return `
              <div class="toolbar__row" data-scope="${escapeHtml(
                scope
              )}" data-key="${escapeHtml(key)}"${
          changed ? ' data-param-changed="true"' : ""
        }${isMacroMapped ? ' data-midi-bound="true"' : ""}>
                <label class="toolbar__switch" title="${escapeHtml(title)}">
                  <input type="checkbox" data-role="bool-toggle" data-key="${escapeHtml(
                    key
                  )}" ${checked ? "checked" : ""} />
                  <span>${escapeHtml(key)}</span>
                </label>
                <button class="toolbar__button toolbar__button--compact" data-role="reset-param" data-key="${escapeHtml(
                  key
                )}">${resetText}</button>
              </div>
            `;
      }

      if (def.kind === "string") {
        if (scope === "background.layer.camera" && key === "deviceId") {
          void cameraDevices.refresh();
          const selectedId = String(current ?? def.default ?? "");
          const options = [
            `<option value="" ${selectedId ? "" : "selected"}>(auto)</option>`,
            ...cameraDevices
              .getOptions()
              .map(
                (d) =>
                  `<option value="${escapeHtml(d.id)}" ${
                    d.id === selectedId ? "selected" : ""
                  }>${escapeHtml(d.label)}</option>`
              ),
          ].join("");
          return `
              <div class="toolbar__row" data-scope="${escapeHtml(
                scope
              )}" data-key="${escapeHtml(key)}"${
            changed ? ' data-param-changed="true"' : ""
          }${isMacroMapped ? ' data-midi-bound="true"' : ""}>
                <label class="toolbar__hint toolbar__hint--select" title="${escapeHtml(
                  title
                )}">
                  <span>${escapeHtml(key)}</span>
                  <select class="toolbar__select toolbar__select--compact" data-role="camera-device-select" data-key="${escapeHtml(
                    key
                  )}">
                    ${options}
                  </select>
                </label>
                <button class="toolbar__button toolbar__button--compact" data-role="reset-param" data-key="${escapeHtml(
                  key
                )}">${resetText}</button>
              </div>
            `;
        }

        const value = current == null ? def.default : String(current);
        const placeholder = (def as any).placeholder
          ? String((def as any).placeholder)
          : "";
        return `
              <div class="toolbar__row" data-scope="${escapeHtml(
                scope
              )}" data-key="${escapeHtml(key)}"${
          changed ? ' data-param-changed="true"' : ""
        }${isMacroMapped ? ' data-midi-bound="true"' : ""}>
                <label class="toolbar__hint" title="${escapeHtml(title)}">
                  <span>${escapeHtml(key)}</span>
                  <input
                    class="toolbar__input"
                    type="text"
                    data-role="string-input"
                    data-key="${escapeHtml(key)}"
                    value="${escapeHtml(String(value ?? ""))}"
                    placeholder="${escapeHtml(placeholder)}"
                  />
                </label>
                <button class="toolbar__button toolbar__button--compact" data-role="reset-param" data-key="${escapeHtml(
                  key
                )}">${resetText}</button>
              </div>
            `;
      }

      return "";
    };

    let recommended: ParamDef[] = [];
    if (!q) {
      recommended = [...filtered]
        .map((def) => {
          const scope = getScopeForDef(def);
          const current = getCurrentValueForDef(def, scope);
          const score = getDefScore(def, scope, current);
          return { def, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((x) => x.def);
    }
    const recommendedSet = new Set(recommended);

    const groups = new Map<string, ParamDef[]>();
    for (const def of filtered) {
      if (recommendedSet.has(def)) continue;
      const group = def.group ?? "Other";
      const list = groups.get(group) ?? [];
      list.push(def);
      groups.set(group, list);
    }

    const recommendedHtml = recommended.length
      ? `
        <div class="toolbar__inspector-group toolbar__inspector-group--recommended">
          <span class="toolbar__subtitle">${escapeHtml(
            s("推荐", "Recommended")
          )}</span>
          ${recommended.map(renderDefRow).join("")}
        </div>
      `
      : "";

    const groupRank = (group: string): number => {
      const rules: Array<{ prefix: string; rank: number }> = [
        { prefix: "Audio/BeatTempo", rank: 10 },
        { prefix: "Audio/Controls/OverlayBudget", rank: 20 },
        { prefix: "Audio/Controls", rank: 30 },
        { prefix: "ProjectM/Blend", rank: 40 },
        { prefix: "Background/Type", rank: 50 },
        { prefix: "Background/Liquid", rank: 60 },
        { prefix: "Background/Basic", rank: 70 },
        { prefix: "Background/Camera", rank: 80 },
        { prefix: "Background/Video", rank: 90 },
        { prefix: "Background/Depth", rank: 100 },
        { prefix: "Background/Underlay", rank: 110 },
      ];
      for (const r of rules) {
        if (group.startsWith(r.prefix)) return r.rank;
      }
      return 999;
    };

    const groupHtml = Array.from(groups.entries())
      .sort((a, b) => {
        const ra = groupRank(a[0]);
        const rb = groupRank(b[0]);
        if (ra !== rb) return ra - rb;
        return a[0].localeCompare(b[0]);
      })
      .map(([group, items]) => {
        const isOverlayBudgetGroup = group === "Audio/Controls/OverlayBudget";

        const renderOverlayBudget = () => {
          const byKey = new Map(items.map((d) => [d.key, d] as const));
          const take = (keys: string[]) =>
            keys.map((k) => byKey.get(k) ?? null).filter(Boolean) as ParamDef[];

          const sections: Array<{ title: string; defs: ParamDef[] }> = [
            {
              title: "Budget",
              defs: take([
                "overlayBudgetMaxEnergy",
                "overlayBudgetMinScale",
                "overlayBudgetSmoothBaseMs",
              ]),
            },
            {
              title: "Depth Influence",
              defs: take(["overlayBudgetDepthWeight"]),
            },
            {
              title: "Priorities",
              defs: take([
                "overlayBudgetPriorityBasic",
                "overlayBudgetPriorityCamera",
                "overlayBudgetPriorityVideo",
                "overlayBudgetPriorityDepth",
              ]),
            },
            {
              title: "ProjectM Retreat",
              defs: take([
                "overlayBudgetPmRetreatStrength",
                "overlayBudgetPmRetreatFloor",
              ]),
            },
          ];

          const used = new Set<string>();
          for (const s of sections) for (const d of s.defs) used.add(d.key);

          const leftovers = items.filter((d) => !used.has(d.key));
          if (leftovers.length) {
            sections.push({ title: "Other", defs: leftovers });
          }

          return sections
            .filter((s) => s.defs.length)
            .map(
              (s) => `
                <div class="toolbar__inspector-subgroup">
                  <span class="toolbar__subtitle">${escapeHtml(s.title)}</span>
                  ${s.defs.map(renderDefRow).join("")}
                </div>
              `
            )
            .join("");
        };

        const rows = isOverlayBudgetGroup
          ? renderOverlayBudget()
          : items.map(renderDefRow).join("");
        return `
        <div class="toolbar__inspector-group">
          <span class="toolbar__subtitle">${escapeHtml(group)}</span>
          ${rows}
        </div>
      `;
      })
      .join("");

    container.innerHTML = `${recommendedHtml}${groupHtml}`;
  };

  const onToggleClick = () => setOpen(!open);
  const onSearchInput = () => {
    query = String(searchInput?.value ?? "");
    if (open) render();
  };
  const onShowAdvancedChange = () => {
    showAdvanced = Boolean(showAdvancedToggle?.checked);
    if (open) render();
  };

  const onResetClick = () => {
    const q = query.trim().toLowerCase();
    const matches = (def: {
      group: string;
      key: string;
      advanced?: boolean;
    }) => {
      if (!showAdvanced && (def as any).advanced) return false;
      if (!q) return true;
      const hay = `${def.group} ${def.key}`.toLowerCase();
      return hay.includes(q);
    };

    const typeDefs = defs.backgroundType.filter(matches as any);
    const typeDef = typeDefs.find((d) => d.key === "type") ?? typeDefs[0];
    if (typeDef) {
      applyInspectorPatch("background.type", {
        type: (typeDef as any).default,
      });
    }

    const all = getInspectorDefs().filter(matches as any);
    for (const def of all) {
      const scope = getScopeForDef(def);
      if (scope === "background.type") continue;
      applyInspectorPatch(scope, { [def.key]: def.default });
    }

    if (open) render();
  };

  const onContainerInput = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const role = (target as any).dataset?.role;
    const key = (target as any).dataset?.key;
    if (!role || !key) return;

    const row = target.closest("[data-scope]") as HTMLElement | null;
    const scope =
      (row?.dataset?.scope as InspectorScope | undefined) ??
      "background.params";
    const def = getInspectorDef(scope, String(key));
    if (!def) return;

    if (role === "number-range" || role === "number-input") {
      const raw = Number((target as HTMLInputElement).value);
      const next = Number.isFinite(raw)
        ? Math.min(
            def.kind === "number" ? def.max : 1,
            Math.max(def.kind === "number" ? def.min : 0, raw)
          )
        : (def as any).default;

      applyInspectorPatch(scope, { [key]: next });

      const range = row?.querySelector(
        `input[data-role="number-range"][data-key="${CSS.escape(String(key))}"]`
      ) as HTMLInputElement | null;
      const num = row?.querySelector(
        `input[data-role="number-input"][data-key="${CSS.escape(String(key))}"]`
      ) as HTMLInputElement | null;
      if (range && range !== target) range.value = String(next);
      if (num && num !== target) num.value = String(next);
    }
  };

  const onContainerChange = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const role = (target as any).dataset?.role;
    const key = (target as any).dataset?.key;
    if (!role || !key) return;

    const row = target.closest("[data-scope]") as HTMLElement | null;
    const scope =
      (row?.dataset?.scope as InspectorScope | undefined) ??
      "background.params";
    const def = getInspectorDef(scope, String(key));
    if (!def) return;

    if (role === "bool-toggle") {
      applyInspectorPatch(scope, {
        [key]: Boolean((target as HTMLInputElement).checked),
      });
    }

    if (role === "enum-select") {
      const value = String((target as HTMLSelectElement).value);
      if (def.kind !== "enum") return;
      const values = def.values as readonly string[];
      const next = values.includes(value) ? value : def.default;
      applyInspectorPatch(scope, { [key]: next });
    }

    if (role === "camera-device-select") {
      if (def.kind !== "string") return;
      const value = String((target as HTMLSelectElement).value ?? "");
      applyInspectorPatch(scope, { [key]: value });
    }

    if (role === "string-input") {
      if (def.kind !== "string") return;
      applyInspectorPatch(scope, {
        [key]: String((target as HTMLInputElement).value),
      });
    }
  };

  const onContainerClick = (event: Event) => {
    const el = (event as MouseEvent).target as HTMLElement | null;
    if (!el) return;
    const role = (el as any).dataset?.role;
    const key = (el as any).dataset?.key;
    if (role !== "reset-param" || !key) return;

    const row = el.closest("[data-scope]") as HTMLElement | null;
    const scope =
      (row?.dataset?.scope as InspectorScope | undefined) ??
      "background.params";
    const def = getInspectorDef(scope, String(key));
    if (!def) return;
    applyInspectorPatch(scope, { [key]: def.default });
    if (open) render();
  };

  const disposers: Array<() => void> = [];
  disposers.push(listen(toggleButton, "click", onToggleClick));
  disposers.push(listen(searchInput, "input", onSearchInput));
  disposers.push(listen(showAdvancedToggle, "change", onShowAdvancedChange));
  disposers.push(listen(resetButton, "click", onResetClick));
  disposers.push(listen(container, "input", onContainerInput));
  disposers.push(listen(container, "change", onContainerChange));
  disposers.push(listen(container, "click", onContainerClick));

  setOpen(false);

  return {
    isOpen: () => open,
    setOpen,
    toggle: () => setOpen(!open),
    render,
    refreshStatus,
    dispose: () => {
      for (const dispose of disposers.splice(0, disposers.length)) {
        try {
          dispose();
        } catch {
          // ignore
        }
      }
    },
  };
}
