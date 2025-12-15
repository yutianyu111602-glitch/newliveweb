type RendererInfo = {
  pixelRatio: number;
  outputColorSpace: string | number;
  toneMapping: string | number;
};

type ProjectMInfo = {
  framesRendered?: number;
  lastAudioRms?: number;
};

export class DiagnosticsPanel {
  private root: HTMLDivElement;
  private audioCtxEl: HTMLDivElement;
  private audioFrameEl: HTMLDivElement;
  private pmEl: HTMLDivElement;
  private rendererEl: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'diagnostics-panel';
    this.root.style.cssText = `
      position: fixed;
      bottom: 12px;
      left: 12px;
      min-width: 260px;
      max-width: 340px;
      background: rgba(12, 14, 20, 0.86);
      color: #c9d0da;
      font-family: Consolas, SFMono-Regular, ui-monospace, monospace;
      font-size: 12px;
      line-height: 1.4;
      padding: 10px 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      pointer-events: none;
      z-index: 9999;
    `;
    this.audioCtxEl = this.addSection('AudioContext');
    this.audioFrameEl = this.addSection('AudioFrame');
    this.pmEl = this.addSection('ProjectM');
    this.rendererEl = this.addSection('Renderer');
    container.appendChild(this.root);
  }

  updateAudioContext(state: string) {
    this.audioCtxEl.textContent = `state=${state}`;
  }

  updateAudioFrame(opts: { energy: number; rms: number; peak: number }) {
    const { energy, rms, peak } = opts;
    this.audioFrameEl.textContent = `energy=${energy.toFixed(3)} rms=${rms.toFixed(3)} peak=${peak.toFixed(3)}`;
  }

  updateProjectM(info: ProjectMInfo) {
    const frames = info.framesRendered ?? NaN;
    const rms = info.lastAudioRms ?? NaN;
    this.pmEl.textContent = `frames=${Number.isFinite(frames) ? frames : 'N/A'} lastAudioRms=${Number.isFinite(rms) ? rms.toFixed(3) : 'N/A'}`;
  }

  updateRenderer(info: RendererInfo) {
    const { pixelRatio, outputColorSpace, toneMapping } = info;
    this.rendererEl.textContent = `dpr=${pixelRatio.toFixed(2)} colorSpace=${String(outputColorSpace)} toneMapping=${String(toneMapping)}`;
  }

  private addSection(title: string): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '6px';
    const label = document.createElement('div');
    label.textContent = title;
    label.style.fontWeight = '600';
    label.style.marginBottom = '2px';
    const value = document.createElement('div');
    value.textContent = '--';
    wrap.appendChild(label);
    wrap.appendChild(value);
    this.root.appendChild(wrap);
    return value;
  }
}

