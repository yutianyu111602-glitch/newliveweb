import type { DiagnosticsPanel } from '../../features/console/DiagnosticsPanel';
import type { AudioFrame } from '../../types/audioFrame';

type AudioContextInfo = Parameters<DiagnosticsPanel['updateAudioContext']>[0];
type AudioFrameInfo = Parameters<DiagnosticsPanel['updateAudioFrame']>[0];
type ProjectMInfo = Parameters<DiagnosticsPanel['updateProjectM']>[0];
type RendererInfo = Parameters<DiagnosticsPanel['updateRenderer']>[0];
type AivjInfo = Parameters<DiagnosticsPanel['updateAivj']>[0];

export function createDiagnosticsTicker(opts: {
  diagnosticsPanel: DiagnosticsPanel;
  throttleMs: number;
  getAudioContextInfo: () => AudioContextInfo;
  getAudioFrameInfo: (frame: AudioFrame) => AudioFrameInfo;
  getProjectMInfo: () => ProjectMInfo;
  getRendererInfo: () => RendererInfo;
  getAivjInfo?: (frame: AudioFrame) => AivjInfo;
  onTick?: () => void;
}) {
  const {
    diagnosticsPanel,
    throttleMs,
    getAudioContextInfo,
    getAudioFrameInfo,
    getProjectMInfo,
    getRendererInfo,
    getAivjInfo,
    onTick,
  } = opts;

  let lastUpdate = 0;

  function maybeUpdate(frame: AudioFrame) {
    const now = performance.now();
    if (now - lastUpdate < throttleMs) return;
    lastUpdate = now;

    diagnosticsPanel.updateAudioContext(getAudioContextInfo());
    diagnosticsPanel.updateAudioFrame(getAudioFrameInfo(frame));
    diagnosticsPanel.updateProjectM(getProjectMInfo());
    diagnosticsPanel.updateRenderer(getRendererInfo());
    if (getAivjInfo) diagnosticsPanel.updateAivj(getAivjInfo(frame));
    onTick?.();
  }

  return { maybeUpdate };
}
