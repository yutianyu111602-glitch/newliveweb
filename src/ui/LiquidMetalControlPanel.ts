import {
  LiquidMetalLayerV2,
  type LiquidMetalParams,
} from "../layers/LiquidMetalLayerV2";
import {
  bindButton,
  bindCheckbox,
  bindSelect,
  listen,
} from "../app/bindings/domBindings";

type LiquidMetalControlPanelOptions = {
  onPatch?: (patch: Partial<LiquidMetalParams>) => void;
  /**
   * If true, mounts the panel into document.body immediately.
   * Defaults to false to avoid UI interference.
   */
  mount?: boolean;
};

export class LiquidMetalControlPanel {
  private static injectedRangeStyle = false;
  private container: HTMLElement;
  private layer: LiquidMetalLayerV2;
  private isVisible = false;
  private isMounted = false;
  private onPatch?: (patch: Partial<LiquidMetalParams>) => void;
  private readonly disposeFns: Array<() => void> = [];
  private sliders = new Map<
    keyof LiquidMetalParams,
    { input: HTMLInputElement; valueText: HTMLSpanElement; step: number }
  >();
  private audioReactiveCheckbox: HTMLInputElement | null = null;
  private audioSensitivityContainer: HTMLElement | null = null;
  private variantSelect: HTMLSelectElement | null = null;
  private readonly onWindowResize: () => void;

  constructor(
    layer: LiquidMetalLayerV2,
    opts?: LiquidMetalControlPanelOptions
  ) {
    this.layer = layer;
    this.onPatch = opts?.onPatch;
    this.container = this.createPanel();
    if (opts?.mount) {
      this.ensureMounted();
    }

    this.onWindowResize = () => {
      if (!this.isVisible) return;
      this.updatePosition();
    };
    this.disposeFns.push(listen(window, "resize", this.onWindowResize));
  }

  private ensureMounted() {
    if (this.isMounted) return;
    document.body.appendChild(this.container);
    this.isMounted = true;
  }

  dispose() {
    for (const dispose of this.disposeFns.splice(0, this.disposeFns.length)) {
      try {
        dispose();
      } catch {
        // ignore
      }
    }
    try {
      this.container.remove();
    } catch {
      // ignore
    }
    this.isVisible = false;
  }

  private updatePosition() {
    // Avoid covering the top toolbar grid (common "UI interference" complaint).
    const toolbar = document.querySelector(".toolbar") as HTMLElement | null;
    const toolbarBottom = toolbar
      ? Math.max(0, toolbar.getBoundingClientRect().bottom)
      : 0;
    const padding = 12;

    const top = Math.max(
      padding,
      Math.min(window.innerHeight - 120, toolbarBottom + padding)
    );
    const maxHeight = Math.max(180, window.innerHeight - top - padding);

    this.container.style.top = `${top}px`;
    this.container.style.right = `${padding}px`;
    this.container.style.maxHeight = `${maxHeight}px`;
  }

  private applyPatch(patch: Partial<LiquidMetalParams>) {
    if (this.onPatch) {
      this.onPatch(patch);
      return;
    }
    throw new Error(
      "[LiquidMetalControlPanel] onPatch is required to avoid direct layer writes (use VisualStateController.applyPatch)."
    );
  }

