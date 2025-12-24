import type { CameraLayer } from "../layers/CameraLayer";

type CameraControlPanelOptions = {
  onPatch?: (patch: Record<string, unknown>) => void;
};

export class CameraControlPanel {
  private static injectedRangeStyle = false;
  private container: HTMLElement;
  private layer: CameraLayer;
  private isVisible = false;
  private onPatch?: (patch: Record<string, unknown>) => void;
  private readonly onWindowResize: () => void;

  constructor(layer: CameraLayer, opts?: CameraControlPanelOptions) {
    this.layer = layer;
    this.onPatch = opts?.onPatch;
    this.container = this.createPanel();
    document.body.appendChild(this.container);

    this.onWindowResize = () => {
      if (!this.isVisible) return;
      this.updatePosition();
    };
    window.addEventListener("resize", this.onWindowResize);
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

  private applyPatch(patch: Record<string, unknown>) {
    if (this.onPatch) {
      this.onPatch(patch);
      return;
    }
    throw new Error(
      "[CameraControlPanel] onPatch is required to avoid direct layer writes."
    );
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.id = "camera-controls";
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
    title.textContent = "摄像头参数调节";
    title.style.cssText = `
      margin: 0 0 15px 0;
      font-size: 16px;
      font-weight: 600;
      color: #c0c5ce;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 10px;
    `;
    panel.appendChild(title);

    // 透明度控制
    this.addControlGroup(panel, "基础参数", [
      { key: "opacity", label: "透明度", min: 0, max: 1, step: 0.05, value: 1 },
    ]);

    // 人像分割开关
    const segmentGroup = document.createElement("div");
    segmentGroup.style.cssText =
      "margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);";

    const segmentLabel = document.createElement("label");
    segmentLabel.style.cssText =
      "display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none;";

    const segmentCheckbox = document.createElement("input");
    segmentCheckbox.type = "checkbox";
    segmentCheckbox.checked = false;
    segmentCheckbox.style.cssText =
      "width: 18px; height: 18px; cursor: pointer;";
    segmentCheckbox.addEventListener("change", (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.applyPatch({ segmentPerson: checked });
      segmentSettings.style.display = checked ? "block" : "none";
    });

    const segmentText = document.createElement("span");
    segmentText.textContent = "人像分割（需 MediaPipe）";
    segmentText.style.fontSize = "14px";

    segmentLabel.appendChild(segmentCheckbox);
    segmentLabel.appendChild(segmentText);
    segmentGroup.appendChild(segmentLabel);

    // 分割设置
    const segmentSettings = document.createElement("div");
    segmentSettings.style.cssText = "margin-top: 10px; display: none;";

    // 质量选择
    const qualityRow = document.createElement("div");
    qualityRow.style.cssText =
      "margin-bottom: 12px; display: flex; align-items: center; gap: 10px;";

    const qualityLabel = document.createElement("div");
    qualityLabel.textContent = "质量";
    qualityLabel.style.cssText =
      "font-size: 13px; color: #9ca3af; min-width: 42px;";

    const qualitySelect = document.createElement("select");
    qualitySelect.style.cssText = `
      flex: 1;
      padding: 6px 8px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 6px;
      color: #e5e7eb;
      outline: none;
    `;
    qualitySelect.innerHTML = `
      <option value="low">低（快）</option>
      <option value="medium" selected>中</option>
      <option value="high">高（慢）</option>
    `;
    qualitySelect.addEventListener("change", () => {
      this.applyPatch({ segmentQuality: qualitySelect.value });
    });

    qualityRow.appendChild(qualityLabel);
    qualityRow.appendChild(qualitySelect);
    segmentSettings.appendChild(qualityRow);

    // FPS 和边缘模糊
    this.addControlGroupToElement(segmentSettings, "分割参数", [
      {
        key: "segmentFps",
        label: "帧率 (FPS)",
        min: 5,
        max: 30,
        step: 1,
        value: 15,
      },
      {
        key: "segmentEdgeBlurPx",
        label: "边缘模糊",
        min: 0,
        max: 16,
        step: 1,
        value: 8,
      },
    ]);

    segmentGroup.appendChild(segmentSettings);
    panel.appendChild(segmentGroup);

    // 提示信息
    const hint = document.createElement("div");
    hint.style.cssText = `
      margin-top: 15px;
      padding: 10px;
      background: rgba(96, 165, 250, 0.1);
      border: 1px solid rgba(96, 165, 250, 0.3);
      border-radius: 4px;
      font-size: 12px;
      color: #9ca3af;
      line-height: 1.4;
    `;
    hint.innerHTML = `
      <strong>提示：</strong><br>
      • 人像分割需要 MediaPipe 资源<br>
      • 首次启用会自动加载模型<br>
      • 如遇问题，运行：<code style="color:#60a5fa">npm run sync:mediapipe</code>
    `;
    panel.appendChild(hint);

    return panel;
  }

  private addControlGroup(
    panel: HTMLElement,
    title: string,
    controls: Array<{
      key: string;
      label: string;
      min: number;
      max: number;
      step: number;
      value?: number;
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
        ctrl.step,
        ctrl.value
      );
      group.appendChild(slider);
    });

    panel.appendChild(group);
  }

  private addControlGroupToElement(
    parent: HTMLElement,
    title: string,
    controls: Array<{
      key: string;
      label: string;
      min: number;
      max: number;
      step: number;
      value?: number;
    }>
  ) {
    const groupTitle = document.createElement("div");
    groupTitle.textContent = title;
    groupTitle.style.cssText =
      "font-size: 13px; font-weight: 600; margin: 10px 0; color: #9ca3af;";
    parent.appendChild(groupTitle);

    controls.forEach((ctrl) => {
      const slider = this.createSlider(
        ctrl.key,
        ctrl.label,
        ctrl.min,
        ctrl.max,
        ctrl.step,
        ctrl.value
      );
      parent.appendChild(slider);
    });
  }

  private createSlider(
    key: string,
    label: string,
    min: number,
    max: number,
    step: number,
    value?: number
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
    const initialValue = value ?? min;
    valueText.textContent = initialValue.toFixed(step < 1 ? 2 : 0);

    labelRow.appendChild(labelText);
    labelRow.appendChild(valueText);
    container.appendChild(labelRow);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = min.toString();
    slider.max = max.toString();
    slider.step = step.toString();
    slider.value = initialValue.toString();
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

    slider.addEventListener("input", (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      this.applyPatch({ [key]: val });
      valueText.textContent = val.toFixed(step < 1 ? 2 : 0);
    });

    container.appendChild(slider);
    return container;
  }

  private ensureRangeStyleInjected() {
    if (CameraControlPanel.injectedRangeStyle) return;
    const existing = document.getElementById("nw-range-style");
    if (existing) {
      CameraControlPanel.injectedRangeStyle = true;
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
    CameraControlPanel.injectedRangeStyle = true;
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
    window.removeEventListener("resize", this.onWindowResize);
    this.container.remove();
  }
}
