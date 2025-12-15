export type DomRefs = {
  root: HTMLDivElement;
  toolbar: HTMLDivElement;
  canvasRoot: HTMLDivElement;
  canvas: HTMLCanvasElement;

  audioStatus: HTMLSpanElement;
  audioToggle: HTMLButtonElement;
  audioFileInput: HTMLInputElement;
  audioUrlInput: HTMLInputElement;
  audioUrlButton: HTMLButtonElement;
  audioVolumeInput: HTMLInputElement;
  audioTime: HTMLSpanElement;

  presetSelect: HTMLSelectElement;
  presetFileInput: HTMLInputElement;
  presetUrlInput: HTMLInputElement;
  presetUrlButton: HTMLButtonElement;
  presetStatus: HTMLSpanElement;
  presetManifestInfo: HTMLSpanElement;
  presetNextButton: HTMLButtonElement;
  presetAutoToggle: HTMLInputElement;
  presetAutoIntervalInput: HTMLInputElement;
  presetAutoLabel: HTMLSpanElement;
  presetLibrarySelect: HTMLSelectElement;

  visualRandomButton: HTMLButtonElement;
  visualFavoriteButton: HTMLButtonElement;
  visualFavoriteCount: HTMLSpanElement;

  pmOpacityInput: HTMLInputElement;
  pmBlendModeSelect: HTMLSelectElement;
  pmAudioOpacityToggle: HTMLInputElement;
  pmEnergyOpacityInput: HTMLInputElement;
};

export type RenderShellOptions = {
  librarySelectOptionsHtml: string;
  audioUrlPlaceholder: string;
  presetUrlPlaceholder: string;
  testAudioLibraryPathLabel: string;
  presetPackPathLabel: string;
};