  public syncFromParams(params: Partial<LiquidMetalParams>) {
    for (const [key, ctrl] of this.sliders.entries()) {
      const nextValue = (params as any)[key];
      if (!Number.isFinite(nextValue)) continue;
      ctrl.input.value = String(nextValue);
      ctrl.valueText.textContent = Number(nextValue).toFixed(
        ctrl.step < 1 ? 2 : 0
      );
    }

    if (
      this.audioReactiveCheckbox &&
      typeof params.audioReactive === "boolean"
    ) {
      this.audioReactiveCheckbox.checked = params.audioReactive;
      if (this.audioSensitivityContainer) {
        this.audioSensitivityContainer.style.display = params.audioReactive
          ? "block"
          : "none";
      }
    }

    if (this.variantSelect && typeof (params as any).variant === "string") {
      this.variantSelect.value = String((params as any).variant);
    }
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.id = "liquid-metal-controls";
    panel.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: rgba(20, 20, 30, 0.95);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 20px;
      width: 320px;
      max-height: 80vh;
      overflow-y: auto;
      font-family: system-ui, -apple-system, sans-serif;
      color: #fff;
      z-index: 1000;
      display: none;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    `;

    // 标题
    const title = document.createElement("h3");
    title.textContent = "液态金属参数调节";
    title.style.cssText = `
      margin: 0 0 15px 0;
      font-size: 16px;
      font-weight: 600;
      color: #c0c5ce;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 10px;
    `;
    panel.appendChild(title);

    // 背景算法选择（L2: “liquid” 背景内的变体）
    const variantRow = document.createElement("div");
    variantRow.style.cssText =
      "margin-bottom: 12px; display: flex; align-items: center; gap: 10px;";

    const variantLabel = document.createElement("div");
    variantLabel.textContent = "算法";
    variantLabel.style.cssText =
      "font-size: 13px; color: #9ca3af; min-width: 42px;";

    const variantSelect = document.createElement("select");
    variantSelect.style.cssText = `
      flex: 1;
      padding: 6px 8px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 6px;
      color: #e5e7eb;
      outline: none;
    `;
    variantSelect.innerHTML = `
      <option value="metal">Metal</option>
      <option value="waves">Waves</option>
      <option value="stars">Stars</option>
      <option value="lines">Lines</option>
    `;
    variantSelect.value = String((this.layer.params as any).variant ?? "metal");
    const variantBinding = bindSelect({
      el: variantSelect,
      get: () => String(variantSelect.value ?? ""),
      set: (value) => this.applyPatch({ variant: value as any }),
    });
    this.disposeFns.push(variantBinding.dispose);
    this.variantSelect = variantSelect;

    variantRow.appendChild(variantLabel);
    variantRow.appendChild(variantSelect);
    panel.appendChild(variantRow);

    // 创建控制组
    this.addControlGroup(panel, "基础参数", [
      { key: "brightness", label: "亮度", min: 0, max: 2, step: 0.1 },
    ]);

    this.addControlGroup(panel, "动画参数", [
      { key: "timeScale", label: "时间缩放", min: 0, max: 5, step: 0.1 },
      { key: "iterations", label: "迭代次数", min: 1, max: 10, step: 1 },
      { key: "waveAmplitude", label: "波浪幅度", min: 0, max: 2, step: 0.1 },
    ]);

    this.addControlGroup(panel, "鼠标交互", [
      { key: "mouseInfluence", label: "影响强度", min: 0, max: 5, step: 0.1 },
    ]);

    this.addControlGroup(panel, "金属质感", [
      { key: "metallicAmount", label: "金属闪烁", min: 0, max: 1, step: 0.05 },
      { key: "metallicSpeed", label: "闪烁速度", min: 0, max: 5, step: 0.1 },
    ]);

    // 音频响应开关
    const audioGroup = document.createElement("div");
    audioGroup.style.cssText =
      "margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);";

    const audioLabel = document.createElement("label");
    audioLabel.style.cssText =
      "display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none;";

    const audioCheckbox = document.createElement("input");
    audioCheckbox.type = "checkbox";
    audioCheckbox.checked = this.layer.params.audioReactive;
    audioCheckbox.style.cssText = "width: 18px; height: 18px; cursor: pointer;";
    const audioReactiveBinding = bindCheckbox({
      el: audioCheckbox,
      get: () => Boolean(audioCheckbox.checked),
      set: (checked) => {
        this.applyPatch({ audioReactive: checked });
        sensitivityControl.style.display = checked ? "block" : "none";
      },
    });
    this.disposeFns.push(audioReactiveBinding.dispose);
    this.audioReactiveCheckbox = audioCheckbox;

    const audioText = document.createElement("span");
    audioText.textContent = "音频响应";
    audioText.style.fontSize = "14px";

    audioLabel.appendChild(audioCheckbox);
    audioLabel.appendChild(audioText);
    audioGroup.appendChild(audioLabel);

    const sensitivityControl = this.createSlider(
      "audioSensitivity",
      "灵敏度",
      0,
      2,
      0.1
    );
    sensitivityControl.style.marginTop = "10px";
    sensitivityControl.style.display = this.layer.params.audioReactive
      ? "block"
      : "none";
    this.audioSensitivityContainer = sensitivityControl;
    audioGroup.appendChild(sensitivityControl);

    panel.appendChild(audioGroup);

    // 预设按钮
    this.addPresetButtons(panel);

    // 重置按钮
    const resetBtn = document.createElement("button");
    resetBtn.textContent = "重置默认";
    resetBtn.style.cssText = `
      width: 100%;
      padding: 10px;
      margin-top: 15px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      color: #fff;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    `;
    this.disposeFns.push(
      listen(resetBtn, "mouseenter", () => {
        resetBtn.style.background = "rgba(255, 255, 255, 0.15)";
      })
    );
    this.disposeFns.push(
      listen(resetBtn, "mouseleave", () => {
        resetBtn.style.background = "rgba(255, 255, 255, 0.1)";
      })
    );
    this.disposeFns.push(
      bindButton(resetBtn, () => this.resetToDefaults()).dispose
    );
    panel.appendChild(resetBtn);

    return panel;
  }

