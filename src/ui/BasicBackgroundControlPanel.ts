import type { BasicBackgroundLayer } from "../layers/BasicBackgroundLayer";
import { bindButton, listen } from "../app/bindings/domBindings";

type BasicBackgroundParams = {
  speed: number;
  opacity: number;
};

type BasicBackgroundControlPanelOptions = {
  onPatch?: (patch: Partial<BasicBackgroundParams>) => void;
};

export class BasicBackgroundControlPanel {
  private static injectedRangeStyle = false;
  private container: HTMLElement;
  private layer: BasicBackgroundLayer;
  private isVisible = false;
  private onPatch?: (patch: Partial<BasicBackgroundParams>) => void;
  private readonly disposeFns: Array<() => void> = [];
  private sliders = new Map<
    keyof BasicBackgroundParams,
    { input: HTMLInputElement; valueText: HTMLSpanElement; step: number }
  >();
  private readonly onWindowResize: () => void;

  constructor(
    layer: BasicBackgroundLayer,
    opts?: BasicBackgroundControlPanelOptions
  ) {
    this.layer = layer;
    this.onPatch = opts?.onPatch;
    this.container = this.createPanel();
    document.body.appendChild(this.container);

    this.onWindowResize = () => {
      if (!this.isVisible) return;
      this.updatePosition();
    };
    this.disposeFns.push(listen(window, "resize", this.onWindowResize));
  }

  private updatePosition() {
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

  private applyPatch(patch: Partial<BasicBackgroundParams>) {
    if (this.onPatch) {
      this.onPatch(patch);
      return;
    }
    throw new Error(
      "[BasicBackgroundControlPanel] onPatch is required to avoid direct layer writes."
    );
  }

  public syncFromParams(params: Partial<BasicBackgroundParams>) {
    for (const [key, ctrl] of this.sliders.entries()) {
      const nextValue = (params as any)[key];
      if (!Number.isFinite(nextValue)) continue;
      ctrl.input.value = String(nextValue);
      ctrl.valueText.textContent = Number(nextValue).toFixed(
        ctrl.step < 1 ? 2 : 0
      );
    }
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.id = "basic-background-controls";
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

    const title = document.createElement("h3");
    title.textContent = "纯色背景参数";
    title.style.cssText = `
      margin: 0 0 15px 0;
      font-size: 16px;
      font-weight: 600;
      color: #c0c5ce;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 10px;
    `;
    panel.appendChild(title);

    this.addControlGroup(panel, "基础参数", [
      { key: "speed", label: "动画速度", min: 0, max: 1, step: 0.1 },
      { key: "opacity", label: "不透明度", min: 0, max: 1, step: 0.05 },
    ]);

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
      key: keyof BasicBackgroundParams;
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
    key: keyof BasicBackgroundParams,
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
    const defaultValue = key === "opacity" ? 1 : key === "speed" ? 0.2 : 0;
    valueText.textContent = defaultValue.toFixed(step < 1 ? 2 : 0);

    labelRow.appendChild(labelText);
    labelRow.appendChild(valueText);
    container.appendChild(labelRow);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = min.toString();
    slider.max = max.toString();
    slider.step = step.toString();
    slider.value = defaultValue.toString();
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
    if (BasicBackgroundControlPanel.injectedRangeStyle) return;
    const existing = document.getElementById("nw-range-style");
    if (existing) {
      BasicBackgroundControlPanel.injectedRangeStyle = true;
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
    BasicBackgroundControlPanel.injectedRangeStyle = true;
  }

  private resetToDefaults() {
    const defaults: Partial<BasicBackgroundParams> = {
      speed: 0.2,
      opacity: 1.0,
    };
    this.applyPatch(defaults);
    this.syncFromParams(defaults);
  }

  toggle() {
    this.isVisible = !this.isVisible;
    this.container.style.display = this.isVisible ? "block" : "none";
    if (this.isVisible) this.updatePosition();
  }

  show() {
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

  dispose() {
    for (const dispose of this.disposeFns.splice(0, this.disposeFns.length)) {
      try {
        dispose();
      } catch {
        // ignore
      }
    }
    this.container.remove();
  }
}