export function renderShell(app: HTMLElement, opts: RenderShellOptions): DomRefs {
  app.innerHTML = `
  <div id="root" class="app-root">
    <div id="toolbar" class="toolbar">
      <div class="toolbar__grid">
        <div class="toolbar__section">
          <div class="toolbar__section-header">
            <span class="toolbar__title">newliveweb - LiquidMetal + ProjectM</span>
            <span id="audio-status" class="toolbar__status toolbar__status--tight">No audio loaded</span>
          </div>
          <div class="toolbar__row">
            <button id="audio-toggle" class="toolbar__button" disabled>Play</button>
            <label class="toolbar__file">
              <input type="file" id="audio-file" accept="audio/*" hidden />
              <span>Load audio</span>
            </label>
            <div class="toolbar__url">
              <input type="text" id="audio-url" placeholder="${opts.audioUrlPlaceholder}" />
              <button id="audio-url-load" class="toolbar__button toolbar__button--compact">Load URL</button>
            </div>
            <label class="toolbar__volume">
              Vol
              <input type="range" id="audio-volume" min="0" max="1" step="0.01" value="0.8" />
            </label>
            <span id="audio-time" class="toolbar__time">00:00 / 00:00</span>
          </div>
        </div>

        <div class="toolbar__section">
          <div class="toolbar__section-header">
            <span class="toolbar__subtitle">Preset</span>
            <span id="preset-status" class="toolbar__status toolbar__status--inline">Preset engine booting...</span>
          </div>
          <div class="toolbar__row">
            <select id="preset-select" class="toolbar__select"></select>
            <label class="toolbar__file">
              <input type="file" id="preset-file" accept=".milk" hidden />
              <span>Import .milk</span>
            </label>
            <div class="toolbar__url">
              <input type="text" id="preset-url" placeholder="${opts.presetUrlPlaceholder}" />
              <button id="preset-url-load" class="toolbar__button toolbar__button--compact">Load URL</button>
            </div>
            <button id="preset-next" class="toolbar__button toolbar__button--compact" title="Load next preset" disabled>Next</button>
          </div>
          <div class="toolbar__row">
            <label class="toolbar__switch" title="自动轮播 ProjectM 预设">
              <input type="checkbox" id="preset-auto-toggle" />
              <span id="preset-auto-label">Auto-cycle</span>
            </label>
            <label class="toolbar__interval" title="自动轮播间隔（秒）">
              Every
              <input type="number" id="preset-auto-interval" min="15" max="600" step="5" value="90" />
              s
            </label>
            <label class="toolbar__hint toolbar__hint--select">
              <span>库模式</span>
              <select id="preset-library-select" class="toolbar__select toolbar__select--compact">
                ${opts.librarySelectOptionsHtml}
              </select>
            </label>
            <span id="preset-manifest-info" class="toolbar__hint toolbar__hint--status">Preset manifest pending...</span>
          </div>
        </div>

        <div class="toolbar__section">
          <div class="toolbar__section-header">
            <span class="toolbar__subtitle">Visual actions</span>
            <span id="visual-favorite-count" class="toolbar__hint toolbar__hint--status toolbar__hint--pill">Favorites: 0</span>
          </div>
          <div class="toolbar__row">
            <button id="visual-random" class="toolbar__button toolbar__button--compact" title="全局随机视觉（受当前音乐能量影响）">Random visual</button>
            <button id="visual-favorite" class="toolbar__button toolbar__button--compact" title="收藏当前视觉配置">★ Favorite</button>
            <span class="toolbar__hint toolbar__hint--pill">测试音乐库：${opts.testAudioLibraryPathLabel}</span>
            <span class="toolbar__hint toolbar__hint--pill">预设合集：${opts.presetPackPathLabel}</span>
          </div>
          <div class="toolbar__row">
            <label class="toolbar__interval" title="ProjectM 叠加透明度">
              Opacity
              <input type="number" id="pm-opacity" min="0" max="1" step="0.01" value="0.8" />
            </label>
            <label class="toolbar__hint toolbar__hint--select" title="ProjectM blend mode">
              <span>Blend</span>
              <select id="pm-blend-mode" class="toolbar__select toolbar__select--compact">
                <option value="normal">normal</option>
                <option value="add" selected>add</option>
                <option value="screen">screen</option>
                <option value="multiply">multiply</option>
              </select>
            </label>
            <label class="toolbar__switch" title="Opacity reacts to audio energy">
              <input type="checkbox" id="pm-audio-opacity" checked />
              <span>Audio opacity</span>
            </label>
            <label class="toolbar__interval" title="Energy to opacity amount (0..1)">
              Energy→Opacity
              <input type="number" id="pm-energy-opacity" min="0" max="1" step="0.05" value="0.3" />
            </label>
          </div>
        </div>
      </div>
    </div>
    <div id="canvas-root" class="canvas-root">
      <canvas id="viz-canvas"></canvas>
    </div>
  </div>
`;

  const q = <T extends Element>(selector: string): T => {
    const el = app.querySelector(selector);
    if (!el) throw new Error(`renderShell: missing element ${selector}`);
    return el as T;
  };

  return {
    root: q<HTMLDivElement>('#root'),
    toolbar: q<HTMLDivElement>('#toolbar'),
    canvasRoot: q<HTMLDivElement>('#canvas-root'),
    canvas: q<HTMLCanvasElement>('#viz-canvas'),

    audioStatus: q<HTMLSpanElement>('#audio-status'),
    audioToggle: q<HTMLButtonElement>('#audio-toggle'),
    audioFileInput: q<HTMLInputElement>('#audio-file'),
    audioUrlInput: q<HTMLInputElement>('#audio-url'),
    audioUrlButton: q<HTMLButtonElement>('#audio-url-load'),
    audioVolumeInput: q<HTMLInputElement>('#audio-volume'),
    audioTime: q<HTMLSpanElement>('#audio-time'),

    presetSelect: q<HTMLSelectElement>('#preset-select'),
    presetFileInput: q<HTMLInputElement>('#preset-file'),
    presetUrlInput: q<HTMLInputElement>('#preset-url'),
    presetUrlButton: q<HTMLButtonElement>('#preset-url-load'),
    presetStatus: q<HTMLSpanElement>('#preset-status'),
    presetManifestInfo: q<HTMLSpanElement>('#preset-manifest-info'),
    presetNextButton: q<HTMLButtonElement>('#preset-next'),
    presetAutoToggle: q<HTMLInputElement>('#preset-auto-toggle'),
    presetAutoIntervalInput: q<HTMLInputElement>('#preset-auto-interval'),
    presetAutoLabel: q<HTMLSpanElement>('#preset-auto-label'),
    presetLibrarySelect: q<HTMLSelectElement>('#preset-library-select'),

    visualRandomButton: q<HTMLButtonElement>('#visual-random'),
    visualFavoriteButton: q<HTMLButtonElement>('#visual-favorite'),
    visualFavoriteCount: q<HTMLSpanElement>('#visual-favorite-count'),

    pmOpacityInput: q<HTMLInputElement>('#pm-opacity'),
    pmBlendModeSelect: q<HTMLSelectElement>('#pm-blend-mode'),
    pmAudioOpacityToggle: q<HTMLInputElement>('#pm-audio-opacity'),
    pmEnergyOpacityInput: q<HTMLInputElement>('#pm-energy-opacity'),
  };
}