  private addControlGroup(
    panel: HTMLElement,
    title: string,
    controls: Array<{
      key: keyof LiquidMetalParams;
      label: string;
      min: number;
      max: number;
      step: number;
    }>
  ) {
    const group = document.createElement("div");
    group.style.cssText =
      "margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);";

    const groupTitle = document.createElement("div");
    groupTitle.textContent = title;
    groupTitle.style.cssText =
      "font-size: 13px; font-weight: 600; margin-bottom: 10px; color: #9ca3af;";
    group.appendChild(groupTitle);

    controls.forEach((ctrl) => {
      const slider = this.createSlider(
        ctrl.key,
        ctrl.label,
        ctrl.min,
        ctrl.max,
        ctrl.step
      );
      group.appendChild(slider);
    });

    panel.appendChild(group);
  }

  private createSlider(
    key: keyof LiquidMetalParams,
    label: string,
    min: number,
    max: number,
    step: number
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = "margin-bottom: 12px;";

    const labelRow = document.createElement("div");
    labelRow.style.cssText =
      "display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 12px;";

    const labelText = document.createElement("span");
    labelText.textContent = label;
    labelText.style.color = "#d1d5db";

    const valueText = document.createElement("span");
    valueText.style.cssText = "font-family: monospace; color: #60a5fa;";
    valueText.textContent = this.layer.params[key]?.toString() || "0";

    labelRow.appendChild(labelText);
    labelRow.appendChild(valueText);
    container.appendChild(labelRow);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = min.toString();
    slider.max = max.toString();
    slider.step = step.toString();
    slider.value = this.layer.params[key]?.toString() || min.toString();
    slider.style.cssText = `
      width: 100%;
      height: 4px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.1);
      outline: none;
      -webkit-appearance: none;
      cursor: pointer;
    `;

    this.ensureRangeStyleInjected();

    // Tracked disposer (keeps behavior identical): live update on 'input'.
    this.disposeFns.push(
      listen(slider, "input", (e: Event) => {
        const value = parseFloat((e.target as HTMLInputElement).value);
        this.applyPatch({ [key]: value } as any);
        valueText.textContent = value.toFixed(step < 1 ? 2 : 0);
      })
    );

    this.sliders.set(key, { input: slider, valueText, step });

    container.appendChild(slider);
    return container;
  }

  private ensureRangeStyleInjected() {
    if (LiquidMetalControlPanel.injectedRangeStyle) return;
    const existing = document.getElementById("nw-range-style");
    if (existing) {
      LiquidMetalControlPanel.injectedRangeStyle = true;
      return;
    }
    const style = document.createElement("style");
    style.id = "nw-range-style";
    style.textContent = `
      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #60a5fa;
        cursor: pointer;
      }
      input[type="range"]::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #60a5fa;
        cursor: pointer;
        border: none;
      }
    `;
    document.head.appendChild(style);
    LiquidMetalControlPanel.injectedRangeStyle = true;
  }

  private addPresetButtons(panel: HTMLElement) {
    const presetGroup = document.createElement("div");
    presetGroup.style.cssText =
      "margin-top: 20px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);";

    const presetTitle = document.createElement("div");
    presetTitle.textContent = "预设";
    presetTitle.style.cssText =
      "font-size: 13px; font-weight: 600; margin-bottom: 10px; color: #9ca3af;";
    presetGroup.appendChild(presetTitle);

    const presets: Array<{ name: string; params: Partial<LiquidMetalParams> }> =
      [
        {
          name: "经典银色",
          params: {
            brightness: 1.0,
            timeScale: 1.0,
            iterations: 10,
            waveAmplitude: 0.6,
            mouseInfluence: 1.0,
            metallicAmount: 0.1,
          },
        },
        {
          name: "流动汞",
          params: {
            brightness: 1.3,
            timeScale: 2.0,
            iterations: 10,
            waveAmplitude: 0.8,
            mouseInfluence: 2.0,
            metallicAmount: 0.2,
            metallicSpeed: 1.5,
          },
        },
        {
          name: "冷钢",
          params: {
            brightness: 0.8,
            timeScale: 0.5,
            iterations: 8,
            waveAmplitude: 0.4,
            mouseInfluence: 0.5,
            metallicAmount: 0.05,
          },
        },
        {
          name: "极简",
          params: {
            brightness: 1.0,
            timeScale: 0.5,
            iterations: 5,
            waveAmplitude: 0.3,
            mouseInfluence: 0.2,
            metallicAmount: 0,
          },
        },
      ];

    const buttonContainer = document.createElement("div");
    buttonContainer.style.cssText =
      "display: grid; grid-template-columns: 1fr 1fr; gap: 8px;";

    presets.forEach((preset) => {
      const btn = document.createElement("button");
      btn.textContent = preset.name;
      btn.style.cssText = `
        padding: 8px;
        background: rgba(96, 165, 250, 0.1);
        border: 1px solid rgba(96, 165, 250, 0.3);
        border-radius: 4px;
        color: #60a5fa;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      `;
      this.disposeFns.push(
        listen(btn, "mouseenter", () => {
          btn.style.background = "rgba(96, 165, 250, 0.2)";
        })
      );
      this.disposeFns.push(
        listen(btn, "mouseleave", () => {
          btn.style.background = "rgba(96, 165, 250, 0.1)";
        })
      );
      this.disposeFns.push(
        bindButton(btn, () => this.applyPreset(preset.params)).dispose
      );
      buttonContainer.appendChild(btn);
    });

    presetGroup.appendChild(buttonContainer);
    panel.appendChild(presetGroup);
  }

  private applyPreset(presetParams: Partial<LiquidMetalParams>) {
    this.applyPatch(presetParams);
    // 使用 syncFromParams 而不是 refreshUI，避免重建整个面板导致 listener 泄漏
    this.syncFromParams(presetParams);
  }

  private resetToDefaults() {
    const defaults: Partial<LiquidMetalParams> = {
      timeScale: 1.0,
      iterations: 10,
      waveAmplitude: 0.6,
      mouseInfluence: 1.0,
      metallicAmount: 0.1,
      metallicSpeed: 1.0,
      brightness: 1.0,
      audioReactive: true,
      audioSensitivity: 1.0,
    };
    this.applyPatch(defaults);
    // 使用 syncFromParams 而不是 refreshUI，避免重建整个面板导致 listener 泄漏
    this.syncFromParams(defaults);
  }

  toggle() {
    this.ensureMounted();
    this.isVisible = !this.isVisible;
    this.container.style.display = this.isVisible ? "block" : "none";
    if (this.isVisible) this.updatePosition();
  }

  show() {
    this.ensureMounted();
    this.isVisible = true;
    this.container.style.display = "block";
    this.updatePosition();
  }

  hide() {
    this.isVisible = false;
    this.container.style.display = "none";
  }

  isShown() {
    return this.isVisible;
  }
}
